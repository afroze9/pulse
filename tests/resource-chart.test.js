import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceChart} from '../src/resource-chart.js';
import {iso,movePlannedItem,resourceLane,resourceProjectLane} from '../src/planning.js';
const people=[{id:'a:1',name:'Alice',initials:'A',peak:1.5,overloaded:[]},{id:'b',name:'Bob',initials:'B',peak:0,overloaded:[]}];
const projects=[{id:'P',name:'Project',color:'blue'},{id:'Q',name:'Other',color:'mint'}];
const ticket={id:'P-1',project:'P',epic:null,person:'a:1',title:'A task',type:'task',points:null,status:'Doing',plannedStart:'2026-10-01',plannedEnd:'2026-10-09',actualStart:'2026-10-02',actualEnd:null,sprint:null};
const data={people,projects,epics:[],sprints:[],stories:[ticket,{...ticket,id:'P-2',title:'Older task',plannedStart:'2026-05-01',plannedEnd:'2026-05-08',actualStart:null},{...ticket,id:'P-3',plannedStart:null,plannedEnd:null,actualStart:null}]};
const scope={types:['task'],people:people.map(p=>p.id)};
const chart=(query='',inPeriod=true)=>resourceChart(data,people,projects,scope,query,'2026-10-02','2026-10-23',inPeriod);
test('resource hierarchy contains people, expandable projects, and individual ticket bars',()=>{
 const {groups,items}=chart();const lane=resourceProjectLane('a:1','P');
 assert.deepEqual(groups.find(g=>g.id==='a:1').nestedGroups,[lane]);
 assert.deepEqual(groups.find(g=>g.id===lane).nestedGroups,['P-1']);
 assert.equal(groups.find(g=>g.id==='P-1').treeLevel,2);
 const bar=items.find(item=>item.id==='story|P-1');assert.equal(bar.group,'P-1');
 assert.match(bar.content,/A task/);assert.match(bar.content,/Estimate unknown/);
 assert.match(groups.find(g=>g.id==='a:1').content,/150%/);
});
test('all-period mode exposes older and unscheduled tickets without inventing dates',()=>{
 const {groups,items}=chart('',false);assert(groups.some(g=>g.id==='P-2'));
 assert.match(groups.find(g=>g.id==='P-3').content,/Unscheduled/);
 assert(!items.some(i=>i.id==='story|P-3'));
});
test('resource search matches ticket titles and project filters exclude hidden work',()=>{
 assert(chart('A task').groups.some(g=>g.id==='P-1'));
 const {groups}=resourceChart(data,people,[projects[1]],scope,'','2026-10-02','2026-10-23');
 assert(!groups.some(g=>g.id==='P-1'));
});
test('dragging a resource ticket changes only that ticket and preserves actuals and parent',()=>{
 const change={kind:'story',id:'P-1',group:resourceProjectLane('b','P'),start:'2026-10-05',end:'2026-10-12'};
 const result=movePlannedItem(data,change,'resources').data;
 assert.equal(result.stories[0].person,'b');assert.equal(result.stories[0].plannedStart,change.start);
 assert.equal(result.stories[0].actualStart,ticket.actualStart);assert.equal(result.stories[0].epic,null);
 assert.deepEqual(result.stories[1],data.stories[1]);
 assert.throws(()=>movePlannedItem(data,{...change,group:resourceProjectLane('b','Q')},'resources'),/same project/);
});
test('drawing resolves person, project, and ticket lanes to the correct owner',()=>{
 assert.deepEqual(resourceLane(data,resourceProjectLane('a:1','P')),{person:'a:1',project:'P',epic:null});
 assert.equal(resourceLane(data,'P-1').person,'a:1');assert.equal(resourceLane(data,'b').person,'b');
 assert.equal(resourceLane(data,'unknown'),null);
});

test('person and project bars roll up child dates with inclusive end dates and remain read-only',()=>{
 const {items}=chart('',false);
 for(const id of ['rollup-person|a:1','rollup-project|'+resourceProjectLane('a:1','P')]){
  const rollup=items.find(item=>item.id===id);
  assert.equal(iso(rollup.start),'2026-05-01');assert.equal(iso(rollup.end),'2026-10-10');
  assert.equal(rollup.editable,false);assert.equal(rollup.selectable,false);
  assert.match(rollup.content,/2 tickets/);assert.match(rollup.content,/2 unestimated/);
 }
 const period=chart().items.find(item=>item.id==='rollup-person|a:1');
 assert.equal(iso(period.start),'2026-10-01');assert.match(period.content,/1 ticket/);
});
test('person rollup spans projects while project rollups retain their own windows',()=>{
 const workspace={...data,stories:[{...ticket,points:2},{...ticket,id:'Q-1',project:'Q',points:3,plannedStart:'2026-10-12',plannedEnd:'2026-10-20'}]};
 const {items}=resourceChart(workspace,people,projects,scope,'','2026-10-02','2026-10-23');
 const person=items.find(item=>item.id==='rollup-person|a:1');
 assert.equal(iso(person.end),'2026-10-21');assert.match(person.content,/2 tickets · 5 SP/);
 const project=items.find(item=>item.id==='rollup-project|'+resourceProjectLane('a:1','P'));
 assert.equal(iso(project.end),'2026-10-10');assert.match(project.content,/1 ticket · 2 SP/);
 const hidden=resourceChart(workspace,people,[projects[0]],scope,'','2026-10-02','2026-10-23');
 assert.equal(iso(hidden.items.find(item=>item.id==='rollup-person|a:1').end),'2026-10-10');
});
test('unscheduled tickets do not produce fabricated rollup spans',()=>{
 const workspace={...data,stories:[data.stories[2]]};
 const {items}=resourceChart(workspace,people,projects,scope,'','2026-10-02','2026-10-23',false);
 assert(!items.some(item=>item.id.startsWith('rollup-')));
});
