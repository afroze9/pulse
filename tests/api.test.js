import test from 'node:test';
import assert from 'node:assert/strict';
import { request, ApiError, workspaceApi } from '../src/api.js';

test('desktop bridge dispatches JSON commands without HTTP', async () => {
  const previousWindow=globalThis.window, previousFetch=globalThis.fetch;
  let command;
  globalThis.window={HybridWebView:{InvokeDotNet:async(name,args)=>{assert.equal(name,'Dispatch');command=JSON.parse(args[0]);return JSON.stringify({status:200,body:{hasToken:true}});}}};
  globalThis.fetch=()=>{throw new Error('HTTP must not run in desktop mode');};
  try {
    assert.deepEqual(await workspaceApi.saveJiraConnection({url:'https://example.atlassian.net',username:'user@example.com',token:'synthetic-test-token'}),{hasToken:true});
    assert.deepEqual(command,{path:'/api/jira/connection',method:'PUT',body:{url:'https://example.atlassian.net',username:'user@example.com',token:'synthetic-test-token'}});
    globalThis.window.HybridWebView.InvokeDotNet=async()=>JSON.stringify({status:400,body:{errors:{url:['HTTPS required.']}}});
    await assert.rejects(request('/api/jira/connection'),e=>e instanceof ApiError&&e.status===400&&e.message==='HTTPS required.');
    globalThis.window.HybridWebView.InvokeDotNet=async()=>{throw new Error('Disconnected');};
    await assert.rejects(request('/api/workspace'),e=>e instanceof ApiError&&e.status===0);
  } finally {globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});

test('browser preview retains HTTP transport and problem responses', async () => {
  const previousWindow=globalThis.window, previousFetch=globalThis.fetch;
  delete globalThis.window;
  globalThis.fetch=async(path,options)=>{assert.equal(path,'/api/jira/connection');assert.equal(options.method,'DELETE');return {status:409,json:async()=>({detail:'Conflict'})};};
  try {await assert.rejects(workspaceApi.forgetJiraConnection(),e=>e instanceof ApiError&&e.status===409&&e.message==='Conflict');}
  finally {globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});
