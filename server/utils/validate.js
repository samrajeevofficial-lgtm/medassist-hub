// Small validation helpers so routes stay readable.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);

function str(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw bad(`${field} is required.`);
    return null;
  }
  const s = String(value).trim();
  if (s.length > max) throw bad(`${field} must be at most ${max} characters.`);
  return s;
}

function num(value, field, { required = false, min = -Infinity, max = Infinity, int = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`${field} is required.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || (int && !Number.isInteger(n))) throw bad(`${field} must be a ${int ? 'whole ' : ''}number.`);
  if (n < min || n > max) throw bad(`${field} must be between ${min} and ${max}.`);
  return n;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

function date(value, field, opts = {}) {
  const s = str(value, field, opts);
  if (s && !DATE_RE.test(s)) throw bad(`${field} must be a date (YYYY-MM-DD).`);
  return s;
}

function time(value, field, opts = {}) {
  const s = str(value, field, opts);
  if (s && !TIME_RE.test(s)) throw bad(`${field} must be a time (HH:MM).`);
  return s;
}

function datetime(value, field, opts = {}) {
  const s = str(value, field, opts);
  if (s && !DATETIME_RE.test(s.slice(0, 16))) throw bad(`${field} must be a date and time.`);
  return s ? s.slice(0, 16) : s;
}

function oneOf(value, field, options, { required = false } = {}) {
  const s = str(value, field, { required });
  if (s && !options.includes(s)) throw bad(`${field} must be one of: ${options.join(', ')}.`);
  return s;
}

// Local date helpers (the client sends its own "today" so timezones line up).
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

module.exports = { HttpError, bad, str, num, date, time, datetime, oneOf, todayLocal, addDays, TIME_RE, DATE_RE };
