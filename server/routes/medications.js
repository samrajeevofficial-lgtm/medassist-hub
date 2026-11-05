const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { str, num, date, time, oneOf, bad, HttpError, todayLocal, addDays, TIME_RE } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

function hydrate(med) {
  if (!med) return med;
  const times = JSON.parse(med.times);
  const lowStock = med.pills_remaining !== null && med.pills_remaining <= med.refill_threshold;
  const dailyUse = times.length * med.pills_per_dose;
  const daysLeft = med.pills_remaining !== null && dailyUse > 0 ? Math.floor(med.pills_remaining / dailyUse) : null;
  return { ...med, times, active: !!med.active, low_stock: lowStock, days_left: daysLeft };
}

function getOwnedMed(userId, id) {
  const med = db.prepare('SELECT * FROM medications WHERE id = ? AND user_id = ?').get(id, userId);
  if (!med) throw new HttpError(404, 'Medication not found.');
  return med;
}

function parseFields(b) {
  let times = Array.isArray(b.times) ? b.times : [b.times].filter(Boolean);
  times = [...new Set(times.map((t) => String(t).trim()))].sort();
  if (times.length === 0) throw bad('Add at least one reminder time.');
  if (times.length > 8) throw bad('At most 8 reminder times per day.');
  if (!times.every((t) => TIME_RE.test(t))) throw bad('Reminder times must be in HH:MM format.');

  const f = {
    name: str(b.name, 'Medication name', { required: true, max: 100 }),
    dosage: str(b.dosage, 'Dosage', { required: true, max: 60 }),
    times: JSON.stringify(times),
    instructions: str(b.instructions, 'Instructions', { max: 200 }),
    start_date: date(b.start_date, 'Start date') || todayLocal(),
    end_date: date(b.end_date, 'End date'),
    pills_remaining: num(b.pills_remaining, 'Pills remaining', { min: 0, max: 10000, int: true }),
    pills_per_dose: num(b.pills_per_dose, 'Pills per dose', { min: 1, max: 20, int: true }) ?? 1,
    refill_threshold: num(b.refill_threshold, 'Refill alert threshold', { min: 0, max: 1000, int: true }) ?? 5,
    active: b.active === undefined ? 1 : (b.active ? 1 : 0),
  };
  if (f.end_date && f.end_date < f.start_date) throw bad('End date cannot be before start date.');
  return f;
}

// List all medications
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM medications WHERE user_id = ? ORDER BY active DESC, name COLLATE NOCASE').all(req.user.id);
  res.json(rows.map(hydrate));
});

