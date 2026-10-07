import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryRows,renderDeliveryPage,PAGE_ROWS} from '../src/delivery-export.js';
const data={projects:[{id:'p',name:'Alpha & Beta'}],people:[],sprints:[{id:'sp',project:'p',start:'2026-10-01',end:'2026-10-15'}],epics:[{id:'E',project:'p',title:'Epic <script>alert(1)</script>',target:'2026-10-20'}],stories:[{id:'S',project:'p',epic:'E',title:'Inherited Task',type:'task',person:null,sprint:'sp'},{id:'U',project:'p',title:'Unscheduled',type:'story',person:null}]};
const scope={people:[],types:['epic','task','story']};
const options={start:'2026-10-05',end:'2026-10-21',detail:'tasks',actuals:true,milestones:true,unscheduled:true,title:'Plan & Delivery'};
test('export rolls up children and retains sprint provenance without modifying the workspace',()=>{
 const before=JSON.stringify(data),model=deliveryRows(data,['p'],scope,options);
 assert.equal(model.rows.find(r=>r.id==='S').inherited,true);
 assert.equal(model.rows.find(r=>r.id==='E').rolledUp,true);
 assert.deepEqual(model.rows[0].plan,{start:'2026-10-01',end:'2026-10-15'});
 assert.equal(model.rows.find(r=>r.id==='U').plan,null);
 assert.equal(JSON.stringify(data),before);
 const svg=renderDeliveryPage(model,options);
 assert(svg.includes('Plan &amp; Delivery'));assert(!svg.includes('<script>'));assert(!svg.includes('NaN'));
 assert(svg.includes('‹'));
});
test('project, people, type, and undated filters are respected',()=>{
 const workspace={...data,stories:[...data.stories,{...data.stories[0],id:'HIDDEN',person:'other'}]};
 assert.equal(deliveryRows(workspace,[],scope,options).rows.length,0);
 const model=deliveryRows(workspace,['p'],{...scope,types:['task']},{...options,unscheduled:false});
 assert.deepEqual(model.rows.map(r=>r.id),['p','S']);
});
test('actual-only and milestone-only records stay visible in range',()=>{
 const workspace={...data,epics:[{...data.epics[0],target:'2026-10-10'}],stories:[{...data.stories[1],actualStart:'2026-10-12'}]};
 const model=deliveryRows(workspace,['p'],scope,{...options,unscheduled:false});
 assert(model.rows.some(r=>r.id==='E'));assert(model.rows.some(r=>r.id==='U'));
 const hidden=deliveryRows(workspace,['p'],scope,{...options,unscheduled:false,actuals:false,milestones:false});
 assert.equal(hidden.rows.length,0);
});
test('invalid or overly broad dates return readable validation',()=>{
 for(const end of ['2026-02-30','2026-10-01','2029-01-01',''])assert(deliveryRows(data,['p'],scope,{...options,end}).error);
});
test('pagination preserves every row and repeats the range and legend',()=>{
 const rows=Array.from({length:29},(_,i)=>({id:'S'+i,title:'Ticket '+i,kind:'story',depth:1,plan:{start:'2026-10-06',end:'2026-10-10'}}));
 const model={rows,outside:0,undated:0};
 const pages=Array.from({length:Math.ceil(rows.length/PAGE_ROWS)},(_,i)=>renderDeliveryPage(model,options,i));
 rows.forEach(r=>assert.equal(pages.filter(p=>p.includes('>'+r.title+'</text>')).length,1));
 assert(pages.every(p=>p.includes('Planned')&&p.includes('5 Oct')));
});
