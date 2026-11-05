const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { str, num, oneOf, HttpError } = require('../utils/validate');
const { analyse, maxSeverity } = require('../services/triageEngine');
const gemini = require('../services/gemini');
const { emergencyNumber, ambulanceNumber, mentalHealthHelpline } = require('../config');

const router = express.Router();

const triageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute and try again.' },
});

router.post('/', triageLimiter, optionalAuth, async (req, res) => {
  const symptoms = str(req.body.symptoms, 'Symptoms', { required: true, max: 2000 });
  const useAi = req.body.use_ai !== false;

  // Context: guest-supplied values, filled in from the profile for logged-in users.
  const ctx = {
    age: num(req.body.age, 'Age', { min: 0, max: 120 }),
    sex: oneOf(req.body.sex, 'Sex', ['female', 'male', 'other']),
    durationDays: num(req.body.duration_days, 'Duration', { min: 0, max: 3650 }),
    allergies: str(req.body.allergies, 'Allergies', { max: 500 }),
    conditions: null,
    currentMeds: [],
  };
  if (req.user) {
    const p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
    if (p) {
      if (ctx.age == null && p.dob) ctx.age = Math.floor((Date.now() - new Date(p.dob)) / (365.25 * 86400000));
      if (!ctx.sex && ['female', 'male', 'other'].includes(p.gender)) ctx.sex = p.gender;
      ctx.allergies = [ctx.allergies, p.allergies].filter(Boolean).join(', ') || null;
      ctx.conditions = p.conditions || null;
    }
    ctx.currentMeds = db.prepare('SELECT name FROM medications WHERE user_id = ? AND active = 1').all(req.user.id).map((m) => m.name);
  }

  const rules = analyse(symptoms, ctx);

  let ai = null;
  let aiStatus = gemini.isEnabled() ? 'ok' : 'disabled';
  let aiError = null;
  if (useAi && gemini.isEnabled()) {
    try {
      ai = await gemini.analyseWithGemini(symptoms, { ...ctx, durationDays: rules.duration_days });
    } catch (e) {
      aiStatus = 'error';
      aiError = e.message;
      console.warn('[triage] Gemini failed:', e.message, e.detail || '');
    }
  } else if (!useAi) {
    aiStatus = 'skipped';
  }

  // Final severity: the AI can raise it but never lower what the rules found.
  let severity = rules.severity;
  if (ai) severity = maxSeverity(severity, ai.severity);
  if (!ai && rules.conditions.length === 0 && severity === 'mild') severity = 'unknown';

  const response = {
    severity,
    crisis: rules.crisis,
    red_flags: rules.red_flags,
    urgent_reasons: rules.urgent_reasons,
    conditions: rules.conditions,
    warnings: rules.warnings,
    duration_days: rules.duration_days,
    ai,
    ai_status: aiStatus,
    ai_error: aiError,
    used_profile: Boolean(req.user),
    emergency_number: emergencyNumber,
    ambulance_number: ambulanceNumber,
    mental_health_helpline: mentalHealthHelpline,
    disclaimer: 'This is general information, not a diagnosis. If you are worried, or symptoms get worse, contact a doctor.',
  };

  if (req.user) {
    const info = db.prepare('INSERT INTO triage_history (user_id, symptoms, severity, result_json) VALUES (?, ?, ?, ?)')
      .run(req.user.id, symptoms, severity, JSON.stringify(response));
    response.history_id = info.lastInsertRowid;
  }

  res.json(response);
});

router.get('/history', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, symptoms, severity, created_at FROM triage_history WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.json(rows);
});

router.get('/history/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM triage_history WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) throw new HttpError(404, 'Not found.');
  res.json({ ...row, result: JSON.parse(row.result_json), result_json: undefined });
});

router.delete('/history/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM triage_history WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) throw new HttpError(404, 'Not found.');
  res.json({ ok: true });
});

module.exports = router;
