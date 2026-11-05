#!/usr/bin/env node
// Creates (or resets) the demo account with ~75 days of realistic history.
//   npm run seed   -> reset demo data
//   npm run demo   -> reset demo data, then start the server
//
// Dates are generated relative to "now" in DEMO_TIMEZONE (default Asia/Kolkata), so run it
// shortly before presenting and the schedule, overdue doses and charts line up with your clock.
const bcrypt = require('bcryptjs');
const db = require('../server/db');
const { analyse } = require('../server/services/triageEngine');
const config = require('../server/config');

const DEMO = {
    name: 'Rajesh Sharma',
    email: process.env.DEMO_EMAIL || 'demo@medassist.app',
    password: process.env.DEMO_PASSWORD || 'Demo@1234',
};
const TZ = process.env.DEMO_TIMEZONE || 'Asia/Kolkata';
const HISTORY_DAYS = 75;

// ---------- helpers ----------
function nowInTz() {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(new Date()).map((p) => [p.type, p.value]),
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
function addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const pad = (n) => String(n).padStart(2, '0');
function shiftTime(hhmm, deltaMin) {
    const [h, m] = hhmm.split(':').map(Number);
    const t = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + deltaMin));
    return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
// Local (TZ) date+time -> SQLite UTC "YYYY-MM-DD HH:MM:SS" (approximate offset from Intl)
function localToUtcSql(ymd, hhmm) {
    const guess = new Date(`${ymd}T${hhmm}:00Z`);
    const tzStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(guess);
    const asTz = new Date(tzStr.replace(', ', 'T') + ':00Z');
    const offsetMs = asTz - guess;
    return new Date(guess.getTime() - offsetMs).toISOString().replace('T', ' ').slice(0, 19);
}
// Deterministic random numbers so every reset looks the same.
function rng(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = rng(20261106);
const jitter = (amp) => (rand() * 2 - 1) * amp;
const lerp = (a, b, t) => a + (b - a) * t;
const round1 = (n) => Math.round(n * 10) / 10;

// ---------- build ----------
const { date: today, time: now } = nowInTz();
const day = (n) => addDays(today, n);

const seed = db.transaction(() => {
    db.prepare('DELETE FROM users WHERE email = ?').run(DEMO.email); // cascades to all demo data

    const userId = Number(db.prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(DEMO.name, DEMO.email, bcrypt.hashSync(DEMO.password, 10), localToUtcSql(day(-HISTORY_DAYS), '19:10')).lastInsertRowid);

    // Profile & contacts
    db.prepare(`INSERT INTO profiles (user_id, dob, gender, blood_group, height_cm, weight_kg, allergies, conditions, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        userId, '1974-03-18', 'male', 'B+', 170, 84.2, 'Sulfa drugs',
        'Type 2 diabetes (since 2019), Hypertension',
        'Last HbA1c 7.4% (2 months ago). Reading glasses. Non-smoker.',
    );
    const addContact = db.prepare('INSERT INTO emergency_contacts (user_id, name, relation, phone) VALUES (?, ?, ?, ?)');
    addContact.run(userId, 'Sunita Sharma', 'Wife', '+91 90000 11111');
    addContact.run(userId, 'Arjun Sharma', 'Son', '+91 90000 22222');

    // Medications
    const addMed = db.prepare(`INSERT INTO medications
        (user_id, name, dosage, times, instructions, start_date, end_date, pills_remaining, pills_per_dose, refill_threshold, active, created_at)
        VALUES (@user_id, @name, @dosage, @times, @instructions, @start_date, @end_date, @pills_remaining, 1, @refill_threshold, 1, @created_at)`);
    const meds = [
        { key: 'metformin', name: 'Metformin', dosage: '500mg', times: ['08:00', '20:30'], instructions: 'After food', start: -HISTORY_DAYS, stock: 46, threshold: 10, miss: { '08:00': 0.08, '20:30': 0.26 } },
        { key: 'telmisartan', name: 'Telmisartan', dosage: '40mg', times: ['08:00'], instructions: null, start: -HISTORY_DAYS, stock: 22, threshold: 7, miss: { '08:00': 0.08 } },
        { key: 'atorvastatin', name: 'Atorvastatin', dosage: '10mg', times: ['21:30'], instructions: 'At bedtime', start: -52, stock: 4, threshold: 7, miss: { '21:30': 0.22 } },
        { key: 'vitd', name: 'Vitamin D3', dosage: '1000 IU', times: ['13:30'], instructions: 'With food', start: -30, stock: null, threshold: 5, miss: { '13:30': 0.16 } },
        { key: 'azithro', name: 'Azithromycin', dosage: '500mg', times: ['09:00'], instructions: 'After food', start: -23, end: -19, stock: null, threshold: 0, miss: { '09:00': 0 } },
    ];
    for (const m of meds) {
        m.id = Number(addMed.run({
            user_id: userId, name: m.name, dosage: m.dosage, times: JSON.stringify(m.times), instructions: m.instructions,
            start_date: day(m.start), end_date: m.end != null ? day(m.end) : null, pills_remaining: m.stock,
            refill_threshold: m.threshold, created_at: localToUtcSql(day(m.start), '18:00'),
        }).lastInsertRowid);
    }

    // Dose logs: realistic adherence, worse on weekends, much better in the last 10 days ("since using reminders").
    const addLog = db.prepare(`INSERT INTO dose_logs (medication_id, user_id, scheduled_date, scheduled_time, status, logged_at) VALUES (?, ?, ?, ?, ?, ?)`);
    const todaysPastDoses = [];
    for (const m of meds) {
        const last = m.end != null ? m.end : 0;
        for (let d = m.start; d <= last; d++) {
            const ymd = day(d);
            const weekend = [0, 6].includes(new Date(`${ymd}T00:00:00Z`).getUTCDay());
            for (const t of m.times) {
                if (d === 0 && t > now) continue; // future doses today: not logged yet
                if (d === 0) { todaysPastDoses.push({ m, t }); continue; } // handled below
                let pMiss = m.miss[t] * (weekend ? 1.8 : 1);
                if (d >= -10) pMiss *= 0.25;
                if (d >= -24 && d <= -21 && m.key === 'vitd') pMiss = 0.5; // unwell with fever
                const r = rand();
                if (r < pMiss * 0.25) addLog.run(m.id, userId, ymd, t, 'skipped', localToUtcSql(ymd, shiftTime(t, 40)));
                else if (r < pMiss) continue; // missed: no log at all
                else addLog.run(m.id, userId, ymd, t, 'taken', localToUtcSql(ymd, shiftTime(t, Math.round(rand() * 35 - 5))));
            }
        }
    }
    // Today: everything already due is taken, except the most recent dose, left pending for a live "Taken" demo.
    todaysPastDoses.sort((a, b) => a.t.localeCompare(b.t));
    const leavePending = todaysPastDoses.length ? todaysPastDoses[todaysPastDoses.length - 1] : null;
    for (const dose of todaysPastDoses) {
        if (dose === leavePending) continue;
        addLog.run(dose.m.id, userId, today, dose.t, 'taken', localToUtcSql(today, shiftTime(dose.t, 10)));
    }

    // Vitals: BP and sugar improving over 60 days, weight slowly down, a fever episode 3 weeks ago.
    const addVital = db.prepare('INSERT INTO vitals (user_id, type, value1, value2, context, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const V = (type, d, time, v1, v2 = null, context = null, note = null) => addVital.run(userId, type, v1, v2, context, note, `${day(d)}T${time}`);
    for (let d = -60; d < 0; d += 2) {
        const t = (d + 60) / 60;
        const fever = d >= -24 && d <= -21;
        const sys = Math.round(lerp(152, 131, t) + jitter(4) + (fever ? 4 : 0));
        const dia = Math.round(lerp(96, 83, t) + jitter(3));
        V('blood_pressure', d, shiftTime('07:30', Math.round(jitter(20))), sys, dia, null, d === -60 ? 'Before starting regular monitoring' : null);
        if (d % 4 === 0) V('heart_rate', d, shiftTime('07:32', Math.round(jitter(20))), Math.round(lerp(84, 76, t) + jitter(4) + (fever ? 14 : 0)));
    }
    for (let d = -59; d <= 0; d += 3) {
        const t = (d + 59) / 59;
        V('blood_sugar', d, shiftTime('07:00', Math.round(jitter(15))), Math.round(lerp(168, 122, t) + jitter(7)), null, 'fasting');
        if (d % 9 === 0) V('blood_sugar', d, '14:15', Math.round(lerp(214, 162, t) + jitter(10)), null, 'after_meal', 'After lunch');
    }
    for (let d = -56; d <= 0; d += 7) V('weight', d, '07:15', round1(lerp(86.8, 84.2, (d + 56) / 56) + jitter(0.3)));
    [[-24, 38.6], [-23, 38.9], [-22, 38.1], [-21, 37.4], [-20, 36.9]].forEach(([d, c], i) => V('temperature', d, i % 2 ? '20:00' : '09:30', c, null, null, i === 1 ? 'Took paracetamol' : null));
    [[-23, 96], [-22, 97], [-6, 98], [0, 98]].forEach(([d, s]) => V('spo2', d, '09:35', s));
    // Make the very latest readings tell a clear "improving" story
    V('blood_pressure', 0, now < '07:30' ? shiftTime(now, -5) : '07:30', 129, 82, null, 'Morning, after walk');
    V('blood_sugar', 0, now < '07:00' ? shiftTime(now, -6) : '07:00', 118, null, 'fasting');

    // Appointments
    const addAppt = db.prepare(`INSERT INTO appointments (user_id, doctor_name, specialty, location, datetime, reason, notes, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const A = (d, t, doctor, spec, loc, reason, notes, status) => addAppt.run(userId, doctor, spec, loc, `${day(d)}T${t}`, reason, notes, status, localToUtcSql(day(Math.min(d, 0) - 5), '20:00'));
    A(-52, '10:30', 'Dr. Anil Mehta', 'Diabetologist', 'Sunrise Diabetes Clinic, Indiranagar', '3-month diabetes review', 'HbA1c 7.4%. Continue Metformin. Started Atorvastatin 10mg for cholesterol.', 'completed');
    A(-23, '18:00', 'Dr. Priya Nair', 'General Physician', 'CityCare Clinic, HSR Layout', 'Fever, cough and body ache', 'Throat infection. 5-day Azithromycin course. Paracetamol for fever.', 'completed');
    A(-12, '16:00', 'Dr. Anil Mehta', 'Diabetologist', 'Sunrise Diabetes Clinic, Indiranagar', 'Lab report review', 'Rescheduled by clinic.', 'cancelled');
    A(2, '11:30', 'Dr. Kavita Rao', 'Cardiologist', 'Heartline Hospital, Jayanagar', 'BP review and ECG', 'Ask: can Telmisartan dose be reduced now that BP is improving?', 'upcoming');
    A(9, '10:00', 'Dr. Anil Mehta', 'Diabetologist', 'Sunrise Diabetes Clinic, Indiranagar', 'HbA1c test and 3-month review', 'Go fasting. Carry the sugar log from MedAssist.', 'upcoming');
    A(20, '17:15', 'Dr. Farah Khan', 'Ophthalmologist', 'ClearView Eye Centre, Koramangala', 'Annual diabetic eye screening', null, 'upcoming');

    // Symptom-check history (generated by the real triage engine)
    const addTriage = db.prepare('INSERT INTO triage_history (user_id, symptoms, severity, result_json, created_at) VALUES (?, ?, ?, ?, ?)');
    const ctx = { age: 52, sex: 'male', allergies: 'Sulfa drugs', conditions: 'Type 2 diabetes (since 2019), Hypertension' };
    [
        [-24, '21:40', 'Fever with chills, cough and body ache since yesterday', 2],
        [-11, '08:15', 'Mild headache and feeling dizzy when I stand up quickly', 0],
        [-3, '22:30', 'Acidity and bloating after dinner, burning feeling', 0],
    ].forEach(([d, t, symptoms, dur]) => {
        const r = analyse(symptoms, { ...ctx, durationDays: dur });
        const severity = r.conditions.length || r.severity !== 'mild' ? r.severity : 'unknown';
        const result = {
            ...r, severity, ai: null, ai_status: 'disabled', ai_error: null, used_profile: true,
            emergency_number: config.emergencyNumber, ambulance_number: config.ambulanceNumber,
            mental_health_helpline: config.mentalHealthHelpline,
            disclaimer: 'This is general information, not a diagnosis. If you are worried, or symptoms get worse, contact a doctor.',
        };
        addTriage.run(userId, symptoms, severity, JSON.stringify(result), localToUtcSql(day(d), t));
    });

    return { userId, pending: leavePending };
});

const { pending } = seed();
console.log('\n✔ Demo account ready');
console.log(`  Email:    ${DEMO.email}`);
console.log(`  Password: ${DEMO.password}`);
console.log(`  Data generated for ${today} ${now} (${TZ})`);
if (pending) console.log(`  Tip: ${pending.m.name} (${pending.t}) is left untaken today, so you can tap "Taken" live.\n`);
else console.log('');
