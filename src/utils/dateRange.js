/** @returns {string} YYYY-MM-DD in local calendar */
function toYmd(d) {
  return d.toLocaleDateString('en-CA');
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Monday = start of week */
function startOfWeekMonday(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeekSunday(d) {
  const start = startOfWeekMonday(d);
  const x = new Date(start);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
}

/**
 * @typedef {{ startYmd: string; endYmd: string; label?: string }} DateRange
 */

/** @returns {DateRange} */
export function getPresetRange(preset) {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case 'today':
      return { startYmd: toYmd(today), endYmd: toYmd(today), label: 'Today' };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yd = toYmd(y);
      return { startYmd: yd, endYmd: yd, label: 'Yesterday' };
    }
    case 'this_week': {
      const s = startOfWeekMonday(now);
      const e = endOfWeekSunday(now);
      return { startYmd: toYmd(s), endYmd: toYmd(e), label: 'This week' };
    }
    case 'last_week': {
      const thisStart = startOfWeekMonday(now);
      const lastStart = new Date(thisStart);
      lastStart.setDate(lastStart.getDate() - 7);
      const lastEnd = new Date(lastStart);
      lastEnd.setDate(lastEnd.getDate() + 6);
      return { startYmd: toYmd(startOfDay(lastStart)), endYmd: toYmd(endOfDay(lastEnd)), label: 'Last week' };
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startYmd: toYmd(startOfDay(s)), endYmd: toYmd(endOfDay(e)), label: 'This month' };
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startYmd: toYmd(startOfDay(s)), endYmd: toYmd(endOfDay(e)), label: 'Last month' };
    }
    case 'this_year': {
      const s = new Date(now.getFullYear(), 0, 1);
      const e = new Date(now.getFullYear(), 11, 31);
      return { startYmd: toYmd(startOfDay(s)), endYmd: toYmd(endOfDay(e)), label: 'This year' };
    }
    default:
      return { startYmd: toYmd(today), endYmd: toYmd(today), label: 'Today' };
  }
}
