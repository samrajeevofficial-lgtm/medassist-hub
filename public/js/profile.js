// ---------- Profile, emergency contacts, Medical ID & SOS ----------
let profileData = null;

async function loadProfile() {
    if (!currentUser) return null;
    const d = await attempt(() => api('/profile'));
    if (d) profileData = d;
    return d;
}

function fillProfileForm(d) {
    const p = d.profile;
    document.getElementById('pf-name').value = d.user.name;
    document.getElementById('pf-dob').value = p.dob || '';
    document.getElementById('pf-gender').value = p.gender || '';
    document.getElementById('pf-blood').value = p.blood_group || '';
    document.getElementById('pf-height').value = p.height_cm ?? '';
    document.getElementById('pf-weight').value = p.weight_kg ?? '';
    document.getElementById('pf-allergies').value = p.allergies || '';
    document.getElementById('pf-conditions').value = p.conditions || '';
    document.getElementById('pf-notes').value = p.notes || '';
    document.getElementById('account-email').textContent = `Signed in as ${d.user.email}`;
    const parts = [];
    if (p.age !== null) parts.push(`Age ${p.age}`);
    if (p.blood_group) parts.push(`Blood ${p.blood_group}`);
    if (p.bmi) parts.push(`BMI ${p.bmi} (${p.bmi < 18.5 ? 'underweight' : p.bmi < 25 ? 'healthy' : p.bmi < 30 ? 'overweight' : 'obese range'})`);
    document.getElementById('pf-bmi').textContent = parts.join(' · ');
    renderContacts(d.contacts);
}

function renderContacts(contacts) {
    document.getElementById('contacts-list').innerHTML = contacts.length ? contacts.map((c) => `
        <div class="list-row">
            <div class="min-w-0">
                <p class="font-semibold truncate">${esc(c.name)}${c.relation ? ` <span class="font-normal muted">· ${esc(c.relation)}</span>` : ''}</p>
                <a href="tel:${esc(c.phone.replace(/\s/g, ''))}" class="text-[14px] num text-[color:var(--accent)]">${esc(c.phone)}</a>
            </div>
            <button onclick="deleteContact(${c.id})" class="btn btn-icon" aria-label="Remove ${esc(c.name)}">${icon('trash', 'h-4 w-4')}</button>
        </div>`).join('') : '<p class="empty">No contacts yet. Add someone who should hear from you in an emergency.</p>';
}

async function saveProfile(e) {
    e.preventDefault();
    const body = {
        name: document.getElementById('pf-name').value,
        dob: document.getElementById('pf-dob').value,
        gender: document.getElementById('pf-gender').value,
        blood_group: document.getElementById('pf-blood').value,
        height_cm: document.getElementById('pf-height').value,
        weight_kg: document.getElementById('pf-weight').value,
        allergies: document.getElementById('pf-allergies').value,
        conditions: document.getElementById('pf-conditions').value,
        notes: document.getElementById('pf-notes').value,
    };
    const d = await attempt(() => api('/profile', { method: 'PUT', body }), 'Could not save profile');
    if (!d) return;
    profileData = d;
    currentUser.name = d.user.name;
    applyAuthState();
    fillProfileForm(d);
    toast('Profile saved.', 'success');
}

async function addContact(e) {
    e.preventDefault();
    const body = { name: document.getElementById('ct-name').value, relation: document.getElementById('ct-relation').value, phone: document.getElementById('ct-phone').value };
    if (await attempt(() => api('/profile/contacts', { method: 'POST', body }), 'Could not add contact')) {
        document.getElementById('contact-form').reset();
        toast('Emergency contact added.', 'success');
        const d = await loadProfile();
        if (d) renderContacts(d.contacts);
    }
}

async function deleteContact(id) {
    if (!(await confirmDialog('Remove this contact?', 'They will no longer appear in your SOS options.', 'Remove', true))) return;
    if (await attempt(() => api(`/profile/contacts/${id}`, { method: 'DELETE' }))) {
        const d = await loadProfile();
        if (d) renderContacts(d.contacts);
    }
}

