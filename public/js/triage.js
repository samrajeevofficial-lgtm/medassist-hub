// ---------- Symptom check ----------
const SEVERITY_UI = {
    emergency: { cls: 'sev-emergency', title: 'Emergency: get help now', text: 'Call emergency services or go to the nearest emergency department.' },
    urgent: { cls: 'sev-urgent', title: 'See a doctor within 24 hours', text: 'This needs a medical check soon, even if you feel a little better.' },
    moderate: { cls: 'sev-moderate', title: 'Watch it closely', text: 'Self-care should help. See a doctor if it lasts, gets worse, or a warning sign appears.' },
    mild: { cls: 'sev-mild', title: 'Likely fine to manage at home', text: 'Self-care below should help. See a doctor if it lasts or gets worse.' },
    unknown: { cls: 'sev-unknown', title: 'We couldn’t match these symptoms', text: 'Try describing them in more detail, or ask a doctor or pharmacist.' },
};
const SEVERITY_DOT = { emergency: 'var(--sos)', urgent: '#ea580c', moderate: '#d97706', mild: 'var(--positive)', unknown: 'var(--faint)' };

function renderSymptomChips() {
    document.getElementById('symptom-chips').innerHTML = (appMeta.common_symptoms || [])
        .map((s) => `<button type="button" class="sym-chip" data-symptom="${esc(s)}" onclick="addSymptom(this.dataset.symptom)">${esc(s)}</button>`).join('');
    const aiOn = appMeta.ai_enabled;
    document.getElementById('ai-badge').classList.toggle('hidden', !aiOn);
    const wrap = document.getElementById('ai-toggle-wrap');
    wrap.classList.toggle('hidden', !aiOn);
    wrap.classList.toggle('flex', aiOn);
}

function addSymptom(s) {
    const ta = document.getElementById('symptoms-input');
    const current = ta.value.trim();
    if (current.toLowerCase().includes(s.toLowerCase())) return;
    ta.value = current ? `${current.replace(/[.,]\s*$/, '')}, ${s}` : s;
    ta.focus();
}

