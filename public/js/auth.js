// ---------- Authentication ----------
let currentUser = null;
let appMeta = { emergency_number: '112', ambulance_number: '108', mental_health_helpline: '14416', default_country_code: '91', ai_enabled: false, demo_available: false, common_symptoms: [] };

const GATE_TEXT = {
    tracker: ['Medicines', 'Save your medicines, get a reminder when each dose is due, see how many pills are left and how regularly you take them.'],
    vitals: ['Vitals', 'Log blood pressure, sugar, heart rate, weight, temperature and oxygen, and see whether they are improving.'],
    appointments: ['Appointments', 'Keep track of doctor visits, add them to your phone calendar and get reminded an hour before.'],
    profile: ['Profile', 'Store your blood group, allergies, conditions and emergency contacts, and print a Medical ID.'],
};

function renderAuthGates() {
    document.querySelectorAll('.auth-gate').forEach((gate) => {
        const tab = gate.closest('.tab-content').id;
        const [title, text] = GATE_TEXT[tab] || ['Members only', 'Log in to use this feature.'];
        gate.innerHTML = `
            <div class="title-row"><div><h1 class="page-title screen-title">${esc(title)}</h1><p class="page-sub">${esc(text)}</p></div></div>
            <div class="panel mt-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <p class="text-[16px] leading-[24px] max-w-[32rem]">Log in to use ${esc(title.toLowerCase())}. Or try the demo account to see two months of real-looking data.</p>
                <div class="flex flex-wrap gap-2 shrink-0">
                    ${appMeta.demo_available ? '<button onclick="demoLogin(this)" class="btn btn-secondary">Try the demo</button>' : ''}
                    <button onclick="openAuth('register')" class="btn btn-secondary">Create account</button>
                    <button onclick="openAuth('login')" class="btn btn-primary">Log in</button>
                </div>
            </div>`;
    });
}

function applyAuthState() {
    const loggedIn = Boolean(currentUser);
    document.querySelectorAll('.auth-gate').forEach((el) => el.classList.toggle('hidden', loggedIn));
    document.querySelectorAll('.auth-content').forEach((el) => el.classList.toggle('hidden', !loggedIn));
    document.querySelectorAll('.guest-only').forEach((el) => el.classList.toggle('hidden', loggedIn));
    document.querySelectorAll('.user-only').forEach((el) => el.classList.toggle('hidden', !loggedIn));
    document.querySelectorAll('.user-btn').forEach((btn) => {
        btn.classList.toggle('has-user', loggedIn);
        btn.querySelector('.user-initial').textContent = loggedIn ? currentUser.name.trim()[0].toUpperCase() : '';
        btn.querySelector('.user-label').textContent = loggedIn ? currentUser.name.split(' ')[0] : 'Log in';
        btn.setAttribute('aria-label', loggedIn ? `Profile: ${currentUser.name}` : 'Log in');
    });
    document.getElementById('dash-guest').classList.toggle('hidden', loggedIn);
    document.getElementById('dash-user').classList.toggle('hidden', !loggedIn);
    document.getElementById('triage-history-card').classList.toggle('hidden', !loggedIn);
    if (loggedIn) startReminders(); else stopReminders();
    syncTitles();
}

function onUserButton() {
    if (currentUser) switchTab('profile');
    else openAuth('login');
}

function afterLogin(data, message, nextTab) {
    setToken(data.token);
    currentUser = data.user;
    applyAuthState();
    toast(message, 'success');
    switchTab(nextTab);
}

async function demoLogin(btn) {
    setLoading(btn, true, 'Opening demo…');
    try {
        const data = await api('/auth/demo', { method: 'POST' });
        closePanel();
        afterLogin(data, `Signed in as ${data.user.name} (demo account).`, currentTab && currentTab !== 'dashboard' ? currentTab : 'dashboard');
    } catch (e) {
        showModal('Demo account unavailable', e.message, true);
    } finally {
        setLoading(btn, false);
    }
}

function openAuth(mode = 'login') {
    const isLogin = mode === 'login';
    openPanel(isLogin ? 'Log in' : 'Create your account', `
        <form id="auth-form" class="space-y-4">
            ${isLogin ? '' : `<div><label class="label" for="af-name">Full name</label><input id="af-name" type="text" name="name" required maxlength="80" autocomplete="name" class="field"></div>`}
            <div><label class="label" for="af-email">Email</label><input id="af-email" type="email" name="email" required maxlength="120" autocomplete="email" class="field"></div>
            <div>
                <label class="label" for="af-pass">Password</label>
                <input id="af-pass" type="password" name="password" required minlength="${isLogin ? 1 : 8}" autocomplete="${isLogin ? 'current-password' : 'new-password'}" class="field" ${isLogin ? '' : 'aria-describedby="af-pass-hint"'}>
                ${isLogin ? '' : '<p id="af-pass-hint" class="hint">At least 8 characters.</p>'}
            </div>
            <p id="auth-error" class="hidden notice notice-neg"></p>
            <button type="submit" id="auth-submit" class="btn btn-primary w-full">${isLogin ? 'Log in' : 'Create account'}</button>
            ${appMeta.demo_available ? '<button type="button" onclick="demoLogin(this)" class="btn btn-secondary w-full">Use the demo account</button>' : ''}
            <p class="text-center text-[14px] muted">
                ${isLogin ? 'New here?' : 'Already have an account?'}
                <button type="button" onclick="openAuth('${isLogin ? 'register' : 'login'}')" class="btn btn-text">${isLogin ? 'Create an account' : 'Log in'}</button>
            </p>
        </form>`, 'max-w-sm');

    const form = document.getElementById('auth-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('auth-submit');
        const errEl = document.getElementById('auth-error');
        errEl.classList.add('hidden');
        setLoading(btn, true, isLogin ? 'Logging in…' : 'Creating account…');
        try {
            const data = await api(`/auth/${isLogin ? 'login' : 'register'}`, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
            closePanel();
            afterLogin(data,
                isLogin ? `Welcome back, ${data.user.name.split(' ')[0]}.` : 'Account created. Add your health details next.',
                isLogin ? (currentTab || 'dashboard') : 'profile');
        } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
        } finally {
            setLoading(btn, false);
        }
    };
}

function logout() {
    setToken(null);
    currentUser = null;
    applyAuthState();
    switchTab('dashboard');
    toast('You have been logged out.');
}

let sessionExpiredShown = false;
function onSessionExpired() {
    setToken(null);
    currentUser = null;
    applyAuthState();
    if (!sessionExpiredShown) {
        sessionExpiredShown = true;
        toast('Your session expired. Please log in again.', 'warning', { actions: [{ label: 'Log in', onClick: () => openAuth('login') }] });
        setTimeout(() => { sessionExpiredShown = false; }, 5000);
    }
}

async function restoreSession() {
    if (!getToken()) return;
    try {
        currentUser = (await api('/auth/me')).user;
    } catch {
        setToken(null);
        currentUser = null;
    }
}
