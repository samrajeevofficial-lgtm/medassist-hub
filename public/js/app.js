// ---------- App start-up ----------
(async function init() {
    try {
        appMeta = { ...appMeta, ...(await api('/meta')) };
    } catch { /* keep defaults */ }
    document.querySelectorAll('.emergency-number').forEach((el) => { el.textContent = appMeta.emergency_number; });
    document.querySelectorAll('a.emergency-call').forEach((a) => { a.href = `tel:${appMeta.emergency_number}`; });

    renderAuthGates();
    renderGuest();
    renderSymptomChips();

    await restoreSession();
    // "?demo" in the address opens the demo account straight away (handy on presentation day).
    if (!currentUser && new URLSearchParams(location.search).has('demo') && appMeta.demo_available) {
        try {
            const data = await api('/auth/demo', { method: 'POST' });
            setToken(data.token);
            currentUser = data.user;
        } catch { /* fall through as a guest */ }
        history.replaceState(null, '', location.pathname + location.hash);
    }
    applyAuthState();
    switchTab(location.hash.replace('#', '') || 'dashboard');
})();

window.addEventListener('hashchange', () => {
    const tab = location.hash.replace('#', '');
    if (tab && tab !== currentTab) switchTab(tab);
});

// Refresh time-sensitive views when the person comes back to the tab.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !currentUser) return;
    if (currentTab === 'dashboard') loadDashboard();
    if (currentTab === 'tracker') refreshTracker();
    checkReminders();
});
