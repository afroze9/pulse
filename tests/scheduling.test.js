import test from 'node:test';
import assert from 'node:assert/strict';
import { allocations, normalizeWorkspace, movePlannedItem, dailyLoad, scheduleFor } from '../src/planning.js';
const fixture=()=>normalizeWorkspace({
  projects:[{id:'a'},{id:'b'}],people:[{id:'sara'},{id:'ali'}],
  sprints:[{id:'a1',project:'a',start:'2026-10-05',end:'2026-10-16'},{id:'b1',project:'b',start:'2026-10-07',end:'2026-10-20'}],
  epics:[{id:'EA',project:'a',start:'2026-10-05',end:'2026-10-30',target:'2026-10-30'},{id:'EB',project:'b',start:'2026-10-07',end:'2026-11-04'}],
  stories:[{id:'S1',epic:'EA',person:'sara',sprint:'a1',points:5,actualStart:'2026-10-06',actualEnd:'2026-10-12'},{id:'S2',epic:'EA',person:'sara',sprint:'a1',points:3}]
});
test('resource drag moves the entire allocation while retaining actuals, points, and sprint membership',()=>{
  const data=fixture(),booking=allocations(data.stories,data.sprints,data.epics)[0];
  const result=movePlannedItem(data,{kind:'booking',id:booking.id,group:'ali',start:'2026-10-12',end:'2026-10-16'},'resources').data;
  assert.deepEqual(result.stories.map(s=>s.person),['ali','ali']);
  assert.equal(result.stories[0].actualStart,'2026-10-06');assert.equal(result.stories[0].actualEnd,'2026-10-12');assert.equal(result.stories[0].sprint,'a1');
  const bs=allocations(result.stories,result.sprints,result.epics);assert.equal(bs[0].points,8);assert.equal(dailyLoad('ali','2026-10-12',bs),1.6);assert.equal(dailyLoad('sara','2026-10-12',bs),0);
});
test('moving one story gives it its own explicit allocation without moving its sibling',()=>{
  const data=fixture(),result=movePlannedItem(data,{kind:'story',id:'S1',group:'S1',start:'2026-10-19',end:'2026-10-23'},'projects').data;
  const bs=allocations(result.stories,result.sprints,result.epics);assert.equal(bs.length,2);assert.equal(result.stories[1].plannedStart,null);assert.equal(bs.find(b=>b.stories[0].id==='S1').dailyRate,1);
});
test('moving a story across epics updates project and uses the destination calendar',()=>{
  const data=fixture(),result=movePlannedItem(data,{kind:'story',id:'S1',group:'EB',start:'2026-10-12',end:'2026-10-16'},'projects').data;
  assert.equal(result.stories[0].epic,'EB');assert.equal(result.stories[0].sprint,'b1');assert.equal(scheduleFor(result.stories[0],result.sprints,result.epics).project,'b');
});
test('explicit schedules work without a sprint and resizing rejects weekend-only ranges',()=>{
  const data=fixture();data.stories[0]={...data.stories[0],sprint:null,plannedStart:'2026-10-12',plannedEnd:'2026-10-16'};
  assert.equal(allocations(data.stories,data.sprints,data.epics).find(b=>!b.sprint).dailyRate,1);
  assert.throws(()=>movePlannedItem(data,{kind:'story',id:'S1',group:'EA',start:'2026-10-10',end:'2026-10-11'},'projects'),/working day/);
});
test('moving an epic across projects retains child planned windows and every actual date',()=>{
  const data=fixture();data.epics[0].actualStart='2026-10-06';
  const result=movePlannedItem(data,{kind:'epic',id:'EA',group:'b',start:'2026-10-12',end:'2026-11-06'},'roadmap').data;
  assert.equal(result.epics[0].project,'b');assert.equal(result.epics[0].plannedStart,'2026-10-12');assert.equal(result.epics[0].target,'2026-11-06');assert.equal(result.epics[0].actualStart,'2026-10-06');
  assert.equal(result.stories[0].plannedStart,'2026-10-05');assert.equal(result.stories[0].sprint,null);assert.equal(result.stories[0].actualEnd,'2026-10-12');assert.equal(allocations(result.stories,result.sprints,result.epics)[0].project,'b');
});