function listBlock(title, items, cls = '') {
    if (!items || !items.length) return '';
    return `<h4>${esc(title)}</h4><ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

let slowTimer = null;
async function analyzeSymptoms() {
    const input = document.getElementById('symptoms-input').value.trim();
    if (!input) {
        showModal('Describe your symptoms', 'Type how you feel, or tap one of the common symptoms.');
        return;
    }
    const btn = document.getElementById('analyze-btn');
    const useAi = appMeta.ai_enabled && document.getElementById('ai-toggle').checked;
    setLoading(btn, true, useAi ? 'Checking with AI…' : 'Checking…');
    clearTimeout(slowTimer);
    if (useAi) slowTimer = setTimeout(() => { if (btn.disabled) btn.innerHTML = '<span class="spinner"></span> Still thinking… up to 40 s'; }, 8000);
    try {
        const r = await api('/triage', {
            method: 'POST',
            body: {
                symptoms: input,
                duration_days: document.getElementById('triage-duration').value || undefined,
                age: currentUser ? undefined : (document.getElementById('triage-age').value || undefined),
                sex: currentUser ? undefined : (document.getElementById('triage-sex').value || undefined),
                use_ai: useAi,
            },
        });
        renderTriageResult(r);
        if (currentUser) loadTriageHistory();
    } catch (e) {
        showModal('Check failed', e.message, true);
    } finally {
        clearTimeout(slowTimer);
        setLoading(btn, false);
    }
}

function renderTriageResult(r) {
    const ui = SEVERITY_UI[r.severity] || SEVERITY_UI.unknown;
    let html = '';

    if (r.crisis) {
        html += `
        <div class="panel !bg-[#f5f3ff]">
            <h2 class="panel-title">You don’t have to go through this alone</h2>
            <p class="text-[14px] mt-1">If you’re thinking about harming yourself, please talk to someone right now. It can help.</p>
            <div class="flex flex-wrap gap-2 mt-3">
                <a href="tel:${esc(r.mental_health_helpline)}" class="btn btn-primary">Call Tele-MANAS ${esc(r.mental_health_helpline)} (free, 24×7)</a>
                <a href="tel:${esc(r.emergency_number)}" class="btn btn-danger">Emergency ${esc(r.emergency_number)}</a>
            </div>
        </div>`;
    }

    html += `
        <div class="sev-banner ${ui.cls}">
            <h2 class="text-[20px] leading-[28px] font-semibold">${ui.title}</h2>
            <p class="text-[14px] mt-1 opacity-95">${r.urgent_reasons.length ? esc(r.urgent_reasons.join(' · ')) : ui.text}</p>
            ${r.severity === 'emergency' ? `
            <div class="flex flex-wrap gap-2 mt-4">
                <a href="tel:${esc(r.emergency_number)}" class="btn bg-white !text-[color:var(--sos)]">Call ${esc(r.emergency_number)}</a>
                <a href="tel:${esc(r.ambulance_number)}" class="btn border border-white/70 text-white">Ambulance ${esc(r.ambulance_number)}</a>
                <button onclick="switchTab('locator'); findHospitals();" class="btn border border-white/70 text-white">Nearest hospital</button>
            </div>` : ''}
        </div>`;

    r.red_flags.forEach((f) => {
        html += `<div class="notice notice-neg flex-col !gap-1"><p class="font-semibold">${esc(f.title)}</p><p>${esc(f.message)}</p></div>`;
    });
    if (r.warnings.length) html += `<div class="notice notice-warn flex-col !gap-1">${r.warnings.map((w) => `<p>${esc(w)}</p>`).join('')}</div>`;

    if (r.ai) {
        const lk = { high: 'chip-neg', medium: 'chip-warn', low: '' };
        html += `
        <div class="panel result-block">
            <div class="flex items-center justify-between gap-2"><h2 class="panel-title">AI analysis</h2><span class="chip chip-info">Gemini</span></div>
            ${r.ai.summary ? `<p class="text-[15px] leading-[23px] mt-2">${esc(r.ai.summary)}</p>` : ''}
            ${r.ai.possible_conditions.length ? `<div class="space-y-2 mt-3">${r.ai.possible_conditions.map((c) => `
                <div class="row-card"><div class="flex items-center justify-between gap-2"><span class="font-semibold">${esc(c.name)}</span><span class="chip ${lk[c.likelihood]}">${esc(c.likelihood)} likelihood</span></div>
                ${c.explanation ? `<p class="text-[13px] muted mt-1">${esc(c.explanation)}</p>` : ''}</div>`).join('')}</div>` : ''}
            <div class="grid sm:grid-cols-2 gap-x-6">
                <div>${listBlock('What you can do', r.ai.self_care)}${listBlock('Over the counter (follow the pack label)', r.ai.otc_options)}</div>
                <div>${listBlock('See a doctor if', r.ai.see_doctor_if, 'warn')}${listBlock('Avoid', r.ai.avoid, 'avoid')}</div>
            </div>
            ${r.ai.specialist ? `<p class="text-[14px] mt-4"><span class="muted">Doctor to see:</span> ${esc(r.ai.specialist)}</p>` : ''}
            ${r.ai.follow_up_questions.length ? `<h4>Add these details for a better answer</h4><ul>${r.ai.follow_up_questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
        </div>`;
    } else if (r.ai_status === 'error') {
        html += `<p class="notice notice-info">AI analysis isn’t available right now (${esc(r.ai_error || 'error')}). These results come from the built-in medical rules.</p>`;
    }

    r.conditions.forEach((c) => {
        html += `
        <div class="panel result-block">
            <div class="flex items-start justify-between gap-3">
                <div><h2 class="panel-title">${esc(c.name)}</h2><p class="meta mt-0.5">Matched: ${c.matched.map(esc).join(', ')}</p></div>
                ${currentUser ? `<button data-spec="${esc(c.specialist)}" onclick="bookFromTriage(this.dataset.spec)" class="btn btn-secondary btn-sm shrink-0">Plan a visit</button>` : ''}
            </div>
            <div class="grid sm:grid-cols-2 gap-x-6">
                <div>${listBlock('What you can do', c.self_care)}${listBlock('Over the counter (follow the pack label or ask a pharmacist)', c.otc)}</div>
                <div>${listBlock('See a doctor if', c.see_doctor_if, 'warn')}${listBlock('Avoid', c.avoid, 'avoid')}</div>
            </div>
            <p class="text-[14px] mt-4"><span class="muted">Doctor to see:</span> ${esc(c.specialist)}</p>
        </div>`;
    });

    html += `<p class="meta">${esc(r.disclaimer)} If symptoms get worse or you notice a warning sign, get medical help straight away.</p>`;
    document.getElementById('results-container').innerHTML = html;
    const area = document.getElementById('triage-results');
    area.classList.remove('hidden');
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bookFromTriage(specialty) {
    switchTab('appointments');
    resetApptForm();
    document.getElementById('appt-specialty').value = specialty.split(' / ')[0];
    document.getElementById('appt-reason').value = document.getElementById('symptoms-input').value.slice(0, 300);
    setTimeout(() => document.getElementById('appt-doctor').focus(), 200);
}

async function loadTriageHistory() {
    if (!currentUser) return;
    const rows = await attempt(() => api('/triage/history'));
    if (!rows) return;
    const el = document.getElementById('triage-history');
    el.innerHTML = rows.length ? rows.slice(0, 6).map((h) => `
        <div class="flex items-center gap-3 py-2 border-t border-[color:var(--panel-2)] first:border-t-0">
            <span class="w-2 h-2 rounded-full shrink-0" style="background:${SEVERITY_DOT[h.severity] || SEVERITY_DOT.unknown}" title="${esc(h.severity)}"></span>
            <button onclick="viewTriage(${h.id})" class="flex-grow text-left min-w-0">
                <span class="block truncate text-[14px]">${esc(h.symptoms)}</span>
                <span class="block meta">${esc(formatUtc(h.created_at))} · ${esc(h.severity)}</span>
            </button>
            <button onclick="deleteTriage(${h.id})" class="btn btn-icon shrink-0" aria-label="Delete this check">${icon('trash', 'h-4 w-4')}</button>
        </div>`).join('') : '<p class="text-[14px] muted">Your checks will appear here.</p>';
}

async function viewTriage(id) {
    const row = await attempt(() => api(`/triage/history/${id}`));
    if (!row) return;
    document.getElementById('symptoms-input').value = row.symptoms;
    renderTriageResult(row.result);
}

async function deleteTriage(id) {
    if (await attempt(() => api(`/triage/history/${id}`, { method: 'DELETE' }))) loadTriageHistory();
}

TAB_LOADERS.triage = loadTriageHistory;
