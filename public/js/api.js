// ---------- API client ----------
const TOKEN_KEY = 'medassist_token';

function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(token) {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable - session-only login */ }
}

class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

async function api(path, { method = 'GET', body, query } = {}) {
    let url = `/api${path}`;
    if (query) {
        const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
        const qs = params.toString();
        if (qs) url += `?${qs}`;
    }
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
        res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
        throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
    }

    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }

    if (!res.ok) {
        if (res.status === 401 && token) onSessionExpired();
        throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
    }
    return data;
}

// Wraps an async action and shows errors in a toast.
async function attempt(fn, errorTitle) {
    try {
        return await fn();
    } catch (e) {
        if (e.status === 401) return null;
        if (errorTitle) showModal(errorTitle, e.message, true);
        else toast(e.message, 'error', { duration: 6000 });
        return null;
    }
}
