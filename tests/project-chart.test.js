import test from 'node:test';
import assert from 'node:assert/strict';
import { projectChart } from '../src/project-chart.js';
const data={projects:[{id:'p',name:'Project',color:'blue'}],people:[],sprints:[],epics:[{id:'E',project:'p',title:'Epic'}],stories:[{id:'S',project:'p',epic:'E',person:null,title:'Story without dates',type:'story',points:null},{id:'T',project:'p',epic:'E',person:null,title:'Task without dates',type:'task'},{id:'O',project:'p',epic:null,person:null,title:'Orphan',type:'task'}]};
const scope={types:['epic','story','task'],people:[]};
test('unscheduled stories and tasks have expandable rows without fabricated bars',()=>{
 const chart=projectChart(data,data.projects,scope);
 assert.deepEqual(chart.groups.find(g=>g.id==='E').nestedGroups,['S','T']);
 assert.match(chart.groups.find(g=>g.id==='S').content,/Unscheduled/);
 assert.equal(chart.items.length,0);
 assert.deepEqual(chart.groups.find(g=>g.id==='unparented|p').nestedGroups,['O']);
});
test('searching an epic keeps its unscheduled children and work-item type filters still apply',()=>{
 const chart=projectChart(data,data.projects,{...scope,types:['epic','task']},'Epic');
 assert.deepEqual(chart.groups.find(g=>g.id==='E').nestedGroups,['T']);
 assert(!chart.groups.some(g=>g.id==='S'));
});

test('large portfolios expand the first epic with tickets, even when preceding epics are empty',()=>{
 const many={...data,epics:[{id:'EMPTY',project:'p',title:'Empty epic'},...data.epics],stories:Array.from({length:201},(_,i)=>({...data.stories[0],id:'S'+i,sprint:'sprint'})),sprints:[{id:'sprint',project:'p',start:'2026-10-01',end:'2026-10-14'}]};
 const chart=projectChart(many,many.projects,scope);
 assert.equal(chart.groups.find(g=>g.id==='E').showNested,true);
 assert.equal(chart.items.length,201);
 assert.match(chart.items[0].content,/Estimate unknown/);
});

test('epics and child rows with work in the visible period come first',()=>{
 const dated={...data,epics:[{id:'OLD',project:'p',title:'Past'},...data.epics],sprints:[],stories:[{...data.stories[0],id:'PAST',epic:'OLD',plannedStart:'2026-05-01',plannedEnd:'2026-05-07'},{...data.stories[1],plannedStart:'2026-10-01',plannedEnd:'2026-10-14'},data.stories[0]]};
 const chart=projectChart(dated,dated.projects,scope,'','2026-10-01','2026-10-22');
 assert.equal(chart.groups[0].id,'E');assert.equal(chart.groups[1].id,'T');
 assert.match(chart.groups.find(g=>g.id==='PAST').content,/Outside date range/);
});

test('exact issue-key searches focus one ticket and epic-key searches keep children',()=>{
 const workspace={...data,stories:[...data.stories,{...data.stories[0],id:'S10'}]};
 const ticket=projectChart(workspace,workspace.projects,scope,'S');
 assert(ticket.groups.some(g=>g.id==='S'));assert(!ticket.groups.some(g=>g.id==='S10'));
 const epic=projectChart(workspace,workspace.projects,scope,'E');
 assert.deepEqual(epic.groups.find(g=>g.id==='E').nestedGroups,['S','T','S10']);
});
