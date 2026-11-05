#!/usr/bin/env node
// Connectivity check: run "npm run check" before a demo.
// Tests every outside service the app uses and prints what works and what doesn't.
require('../server/net');
const config = require('../server/config');
const { fetchWithTimeout } = require('../server/net');

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const UA = { 'User-Agent': 'MedAssistHub/2.1 (connectivity check)' };

async function timed(fn) {
    const t = Date.now();
    try {
        const detail = await fn();
        return { ok: true, ms: Date.now() - t, detail };
    } catch (e) {
        return { ok: false, ms: Date.now() - t, detail: e.message };
    }
}

function print(name, r) {
    const status = r.ok ? green('OK  ') : red('FAIL');
    console.log(`${status} ${name.padEnd(28)} ${String(r.ms).padStart(6)} ms  ${r.detail || ''}`);
}

(async () => {
    console.log(`\nMedAssist Hub connectivity check  (Node ${process.version})\n`);

    print('Overpass (overpass-api.de)', await timed(async () => {
        const res = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
            method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent('[out:json][timeout:15];node["amenity"="hospital"](around:2000,12.9716,77.5946);out 3;')}`,
        }, 25000, 'Overpass');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return `${(await res.json()).elements.length} hospitals found`;
    }));

    print('Overpass (kumi.systems)', await timed(async () => {
        const res = await fetchWithTimeout('https://overpass.kumi.systems/api/interpreter', {
            method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent('[out:json][timeout:15];node["amenity"="hospital"](around:2000,12.9716,77.5946);out 3;')}`,
        }, 25000, 'Overpass');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return `${(await res.json()).elements.length} hospitals found`;
    }));

    print('Nominatim (area search)', await timed(async () => {
        const res = await fetchWithTimeout('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Bengaluru', { headers: UA }, 15000, 'Nominatim');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json())[0]?.display_name?.slice(0, 40) || 'no result';
    }));

    print('openFDA (medicine info)', await timed(async () => {
        const res = await fetchWithTimeout('https://api.fda.gov/drug/label.json?search=openfda.generic_name:%22acetaminophen%22&limit=1', { headers: UA }, 20000, 'openFDA');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return 'label found';
    }));

    if (!config.geminiApiKey) {
        console.log(`${yellow('SKIP')} Gemini AI                    -       GEMINI_API_KEY is not set (rule-based triage still works)`);
    } else {
        const list = await timed(async () => {
            const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': config.geminiApiKey } }, 20000, 'Gemini');
            if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
            const models = (await res.json()).models
                .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /flash/i.test(m.name))
                .map((m) => m.name.replace('models/', ''));
            return models;
        });
        print('Gemini (API key + models)', { ...list, detail: list.ok ? `${list.detail.length} flash models available` : list.detail });
        if (list.ok) {
            const has = list.detail.includes(config.geminiModel);
            console.log(`     Configured model: ${config.geminiModel} ${has ? green('(available)') : red('(NOT in your list - change GEMINI_MODEL)')}`);
            console.log(`     Available flash models: ${list.detail.slice(0, 12).join(', ')}`);
        }

        const gemini = require('../server/services/gemini');
        print(`Gemini triage (${config.geminiModel})`, await timed(async () => {
            const r = await gemini.analyseWithGemini('mild fever and sore throat since yesterday', { age: 30 });
            return `severity "${r.severity}", ${r.possible_conditions.length} conditions`;
        }));
    }

    console.log('\nIf something fails: check your internet, try again in a minute (free servers get busy),');
    console.log('or run the app in GitHub Codespaces, whose servers have very reliable connections.\n');
})();
