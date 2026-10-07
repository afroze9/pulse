import test from 'node:test';
import assert from 'node:assert/strict';
import { startOfWeek } from '../src/planning.js';
import { timelineRangeDays, formatTimelineRange, readTimelineRange, saveTimelineRange } from '../src/timeline-range.js';

test('default weeks include earlier weekdays and handle Sunday and year boundaries', () => {
  assert.equal(startOfWeek('2026-10-07'), '2026-10-05');
  assert.equal(startOfWeek('2026-10-05'), '2026-10-05');
  assert.equal(startOfWeek('2026-10-11'), '2026-10-05');
  assert.equal(startOfWeek('2027-01-01'), '2026-12-28');
});

test('custom ranges count inclusive days across month, leap-year and DST boundaries', () => {
  assert.equal(timelineRangeDays('2026-10-05', '2026-10-25'), 21);
  assert.equal(timelineRangeDays('2026-10-05', '2026-10-05'), 1);
  assert.equal(timelineRangeDays('2028-02-28', '2028-03-01'), 3);
  assert.equal(timelineRangeDays('2026-03-07', '2026-03-10'), 4);
  assert.equal(timelineRangeDays('2026-10-31', '2026-11-02'), 3);
});

test('empty, impossible and reversed custom dates cannot change the range', () => {
  assert.equal(timelineRangeDays('', '2026-10-25'), null);
  assert.equal(timelineRangeDays('2026-02-30', '2026-03-10'), null);
  assert.equal(timelineRangeDays('2026-10-25', '2026-10-05'), null);
});

test('range labels include dates and disambiguate both years when needed', () => {
  assert.equal(formatTimelineRange('2026-10-05', '2026-10-25'), '5 Oct – 25 Oct 2026');
  assert.equal(formatTimelineRange('2026-12-28', '2027-01-10'), '28 Dec 2026 – 10 Jan 2027');
});

test('a chosen range restores on reload while broken preferences fall back safely', () => {
  let value = null;
  const storage = { getItem: () => value, setItem: (_key, next) => { value = next; } };
  assert.equal(readTimelineRange(storage), null);
  saveTimelineRange(storage, '2026-09-14', 10);
  assert.deepEqual(readTimelineRange(storage), { start: '2026-09-14', days: 10 });
  for (const bad of ['invalid JSON', '{"start":"2026-02-30","days":21}', '{"start":"2026-10-05","days":0}', '{"start":"2026-10-05","days":1.5}']) {
    value = bad;
    assert.equal(readTimelineRange(storage), null);
  }
  const unavailable = { getItem: () => { throw Error('Unavailable'); }, setItem: () => { throw Error('Unavailable'); } };
  assert.equal(readTimelineRange(unavailable), null);
  assert.doesNotThrow(() => saveTimelineRange(unavailable, '2026-10-05', 21));
});
