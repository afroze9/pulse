import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTimelineStart, allocations, workingDays, dailyLoad, personLoad, addDays } from '../src/planning.js';
const sprints=[{id:'a',project:'commerce',start:'2026-10-05',end:'2026-10-16'},{id:'b',project:'platform',start:'2026-10-07',end:'2026-10-20'}];
const stories=[{id:'1',person:'sara',sprint:'a',points:8},{id:'2',person:'sara',sprint:'b',points:5}];
test('sprints retain offset calendars, and weekends contribute no workdays',()=>{assert.equal(workingDays(sprints[0].start,sprints[0].end).length,10);assert.equal(workingDays(sprints[1].start,sprints[1].end).length,10);assert.equal(addDays('2026-10-31',1),'2026-11-01');});
test('daily effort is shared across project sprints only where dates overlap',()=>{const b=allocations(stories,sprints);assert.equal(dailyLoad('sara','2026-10-05',b),.8);assert.equal(dailyLoad('sara','2026-10-07',b),1.3);assert.equal(dailyLoad('sara','2026-10-10',b),0);assert.equal(dailyLoad('sara','2026-10-19',b),.5);assert.equal(personLoad('sara',b,'2026-10-05','2026-10-20').overloaded.length,8);});
test('reassigning changes both people and preserves total planned effort',()=>{const changed=stories.map(s=>s.id==='2'?{...s,person:'ali'}:s);const b=allocations(changed,sprints);assert.equal(dailyLoad('sara','2026-10-07',b),.8);assert.equal(dailyLoad('ali','2026-10-07',b),.5);assert.equal(b.reduce((sum,x)=>sum+x.points,0),13);});
test('exactly 1 SP per day is within capacity; backlog and unassigned do not create load',()=>{const b=allocations([{person:'sara',sprint:'a',points:10},{person:null,sprint:'b',points:10},{person:'sara',sprint:null,points:8}],sprints);assert.equal(b.length,1);assert.equal(personLoad('sara',b,'2026-10-05','2026-10-16').overloaded.length,0);assert.equal(personLoad('missing',b,'2026-10-05','2026-10-16').peak,0);});

test('initial view keeps ongoing work visible instead of skipping to a future sprint',()=>{
 const workspace={sprints:[{start:'2026-09-22',end:'2026-10-08'},{start:'2026-10-08',end:'2026-10-22'}],epics:[],stories:[]};
 assert.equal(initialTimelineStart(workspace,'2026-10-02'),'2026-10-02');
 assert.equal(initialTimelineStart(workspace,'2026-09-01'),'2026-09-22');
 assert.equal(initialTimelineStart({...workspace,sprints:[]},'2026-10-02'),'2026-10-02');
});
