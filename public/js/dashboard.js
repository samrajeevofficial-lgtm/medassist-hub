// ---------- Home ----------
const GUEST_FEATURES = [
    ['Never miss a dose', 'Several reminder times a day, a tick when taken, pill stock that counts down and warns before you run out.', 'tracker'],
    ['See your numbers improve', 'Blood pressure, sugar, heart rate, weight, temperature and oxygen on a clear chart, each reading labelled normal or high.', 'vitals'],
    ['Know how urgent it is', 'Describe how you feel; emergency warning signs are caught first, and suggestions skip medicines you are allergic to.', 'triage'],
    ['Find help fast', 'The nearest hospitals, clinics and pharmacies on a map with distance, phone and directions. Works without an account.', 'locator'],
    ['Be ready for the doctor', 'Appointments with reminders and calendar links, plus a printable Medical ID with your allergies and medicines.', 'appointments'],
    ['One tap in an emergency', 'The SOS button calls 112 and sends your live location to family by SMS or WhatsApp.', 'info'],
];

// Sample day for the guest preview (clearly labelled as an example).
const SAMPLE_DOSES = [
    { name: 'Metformin', dosage: '500mg', time: '08:00', status: 'taken' },
    { name: 'Telmisartan', dosage: '40mg', time: '08:00', status: 'taken' },
    { name: 'Vitamin D3', dosage: '1000 IU', time: '13:30', status: 'taken' },
    { name: 'Metformin', dosage: '500mg', time: '20:30', status: 'pending' },
    { name: 'Atorvastatin', dosage: '10mg', time: '21:30', status: 'pending' },
];

function renderGuest() {
    document.getElementById('guest-features').innerHTML = GUEST_FEATURES.map(([title, text, tab]) => `
        <button onclick="switchTab('${tab}')" class="feature col-span-12 sm:col-span-6 lg:col-span-4 text-left">
            <h3>${title}</h3>
            <p>${text}</p>
        </button>`).join('');
    document.getElementById('guest-preview').innerHTML = `
        <div class="panel-head"><h2 class="panel-title">An example day</h2><span class="chip num">3 of 5 taken</span></div>
        ${renderDoseStrip(SAMPLE_DOSES, null, '18:40')}
        <div class="space-y-2 mt-4">${SAMPLE_DOSES.slice(2, 5).map((d) => `
            <div class="dose-row"><div class="flex items-center gap-3 min-w-0"><span class="dose-time">${formatTime(d.time)}</span>
            <span class="min-w-0"><span class="font-semibold">${d.name}</span> <span class="muted">${d.dosage}</span></span></div>
            ${d.status === 'taken' ? '<span class="chip chip-pos">Taken</span>' : '<span class="meta">Upcoming</span>'}</div>`).join('')}
        </div>`;
}

// ---------- Today's dose strip (shared with the Medicines tab) ----------
// doses: [{ name, dosage, time, status }]; day: 'YYYY-MM-DD' or null; nowOverride: 'HH:MM' for previews.
function doseState(d, day) {
    if (d.status !== 'pending') return d.status;
    const today = todayStr();
    if (day && day < today) return 'missed';
    if ((!day || day === today) && d.time < nowTimeStr()) return 'overdue';
    return 'pending';
}

