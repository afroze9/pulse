import test from 'node:test';
import assert from 'node:assert/strict';
import {searchWorkspace} from '../src/global-search.js';
const data={people:[{id:'p1',name:'Afroze Amjad'}],projects:[{id:'RAP',key:'RAP',name:'Revenue Auto Posting'},{id:'HIDE',key:'HIDE',name:'Hidden'}],epics:[{id:'RAP-1',project:'RAP',title:'Payment Posting'}],stories:[{id:'RAP-37',project:'RAP',title:'Post Invoices',type:'task'},{id:'RAP-376',project:'RAP',title:'Post Telemetry',type:'story'},{id:'HIDE-1',project:'HIDE',title:'Posting Hidden',type:'story'}]};
const scope={people:['p1'],projects:['RAP'],types:['epic','story','task']};
test('global search finds people, projects, epics and tickets without case sensitivity',()=>{
 assert.equal(searchWorkspace(data,scope,'AFROZE')[0].kind,'person');
 assert.equal(searchWorkspace(data,scope,'revenue')[0].kind,'project');
 assert.equal(searchWorkspace(data,scope,'payment')[0].kind,'epic');
 assert.equal(searchWorkspace(data,scope,'invoices')[0].id,'RAP-37');
});
test('global search ranks exact issue keys first and respects configured scope and limits',()=>{
 assert.equal(searchWorkspace(data,scope,'rap-37')[0].id,'RAP-37');
 assert.equal(searchWorkspace(data,scope,'hidden').length,0);
 assert.equal(searchWorkspace(data,{...scope,types:['epic']},'invoices').length,0);
 assert.equal(searchWorkspace(data,scope,'post',2).length,2);
 assert.deepEqual(searchWorkspace(data,scope,' '),[]);
});