// ----- Medical ID card -----
async function showMedicalId() {
    const [d, meds] = await Promise.all([loadProfile(), attempt(() => api('/medications'))]);
    if (!d) return;
    const p = d.profile;
    const active = (meds || []).filter((m) => m.active && (!m.end_date || m.end_date >= todayStr()));
    const row = (label, value, cls = '') => `<div class="py-2.5 border-t border-[color:var(--rule)]"><p class="meta">${label}</p><p class="text-[14px] mt-0.5 ${cls}">${value || '<span class="text-[color:var(--faint)]">Not added</span>'}</p></div>`;
    openPanel('Medical ID', `
        <div id="print-area">
            <div class="rounded-[16px] overflow-hidden border border-[color:var(--border)]">
                <div class="bg-[color:var(--brand)] text-white px-5 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-2"><svg viewBox="0 0 32 32" class="h-6 w-6" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#fff"/><path d="M13 8h6v5h5v6h-5v5h-6v-5H8v-6h5z" fill="#1e3a8a"/></svg><span class="font-semibold">Medical ID</span></div>
                    <span class="text-[12px] opacity-80">MedAssist Hub</span>
                </div>
                <div class="p-5">
                    <div class="flex items-start justify-between gap-4 mb-2">
                        <div>
                            <p class="text-[20px] font-semibold">${esc(d.user.name)}</p>
                            <p class="text-[14px] muted">${[p.dob ? `Born ${esc(formatDate(p.dob, { day: 'numeric', month: 'short', year: 'numeric' }))}` : '', p.age !== null ? `${p.age} years` : '', p.gender && p.gender !== 'prefer_not_to_say' ? esc(p.gender) : ''].filter(Boolean).join(' · ')}</p>
                        </div>
                        <div class="text-center rounded-[12px] px-4 py-2 bg-[color:var(--pill-negative-bg)] text-[color:var(--pill-negative-ink)]">
                            <p class="text-[12px] font-semibold">Blood</p><p class="text-[24px] leading-[28px] font-semibold">${esc(p.blood_group || '—')}</p>
                        </div>
                    </div>
                    ${row('Allergies', esc(p.allergies), 'font-semibold text-[color:var(--pill-negative-ink)]')}
                    ${row('Conditions', esc(p.conditions))}
                    ${row('Current medicines', active.map((m) => `${esc(m.name)} ${esc(m.dosage)}`).join(', '))}
                    ${row('Notes', esc(p.notes))}
                    ${row('Emergency contacts', d.contacts.map((c) => `${esc(c.name)}${c.relation ? ` (${esc(c.relation)})` : ''}: <span class="num font-semibold">${esc(c.phone)}</span>`).join('<br>'))}
                    <p class="meta mt-3">Updated ${esc(new Date().toLocaleDateString('en-IN'))}</p>
                </div>
            </div>
        </div>
        <button onclick="window.print()" class="no-print btn btn-primary w-full mt-4">Print or save as PDF</button>`);
}

// ----- Account -----
function openChangePassword() {
    openPanel('Change password', `
        <form id="pw-form" class="space-y-4">
            <div><label for="pw-current" class="label">Current password</label><input type="password" id="pw-current" required autocomplete="current-password" class="field"></div>
            <div><label for="pw-new" class="label">New password</label><input type="password" id="pw-new" required minlength="8" autocomplete="new-password" class="field" aria-describedby="pw-new-hint"><p id="pw-new-hint" class="hint">At least 8 characters.</p></div>
            <button type="submit" class="btn btn-primary w-full">Update password</button>
        </form>`, 'max-w-sm');
    document.getElementById('pw-form').onsubmit = async (e) => {
        e.preventDefault();
        const ok = await attempt(() => api('/auth/change-password', { method: 'POST', body: { currentPassword: document.getElementById('pw-current').value, newPassword: document.getElementById('pw-new').value } }), 'Could not change password');
        if (ok) { closePanel(); toast('Password updated.', 'success'); }
    };
}

function openDeleteAccount() {
    openPanel('Delete your account', `
        <form id="del-form" class="space-y-4">
            <p class="text-[14px] muted">This permanently deletes your account with all its medicines, readings, appointments and history. It cannot be undone.</p>
            <div><label for="del-pw" class="label">Password</label><input type="password" id="del-pw" required class="field"></div>
            <button type="submit" class="btn btn-danger w-full">Delete my account</button>
        </form>`, 'max-w-sm');
    document.getElementById('del-form').onsubmit = async (e) => {
        e.preventDefault();
        const ok = await attempt(() => api('/auth/account', { method: 'DELETE', body: { password: document.getElementById('del-pw').value } }), 'Could not delete account');
        if (ok) {
            closePanel();
            setToken(null);
            currentUser = null;
            applyAuthState();
            switchTab('dashboard');
            toast('Your account has been deleted.');
        }
    };
}

