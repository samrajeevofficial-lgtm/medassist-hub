// ---------- Vitals ----------
const VITAL_META = {
    blood_pressure: { label: 'Blood pressure', unit: 'mmHg', ref: { value: 130, label: 'High from 130' } },
    blood_sugar: { label: 'Blood sugar', unit: 'mg/dL', ref: { value: 100, label: 'Fasting raised from 100' } },
    heart_rate: { label: 'Heart rate', unit: 'bpm', ref: { value: 100, label: 'Fast above 100' } },
    weight: { label: 'Weight', unit: 'kg' },
    temperature: { label: 'Temperature', unit: '°C', ref: { value: 38, label: 'Fever from 38' } },
    spo2: { label: 'Oxygen', unit: '%', ref: { value: 95, label: 'Low below 95' } },
};
const charts = {};

// Dashed reference line drawn on the chart area (no plugin dependency).
const refLinePlugin = {
    id: 'refLine',
    afterDatasetsDraw(chart, _args, opts) {
        if (!opts || opts.value == null) return;
        const { ctx, chartArea, scales } = chart;
        const y = scales.y.getPixelForValue(opts.value);
        if (y < chartArea.top || y > chartArea.bottom) return;
        ctx.save();
        ctx.strokeStyle = '#67707e';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#4b5563';
        ctx.font = '12px "Public Sans", system-ui, sans-serif';
        // Label sits at the left end on whichever side of the line the main series is not.
        const first = chart.data.datasets[0].data.find((v) => v != null);
        const below = first != null && first > opts.value;
        ctx.textAlign = 'left';
        ctx.textBaseline = below ? 'top' : 'bottom';
        const text = opts.label;
        const w = ctx.measureText(text).width;
        const tx = chartArea.left + 6, ty = below ? y + 5 : y - 5;
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.fillRect(tx - 3, below ? ty - 1 : ty - 15, w + 6, 16);
        ctx.fillStyle = '#4b5563';
        ctx.fillText(text, tx, ty);
        ctx.restore();
    },
};

// Straight 2px lines, no point markers, faint horizontal grid, no legend for one series.
function drawTrendChart(canvasId, type, rows, { compact = false } = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts[canvasId]) charts[canvasId].destroy();
    const meta = VITAL_META[type];
    const labels = rows.map((v) => parseLocal(v.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    const line = (label, data, color, extra = {}) => ({
        label, data, borderColor: color, backgroundColor: color, borderWidth: 2, tension: 0, spanGaps: true,
        pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 10, ...extra,
    });
    let datasets;
    if (type === 'blood_pressure') {
        datasets = [line('Systolic', rows.map((v) => v.value1), '#1d5fbf'), line('Diastolic', rows.map((v) => v.value2), '#9db7e3')];
    } else if (type === 'blood_sugar') {
        datasets = [
            line('Fasting', rows.map((v) => (v.context === 'fasting' ? v.value1 : null)), '#1d5fbf'),
            line('After a meal', rows.map((v) => (v.context !== 'fasting' ? v.value1 : null)), '#98a2b3', { borderWidth: 0, pointRadius: 3.5, showLine: false }),
        ];
    } else {
        datasets = [line(meta.label, rows.map((v) => v.value1), '#1d5fbf', rows.length < 3 ? { pointRadius: 3 } : {})];
    }
    charts[canvasId] = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        plugins: [refLinePlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 4 } },
            plugins: {
                legend: { display: datasets.length > 1, align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', color: '#4b5563', font: { family: 'Public Sans', size: 12 } } },
                tooltip: {
                    backgroundColor: '#111827', padding: 10, displayColors: false, titleFont: { family: 'Public Sans' }, bodyFont: { family: 'Public Sans' },
                    callbacks: {
                        title: (items) => formatDateTime(rows[items[0].dataIndex].recorded_at),
                        label: (item) => (item.raw == null ? null : `${item.dataset.label}: ${item.raw} ${meta.unit}`),
                    },
                },
                refLine: meta.ref ? { value: meta.ref.value, label: meta.ref.label } : {},
            },
            scales: {
                y: { grace: '8%', border: { display: false }, grid: { color: '#e5e7eb' }, ticks: { maxTicksLimit: compact ? 4 : 5, color: '#4b5563', font: { family: 'Public Sans', size: 12 } } },
                x: { border: { color: '#cbd5e1' }, grid: { display: false }, ticks: { maxTicksLimit: compact ? 4 : 6, maxRotation: 0, color: '#4b5563', font: { family: 'Public Sans', size: 12 } } },
            },
        },
    });
}

