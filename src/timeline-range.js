import { addDays, day, iso } from './planning.js';

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && iso(day(value)) === value;
const storageKey = 'pulse.timeline-range';

export function timelineRangeDays(start, end) {
  if (!validDate(start) || !validDate(end) || end < start) return null;
  // Date-only UTC arithmetic counts calendar days across daylight-saving changes.
  return (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
}

export function formatTimelineRange(start, end) {
  const sameYear = day(start).getFullYear() === day(end).getFullYear();
  const format = (date, year) => day(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
  return `${format(start, !sameYear)} – ${format(end, true)}`;
}

export function readTimelineRange(storage) {
  try {
    const range = JSON.parse(storage.getItem(storageKey));
    if (range && validDate(range.start) && Number.isSafeInteger(range.days) && range.days > 0 && validDate(addDays(range.start, range.days - 1))) return range;
  } catch { /* Unavailable storage or a stale preference must not block workspace loading. */ }
  return null;
}

export function saveTimelineRange(storage, start, days) {
  try { storage.setItem(storageKey, JSON.stringify({ start, days })); } catch { /* The controls still work without persistent storage. */ }
}
