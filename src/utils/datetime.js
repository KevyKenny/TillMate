/** Storefront timezone (Zimbabwe, CAT / UTC+2). */
export const APP_TIME_ZONE = 'Africa/Harare';

/**
 * Parse values from SQLite `datetime('now')` as UTC so they display
 * correctly in Africa/Harare (avoids treating DB timestamps as naive local).
 */
export function parseSqliteUtc(s) {
  if (s == null) return new Date();
  const raw = String(s).trim();
  if (!raw) return new Date();
  if (raw.includes('T') && (raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw))) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw.endsWith('Z') ? raw : `${raw}Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * @param {string | null | undefined} isoOrSqlDateTime
 * @param {{ dateStyle?: Intl.DateTimeFormatOptions['dateStyle']; timeStyle?: Intl.DateTimeFormatOptions['timeStyle'] }} [options]
 */
export function formatHarare(isoOrSqlDateTime, options = {}) {
  if (isoOrSqlDateTime == null || String(isoOrSqlDateTime).trim() === '') {
    return '';
  }
  const d = parseSqliteUtc(isoOrSqlDateTime);
  const { dateStyle = 'medium', timeStyle = 'short' } = options;
  return d.toLocaleString('en-GB', {
    timeZone: APP_TIME_ZONE,
    dateStyle,
    timeStyle,
  });
}
