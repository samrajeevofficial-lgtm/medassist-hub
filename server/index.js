require('./net'); // must load first: network tuning for outgoing API calls
const path = require('path');
const express = require('express');
const config = require('./config');
require('./db'); // creates tables on first run

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

// Basic security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ---- API ----
app.get('/api/health', (_req, res) => res.json({ ok: true, version: '2.0.0' }));
// Public settings the frontend needs on load
app.get('/api/meta', (_req, res) => {
  res.json({
    ai_enabled: Boolean(config.geminiApiKey),
    emergency_number: config.emergencyNumber,
    ambulance_number: config.ambulanceNumber,
    mental_health_helpline: config.mentalHealthHelpline,
    default_country_code: config.defaultCountryCode,
    demo_available: require('./routes/auth').demoAvailable(),
    common_symptoms: require('./data/symptoms').COMMON_SYMPTOMS,
  });
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/medications', require('./routes/medications'));
app.use('/api/vitals', require('./routes/vitals'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/triage', require('./routes/triage'));
app.use('/api', require('./routes/health-data'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ---- Frontend ----
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ---- Errors ----
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON in request.' });
  const status = err.status || 500;
  if (!err.status) console.error(err);
  // Only show messages from errors we raised on purpose; hide internal details.
  res.status(status).json({ error: err.status ? err.message : 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`MedAssist Hub running at http://localhost:${config.port}`);
  console.log(`AI triage (Gemini): ${config.geminiApiKey ? `enabled (${config.geminiModel})` : 'disabled - add GEMINI_API_KEY to .env to enable'}`);
});
