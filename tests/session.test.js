import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSession } from '../src/workspace-session.js';
const data={projects:[],people:[],sprints:[],epics:[],stories:[]};
const configuration={projects:[],people:[],types:['story']};
const envelope=(version=1)=>({version,data,configuration,canUndo:true,source:'local',jira:{configured:false}});
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('save locks further edits and accepts server revision only after response',async()=>{
 let finish;const api={load:async()=>envelope(),save:()=>new Promise(resolve=>finish=resolve)};
 const session=new WorkspaceSession(api,()=>{},memory());await session.load();
 const pending=session.save({...data,stories:[{id:'new',title:'Draft'}]},configuration);
 assert.equal(session.state.phase,'saving');assert.equal(session.state.data.stories.length,1);
 assert.equal(await session.save(data,configuration),false);
 finish({...envelope(2),data:session.state.data});assert.equal(await pending,true);assert.equal(session.state.version,2);
});
test('failed save preserves draft, command ID and expected version for idempotent retry',async()=>{
 const calls=[];let fail=true;const api={load:async()=>envelope(),save:async body=>{calls.push(body);if(fail)throw Error('Offline');return {...envelope(2),data:body.data};}};
 const storage=memory(),session=new WorkspaceSession(api,()=>{},storage);await session.load();
 await session.save({...data,stories:[{id:'draft'}]},configuration);
 assert.equal(session.state.phase,'failed');assert.equal(session.state.data.stories[0].id,'draft');assert.ok(storage.getItem('pulse.pending-workspace.v1'));
 fail=false;await session.persist();assert.equal(calls[0].commandId,calls[1].commandId);assert.equal(calls[1].expectedVersion,1);
 assert.equal(storage.getItem('pulse.pending-workspace.v1'),undefined);
});
test('stale revision retains draft until explicit replacement against latest version',async()=>{
 let calls=0,last;const api={load:async()=>envelope(calls?8:1),save:async body=>{calls++;last=body;if(calls===1)throw Object.assign(Error('Conflict'),{status:409});return {...envelope(9),data:body.data};}};
 const session=new WorkspaceSession(api,()=>{},memory());await session.load();await session.save({...data,stories:[{id:'mine'}]},configuration);
 assert.equal(session.state.phase,'conflict');assert.equal(session.state.remote.version,8);assert.equal(session.state.data.stories[0].id,'mine');
 await session.persist(true);assert.equal(last.expectedVersion,8);assert.equal(session.state.version,9);
});
test('new browser session recovers failed draft and requires review',async()=>{
 const storage=memory();storage.setItem('pulse.pending-workspace.v1',JSON.stringify({data:{...data,stories:[{id:'recovered'}]},configuration,expectedVersion:1,commandId:'old'}));
 const session=new WorkspaceSession({load:async()=>envelope(3)},()=>{},storage);await session.load();
 assert.equal(session.state.phase,'conflict');assert.equal(session.state.data.stories[0].id,'recovered');
 await session.discard();assert.equal(session.state.phase,'ready');assert.equal(session.state.data.stories.length,0);
});

test('initial loading and failed connection never supply placeholder data; retry loads saved workspace',async()=>{
 let finish;const session=new WorkspaceSession({load:()=>new Promise((resolve,reject)=>{finish={resolve,reject};})},()=>{},memory());
 const loading=session.load();assert.equal(session.state.phase,'loading');assert.equal(session.state.data,undefined);
 finish.reject(Error('Unavailable'));await loading;assert.equal(session.state.phase,'offline');assert.equal(session.state.data,undefined);assert.equal(session.state.version,null);
 const retry=session.load();finish.resolve({...envelope(7),source:'jira',data:{...data,projects:[{id:'REAL',name:'Saved project'}]}});await retry;
 assert.equal(session.state.phase,'ready');assert.equal(session.state.source,'jira');assert.equal(session.state.data.projects[0].id,'REAL');
});