function renderDoseStrip(doses, day, nowOverride) {
    if (!doses.length) return '<p class="empty">No doses scheduled for this day.</p>';
    const start = Math.min(6 * 60, ...doses.map((d) => minutesOf(d.time) - 30));
    const end = Math.max(24 * 60, ...doses.map((d) => minutesOf(d.time) + 30));
    const pos = (m) => `${(((m - start) / (end - start)) * 100).toFixed(2)}%`;
    const isToday = nowOverride || day === todayStr();
    const nowMin = minutesOf(nowOverride || nowTimeStr());

    const groups = {};
    doses.forEach((d) => { (groups[d.time] ||= []).push({ ...d, state: nowOverride ? (d.status === 'pending' && d.time < nowOverride ? 'overdue' : d.status) : doseState(d, day) }); });
    const rank = { overdue: 5, missed: 4, pending: 3, skipped: 2, taken: 1 };
    const marks = Object.entries(groups).map(([t, list]) => {
        const state = list.reduce((a, b) => (rank[b.state] > rank[a] ? b.state : a), 'taken');
        const label = `${formatTime(t)}: ${list.map((x) => `${x.name} (${x.state})`).join(', ')}`;
        return `<span class="dose-mark ${state === 'pending' ? '' : state}" style="left:${pos(minutesOf(t))}" title="${esc(label)}" aria-label="${esc(label)}" role="img">${list.length > 1 ? `<span class="stack num">${list.length}</span>` : ''}</span>`;
    }).join('');

    const ticks = [];
    for (let m = Math.ceil(start / 180) * 180, i = 0; m <= end; m += 180, i++) {
        const h = Math.floor(m / 60) % 24;
        ticks.push(`<span class="tick ${m + 180 > end ? 'last' : ''} ${i % 2 ? 'minor' : ''}" style="left:${pos(m)}">${h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}</span>`);
    }
    const nowIn = isToday && nowMin >= start && nowMin <= end;
    return `
        <div class="dose-strip" aria-label="Doses across the day">
            <div class="track"></div>
            ${nowIn ? `<div class="done" style="width:${pos(nowMin)}"></div><div class="now" style="left:${pos(nowMin)}"><span>Now</span></div>` : ''}
            ${marks}
            ${ticks.join('')}
        </div>
        <div class="strip-legend mt-1"><span><i class="taken"></i>Taken</span><span><i></i>Upcoming</span><span><i class="overdue"></i>Overdue</span>${day && day < todayStr() ? '<span><i class="missed"></i>Missed</span>' : ''}</div>`;
}

