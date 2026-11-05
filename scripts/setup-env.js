#!/usr/bin/env node
// Creates .env from .env.example (if it doesn't exist yet) with a random JWT_SECRET,
// so logins survive server restarts. Safe to run more than once.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
    console.log('.env already exists - leaving it as it is.');
    process.exit(0);
}
let text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
text = text.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`);
fs.writeFileSync(envPath, text);
console.log('Created .env with a random JWT_SECRET.');
if (process.env.GEMINI_API_KEY) console.log('GEMINI_API_KEY found in the environment (Codespaces secret): AI triage will be on.');
