const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { str, num, date, oneOf, HttpError } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'];

function getProfile(userId) {
  const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(userId);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) || {};
  const contacts = db.prepare('SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY id').all(userId);
  let age = null;
  if (profile.dob) {
    const b = new Date(profile.dob);
    const now = new Date();
    age = now.getFullYear() - b.getFullYear() - (now < new Date(now.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
  }
  let bmi = null;
  if (profile.height_cm && profile.weight_kg) {
    bmi = Math.round((profile.weight_kg / (profile.height_cm / 100) ** 2) * 10) / 10;
  }
  return { user, profile: { ...profile, age, bmi }, contacts };
}

router.get('/', (req, res) => {
  res.json(getProfile(req.user.id));
});

router.put('/', (req, res) => {
  const b = req.body;
  const name = str(b.name, 'Name', { max: 80 });
  const fields = {
    dob: date(b.dob, 'Date of birth'),
    gender: oneOf(b.gender, 'Gender', GENDERS),
    blood_group: oneOf(b.blood_group, 'Blood group', BLOOD_GROUPS),
    height_cm: num(b.height_cm, 'Height', { min: 30, max: 260 }),
    weight_kg: num(b.weight_kg, 'Weight', { min: 1, max: 400 }),
    allergies: str(b.allergies, 'Allergies', { max: 1000 }),
    conditions: str(b.conditions, 'Conditions', { max: 1000 }),
    notes: str(b.notes, 'Notes', { max: 2000 }),
  };
  if (fields.dob && fields.dob > new Date().toISOString().slice(0, 10)) {
    throw new HttpError(400, 'Date of birth cannot be in the future.');
  }

  const tx = db.transaction(() => {
    if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    db.prepare(`
      INSERT INTO profiles (user_id, dob, gender, blood_group, height_cm, weight_kg, allergies, conditions, notes, updated_at)
      VALUES (@user_id, @dob, @gender, @blood_group, @height_cm, @weight_kg, @allergies, @conditions, @notes, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        dob=@dob, gender=@gender, blood_group=@blood_group, height_cm=@height_cm, weight_kg=@weight_kg,
        allergies=@allergies, conditions=@conditions, notes=@notes, updated_at=datetime('now')
    `).run({ user_id: req.user.id, ...fields });
  });
  tx();
  res.json(getProfile(req.user.id));
});

// ---- Emergency contacts ----
function contactFields(b) {
  return {
    name: str(b.name, 'Contact name', { required: true, max: 80 }),
    relation: str(b.relation, 'Relation', { max: 40 }),
    phone: (() => {
      const p = str(b.phone, 'Phone', { required: true, max: 20 });
      if (!/^\+?[\d\s\-()]{6,20}$/.test(p)) throw new HttpError(400, 'Please enter a valid phone number.');
      return p;
    })(),
  };
}

router.post('/contacts', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM emergency_contacts WHERE user_id = ?').get(req.user.id).c;
  if (count >= 5) throw new HttpError(400, 'You can save up to 5 emergency contacts.');
  const f = contactFields(req.body);
  const info = db.prepare('INSERT INTO emergency_contacts (user_id, name, relation, phone) VALUES (?, ?, ?, ?)')
    .run(req.user.id, f.name, f.relation, f.phone);
  res.status(201).json(db.prepare('SELECT * FROM emergency_contacts WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/contacts/:id', (req, res) => {
  const f = contactFields(req.body);
  const info = db.prepare('UPDATE emergency_contacts SET name=?, relation=?, phone=? WHERE id=? AND user_id=?')
    .run(f.name, f.relation, f.phone, req.params.id, req.user.id);
  if (!info.changes) throw new HttpError(404, 'Contact not found.');
  res.json(db.prepare('SELECT * FROM emergency_contacts WHERE id = ?').get(req.params.id));
});

router.delete('/contacts/:id', (req, res) => {
  const info = db.prepare('DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) throw new HttpError(404, 'Contact not found.');
  res.json({ ok: true });
});

module.exports = router;
module.exports.getProfile = getProfile;
