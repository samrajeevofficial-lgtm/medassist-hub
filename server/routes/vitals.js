const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { str, num, datetime, oneOf, bad, HttpError } = require('../utils/validate');
const { VITAL_TYPES, classify } = require('../utils/vitalRanges');

const router = express.Router();
router.use(requireAuth);

const TYPES = Object.keys(VITAL_TYPES);

function withStatus(row) {
  const meta = VITAL_TYPES[row.type];
  return {
    ...row,
    unit: meta.unit,
    label: meta.label,
    display: row.type === 'blood_pressure' ? `${row.value1}/${row.value2}` : String(row.value1),
    status: classify(row.type, row.value1, row.value2, row.context),
  };
}

router.get('/types', (_req, res) => res.json(VITAL_TYPES));

router.get('/', (req, res) => {
  const type = oneOf(req.query.type, 'Type', TYPES);
  const days = num(req.query.days, 'Days', { min: 1, max: 3650, int: true }) || 90;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 16);
  const rows = type
    ? db.prepare('SELECT * FROM vitals WHERE user_id = ? AND type = ? AND recorded_at >= ? ORDER BY recorded_at').all(req.user.id, type, since)
    : db.prepare('SELECT * FROM vitals WHERE user_id = ? AND recorded_at >= ? ORDER BY recorded_at').all(req.user.id, since);
  res.json(rows.map(withStatus));
});

// Latest reading of each type
router.get('/summary', (req, res) => {
  const rows = db.prepare(`
    SELECT v.* FROM vitals v
    JOIN (SELECT type, MAX(recorded_at) m FROM vitals WHERE user_id = ? GROUP BY type) t
      ON v.type = t.type AND v.recorded_at = t.m
    WHERE v.user_id = ?
    GROUP BY v.type
  `).all(req.user.id, req.user.id);
  res.json(rows.map(withStatus));
});

router.post('/', (req, res) => {
  const b = req.body;
  const type = oneOf(b.type, 'Type', TYPES, { required: true });
  const meta = VITAL_TYPES[type];
  const value1 = num(b.value1, type === 'blood_pressure' ? 'Systolic' : meta.label, { required: true, min: meta.min, max: meta.max });
  let value2 = null;
  if (type === 'blood_pressure') {
    value2 = num(b.value2, 'Diastolic', { required: true, min: meta.min2, max: meta.max2 });
    if (value2 >= value1) throw bad('Diastolic (lower number) should be less than systolic (upper number).');
  }
  const recorded_at = datetime(b.recorded_at, 'Recorded at') || new Date().toISOString().slice(0, 16);
  const context = type === 'blood_sugar' ? oneOf(b.context, 'Context', ['fasting', 'after_meal', 'random']) : null;
  const note = str(b.note, 'Note', { max: 300 });

  const info = db.prepare('INSERT INTO vitals (user_id, type, value1, value2, context, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, type, value1, value2, context, note, recorded_at);
  res.status(201).json(withStatus(db.prepare('SELECT * FROM vitals WHERE id = ?').get(info.lastInsertRowid)));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM vitals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) throw new HttpError(404, 'Reading not found.');
  res.json({ ok: true });
});

module.exports = router;
module.exports.withStatus = withStatus;
