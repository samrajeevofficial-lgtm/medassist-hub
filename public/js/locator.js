// ---------- Nearby hospitals ----------
let map = null;
let markerLayer = null;
let lastCenter = null;
let lastLabel = '';
let places = [];
const markersById = {};

const CATEGORY = {
    hospital: { color: '#c4242a', label: 'Hospital', chip: 'chip-neg' },
    clinic: { color: '#1d5fbf', label: 'Clinic', chip: 'chip-info' },
    pharmacy: { color: '#247b50', label: 'Pharmacy', chip: 'chip-pos' },
};

const selectedPlaceTypes = () => [...document.querySelectorAll('#place-filters input:checked')].map((i) => i.value);
const setLocateStatus = (t) => { document.getElementById('locate-status').textContent = t; };

function setLocatorView(view) {
    document.getElementById('locator-results').dataset.view = view;
    document.querySelectorAll('#locator-results [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (view === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
}

function findHospitals() {
    const btn = document.getElementById('locate-btn');
    if (!navigator.geolocation) {
        showModal('Location not available', 'This browser cannot share your location. Type your area in the search box instead.', true);
        return;
    }
    setLocateStatus('Asking for your location…');
    setLoading(btn, true, 'Locating…');
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            await loadPlaces(pos.coords.latitude, pos.coords.longitude, 'you');
            setLoading(btn, false);
        },
        (error) => {
            const msg = {
                1: 'Location access was blocked. Allow location for this site in your browser settings, or type your area in the search box.',
                2: 'Your location is unavailable right now. Type your area in the search box instead.',
                3: 'Finding your location took too long. Try again, or type your area.',
            }[error.code] || 'Could not get your location. Type your area instead.';
            setLocateStatus('');
            setLoading(btn, false);
            showModal('Location problem', msg, true);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
}

async function searchArea(e) {
    e.preventDefault();
    const q = document.getElementById('area-input').value.trim();
    if (!q) return;
    setLocateStatus(`Looking up “${q}”…`);
    try {
        const results = await api('/places/geocode', { query: { q } });
        if (!results.length) {
            setLocateStatus(`Couldn’t find “${q}”. Try adding the city, e.g. “${q}, Bengaluru”.`);
            return;
        }
        await loadPlaces(results[0].lat, results[0].lng, results[0].name.split(',').slice(0, 2).join(','));
    } catch (err) {
        setLocateStatus(err.message);
    }
}

async function loadPlaces(lat, lng, label) {
    const types = selectedPlaceTypes();
    if (!types.length) {
        setLocateStatus('Choose at least one: hospitals, clinics or pharmacies.');
        return;
    }
    lastCenter = { lat, lng };
    lastLabel = label;
    setLocateStatus(`Searching near ${label}…`);
    const slow = setTimeout(() => setLocateStatus(`Still searching near ${label}. The free map servers can take up to 20 seconds…`), 6000);
    try {
        const data = await api('/places/nearby', { query: { lat, lng, radius: document.getElementById('place-radius').value, types: types.join(',') } });
        places = data.places;
        setLocateStatus(`${data.count} place${data.count === 1 ? '' : 's'} near ${label}.`);
        showResults();
    } catch (err) {
        places = [];
        setLocateStatus('');
        showResults(err.message);
    } finally {
        clearTimeout(slow);
    }
}

function googleMapsUrl() {
    return lastCenter ? `https://www.google.com/maps/search/hospitals/@${lastCenter.lat},${lastCenter.lng},14z` : 'https://www.google.com/maps/search/hospitals+near+me';
}
const directionsUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
const telHref = (phone) => `tel:${phone.split(/[;,]/)[0].replace(/[^\d+]/g, '')}`;

function showResults(error) {
    document.getElementById('locator-empty').classList.add('hidden');
    const results = document.getElementById('locator-results');
    results.classList.remove('hidden');
    if (!results.dataset.view) setLocatorView('list');
    if (typeof L !== 'undefined' && !map) {
        map = L.map('map', { scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        markerLayer = L.layerGroup().addTo(map);
    }
    if (map) setTimeout(() => map.invalidateSize(), 50);
    renderPlaces(error);
}

function renderPlaces(error) {
    const emergencyOnly = document.getElementById('emergency-only').checked;
    const list = places.filter((p) => !emergencyOnly || p.emergency || p.open_24_7);
    const el = document.getElementById('places-list');

    if (error) {
        el.innerHTML = `
            <div class="notice notice-warn flex-col !gap-2">
                <p class="font-semibold">Couldn’t load nearby places</p>
                <p>${esc(error)}</p>
                <div class="flex flex-wrap gap-2 mt-1">
                    <button onclick="loadPlaces(${lastCenter.lat}, ${lastCenter.lng}, '${esc(lastLabel).replace(/'/g, '')}')" class="btn btn-primary btn-sm">Try again</button>
                    <a href="${googleMapsUrl()}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Open Google Maps</a>
                </div>
            </div>`;
    } else if (!list.length) {
        el.innerHTML = `
            <p class="empty">No places found${emergencyOnly ? ' tagged emergency or 24×7' : ''} in this area. Try a larger distance.</p>
            <a href="${googleMapsUrl()}" target="_blank" rel="noopener" class="btn btn-secondary w-full mt-3">Open Google Maps</a>`;
    } else {
        el.innerHTML = list.map((p) => {
            const c = CATEGORY[p.category];
            const dist = p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)} m` : `${p.distance_km.toFixed(1)} km`;
            return `
            <div class="place-card" data-id="${esc(p.id)}" onclick="focusPlace(this.dataset.id)" tabindex="0" onkeydown="if(event.key==='Enter')focusPlace(this.dataset.id)">
                <div class="flex justify-between gap-3">
                    <p class="font-semibold">${esc(p.name)}</p>
                    <span class="num text-[14px] font-semibold shrink-0">${dist}</span>
                </div>
                <div class="flex flex-wrap gap-1 mt-1">
                    <span class="chip ${c.chip}">${c.label}</span>
                    ${p.emergency ? '<span class="chip chip-neg">Emergency</span>' : ''}
                    ${p.open_24_7 ? '<span class="chip">Open 24×7</span>' : ''}
                </div>
                ${p.address ? `<p class="text-[13px] muted mt-1.5">${esc(p.address)}</p>` : ''}
                ${p.opening_hours && !p.open_24_7 ? `<p class="meta mt-0.5">Hours: ${esc(p.opening_hours)}</p>` : ''}
                <div class="flex gap-2 mt-3" onclick="event.stopPropagation()">
                    <a href="${directionsUrl(p)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Directions</a>
                    ${p.phone ? `<a href="${esc(telHref(p.phone))}" class="btn btn-secondary btn-sm">Call</a>` : ''}
                    ${p.website ? `<a href="${esc(p.website.startsWith('http') ? p.website : `https://${p.website}`)}" target="_blank" rel="noopener" class="btn btn-quiet btn-sm">Website</a>` : ''}
                </div>
            </div>`;
        }).join('') + `<a href="${googleMapsUrl()}" target="_blank" rel="noopener" class="btn btn-text w-full mt-3 text-[13px]">Not listed? Open Google Maps</a>`;
    }

    if (!map || !markerLayer || !lastCenter) return;
    markerLayer.clearLayers();
    Object.keys(markersById).forEach((k) => delete markersById[k]);
    markerLayer.addLayer(L.circleMarker([lastCenter.lat, lastCenter.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1d5fbf', fillOpacity: 1 }).bindPopup('<strong>You are here</strong>'));
    const bounds = [[lastCenter.lat, lastCenter.lng]];
    list.forEach((p) => {
        const c = CATEGORY[p.category];
        const m = L.circleMarker([p.lat, p.lng], { radius: p.emergency ? 9 : 7, color: '#fff', weight: 2, fillColor: c.color, fillOpacity: 1 })
            .bindPopup(`<strong>${esc(p.name)}</strong><br>${c.label} · ${p.distance_km.toFixed(1)} km<br><a href="${directionsUrl(p)}" target="_blank" rel="noopener">Directions</a>${p.phone ? ` · <a href="${esc(telHref(p.phone))}">Call</a>` : ''}`);
        markerLayer.addLayer(m);
        markersById[p.id] = m;
        bounds.push([p.lat, p.lng]);
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    else map.setView([lastCenter.lat, lastCenter.lng], 14);
}

function focusPlace(id) {
    document.querySelectorAll('.place-card').forEach((c) => c.classList.toggle('is-selected', c.dataset.id === id));
    const m = markersById[id];
    if (!m || !map) return;
    if (window.innerWidth < 1024) setLocatorView('map');
    map.setView(m.getLatLng(), 16);
    m.openPopup();
}

TAB_LOADERS.locator = () => { if (map) setTimeout(() => map.invalidateSize(), 50); };
