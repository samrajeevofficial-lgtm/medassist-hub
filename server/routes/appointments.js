const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { str, datetime, oneOf, HttpError } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['upcoming', 'completed', 'cancelled'];

function fields(b, { partial = false } = {}) {
  return {
    doctor_name: str(b.doctor_name, 'Doctor name', { required: !partial, max: 100 }),
    specialty: str(b.specialty, 'Specialty', { max: 60 }),
    location: str(b.location, 'Location', { max: 200 }),
    datetime: datetime(b.datetime, 'Date and time', { required: !partial }),
    reason: str(b.reason, 'Reason', { max: 300 }),
    notes: str(b.notes, 'Notes', { max: 2000 }),
    status: oneOf(b.status, 'Status', STATUSES) || 'upcoming',
  };
}

router.get('/', (req, res) => {
  const status = oneOf(req.query.status, 'Status', STATUSES);
  const rows = status
    ? db.prepare(`SELECT * FROM appointments WHERE user_id = ? AND status = ? ORDER BY datetime ${status === 'upcoming' ? 'ASC' : 'DESC'}`).all(req.user.id, status)
    : db.prepare('SELECT * FROM appointments WHERE user_id = ? ORDER BY datetime DESC').all(req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const f = fields(req.body);
  const info = db.prepare(`
    INSERT INTO appointments (user_id, doctor_name, specialty, location, datetime, reason, notes, status)
    VALUES (@user_id, @doctor_name, @specialty, @location, @datetime, @reason, @notes, @status)
  `).run({ user_id: req.user.id, ...f });
  res.status(201).json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM appointments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) throw new HttpError(404, 'Appointment not found.');
  const f = fields({ ...existing, ...req.body });
  db.prepare(`
    UPDATE appointments SET doctor_name=@doctor_name, specialty=@specialty, location=@location, datetime=@datetime,
      reason=@reason, notes=@notes, status=@status WHERE id=@id
  `).run({ ...f, id: existing.id });
  res.json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(existing.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM appointments WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) throw new HttpError(404, 'Appointment not found.');
  res.json({ ok: true });
});

module.exports = router;
