// ---------- Reminders (browser notifications while the app is open) ----------
let reminderTimer = null;
let reminderDoses = [];
let reminderAppointments = [];
let reminderLoadedAt = 0;
const NOTIFIED_KEY = 'medassist_notified';

function notifiedSet() {
    try {
        const raw = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
        if (raw.date !== todayStr()) return { date: todayStr(), keys: [] };
        return raw;
    } catch { return { date: todayStr(), keys: [] }; }
}
function markNotified(key) {
    const s = notifiedSet();
    s.keys.push(key);
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
function wasNotified(key) { return notifiedSet().keys.includes(key); }

function updateNotifCard() {
    const card = document.getElementById('notif-card');
    if (!card) return;
    const head = '<h2 class="panel-title mb-1">Dose reminders</h2>';
    if (!('Notification' in window)) {
        card.innerHTML = `${head}<p class="text-[14px] muted">This browser can’t show pop-ups. You’ll still see an alert inside MedAssist while it’s open.</p>`;
    } else if (Notification.permission === 'granted') {
        card.innerHTML = `${head}<p class="text-[14px]"><span class="chip chip-pos mr-1">On</span> You’ll get a pop-up when a dose is due, while MedAssist is open in a tab.</p>`;
    } else if (Notification.permission === 'denied') {
        card.innerHTML = `${head}<p class="text-[14px] muted">Pop-ups are blocked for this site. Allow notifications in your browser’s site settings. Alerts inside MedAssist still work.</p>`;
    }
}

async function enableNotifications() {
    if (!('Notification' in window)) return updateNotifCard();
    const perm = await Notification.requestPermission();
    updateNotifCard();
    if (perm === 'granted') new Notification('MedAssist Hub', { body: 'Reminders are on. We\'ll let you know when it\'s time for a dose.' });
}

function notify(title, body, actions = []) {
    toast(`${title}: ${body}`, 'info', { duration: 0, actions });
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const n = new Notification(title, { body, tag: title + body });
            n.onclick = () => { window.focus(); n.close(); };
        } catch { /* some mobile browsers need a service worker */ }
    }
}

async function refreshReminderSchedule() {
    if (!currentUser) return;
    const [sched, appts] = await Promise.all([
        api('/medications/schedule', { query: { date: todayStr() } }).catch(() => null),
        api('/appointments', { query: { status: 'upcoming' } }).catch(() => null),
    ]);
    if (sched) reminderDoses = sched.doses;
    if (appts) reminderAppointments = appts;
    reminderLoadedAt = Date.now();
}

async function checkReminders() {
    if (!currentUser) return;
    if (Date.now() - reminderLoadedAt > 5 * 60000 || reminderDoses[0]?.date !== todayStr()) await refreshReminderSchedule();
    const now = nowTimeStr();
    const today = todayStr();

    reminderDoses.forEach((d) => {
        if (d.status !== 'pending' || d.time > now) return;
        // Only remind for doses due in the last 30 minutes, so opening the app late doesn't flood you.
        const [h, m] = d.time.split(':').map(Number);
        const [nh, nm] = now.split(':').map(Number);
        if ((nh * 60 + nm) - (h * 60 + m) > 30) return;
        const key = `dose|${d.medication_id}|${d.time}`;
        if (wasNotified(key)) return;
        markNotified(key);
        notify('Time for your medicine', `${d.name} ${d.dosage}${d.instructions ? ` (${d.instructions.toLowerCase()})` : ''}`, [
            { label: 'Taken', onClick: () => logDose(d.medication_id, today, d.time, 'taken') },
        ]);
    });

    const nowMs = Date.now();
    reminderAppointments.forEach((a) => {
        const diffMin = (parseLocal(a.datetime) - nowMs) / 60000;
        const key = `appt|${a.id}|${a.datetime}`;
        if (diffMin > 0 && diffMin <= 60 && !wasNotified(key)) {
            markNotified(key);
            notify('Upcoming appointment', `${a.doctor_name} at ${formatTime(a.datetime.slice(11, 16))}${a.location ? `, ${a.location}` : ''}`);
        }
    });
}

function startReminders() {
    if (reminderTimer) return;
    refreshReminderSchedule().then(checkReminders);
    reminderTimer = setInterval(checkReminders, 30000);
}

function stopReminders() {
    clearInterval(reminderTimer);
    reminderTimer = null;
    reminderDoses = [];
    reminderAppointments = [];
}
