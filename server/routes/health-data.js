// Routes that call free public data sources: openFDA (drug info) and OpenStreetMap (nearby places).
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { str, num, HttpError } = require('../utils/validate');
const openfda = require('../services/openfda');
const overpass = require('../services/overpass');
const { FIRST_AID } = require('../data/firstAid');

const router = express.Router();

const externalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute and try again.' },
});

// ---- Drug information ----
router.get('/drugs/lookup', externalLimiter, async (req, res) => {
  const name = str(req.query.name, 'Medicine name', { required: true, max: 100 });
  try {
    const info = await openfda.lookup(name);
    res.json(info);
  } catch (e) {
    throw new HttpError(502, `Drug information service is unavailable right now (${e.message}).`);
  }
});

router.post('/drugs/interactions', externalLimiter, async (req, res) => {
  const names = Array.isArray(req.body.names) ? req.body.names.map(String) : [];
  if (names.length < 2) throw new HttpError(400, 'Add at least two medicines to check.');
  res.json(await openfda.checkInteractions(names));
});

// Check all of the logged-in user's active medications against each other.
router.get('/drugs/my-interactions', requireAuth, externalLimiter, async (req, res) => {
  const names = db.prepare('SELECT name FROM medications WHERE user_id = ? AND active = 1').all(req.user.id).map((m) => m.name);
  if (names.length < 2) return res.json({ checked: names.map((n) => ({ name: n })), interactions: [], note: 'Add at least two active medicines to check interactions.' });
  res.json(await openfda.checkInteractions(names));
});

// ---- Nearby hospitals / clinics / pharmacies ----
router.get('/places/nearby', externalLimiter, async (req, res) => {
  const lat = num(req.query.lat, 'Latitude', { required: true, min: -90, max: 90 });
  const lng = num(req.query.lng, 'Longitude', { required: true, min: -180, max: 180 });
  const radius = num(req.query.radius, 'Radius', { min: 500, max: 25000, int: true }) || 5000;
  const allowed = ['hospital', 'clinic', 'pharmacy'];
  const types = String(req.query.types || 'hospital,clinic').split(',').map((t) => t.trim()).filter((t) => allowed.includes(t));
  if (!types.length) throw new HttpError(400, 'Choose at least one place type.');
  try {
    res.json(await overpass.findNearby({ lat, lng, radius, types }));
  } catch (e) {
    throw new HttpError(502, e.message);
  }
});

router.get('/places/geocode', externalLimiter, async (req, res) => {
  const q = str(req.query.q, 'Location', { required: true, max: 150 });
  try {
    res.json(await overpass.geocode(q));
  } catch (e) {
    throw new HttpError(502, `Location search is unavailable right now (${e.message}).`);
  }
});

// ---- First aid guides ----
router.get('/firstaid', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const list = q
    ? FIRST_AID.filter((g) => [g.title, g.category, ...(g.tags || []), ...g.steps].join(' ').toLowerCase().includes(q))
    : FIRST_AID;
  res.json(list);
});

module.exports = router;
