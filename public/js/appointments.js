// ---------- Appointments ----------
let appointments = [];

function resetApptForm() {
    document.getElementById('appt-form').reset();
    document.getElementById('appt-id').value = '';
    document.getElementById('appt-form-title').textContent = 'New appointment';
    document.getElementById('appt-submit').textContent = 'Save appointment';
    document.getElementById('appt-cancel').classList.add('hidden');
}

function focusApptForm() {
    resetApptForm();
    document.getElementById('appt-form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.getElementById('appt-doctor').focus(), 300);
}

function editAppointment(id) {
    const a = appointments.find((x) => x.id === id);
    if (!a) return;
    document.getElementById('appt-id').value = a.id;
    document.getElementById('appt-doctor').value = a.doctor_name;
    document.getElementById('appt-specialty').value = a.specialty || '';
    document.getElementById('appt-datetime').value = a.datetime;
    document.getElementById('appt-location').value = a.location || '';
    document.getElementById('appt-reason').value = a.reason || '';
    document.getElementById('appt-notes').value = a.notes || '';
    document.getElementById('appt-form-title').textContent = 'Edit appointment';
    document.getElementById('appt-submit').textContent = 'Save changes';
    document.getElementById('appt-cancel').classList.remove('hidden');
    document.getElementById('appt-form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveAppointment(e) {
    e.preventDefault();
    const id = document.getElementById('appt-id').value;
    const body = {
        doctor_name: document.getElementById('appt-doctor').value,
        specialty: document.getElementById('appt-specialty').value,
        datetime: document.getElementById('appt-datetime').value,
        location: document.getElementById('appt-location').value,
        reason: document.getElementById('appt-reason').value,
        notes: document.getElementById('appt-notes').value,
    };
    if (!id && body.datetime < nowLocalDatetime()) {
        if (!(await confirmDialog('That date has passed', 'Save it as a past appointment?', 'Save as past'))) return;
        body.status = 'completed';
    }
    const saved = await attempt(() => api(id ? `/appointments/${id}` : '/appointments', { method: id ? 'PUT' : 'POST', body }), 'Could not save');
    if (!saved) return;
    toast(id ? 'Appointment updated.' : `Appointment with ${saved.doctor_name} saved.`, 'success');
    resetApptForm();
    loadAppointments();
    refreshReminderSchedule();
}

async function setApptStatus(id, status) {
    if (status === 'cancelled' && !(await confirmDialog('Cancel this appointment?', 'It moves to your past appointments.', 'Cancel appointment', true))) return;
    if (await attempt(() => api(`/appointments/${id}`, { method: 'PUT', body: { status } }))) {
        loadAppointments();
        refreshReminderSchedule();
    }
}

async function deleteAppointment(id) {
    if (!(await confirmDialog('Delete this appointment?', 'This cannot be undone.', 'Delete', true))) return;
    if (await attempt(() => api(`/appointments/${id}`, { method: 'DELETE' }))) loadAppointments();
}

// Download an .ics file for Google, Apple or Outlook calendar (with a 1-hour alarm).
function downloadIcs(id) {
    const a = appointments.find((x) => x.id === id);
    if (!a) return;
    const start = parseLocal(a.datetime);
    const end = new Date(start.getTime() + 30 * 60000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const escIcs = (s) => String(s || '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MedAssist Hub//EN', 'BEGIN:VEVENT',
        `UID:medassist-appt-${a.id}@medassist`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
        `SUMMARY:${escIcs(`${a.doctor_name}${a.specialty ? ` (${a.specialty})` : ''}`)}`,
        `LOCATION:${escIcs(a.location)}`,
        `DESCRIPTION:${escIcs([a.reason, a.notes].filter(Boolean).join('\n'))}`,
        'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Doctor appointment in 1 hour', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `appointment-${a.datetime.slice(0, 10)}.ics`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function apptCard(a, upcoming) {
    const dt = parseLocal(a.datetime);
    const status = a.status === 'upcoming' && !upcoming ? ['chip-warn', 'Not updated'] : { completed: ['chip-pos', 'Done'], cancelled: ['', 'Cancelled'], upcoming: ['chip-info', relativeDays(a.datetime)] }[a.status];
    return `
    <div class="row-card">
        <div class="flex items-start gap-4">
            <div class="text-center w-12 shrink-0 pt-0.5">
                <p class="text-[12px] font-semibold uppercase muted">${esc(dt.toLocaleDateString('en-IN', { month: 'short' }))}</p>
                <p class="text-[24px] leading-[28px] num">${dt.getDate()}</p>
                <p class="meta num">${formatTime(a.datetime.slice(11, 16)).replace(':00', '')}</p>
            </div>
            <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                    <p class="font-semibold text-[15px]">${esc(a.doctor_name)}${a.specialty ? ` <span class="font-normal muted">· ${esc(a.specialty)}</span>` : ''}</p>
                    <span class="chip ${status[0]}">${esc(status[1])}</span>
                </div>
                ${a.location ? `<p class="text-[13px] muted mt-0.5">${esc(a.location)}</p>` : ''}
                ${a.reason ? `<p class="text-[14px] mt-2">${esc(a.reason)}</p>` : ''}
                ${a.notes ? `<p class="text-[13px] muted mt-1 whitespace-pre-line">${esc(a.notes)}</p>` : ''}
                <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[13px]">
                    ${upcoming ? `<button onclick="downloadIcs(${a.id})" class="btn btn-text">Add to calendar</button>` : ''}
                    ${a.status === 'upcoming' ? `<button onclick="setApptStatus(${a.id}, 'completed')" class="btn btn-text">Mark done</button>` : ''}
                    ${a.status === 'upcoming' ? `<button onclick="setApptStatus(${a.id}, 'cancelled')" class="btn btn-text">Cancel</button>` : ''}
                    <button onclick="editAppointment(${a.id})" class="btn btn-text">Edit</button>
                    <button onclick="deleteAppointment(${a.id})" class="btn btn-text !text-[color:var(--negative)]">Delete</button>
                </div>
            </div>
        </div>
    </div>`;
}

async function loadAppointments() {
    const rows = await attempt(() => api('/appointments'));
    if (!rows) return;
    appointments = rows;
    const now = nowLocalDatetime();
    const upcoming = rows.filter((a) => a.status === 'upcoming' && a.datetime >= now).sort((a, b) => a.datetime.localeCompare(b.datetime));
    const past = rows.filter((a) => !(a.status === 'upcoming' && a.datetime >= now));
    document.getElementById('appt-count').textContent = upcoming.length;
    document.getElementById('appt-sub').textContent = upcoming.length
        ? `Next: ${upcoming[0].doctor_name}, ${formatDateTime(upcoming[0].datetime)} (${relativeDays(upcoming[0].datetime).toLowerCase()}).`
        : 'Doctor visits, with reminders and calendar links.';
    document.getElementById('appt-upcoming').innerHTML = upcoming.length ? upcoming.map((a) => apptCard(a, true)).join('') : '<p class="empty">No upcoming appointments.</p>';
    document.getElementById('appt-past').innerHTML = past.length ? past.map((a) => apptCard(a, false)).join('') : '<p class="empty">Past visits will appear here.</p>';
}

TAB_LOADERS.appointments = () => { if (currentUser) loadAppointments(); };