router.post('/', (req, res) => {
  const f = parseFields(req.body);
  const info = db.prepare(`
    INSERT INTO medications (user_id, name, dosage, times, instructions, start_date, end_date, pills_remaining, pills_per_dose, refill_threshold, active)
    VALUES (@user_id, @name, @dosage, @times, @instructions, @start_date, @end_date, @pills_remaining, @pills_per_dose, @refill_threshold, @active)
  `).run({ user_id: req.user.id, ...f });
  res.status(201).json(hydrate(db.prepare('SELECT * FROM medications WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  getOwnedMed(req.user.id, req.params.id);
  const f = parseFields(req.body);
  db.prepare(`
    UPDATE medications SET name=@name, dosage=@dosage, times=@times, instructions=@instructions, start_date=@start_date,
      end_date=@end_date, pills_remaining=@pills_remaining, pills_per_dose=@pills_per_dose, refill_threshold=@refill_threshold, active=@active
    WHERE id=@id AND user_id=@user_id
  `).run({ ...f, id: req.params.id, user_id: req.user.id });
  res.json(hydrate(db.prepare('SELECT * FROM medications WHERE id = ?').get(req.params.id)));
});

// Quick refill: add pills to stock
router.post('/:id/refill', (req, res) => {
  const med = getOwnedMed(req.user.id, req.params.id);
  const amount = num(req.body.amount, 'Refill amount', { required: true, min: 1, max: 10000, int: true });
  db.prepare('UPDATE medications SET pills_remaining = ? WHERE id = ?').run((med.pills_remaining || 0) + amount, med.id);
  res.json(hydrate(db.prepare('SELECT * FROM medications WHERE id = ?').get(med.id)));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM medications WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) throw new HttpError(404, 'Medication not found.');
  res.json({ ok: true });
});

// ---- Schedule & dose logging ----

function activeMedsOn(userId, day) {
  return db.prepare(`
    SELECT * FROM medications
    WHERE user_id = ? AND active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
  `).all(userId, day, day);
}

function scheduleFor(userId, day) {
  const meds = activeMedsOn(userId, day);
  const logs = db.prepare('SELECT * FROM dose_logs WHERE user_id = ? AND scheduled_date = ?').all(userId, day);
  const logMap = new Map(logs.map((l) => [`${l.medication_id}|${l.scheduled_time}`, l]));
  const doses = [];
  for (const med of meds) {
    for (const t of JSON.parse(med.times)) {
      const log = logMap.get(`${med.id}|${t}`);
      doses.push({
        medication_id: med.id,
        name: med.name,
        dosage: med.dosage,
        instructions: med.instructions,
        date: day,
        time: t,
        status: log ? log.status : 'pending',
        logged_at: log ? log.logged_at : null,
      });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

router.get('/schedule', (req, res) => {
  const day = date(req.query.date, 'Date') || todayLocal();
  res.json({ date: day, doses: scheduleFor(req.user.id, day) });
});

// Mark a dose as taken / skipped / missed. Keeps pill count in sync.
router.post('/:id/log', (req, res) => {
  const med = getOwnedMed(req.user.id, req.params.id);
  const day = date(req.body.date, 'Date', { required: true });
  const t = time(req.body.time, 'Time', { required: true });
  const status = oneOf(req.body.status, 'Status', ['taken', 'skipped', 'missed'], { required: true });
  if (!JSON.parse(med.times).includes(t)) throw bad('That time is not on this medication’s schedule.');

  const tx = db.transaction(() => {
    const prev = db.prepare('SELECT status FROM dose_logs WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ?')
      .get(med.id, day, t);
    db.prepare(`
      INSERT INTO dose_logs (medication_id, user_id, scheduled_date, scheduled_time, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(medication_id, scheduled_date, scheduled_time) DO UPDATE SET status = excluded.status, logged_at = datetime('now')
    `).run(med.id, req.user.id, day, t, status);

    if (med.pills_remaining !== null) {
      const wasTaken = prev?.status === 'taken';
      const isTaken = status === 'taken';
      if (isTaken && !wasTaken) {
        db.prepare('UPDATE medications SET pills_remaining = MAX(0, pills_remaining - pills_per_dose) WHERE id = ?').run(med.id);
      } else if (!isTaken && wasTaken) {
        db.prepare('UPDATE medications SET pills_remaining = pills_remaining + pills_per_dose WHERE id = ?').run(med.id);
      }
    }
  });
  tx();
  res.json({ ok: true, medication: hydrate(db.prepare('SELECT * FROM medications WHERE id = ?').get(med.id)) });
});

// Undo a log entry
router.delete('/:id/log', (req, res) => {
  const med = getOwnedMed(req.user.id, req.params.id);
  const day = date(req.query.date, 'Date', { required: true });
  const t = time(req.query.time, 'Time', { required: true });
  const tx = db.transaction(() => {
    const prev = db.prepare('SELECT status FROM dose_logs WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ?').get(med.id, day, t);
    if (!prev) return;
    db.prepare('DELETE FROM dose_logs WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ?').run(med.id, day, t);
    if (prev.status === 'taken' && med.pills_remaining !== null) {
      db.prepare('UPDATE medications SET pills_remaining = pills_remaining + pills_per_dose WHERE id = ?').run(med.id);
    }
  });
  tx();
  res.json({ ok: true, medication: hydrate(db.prepare('SELECT * FROM medications WHERE id = ?').get(med.id)) });
});

// Adherence over the last N days. Only doses whose time has passed count.
router.get('/adherence', (req, res) => {
  const days = num(req.query.days, 'Days', { min: 1, max: 90, int: true }) || 7;
  const today = date(req.query.today, 'Today') || todayLocal();
  const now = time(req.query.now, 'Now') || '23:59';

  const perDay = [];
  const perMed = new Map();
  let totals = { scheduled: 0, taken: 0, skipped: 0, missed: 0 };

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const doses = scheduleFor(req.user.id, day).filter((d) => day < today || d.time <= now);
    const row = { date: day, scheduled: doses.length, taken: 0, skipped: 0, missed: 0 };
    for (const d of doses) {
      const s = d.status === 'pending' ? 'missed' : d.status; // a past dose with no log counts as missed
      row[s]++;
      const m = perMed.get(d.medication_id) || { medication_id: d.medication_id, name: d.name, scheduled: 0, taken: 0 };
      m.scheduled++;
      if (s === 'taken') m.taken++;
      perMed.set(d.medication_id, m);
    }
    totals.scheduled += row.scheduled;
    totals.taken += row.taken;
    totals.skipped += row.skipped;
    totals.missed += row.missed;
    row.rate = row.scheduled ? Math.round((row.taken / row.scheduled) * 100) : null;
    perDay.push(row);
  }

  res.json({
    days,
    totals: { ...totals, rate: totals.scheduled ? Math.round((totals.taken / totals.scheduled) * 100) : null },
    per_day: perDay,
    per_medication: [...perMed.values()].map((m) => ({ ...m, rate: m.scheduled ? Math.round((m.taken / m.scheduled) * 100) : null })),
  });
});

module.exports = router;
module.exports.scheduleFor = scheduleFor;
module.exports.hydrate = hydrate;
