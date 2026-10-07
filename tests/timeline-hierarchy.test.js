import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineHierarchy } from '../src/timeline-hierarchy.js';

const groups = () => [
  { id: 'person', nestedGroups: ['project'], showNested: true },
  { id: 'project', nestedGroups: ['ticket'], showNested: false },
  { id: 'ticket' }
];

test('row choices survive screen changes and remain independent for each view', () => {
  const hierarchy = createTimelineHierarchy();
  hierarchy.remember('resources', [{ id: 'project', nestedGroups: ['ticket'], showNested: true }]);
  hierarchy.remember('projects', [{ id: 'person', nestedGroups: ['project'], showNested: false }]);
  assert.equal(hierarchy.apply('resources', groups())[1].showNested, true);
  assert.equal(hierarchy.apply('projects', groups())[0].showNested, false);
  assert.equal(hierarchy.apply('projects', groups())[1].showNested, false);
});

test('collapsing a parent hides all descendants without losing their expansion choices', () => {
  const hierarchy = createTimelineHierarchy();
  hierarchy.remember('resources', [
    { id: 'person', nestedGroups: ['project'], showNested: false },
    { id: 'project', nestedGroups: ['ticket'], showNested: true }
  ]);
  let restored = hierarchy.apply('resources', groups());
  assert.deepEqual(restored.map(row => row.visible), [true, false, false]);
  assert.equal(restored[1].showNested, true);
  hierarchy.remember('resources', [{ id: 'person', nestedGroups: ['project'], showNested: true }]);
  restored = hierarchy.apply('resources', groups());
  assert.deepEqual(restored.map(row => row.visible), [true, true, true]);
});

test('filtered rows keep their choices when they return and new rows retain defaults', () => {
  const hierarchy = createTimelineHierarchy();
  hierarchy.remember('resources', [{ id: 'project', nestedGroups: ['ticket'], showNested: true }]);
  hierarchy.apply('resources', []);
  assert.equal(hierarchy.apply('resources', groups())[1].showNested, true);
  assert.equal(hierarchy.apply('resources', [{ id: 'new', nestedGroups: ['other'], showNested: false }])[0].showNested, false);
});

test('search can reveal saved collapsed rows without replacing their normal state', () => {
  const hierarchy = createTimelineHierarchy();
  hierarchy.remember('projects', [{ id: 'person', nestedGroups: ['project'], showNested: false }]);
  assert(hierarchy.apply('projects', groups(), true).every(row => row.visible));
  assert.equal(hierarchy.apply('projects', groups())[0].showNested, false);
});

test('expand/collapse-all and individual rows persist across a fresh instance', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const hierarchy = createTimelineHierarchy({ storage });
  hierarchy.remember('resources', groups().map(row => ({ ...row, showNested: false })));
  let restored = createTimelineHierarchy({ storage }).apply('resources', groups());
  assert.deepEqual(restored.map(row => row.visible), [true, false, false]);
  hierarchy.remember('resources', groups().map(row => ({ ...row, showNested: true })));
  restored = createTimelineHierarchy({ storage }).apply('resources', groups());
  assert(restored.every(row => row.visible));
  assert.equal(restored[1].showNested, true);
});

test('library mutations do not alter input groups or saved choices', () => {
  const hierarchy = createTimelineHierarchy();
  const input = groups();
  const restored = hierarchy.apply('resources', input);
  restored[0].nestedGroups.push('another');
  restored[0].showNested = false;
  assert.deepEqual(input, groups());
  assert.equal(hierarchy.apply('resources', input)[0].showNested, true);
});

test('invalid or unavailable storage does not prevent in-memory preferences', () => {
  for (const storage of [
    { getItem: () => '{bad JSON', setItem: () => { throw Error('Unavailable'); } },
    { getItem: () => '{"resources":{"project":"false"}}', setItem: () => {} },
    { getItem: () => { throw Error('Unavailable'); }, setItem: () => { throw Error('Unavailable'); } }
  ]) {
    const hierarchy = createTimelineHierarchy({ storage });
    assert.equal(hierarchy.apply('resources', groups())[1].showNested, false);
    hierarchy.remember('resources', [{ id: 'project', nestedGroups: ['ticket'], showNested: true }]);
    assert.equal(hierarchy.apply('resources', groups())[1].showNested, true);
  }
});
