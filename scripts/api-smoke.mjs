// Run against an isolated Pulse instance and disposable data directory.
// node scripts/api-smoke.mjs http://127.0.0.1:5082 --allow-write
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = new URL(process.argv[2] || 'http://127.0.0.1:5082');
assert(['127.0.0.1','localhost','[::1]'].includes(base.hostname), 'Smoke test is restricted to loopback.');
assert(base.port !== '5080', 'Do not run destructive smoke tests against the user preview.');
assert(process.argv.includes('--allow-write'), 'Pass --allow-write only for an isolated disposable instance.');

async function request(path, method='GET', body) {
  const response = await fetch(new URL(path,base), {
    method, headers: body ? {'Content-Type':'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json();
  return {status:response.status,body:payload};
}
const initial = await request('/api/workspace');
assert.equal(initial.status,200);
const before=initial.body;
assert(Number.isInteger(before.version));
assert(Array.isArray(before.data.stories));
assert(Array.isArray(before.configuration.projects));
const edited=structuredClone(before.data);
const story=edited.stories.find(s=>s.person&&s.epic);
assert(story,'Fixture must contain an assigned story');
story.plannedStart='2026-10-12'; story.plannedEnd='2026-10-16';
story.actualStart='2026-10-13'; story.actualEnd='2026-10-15';
const configuration=structuredClone(before.configuration);
configuration.projects=configuration.projects.slice(0,1);
const command={expectedVersion:before.version,data:edited,configuration,commandId:randomUUID()};
const saved=await request('/api/workspace','PUT',command);
assert.equal(saved.status,200,JSON.stringify(saved.body));
assert(saved.body.version>before.version);
assert.equal(saved.body.canUndo,true);
assert.equal(saved.body.data.stories.find(s=>s.id===story.id).actualEnd,'2026-10-15');
assert.deepEqual(saved.body.configuration.projects,configuration.projects);
const replay=await request('/api/workspace','PUT',command);
assert.equal(replay.status,200,'Command replay must be idempotent');
assert.equal(replay.body.version,saved.body.version);
const stale=await request('/api/workspace','PUT',{...command,commandId:randomUUID()});
assert.equal(stale.status,409,'Stale edits must conflict');
const reloaded=(await request('/api/workspace')).body;
assert.equal(reloaded.version,saved.body.version);
assert.equal(reloaded.data.stories.find(s=>s.id===story.id).plannedStart,'2026-10-12');
const invalid=structuredClone(reloaded.data);
invalid.stories.find(s=>s.id===story.id).actualEnd='2026-10-01';
const rejected=await request('/api/workspace','PUT',{expectedVersion:reloaded.version,data:invalid,configuration:reloaded.configuration,commandId:randomUUID()});
assert([400,422].includes(rejected.status),'End-before-start must fail validation');
assert.equal((await request('/api/workspace')).body.version,reloaded.version,'Rejected edits must not change state');
const undo=await request('/api/workspace/undo','POST',{expectedVersion:reloaded.version,commandId:randomUUID()});
assert.equal(undo.status,200,JSON.stringify(undo.body));
assert(undo.body.version>reloaded.version);
assert.deepEqual(undo.body.data,before.data,'Undo must restore data');
assert.deepEqual(undo.body.configuration,before.configuration,'Undo must restore scope');
const jira=await request('/api/jira/status');
assert.equal(jira.status,200);
assert(!JSON.stringify(jira.body).match(/"(?:apiToken|accessToken|refreshToken|password)"\s*:/i),'Status must not contain credentials');
console.log('PASS: workspace contract, persistence reads, configuration, idempotency, conflicts, validation, undo, safe Jira status.');