// ----- Log form -----
function onVitalTypeChange() {
    const type = document.getElementById('vital-type').value;
    const f = document.getElementById('vital-fields');
    const field = (id, label, attrs) => `<div><label for="${id}" class="label">${label}</label><input type="number" id="${id}" required ${attrs} inputmode="decimal" class="field"></div>`;
    switch (type) {
        case 'blood_pressure':
            f.innerHTML = `<div class="grid grid-cols-2 gap-2">${field('vital-v1', 'Upper (systolic)', 'min="40" max="300" placeholder="120"')}${field('vital-v2', 'Lower (diastolic)', 'min="20" max="200" placeholder="80"')}</div>`;
            break;
        case 'blood_sugar':
            f.innerHTML = `<div class="grid grid-cols-2 gap-2">${field('vital-v1', 'Sugar (mg/dL)', 'min="10" max="800" placeholder="100"')}
                <div><label for="vital-context" class="label">Taken</label><select id="vital-context" class="field"><option value="fasting">Fasting</option><option value="after_meal">After a meal</option><option value="random">Random</option></select></div></div>`;
            break;
        case 'heart_rate': f.innerHTML = field('vital-v1', 'Heart rate (bpm)', 'min="20" max="250" placeholder="72"'); break;
        case 'weight': f.innerHTML = field('vital-v1', 'Weight (kg)', 'min="1" max="400" step="0.1" placeholder="65"'); break;
        case 'temperature':
            f.innerHTML = `<div class="flex gap-2 items-end"><div class="flex-grow">${field('vital-v1', 'Temperature', 'min="30" max="113" step="0.1" placeholder="37.0"')}</div>
                <select id="vital-temp-unit" class="field !w-20" aria-label="Unit"><option value="C">°C</option><option value="F">°F</option></select></div>`;
            break;
        case 'spo2': f.innerHTML = field('vital-v1', 'Oxygen saturation (%)', 'min="50" max="100" placeholder="98"'); break;
    }
}

async function saveVital(e) {
    e.preventDefault();
    const type = document.getElementById('vital-type').value;
    let value1 = Number(document.getElementById('vital-v1').value);
    if (type === 'temperature' && document.getElementById('vital-temp-unit').value === 'F') value1 = Math.round(((value1 - 32) * 5 / 9) * 10) / 10;
    const body = {
        type, value1,
        value2: type === 'blood_pressure' ? document.getElementById('vital-v2').value : undefined,
        context: type === 'blood_sugar' ? document.getElementById('vital-context').value : undefined,
        recorded_at: document.getElementById('vital-when').value,
        note: document.getElementById('vital-note').value,
    };
    const v = await attempt(() => api('/vitals', { method: 'POST', body }), 'Could not save reading');
    if (!v) return;
    const level = v.status.level;
    toast(`${v.label}: ${v.display} ${v.unit}${v.status.label ? `, ${v.status.label.toLowerCase()}` : ''}`, level === 'critical' ? 'error' : ['normal', 'info'].includes(level) ? 'success' : 'warning', { duration: 6000 });
    if (level === 'critical') showModal('This reading needs attention', `${v.label} of ${v.display} ${v.unit} is outside the safe range (${v.status.label}). If you feel unwell, get medical help now.`, true);
    document.getElementById('vital-v1').value = '';
    if (document.getElementById('vital-v2')) document.getElementById('vital-v2').value = '';
    document.getElementById('vital-note').value = '';
    document.getElementById('vital-when').value = nowLocalDatetime();
    document.getElementById('chart-type').value = type;
    loadVitals();
}

