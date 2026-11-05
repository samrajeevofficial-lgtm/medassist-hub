// ---------- Shared UI helpers ----------

// Always escape user-supplied text before putting it into innerHTML.
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// One outline icon set, used sparingly (16-20px, grey).
const ICONS = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
    pill: '<path d="M10.5 20.5l10-10a4.95 4.95 0 10-7-7l-10 10a4.95 4.95 0 107 7zM8.5 8.5l7 7"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    calendar: '<path d="M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"/>',
    map: '<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    lock: '<path d="M6 11h12v9H6zM8 11V8a4 4 0 018 0v3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
};

function icon(name, cls = 'h-5 w-5') {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
}

// ---------- Tabs ----------
const TAB_LOADERS = {}; // each module registers: TAB_LOADERS.tracker = () => {...}
let currentTab = null;
const MORE_TABS = ['appointments', 'locator', 'info', 'profile'];

function switchTab(tabId) {
    if (!document.getElementById(tabId)) tabId = 'dashboard';
    document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.toggle('active', tab.id === tabId));
    document.querySelectorAll('[data-tab]').forEach((btn) => {
        const active = btn.dataset.tab === tabId || (btn.dataset.tab === 'more' && MORE_TABS.includes(tabId));
        btn.classList.toggle('is-active', active);
        if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    currentTab = tabId;
    syncTitles();
    if (location.hash !== `#${tabId}`) history.replaceState(null, '', `#${tabId}`);
    window.scrollTo({ top: 0 });
    if (TAB_LOADERS[tabId]) TAB_LOADERS[tabId]();
}

// Only the visible screen's title is an <h1>; titles of hidden screens become <h2>.
function syncTitles() {
    document.querySelectorAll('.screen-title').forEach((el) => {
        const visible = el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
        const want = visible ? 'H1' : 'H2';
        if (el.tagName === want) return;
        const next = document.createElement(want);
        [...el.attributes].forEach((a) => next.setAttribute(a.name, a.value));
        next.innerHTML = el.innerHTML;
        el.replaceWith(next);
    });
}

function openMoreSheet() {
    const item = (tab, title, text) => `
        <button onclick="closePanel(); switchTab('${tab}')" class="w-full flex items-center justify-between gap-3 py-3 border-t border-[color:var(--rule)] first:border-t-0 text-left">
            <span><span class="block text-[16px] font-semibold">${title}</span><span class="block text-[13px] muted">${text}</span></span>
            ${icon('chevron', 'h-5 w-5 text-[color:var(--faint)]')}
        </button>`;
    openPanel('More', `
        <div>
            ${item('appointments', 'Appointments', 'Doctor visits and reminders')}
            ${item('locator', 'Nearby hospitals', 'Map, directions and phone numbers')}
            ${item('info', 'First aid', 'Step-by-step emergency guides')}
            ${currentUser ? item('profile', 'Profile', 'Health details, contacts, Medical ID') : ''}
        </div>
        ${currentUser ? '' : '<button onclick="closePanel(); openAuth(\'login\')" class="btn btn-primary w-full mt-4">Log in</button>'}
        <a href="tel:${esc(appMeta.emergency_number)}" class="btn btn-danger w-full mt-3">Call ${esc(appMeta.emergency_number)}</a>`);
}

// ---------- Small modal (alert replacement) ----------
function showModal(title, message, isError = false) {
    const modal = document.getElementById('custom-modal');
    const box = document.getElementById('modal-content-box');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    const iconEl = document.getElementById('modal-icon');
    iconEl.style.background = isError ? 'var(--pill-negative-bg)' : 'var(--accent-soft)';
    iconEl.style.color = isError ? 'var(--negative)' : 'var(--brand)';
    iconEl.innerHTML = icon(isError ? 'alert' : 'info', 'h-6 w-6');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-95'); });
    setTimeout(() => modal.querySelector('button')?.focus(), 50);
}

function closeModal() {
    const modal = document.getElementById('custom-modal');
    modal.classList.add('opacity-0');
    document.getElementById('modal-content-box').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

// ---------- Panel modal (a bottom sheet on phones) ----------
let panelReturnFocus = null;
function openPanel(title, html, size = 'max-w-lg') {
    const modal = document.getElementById('panel-modal');
    const box = document.getElementById('panel-box');
    panelReturnFocus = document.activeElement;
    box.className = `modal-box ${size} scale-95`;
    document.getElementById('panel-title').textContent = title;
    document.getElementById('panel-body').innerHTML = html;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-95'); });
    setTimeout(() => (box.querySelector('input, select, textarea') || box.querySelector('button'))?.focus(), 60);
}

function closePanel() {
    const modal = document.getElementById('panel-modal');
    modal.classList.add('opacity-0');
    document.getElementById('panel-box').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
    panelReturnFocus?.focus?.();
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('custom-modal').classList.contains('hidden')) closeModal();
    else if (!document.getElementById('panel-modal').classList.contains('hidden')) closePanel();
});
document.addEventListener('click', (e) => {
    if (e.target.id === 'panel-modal') closePanel();
    if (e.target.id === 'custom-modal') closeModal();
});

