// ---------- Medicines ----------
let medications = [];
let scheduleDate = todayStr();

// ----- Form -----
function addTimeInput(value = '') {
    const wrap = document.getElementById('med-times');
    const row = document.createElement('div');
    row.className = 'flex gap-2';
    const n = wrap.children.length + 1;
    row.innerHTML = `
        <input type="time" required class="med-time field" value="${esc(value)}" aria-label="Reminder time ${n}">
        <button type="button" class="btn btn-icon shrink-0" aria-label="Remove this time">${icon('trash')}</button>`;
    row.querySelector('button').onclick = () => { if (wrap.children.length > 1) row.remove(); };
    wrap.appendChild(row);
}

function resetMedForm() {
    document.getElementById('med-form').reset();
    document.getElementById('med-id').value = '';
    document.getElementById('med-times').innerHTML = '';
    addTimeInput();
    document.getElementById('med-start').value = todayStr();
    document.getElementById('med-form-title').textContent = 'Add a medicine';
    document.getElementById('med-submit').textContent = 'Add to schedule';
    document.getElementById('med-cancel').classList.add('hidden');
}

function focusMedForm() {
    resetMedForm();
    document.getElementById('med-form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.getElementById('med-name').focus(), 300);
}

function editMedication(id) {
    const m = medications.find((x) => x.id === id);
    if (!m) return;
    document.getElementById('med-id').value = m.id;
    document.getElementById('med-name').value = m.name;
    document.getElementById('med-dosage').value = m.dosage;
    document.getElementById('med-instructions').value = m.instructions || '';
    document.getElementById('med-start').value = m.start_date;
    document.getElementById('med-end').value = m.end_date || '';
    document.getElementById('med-stock').value = m.pills_remaining ?? '';
    document.getElementById('med-perdose').value = m.pills_per_dose;
    document.getElementById('med-threshold').value = m.refill_threshold;
    document.getElementById('med-times').innerHTML = '';
    m.times.forEach((t) => addTimeInput(t));
    document.querySelector('#med-form details').open = true;
    document.getElementById('med-form-title').textContent = `Edit ${m.name}`;
    document.getElementById('med-submit').textContent = 'Save changes';
    document.getElementById('med-cancel').classList.remove('hidden');
    document.getElementById('med-form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveMedication(e) {
    e.preventDefault();
    const id = document.getElementById('med-id').value;
    const body = {
        name: document.getElementById('med-name').value,
        dosage: document.getElementById('med-dosage').value,
        times: [...document.querySelectorAll('.med-time')].map((i) => i.value).filter(Boolean),
        instructions: document.getElementById('med-instructions').value,
        start_date: document.getElementById('med-start').value || todayStr(),
        end_date: document.getElementById('med-end').value || null,
        pills_remaining: document.getElementById('med-stock').value,
        pills_per_dose: document.getElementById('med-perdose').value || 1,
        refill_threshold: document.getElementById('med-threshold').value || 5,
    };
    const btn = document.getElementById('med-submit');
    setLoading(btn, true, 'Saving…');
    const saved = await attempt(() => api(id ? `/medications/${id}` : '/medications', { method: id ? 'PUT' : 'POST', body }), 'Could not save');
    setLoading(btn, false);
    if (!saved) return;
    toast(id ? `${saved.name} updated.` : `${saved.name} added to your schedule.`, 'success');
    resetMedForm();
    refreshTracker();
    refreshReminderSchedule();
}

// ----- Prescriptions list -----
async function loadMeds() {
    const rows = await attempt(() => api('/medications'));
    if (!rows) return;
    medications = rows;
    renderMeds();
}

function renderMeds() {
    const container = document.getElementById('med-list-container');
    const today = todayStr();
    const active = medications.filter((m) => m.active && !(m.end_date && m.end_date < today));
    document.getElementById('med-count').textContent = active.length;
    const low = active.filter((m) => m.low_stock);
    document.getElementById('tracker-sub').textContent = active.length
        ? `${active.length} active medicine${active.length === 1 ? '' : 's'}${low.length ? `; ${low.map((m) => m.name).join(', ')} running low` : ''}.`
        : 'Your schedule, stock and how regularly you take them.';

    if (!medications.length) {
        container.innerHTML = '<p class="empty">No medicines yet. Add one with the form to start getting reminders.</p>';
        return;
    }
    container.innerHTML = medications.map((m) => {
        const ended = m.end_date && m.end_date < today;
        const stock = m.pills_remaining === null ? '' : `<span class="chip ${m.low_stock ? 'chip-warn' : ''} num">${m.pills_remaining} left${m.days_left !== null ? ` · ${m.days_left}d` : ''}</span>`;
        return `
        <div class="row-card ${!m.active || ended ? 'opacity-70' : ''}">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="font-semibold text-[15px]">${esc(m.name)} <span class="font-normal muted">${esc(m.dosage)}</span></p>
                    <p class="text-[13px] muted mt-0.5 num">${m.times.map(formatTime).join(' · ')}${m.instructions ? ` · ${esc(m.instructions)}` : ''}</p>
                    <div class="flex flex-wrap gap-1 mt-2">
                        ${stock}
                        ${m.end_date ? `<span class="chip">${ended ? 'Course ended' : 'Until'} ${esc(formatDate(m.end_date, { day: 'numeric', month: 'short' }))}</span>` : ''}
                        ${!m.active ? '<span class="chip">Paused</span>' : ''}
                    </div>
                </div>
                <div class="flex items-center shrink-0 -mr-1">
                    <button data-name="${esc(m.name)}" onclick="showDrugInfo(this.dataset.name)" class="btn btn-icon" title="Medicine information" aria-label="Information about ${esc(m.name)}">${icon('info')}</button>
                    ${m.pills_remaining !== null ? `<button onclick="refillMedication(${m.id})" class="btn btn-icon" title="Add refill" aria-label="Add refill for ${esc(m.name)}">${icon('pill')}</button>` : ''}
                    <button onclick="toggleMedActive(${m.id})" class="btn btn-icon" title="${m.active ? 'Pause' : 'Resume'}" aria-label="${m.active ? 'Pause' : 'Resume'} ${esc(m.name)}">${icon(m.active ? 'pause' : 'play')}</button>
                    <button onclick="editMedication(${m.id})" class="btn btn-icon" title="Edit" aria-label="Edit ${esc(m.name)}">${icon('edit')}</button>
                    <button onclick="removeMedication(${m.id})" class="btn btn-icon hover:!text-[color:var(--negative)]" title="Delete" aria-label="Delete ${esc(m.name)}">${icon('trash')}</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function removeMedication(id) {
    const m = medications.find((x) => x.id === id);
    if (!(await confirmDialog(`Delete ${m?.name || 'medicine'}?`, 'Its schedule and dose history will be removed. This cannot be undone.', 'Delete', true))) return;
    if (await attempt(() => api(`/medications/${id}`, { method: 'DELETE' }))) {
        toast('Medicine deleted.');
        refreshTracker();
        refreshReminderSchedule();
    }
}

async function toggleMedActive(id) {
    const m = medications.find((x) => x.id === id);
    if (!m) return;
    if (await attempt(() => api(`/medications/${id}`, { method: 'PUT', body: { ...m, active: !m.active } }))) {
        toast(m.active ? `${m.name} paused. No reminders until you resume it.` : `${m.name} resumed.`);
        refreshTracker();
        refreshReminderSchedule();
    }
}

function refillMedication(id) {
    const m = medications.find((x) => x.id === id);
    if (!m) return;
    openPanel(`Refill ${m.name}`, `
        <form id="refill-form" class="space-y-4">
            <p class="text-[14px] muted num">${m.pills_remaining} left now.</p>
            <div><label for="refill-amount" class="label">Pills added</label>
            <input type="number" id="refill-amount" min="1" required value="${m.pills_per_dose * m.times.length * 30}" inputmode="numeric" class="field"></div>
            <button type="submit" class="btn btn-primary w-full">Add to stock</button>
        </form>`, 'max-w-sm');
    document.getElementById('refill-form').onsubmit = async (e) => {
        e.preventDefault();
        const r = await attempt(() => api(`/medications/${id}/refill`, { method: 'POST', body: { amount: document.getElementById('refill-amount').value } }));
        if (r) {
            closePanel();
            toast(`${m.name}: ${r.pills_remaining} in stock.`, 'success');
            refreshTracker();
            if (currentTab === 'dashboard') loadDashboard();
        }
    };
}

// ----- Schedule & dose logging -----
function shiftScheduleDay(delta) {
    scheduleDate = delta === 0 ? todayStr() : addDaysStr(scheduleDate, delta);
    loadSchedule();
}

// One dose row, shared with Home.
function doseRow(d, day) {
    const state = doseState(d, day);
    let right;
    if (d.status !== 'pending') {
        const cls = { taken: 'chip-pos', skipped: '', missed: 'chip-neg' }[d.status];
        right = `<span class="chip ${cls}">${d.status[0].toUpperCase() + d.status.slice(1)}</span>
                 <button onclick="undoDose(${d.medication_id}, '${day}', '${d.time}')" class="btn btn-text text-[13px] ml-2">Undo</button>`;
    } else if (day > todayStr()) {
        right = '<span class="meta">Upcoming</span>';
    } else {
        right = `
            <button onclick="logDose(${d.medication_id}, '${day}', '${d.time}', 'taken')" class="btn btn-primary btn-sm">Taken</button>
            <button onclick="logDose(${d.medication_id}, '${day}', '${d.time}', 'skipped')" class="btn btn-quiet btn-sm">Skip</button>`;
    }
    return `
        <div class="dose-row ${state === 'overdue' ? 'overdue' : ''}">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dose-time">${formatTime(d.time)}</span>
                <div class="min-w-0">
                    <p class="font-semibold truncate">${esc(d.name)}</p>
                    <p class="text-[13px] muted">${state === 'overdue' ? '<span class="text-[color:var(--pill-warning-ink)] font-semibold">Overdue</span> · ' : ''}${esc([d.dosage, d.instructions].filter(Boolean).join(' · '))}</p>
                </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">${right}</div>
        </div>`;
}

async function loadSchedule() {
    const label = document.getElementById('schedule-date-label');
    label.textContent = scheduleDate === todayStr() ? 'Today' : formatDate(scheduleDate);
    const data = await attempt(() => api('/medications/schedule', { query: { date: scheduleDate } }));
    if (!data) return;
    document.getElementById('schedule-strip').innerHTML = data.doses.length ? renderDoseStrip(data.doses, scheduleDate) : '';
    document.getElementById('schedule-list').innerHTML = data.doses.length
        ? data.doses.map((d) => doseRow(d, scheduleDate)).join('')
        : '<p class="empty">No doses scheduled for this day.</p>';
}

async function logDose(medId, day, time, status) {
    const r = await attempt(() => api(`/medications/${medId}/log`, { method: 'POST', body: { date: day, time, status } }));
    if (!r) return;
    if (status === 'taken') {
        toast(`${r.medication.name} marked as taken.`, 'success', { duration: 2500 });
        if (r.medication.low_stock) toast(`Only ${r.medication.pills_remaining} ${r.medication.name} left. Time to refill.`, 'warning', { duration: 6000 });
    }
    refreshAfterDoseChange();
}

async function undoDose(medId, day, time) {
    if (await attempt(() => api(`/medications/${medId}/log`, { method: 'DELETE', query: { date: day, time } }))) refreshAfterDoseChange();
}

function refreshAfterDoseChange() {
    if (currentTab === 'dashboard') loadDashboard();
    else refreshTracker();
    refreshReminderSchedule();
}

function refreshTracker() {
    if (currentTab !== 'tracker') return;
    loadMeds();
    loadSchedule();
    loadAdherence();
}

// ----- Adherence -----
async function loadAdherence() {
    const days = document.getElementById('adherence-days').value;
    const a = await attempt(() => api('/medications/adherence', { query: { days, today: todayStr(), now: nowTimeStr() } }));
    if (!a) return;
    const box = document.getElementById('adherence-box');
    if (!a.totals.scheduled) {
        box.innerHTML = '<p class="empty">This fills in once doses are due.</p>';
        return;
    }
    const bar = (r) => (r === null ? 'var(--panel-2)' : r >= 90 ? 'var(--accent)' : r >= 70 ? '#9db7e3' : 'var(--negative)');
    box.innerHTML = `
        <div class="flex items-end justify-between gap-4">
            <p><span class="text-[32px] leading-[36px] num">${a.totals.rate}</span><span class="kpi-unit">%</span></p>
            <p class="text-[13px] muted text-right num">${a.totals.taken} taken · ${a.totals.skipped} skipped · ${a.totals.missed} missed</p>
        </div>
        <div class="flex items-end gap-[3px] h-16 mt-4" role="img" aria-label="Daily share of doses taken">
            ${a.per_day.map((d) => `<div class="flex-1 h-full flex flex-col justify-end" title="${esc(formatDate(d.date))}: ${d.taken} of ${d.scheduled}">
                <div style="height:${d.scheduled ? Math.max(8, d.rate) : 6}%;background:${bar(d.rate)};border-radius:3px 3px 0 0"></div></div>`).join('')}
        </div>
        <div class="flex justify-between meta mt-1"><span>${esc(formatDate(a.per_day[0].date, { day: 'numeric', month: 'short' }))}</span><span>Today</span></div>
        ${a.per_medication.length > 1 ? `<div class="mt-4">${a.per_medication.map((m) => `
            <div class="flex items-center justify-between py-2 border-t border-[color:var(--panel-2)] first:border-t-0 text-[14px]">
                <span class="truncate">${esc(m.name)}</span><span class="num ${m.rate < 80 ? 'text-[color:var(--negative)] font-semibold' : ''}">${m.rate}%</span></div>`).join('')}</div>` : ''}`;
}

// ----- Drug info & interactions -----
async function showDrugInfo(name) {
    name = String(name || '').trim();
    if (!name) { toast('Type a medicine name first.', 'warning'); return; }
    openPanel(`About ${name}`, '<div class="flex justify-center py-10"><span class="spinner dark"></span></div>', 'max-w-2xl');
    try {
        const d = await api('/drugs/lookup', { query: { name } });
        const body = document.getElementById('panel-body');
        if (!d.found) {
            body.innerHTML = `<p class="text-[14px]">No official label found for “${esc(name)}” (searched as “${esc(d.generic)}”). Try the generic (salt) name, for example “paracetamol” instead of a brand name.</p>`;
            return;
        }
        const sec = (title, text, cls = '') => (text ? `<div class="mb-4"><h4 class="text-[13px] font-semibold muted mb-1">${title}</h4><p class="text-[14px] leading-[21px] whitespace-pre-line ${cls}">${esc(text)}</p></div>` : '');
        body.innerHTML = `
            <div class="panel !p-4 mb-4">
                <p class="font-semibold text-[16px]">${esc(d.brand_name || name)}</p>
                <p class="text-[13px] muted">${esc(d.generic_name || d.generic)}${d.route ? ` · ${esc(d.route)}` : ''}${d.product_type ? ` · ${esc(d.product_type)}` : ''}</p>
            </div>
            <div class="max-h-[55vh] overflow-y-auto custom-scroll pr-2">
                ${sec('Purpose', d.purpose)}${sec('Uses', d.uses)}${sec('Do not use', d.do_not_use, 'text-[color:var(--pill-negative-ink)]')}
                ${sec('Warnings', d.warnings)}${sec('Ask a doctor before use if', d.ask_doctor)}
                ${sec('Ask a doctor or pharmacist if you are taking', d.ask_doctor_or_pharmacist)}${sec('Stop use and ask a doctor if', d.stop_use)}
                ${sec('Side effects', d.side_effects)}${sec('Pregnancy and breastfeeding', d.pregnancy)}
            </div>
            <p class="meta mt-4">Source: ${esc(d.source)}. Products sold in India may differ; follow your prescription and the label on your pack. Doses are deliberately not shown.</p>`;
    } catch (e) {
        document.getElementById('panel-body').innerHTML = `<p class="notice notice-neg">${esc(e.message)}</p>`;
    }
}

async function checkMyInteractions() {
    openPanel('Interaction check', '<div class="flex justify-center py-10"><span class="spinner dark"></span></div>', 'max-w-xl');
    try {
        const r = await api('/drugs/my-interactions');
        const checked = (r.checked || []).map((c) => `<span class="chip ${c.found === false ? 'line-through' : 'chip-info'}">${esc(c.name)}</span>`).join(' ');
        document.getElementById('panel-body').innerHTML = `
            <div class="flex flex-wrap gap-1 mb-4">${checked}</div>
            ${r.interactions.length ? r.interactions.map((i) => `
                <div class="notice notice-warn mb-3 flex-col !gap-1"><p class="font-semibold">${esc(i.drug_a)} and ${esc(i.drug_b)}</p><p class="text-[13px]">${esc(i.excerpt)}</p></div>`).join('')
            : '<div class="notice notice-pos mb-3">No interactions between these medicines are mentioned in their official labels.</div>'}
            <p class="text-[13px] muted">${esc(r.note)}</p>
            ${(r.checked || []).some((c) => c.found === false) ? '<p class="meta mt-2">Crossed-out medicines could not be matched; save them by their generic name for a better check.</p>' : ''}`;
    } catch (e) {
        document.getElementById('panel-body').innerHTML = `<p class="notice notice-neg">${esc(e.message)}</p>`;
    }
}

TAB_LOADERS.tracker = () => {
    if (!currentUser) return;
    if (!document.getElementById('med-times').children.length) resetMedForm();
    loadMeds();
    loadSchedule();
    loadAdherence();
    updateNotifCard();
};
