const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'change-me-to-a-long-random-string') {
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[config] JWT_SECRET not set in .env - using a temporary secret. Users will be logged out when the server restarts.');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret,
  jwtExpiresIn: '7d',
  dbFile: process.env.DB_FILE || path.join(__dirname, '..', 'data', 'medassist.db'),
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim(),
  openFdaApiKey: (process.env.OPENFDA_API_KEY || '').trim(),
  emergencyNumber: process.env.EMERGENCY_NUMBER || '112',
  ambulanceNumber: process.env.AMBULANCE_NUMBER || '108',
  mentalHealthHelpline: process.env.MENTAL_HEALTH_HELPLINE || '14416',
  defaultCountryCode: (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, ''),
};
