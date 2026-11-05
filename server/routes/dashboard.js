const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { date, time, todayLocal } = require('../utils/validate');
const { scheduleFor, hydrate } = require('./medications');
const { withStatus } = require('./vitals');

const router = express.Router();
router.use(requireAuth);

// One call that powers the home screen.
router.get('/', (req, res) => {
  const today = date(req.query.date, 'Date') || todayLocal();
  const now = time(req.query.now, 'Now') || '00:00';
  const userId = req.user.id;

  const doses = scheduleFor(userId, today);
  const nextDose = doses.find((d) => d.status === 'pending' && d.time >= now) || null;
  const overdue = doses.filter((d) => d.status === 'pending' && d.time < now);

  const lowStock = db.prepare('SELECT * FROM medications WHERE user_id = ? AND active = 1').all(userId)
    .map(hydrate).filter((m) => m.low_stock);

  const nowLocal = `${today}T${now}`;
  const nextAppointment = db.prepare(`
    SELECT * FROM appointments WHERE user_id = ? AND status = 'upcoming' AND datetime >= ? ORDER BY datetime LIMIT 1
  `).get(userId, nowLocal) || null;

  const latestVitals = db.prepare(`
    SELECT v.* FROM vitals v
    JOIN (SELECT type, MAX(recorded_at) m FROM vitals WHERE user_id = ? GROUP BY type) t ON v.type = t.type AND v.recorded_at = t.m
    WHERE v.user_id = ? GROUP BY v.type
  `).all(userId, userId).map(withStatus);

  const lastTriage = db.prepare('SELECT id, symptoms, severity, created_at FROM triage_history WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) || null;
  const contactsCount = db.prepare('SELECT COUNT(*) c FROM emergency_contacts WHERE user_id = ?').get(userId).c;

  res.json({
    today,
    doses: {
      total: doses.length,
      taken: doses.filter((d) => d.status === 'taken').length,
      list: doses,
      next: nextDose,
      overdue,
    },
    low_stock: lowStock,
    next_appointment: nextAppointment,
    latest_vitals: latestVitals,
    last_triage: lastTriage,
    has_emergency_contacts: contactsCount > 0,
  });
});

module.exports = router;
