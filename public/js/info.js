// ---------- First aid ----------
let firstAidGuides = [];
let infoCategory = 'All';

async function loadInfo() {
    document.getElementById('emergency-banner').innerHTML = `
        <div><p class="font-semibold text-[16px]">In an emergency, call first</p><p class="text-[14px]">Make sure the scene is safe, call for help, then follow a guide.</p></div>
        <div class="flex flex-wrap gap-2">
            <a href="tel:${esc(appMeta.emergency_number)}" class="btn btn-danger">Emergency ${esc(appMeta.emergency_number)}</a>
            <a href="tel:${esc(appMeta.ambulance_number)}" class="btn btn-secondary">Ambulance ${esc(appMeta.ambulance_number)}</a>
            <a href="tel:${esc(appMeta.mental_health_helpline)}" class="btn btn-secondary">Mental health ${esc(appMeta.mental_health_helpline)}</a>
        </div>`;
    if (firstAidGuides.length) return;
    const rows = await attempt(() => api('/firstaid'));
    if (!rows) return;
    firstAidGuides = rows;
    const cats = ['All', ...new Set(rows.map((g) => g.category))];
    document.getElementById('info-categories').innerHTML = `<div class="seg flex-wrap">${cats.map((c) => `
        <button data-cat="${esc(c)}" onclick="setInfoCategory(this.dataset.cat)" aria-pressed="${c === infoCategory}">${esc(c)}</button>`).join('')}</div>`;
    filterInfo();
}

function setInfoCategory(cat) {
    infoCategory = cat;
    document.querySelectorAll('#info-categories [data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
    filterInfo();
}

function filterInfo() {
    const q = document.getElementById('info-search').value.trim().toLowerCase();
    const list = firstAidGuides.filter((g) =>
        (infoCategory === 'All' || g.category === infoCategory) &&
        (!q || [g.title, g.category, ...(g.tags || []), ...g.steps].join(' ').toLowerCase().includes(q)));
    const grid = document.getElementById('info-grid');
    if (!list.length) {
        grid.innerHTML = `<p class="empty">No guide matches “${esc(q)}”. If this is an emergency, call ${esc(appMeta.emergency_number)}.</p>`;
        return;
    }
    grid.innerHTML = list.map((g) => `
        <article class="guide">
            <div class="flex items-start justify-between gap-2">
                <h2 class="panel-title">${esc(g.title)}</h2>
                ${g.call_emergency ? '<span class="chip chip-neg shrink-0">Call first</span>' : `<span class="chip shrink-0">${esc(g.category)}</span>`}
            </div>
            ${g.id === 'kit' ? `<ul class="check-list text-[14px] leading-[21px] mt-2">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : `<ol>${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`}
            ${g.dont?.length ? `<div class="dont"><p class="font-semibold mb-1">Don’t</p>${g.dont.map((d) => `<p>${esc(d)}</p>`).join('')}</div>` : ''}
            ${g.call_emergency ? `<a href="tel:${esc(appMeta.emergency_number)}" class="btn btn-danger w-full mt-4">Call ${esc(appMeta.emergency_number)}</a>` : ''}
        </article>`).join('');
}

TAB_LOADERS.info = loadInfo;