// ----- SOS -----
function whatsappNumber(phone) {
    let digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length === 10) digits = `${appMeta.default_country_code}${digits}`;
    return digits;
}

async function openSOS() {
    openPanel('Emergency', `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <a href="tel:${esc(appMeta.emergency_number)}" class="flex flex-col items-center justify-center py-5 rounded-[16px] bg-[color:var(--sos)] hover:bg-[#b02424] text-white">
                    <span class="text-[28px] leading-[32px] font-semibold num">${esc(appMeta.emergency_number)}</span><span class="text-[13px] mt-1">Emergency</span>
                </a>
                <a href="tel:${esc(appMeta.ambulance_number)}" class="flex flex-col items-center justify-center py-5 rounded-[16px] bg-[color:var(--pill-negative-bg)] text-[color:var(--pill-negative-ink)] hover:bg-[#ffe0db]">
                    <span class="text-[28px] leading-[32px] font-semibold num">${esc(appMeta.ambulance_number)}</span><span class="text-[13px] mt-1">Ambulance</span>
                </a>
            </div>
            <div id="sos-location" class="notice notice-info"><span class="spinner dark shrink-0 mt-0.5"></span> Getting your location…</div>
            <div id="sos-contacts"></div>
            <button onclick="closePanel(); switchTab('locator'); findHospitals();" class="btn btn-secondary w-full">Find the nearest hospital</button>
        </div>`, 'max-w-md');

    let contacts = [];
    if (currentUser) contacts = (await loadProfile())?.contacts || [];

    const renderShare = (mapsLink) => {
        const box = document.getElementById('sos-contacts');
        if (!box) return;
        const msg = `EMERGENCY: I need help.${mapsLink ? ` My location: ${mapsLink}` : ''}${profileData?.profile?.blood_group ? ` Blood group: ${profileData.profile.blood_group}.` : ''} (sent from MedAssist Hub)`;
        let html = '';
        if (contacts.length) {
            html += '<p class="label">Alert your contacts</p>' + contacts.map((c) => `
                <div class="list-row">
                    <span class="font-semibold truncate">${esc(c.name)}</span>
                    <div class="flex gap-1 shrink-0">
                        <a href="tel:${esc(c.phone.replace(/\s/g, ''))}" class="btn btn-secondary btn-sm">Call</a>
                        <a href="sms:${esc(c.phone.replace(/\s/g, ''))}?body=${encodeURIComponent(msg)}" class="btn btn-secondary btn-sm">SMS</a>
                        <a href="https://wa.me/${whatsappNumber(c.phone)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">WhatsApp</a>
                    </div>
                </div>`).join('');
        } else if (currentUser) {
            html += '<p class="text-[14px] muted">No emergency contacts saved. <button onclick="closePanel(); switchTab(\'profile\')" class="btn btn-text">Add one</button></p>';
        } else {
            html += '<p class="text-[14px] muted"><button onclick="openAuth(\'login\')" class="btn btn-text">Log in</button> to alert your saved contacts with one tap.</p>';
        }
        if (navigator.share) html += '<button id="sos-share" class="btn btn-quiet w-full mt-3">Share my location with anyone…</button>';
        box.innerHTML = html;
        const shareBtn = document.getElementById('sos-share');
        if (shareBtn) shareBtn.onclick = () => navigator.share({ title: 'Emergency', text: msg }).catch(() => {});
    };

    renderShare(null);
    if (!navigator.geolocation) {
        document.getElementById('sos-location').textContent = 'Location is not available on this device.';
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            const link = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
            const el = document.getElementById('sos-location');
            if (el) el.innerHTML = `${icon('map', 'h-5 w-5 shrink-0')}<span>Location ready, accurate to about ${Math.round(accuracy)} m. It is added to your messages. <a href="${link}" target="_blank" rel="noopener" class="underline">View</a></span>`;
            renderShare(link);
        },
        () => {
            const el = document.getElementById('sos-location');
            if (el) el.textContent = 'Couldn’t get your location. Messages will be sent without it.';
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
}

TAB_LOADERS.profile = async () => {
    if (!currentUser) return;
    const d = await loadProfile();
    if (d) fillProfileForm(d);
};