// ----- Summary strip (doubles as chart tabs) -----
async function loadVitalsSummary() {
    const rows = await attempt(() => api('/vitals/summary'));
    if (!rows) return;
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
    const latest = rows.map((r) => r.recorded_at).sort().pop();
    document.getElementById('vitals-sub').textContent = latest
        ? `Last reading ${relativeDays(latest).toLowerCase()}, ${formatTime(latest.slice(11, 16))}. Tap a figure to see its trend.`
        : 'Log your first reading to start seeing trends.';
    const selected = document.getElementById('chart-type').value;
    document.getElementById('vitals-summary').innerHTML = Object.entries(VITAL_META).map(([type, m]) => {
        const v = byType[type];
        return `
        <button onclick="selectVital('${type}')" aria-pressed="${type === selected}">
            <span class="kpi-label block">${m.label}</span>
            <span class="kpi-value block mt-1">${v ? esc(v.display) : '<span class="text-[color:var(--faint)]">—</span>'}${v ? `<span class="kpi-unit">${esc(v.unit)}</span>` : ''}</span>
            <span class="block mt-2 min-h-[22px]">${v ? statusChip(v.status) || `<span class="meta">${esc(formatDateTime(v.recorded_at).split(',')[0])}</span>` : '<span class="meta">No reading yet</span>'}</span>
        </button>`;
    }).join('');
}

function selectVital(type) {
    document.getElementById('chart-type').value = type;
    document.querySelectorAll('#vitals-summary > button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('onclick').includes(`'${type}'`))));
    loadVitalsChart();
}

async function loadVitalsChart() {
    const type = document.getElementById('chart-type').value;
    const days = document.getElementById('chart-days').value;
    const meta = VITAL_META[type];
    document.querySelectorAll('#vitals-summary > button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('onclick').includes(`'${type}'`))));
    document.getElementById('chart-title').textContent = meta.label;
    const rows = await attempt(() => api('/vitals', { query: { type, days } }));
    if (!rows) return;

    const wrap = document.getElementById('chart-wrap');
    wrap.classList.toggle('hidden', !rows.length);
    document.getElementById('chart-empty').classList.toggle('hidden', rows.length > 0);

    // The finding, with its baseline named
    const note = document.getElementById('chart-note');
    const series = type === 'blood_sugar' ? rows.filter((r) => r.context === 'fasting') : rows;
    if (series.length > 3) {
        const a = series[0], b = series[series.length - 1];
        const diff = Math.round((b.value1 - a.value1) * 10) / 10;
        const what = type === 'blood_pressure' ? 'Systolic' : type === 'blood_sugar' ? 'Fasting sugar' : meta.label;
        note.textContent = `${what} ${diff < 0 ? 'down' : diff > 0 ? 'up' : 'unchanged'}${diff ? ` ${Math.abs(diff)} ${meta.unit}` : ''} since ${formatDate(a.recorded_at.slice(0, 10), { day: 'numeric', month: 'short' })} (${a.display} → ${b.display}).`;
    } else {
        note.textContent = rows.length ? `${rows.length} reading${rows.length === 1 ? '' : 's'} in this period.` : '';
    }

    document.getElementById('history-count').textContent = rows.length ? `${rows.length} readings` : '';
    document.getElementById('vitals-history').innerHTML = rows.length ? [...rows].reverse().map((v) => `
        <div class="list-row">
            <div class="min-w-0">
                <p><span class="num text-[15px]">${esc(v.display)}</span> <span class="meta">${esc(v.unit)}</span></p>
                <p class="meta mt-0.5">${esc(formatDateTime(v.recorded_at))}${v.context ? ` · ${esc(v.context.replace('_', ' '))}` : ''}${v.note ? ` · ${esc(v.note)}` : ''}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">${statusChip(v.status)}<button onclick="deleteVital(${v.id})" class="btn btn-icon" aria-label="Delete reading from ${esc(formatDateTime(v.recorded_at))}">${icon('trash', 'h-4 w-4')}</button></div>
        </div>`).join('') : '<p class="empty">No readings in this period.</p>';

    if (rows.length) drawTrendChart('vitals-chart', type, rows);
}

async function deleteVital(id) {
    if (!(await confirmDialog('Delete this reading?', 'It will be removed from your history and charts.', 'Delete', true))) return;
    if (await attempt(() => api(`/vitals/${id}`, { method: 'DELETE' }))) loadVitals();
}

function loadVitals() {
    loadVitalsSummary();
    loadVitalsChart();
}

TAB_LOADERS.vitals = () => {
    if (!currentUser) return;
    if (!document.getElementById('vital-fields').innerHTML) onVitalTypeChange();
    if (!document.getElementById('vital-when').value) document.getElementById('vital-when').value = nowLocalDatetime();
    loadVitals();
};
