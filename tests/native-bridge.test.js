import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
const source=fs.readFileSync(new URL('../public/pulse-native.js',import.meta.url),'utf8');
function host(){let listener;const messages=[];const window={chrome:{webview:{addEventListener:(event,handler)=>listener=handler,postMessage:message=>messages.push(message)}}};vm.runInNewContext(source,{window,crypto:{randomUUID}});return {window,messages,reply:value=>listener({data:JSON.stringify(value)})};}
test('native RPC carries large plans as messages and correlates concurrent replies',async()=>{
 const native=host();const large=JSON.stringify({path:'/api/workspace',method:'PUT',body:{text:'x'.repeat(3*1024*1024)}});
 const first=native.window.HybridWebView.InvokeDotNet('Dispatch',[large]);
 const second=native.window.HybridWebView.InvokeDotNet('Dispatch',['{}']);
 const messages=native.messages.map(message=>{assert.ok(message.startsWith('__RawMessage|'));return JSON.parse(message.slice(13));});
 assert.equal(messages[0].request,large);
 native.reply({channel:'pulse',id:messages[1].id,result:'second'});
 native.reply({channel:'pulse',id:messages[0].id,result:'first'});
 assert.equal(await first,'first');assert.equal(await second,'second');
});
test('native RPC rejects unknown methods before sending anything',async()=>{
 const native=host();await assert.rejects(native.window.HybridWebView.InvokeDotNet('LoadCredentials',[]));assert.equal(native.messages.length,0);
});