// Promise-based confirm dialog
function confirmDialog(title, message, confirmLabel = 'Confirm', danger = false) {
    return new Promise((resolve) => {
        openPanel(title, `
            <p class="text-[14px] muted mb-6">${esc(message)}</p>
            <div class="flex gap-3">
                <button id="cf-no" class="btn btn-secondary flex-1">Cancel</button>
                <button id="cf-yes" class="btn ${danger ? 'btn-danger' : 'btn-primary'} flex-1">${esc(confirmLabel)}</button>
            </div>`, 'max-w-sm');
        document.getElementById('cf-yes').onclick = () => { closePanel(); resolve(true); };
        document.getElementById('cf-no').onclick = () => { closePanel(); resolve(false); };
    });
}

// ---------- Toasts ----------
function toast(message, type = 'info', { actions = [], duration = 4000 } = {}) {
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="flex-grow">${esc(message)}</span>`;
    actions.forEach((a) => {
        const b = document.createElement('button');
        b.className = 't-action';
        b.textContent = a.label;
        b.onclick = () => { a.onClick(); el.remove(); };
        el.appendChild(b);
    });
    const close = document.createElement('button');
    close.className = 'opacity-70 hover:opacity-100 text-[18px] leading-none px-1';
    close.innerHTML = '&times;';
    close.setAttribute('aria-label', 'Dismiss');
    close.onclick = () => el.remove();
    el.appendChild(close);
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    if (duration) setTimeout(() => el.remove(), duration);
}

// ---------- Button loading state ----------
function setLoading(btn, loading, label = 'Working…') {
    if (!btn) return;
    if (loading) {
        btn.dataset.original = btn.innerHTML;
        btn.innerHTML = `<span class="spinner"></span> ${esc(label)}`;
        btn.disabled = true;
    } else {
        if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
        btn.disabled = false;
    }
}

// ---------- Date / time helpers (local time) ----------
function pad(n) { return String(n).padStart(2, '0'); }
function todayStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowTimeStr(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function nowLocalDatetime(d = new Date()) { return `${todayStr(d)}T${nowTimeStr(d)}`; }
function addDaysStr(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    return todayStr(new Date(y, m - 1, d + n));
}
function parseLocal(dt) {
    const [date, time = '00:00'] = dt.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
}
function minutesOf(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
}
function formatDate(ymd, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
    return parseLocal(ymd).toLocaleDateString('en-IN', opts);
}
function formatDateTime(dt) {
    const d = parseLocal(dt);
    return `${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(dt.slice(11, 16))}`;
}
function relativeDays(dt) {
    const diff = Math.round((parseLocal(dt.slice(0, 10)) - parseLocal(todayStr())) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}
function formatUtc(ts) {
    return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

const STATUS_CHIP = { normal: 'chip-pos', elevated: 'chip-warn', high: 'chip-neg', low: 'chip-info', critical: 'chip-neg', info: '' };
function statusChip(status) {
    if (!status?.label) return '';
    return `<span class="chip ${STATUS_CHIP[status.level] || ''}">${esc(status.label)}</span>`;
}