// ---------- Logged-in home ----------
async function loadDashboard() {
    if (!currentUser) return;
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const first = currentUser.name.split(' ')[0];
    document.getElementById('dash-title').textContent = `${part}, ${first}.`;

    const [d, bp, appts, adh, weight] = await Promise.all([
        attempt(() => api('/dashboard', { query: { date: todayStr(), now: nowTimeStr() } })),
        attempt(() => api('/vitals', { query: { type: 'blood_pressure', days: 60 } })),
        attempt(() => api('/appointments', { query: { status: 'upcoming' } })),
        attempt(() => api('/medications/adherence', { query: { days: 30, today: todayStr(), now: nowTimeStr() } })),
        attempt(() => api('/vitals', { query: { type: 'weight', days: 60 } })),
    ]);
    if (!d) return;

    const upcoming = (appts || []).filter((a) => a.datetime >= nowLocalDatetime());
    const bpFirst = bp?.[0];
    const bpLast = bp?.[bp.length - 1];
    const vit = Object.fromEntries(d.latest_vitals.map((v) => [v.type, v]));

    // The one fact, from the data
    const facts = [];
    if (d.doses.overdue.length) facts.push(`${d.doses.overdue.map((x) => `${x.name} (${formatTime(x.time)})`).join(', ')} still to take.`);
    else if (d.doses.next) facts.push(`Next dose: ${d.doses.next.name} at ${formatTime(d.doses.next.time)}.`);
    else if (d.doses.total) facts.push('All of today’s doses are done.');
    if (bpFirst && bpLast && bp.length > 3) {
        const drop = bpFirst.value1 - bpLast.value1;
        facts.push(drop > 0
            ? `Blood pressure is ${bpLast.display}, down from ${bpFirst.display} on ${formatDate(bpFirst.recorded_at.slice(0, 10), { day: 'numeric', month: 'short' })}.`
            : `Blood pressure is ${bpLast.display}.`);
    }
    document.getElementById('dash-sub').textContent = facts.join(' ') || 'Add your medicines and readings to see your day here.';

    // KPI tiles
    const sugar = vit.blood_sugar;
    const next = upcoming[0];
    const tile = (tab, label, value, unit, caption) => `
        <button onclick="switchTab('${tab}')" class="kpi-tile col-span-6 lg:col-span-3">
            <span class="kpi-label">${label}</span>
            <span class="kpi-value mt-1">${value}${unit ? `<span class="kpi-unit">${unit}</span>` : ''}</span>
            <span class="kpi-caption">${caption}</span>
        </button>`;
    document.getElementById('dash-kpis').innerHTML = [
        tile('tracker', 'Doses today', d.doses.total ? `${d.doses.taken} of ${d.doses.total}` : '0', '',
            d.doses.overdue.length ? `<span class="chip chip-warn">${d.doses.overdue.length} overdue</span>` : d.doses.next ? `Next ${formatTime(d.doses.next.time)}` : d.doses.total ? 'All done' : 'Nothing scheduled'),
        tile('vitals', 'Blood pressure', vit.blood_pressure ? esc(vit.blood_pressure.display) : '—', vit.blood_pressure ? 'mmHg' : '',
            vit.blood_pressure ? `${statusChip(vit.blood_pressure.status)}${bpFirst && bp.length > 3 ? ` <span class="num">from ${esc(bpFirst.display)}</span>` : ''}` : 'No reading yet'),
        tile('vitals', 'Fasting sugar', sugar ? esc(sugar.display) : '—', sugar ? 'mg/dL' : '',
            sugar ? `${statusChip(sugar.status)} ${esc(formatDateTime(sugar.recorded_at).split(',')[0])}` : 'No reading yet'),
        tile('appointments', 'Next appointment', next ? esc(relativeDays(next.datetime)) : '—', '',
            next ? `${esc(next.doctor_name)}, ${esc(formatTime(next.datetime.slice(11, 16)))}` : 'None booked'),
    ].join('');

    // Dose strip + rows
    document.getElementById('dash-strip').innerHTML = renderDoseStrip(d.doses.list, d.today);
    // Rows only for doses still to take; taken ones are already ticked on the strip.
    const pendingAll = d.doses.list.filter((x) => x.status === 'pending');
    const toTake = pendingAll.slice(0, 3);
    document.getElementById('dash-doses').innerHTML = !d.doses.list.length
        ? '<button onclick="switchTab(\'tracker\')" class="btn btn-secondary">Add your first medicine</button>'
        : toTake.length
            ? toTake.map((x) => doseRow(x, d.today)).join('') + (pendingAll.length > 3 ? `<button onclick="switchTab('tracker')" class="btn btn-text text-[14px] mt-1">${pendingAll.length - 3} more later today</button>` : '')
            : '<p class="notice notice-pos">Every dose for today is done.</p>';

    // Needs attention
    const alerts = [];
    d.doses.overdue.forEach((x) => alerts.push(`<div class="row-card"><p class="font-semibold">${esc(x.name)} overdue</p><p class="meta mt-0.5">Due ${formatTime(x.time)}</p><button onclick="logDose(${x.medication_id}, '${d.today}', '${x.time}', 'taken')" class="btn btn-primary btn-sm mt-2">Mark taken</button></div>`));
    d.low_stock.forEach((m) => alerts.push(`<div class="row-card"><p class="font-semibold">Refill ${esc(m.name)}</p><p class="meta mt-0.5 num">${m.pills_remaining} left${m.days_left !== null ? `, about ${m.days_left} day${m.days_left === 1 ? '' : 's'}` : ''}</p><button onclick="switchTab('tracker'); setTimeout(() => refillMedication(${m.id}), 300)" class="btn btn-secondary btn-sm mt-2">Add refill</button></div>`));
    if (!d.has_emergency_contacts) alerts.push('<div class="row-card"><p class="font-semibold">No emergency contact</p><p class="meta mt-0.5">SOS can alert family once you add one.</p><button onclick="switchTab(\'profile\')" class="btn btn-secondary btn-sm mt-2">Add contact</button></div>');
    document.getElementById('dash-alerts').innerHTML = alerts.length ? alerts.join('') : '<p class="text-[14px] muted">Nothing needs your attention. Doses, stock and contacts are all in order.</p>';

    // At a glance: figures from the data, each with its window named
    const weekAgo = addDaysStr(todayStr(), -7);
    const readingsThisWeek = (bp || []).filter((v) => v.recorded_at.slice(0, 10) > weekAgo).length;
    const w0 = weight?.[0], w1 = weight?.[weight.length - 1];
    const wDiff = w0 && w1 && weight.length > 1 ? Math.round((w1.value1 - w0.value1) * 10) / 10 : null;
    const glance = [
        ['Taken on time, 30 days', adh?.totals?.rate != null ? `${adh.totals.rate}%` : '—'],
        ['BP readings, 7 days', String(readingsThisWeek)],
        ['Weight since ' + (w0 ? formatDate(w0.recorded_at.slice(0, 10), { day: 'numeric', month: 'short' }) : '—'), wDiff == null ? '—' : `${wDiff > 0 ? '+' : wDiff < 0 ? '−' : ''}${Math.abs(wDiff)} kg`],
        ['Emergency contacts', d.has_emergency_contacts ? 'Saved' : 'None'],
        ['Last symptom check', d.last_triage ? relativeDays(new Date(d.last_triage.created_at.replace(' ', 'T') + 'Z').toISOString().slice(0, 10)) : '—'],
    ];
    document.getElementById('dash-glance').innerHTML = glance.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join('');

    // BP chart
    const note = document.getElementById('dash-bp-note');
    if (bp && bp.length) {
        note.textContent = bp.length > 3 && bpFirst.value1 > bpLast.value1
            ? `Systolic down ${bpFirst.value1 - bpLast.value1} mmHg over ${bp.length} readings. The dashed line marks 130, where "high" starts.`
            : `${bp.length} reading${bp.length === 1 ? '' : 's'} in the last 60 days.`;
        drawTrendChart('dash-bp-chart', 'blood_pressure', bp, { compact: true });
    } else {
        note.textContent = '';
        document.getElementById('dash-bp-chart').parentElement.innerHTML = '<p class="empty">No blood pressure readings yet. <button onclick="switchTab(\'vitals\')" class="btn btn-text">Log one</button></p>';
    }

    // Upcoming appointments
    document.getElementById('dash-appt-count').textContent = upcoming.length;
    document.getElementById('dash-appts').innerHTML = upcoming.length ? upcoming.slice(0, 3).map(apptRowCompact).join('')
        : '<p class="empty">No upcoming appointments. <button onclick="switchTab(\'appointments\')" class="btn btn-text">Add one</button></p>';
}

function apptRowCompact(a) {
    const dt = parseLocal(a.datetime);
    return `
        <div class="row-card flex items-center gap-4">
            <div class="text-center w-12 shrink-0">
                <p class="text-[12px] font-semibold uppercase muted">${esc(dt.toLocaleDateString('en-IN', { month: 'short' }))}</p>
                <p class="text-[22px] leading-[26px] num">${dt.getDate()}</p>
            </div>
            <div class="min-w-0 flex-1">
                <p class="font-semibold truncate">${esc(a.doctor_name)} <span class="font-normal muted">· ${esc(a.specialty || 'Appointment')}</span></p>
                <p class="text-[13px] muted truncate">${esc(formatTime(a.datetime.slice(11, 16)))}${a.location ? ` · ${esc(a.location)}` : ''}</p>
            </div>
            <span class="chip chip-info shrink-0">${esc(relativeDays(a.datetime))}</span>
        </div>`;
}

TAB_LOADERS.dashboard = loadDashboard;
