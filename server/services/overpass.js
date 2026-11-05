// Nearby hospitals, clinics and pharmacies from OpenStreetMap.
//
// Primary source: the Overpass API. The public servers are free but often busy, so all mirrors are
// queried at the same time and the first good answer wins. If every mirror fails, Nominatim
// (OpenStreetMap's search service) is used as a lighter fallback.
const TTLCache = require('./cache');
const { fetchWithTimeout } = require('../net');

const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
];
const UA = 'MedAssistHub/2.1 (student health assistant project)';
const OVERPASS_TIMEOUT_MS = 25000;

const cache = new TTLCache(15 * 60 * 1000);

const FILTERS = {
    hospital: ['nwr["amenity"="hospital"]'],
    clinic: ['nwr["amenity"="clinic"]', 'nwr["amenity"="doctors"]'],
    pharmacy: ['nwr["amenity"="pharmacy"]'],
};

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function categorise(tags) {
    const a = tags.amenity || tags.healthcare;
    if (a === 'hospital') return 'hospital';
    if (a === 'pharmacy' || a === 'chemist') return 'pharmacy';
    return 'clinic';
}

function address(tags) {
    if (tags['addr:full']) return tags['addr:full'];
    const parts = [
        [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
        tags['addr:suburb'] || tags['addr:neighbourhood'],
        tags['addr:city'],
        tags['addr:postcode'],
    ].filter(Boolean);
    return parts.join(', ') || null;
}

// Query every mirror in parallel; resolve with the first successful JSON, cancel the rest.
async function raceMirrors(query) {
    const controllers = MIRRORS.map(() => new AbortController());
    const attempts = MIRRORS.map(async (url, i) => {
        const timer = setTimeout(() => controllers[i].abort(), OVERPASS_TIMEOUT_MS);
        try {
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
                body: `data=${encodeURIComponent(query)}`,
                signal: controllers[i].signal,
            }, OVERPASS_TIMEOUT_MS, new URL(url).hostname);
            if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
            const data = await res.json();
            if (data.remark && /runtime error|timed out/i.test(data.remark) && !data.elements?.length) {
                throw new Error(`${new URL(url).hostname}: ${data.remark}`);
            }
            controllers.forEach((c, j) => j !== i && c.abort());
            return data;
        } finally {
            clearTimeout(timer);
        }
    });
    try {
        return await Promise.any(attempts);
    } catch (agg) {
        const reasons = (agg.errors || []).map((e) => e.message).join('; ');
        throw new Error(reasons || 'all map servers failed');
    }
}

function toPlaces(elements, lat, lng) {
    const seen = new Set();
    const places = [];
    for (const el of elements) {
        const tags = el.tags || {};
        const plat = el.lat ?? el.center?.lat;
        const plng = el.lon ?? el.center?.lon;
        if (plat == null || !tags.name) continue;
        const dedupe = `${tags.name.toLowerCase()}|${plat.toFixed(3)}|${plng.toFixed(3)}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        places.push({
            id: `${el.type}/${el.id}`,
            name: tags.name,
            category: categorise(tags),
            lat: plat,
            lng: plng,
            distance_km: Math.round(haversineKm(lat, lng, plat, plng) * 100) / 100,
            phone: tags.phone || tags['contact:phone'] || tags['phone:mobile'] || null,
            website: tags.website || tags['contact:website'] || null,
            address: address(tags),
            emergency: tags.emergency === 'yes',
            opening_hours: tags.opening_hours || null,
            open_24_7: tags.opening_hours === '24/7',
        });
    }
    return places.sort((a, b) => a.distance_km - b.distance_km);
}

// Fallback: Nominatim keyword search inside a bounding box around the point.
async function nominatimNearby({ lat, lng, radius, types }) {
    const dLat = radius / 111320;
    const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
    const viewbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].join(',');
    const words = { hospital: 'hospital', clinic: 'clinic', pharmacy: 'pharmacy' };
    const results = await Promise.all(types.map(async (t) => {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&bounded=1&viewbox=${viewbox}&q=${words[t]}&extratags=1&addressdetails=1`;
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } }, 15000, 'Nominatim');
        if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
        return res.json();
    }));
    const elements = results.flat()
        .filter((r) => ['amenity', 'healthcare'].includes(r.category || r.class))
        .map((r) => ({
            type: r.osm_type,
            id: r.osm_id,
            lat: Number(r.lat),
            lon: Number(r.lon),
            tags: {
                name: r.name || r.display_name.split(',')[0],
                amenity: r.type,
                ...(r.extratags || {}),
                'addr:full': r.display_name.split(',').slice(1, 4).join(',').trim(),
            },
        }));
    return toPlaces(elements, lat, lng);
}

async function findNearby({ lat, lng, radius = 5000, types = ['hospital', 'clinic'] }) {
    const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radius},${[...types].sort().join('+')}`;
    const cached = cache.get(key);
    if (cached) return { ...cached, cached: true };

    const parts = types.flatMap((t) => FILTERS[t] || []).map((f) => `${f}(around:${radius},${lat},${lng});`).join('\n');
    const query = `[out:json][timeout:20];\n(\n${parts}\n);\nout center tags 250;`;

    let places;
    let source = '© OpenStreetMap contributors (Overpass)';
    try {
        const data = await raceMirrors(query);
        places = toPlaces(data.elements || [], lat, lng);
    } catch (overpassErr) {
        console.warn('[places] Overpass failed, trying Nominatim:', overpassErr.message);
        try {
            places = await nominatimNearby({ lat, lng, radius, types });
            source = '© OpenStreetMap contributors (Nominatim)';
        } catch (nomErr) {
            console.warn('[places] Nominatim failed too:', nomErr.message);
            throw new Error(`The free map servers are busy or unreachable right now (${overpassErr.message}).`);
        }
    }

    const result = { center: { lat, lng }, radius, count: places.length, places: places.slice(0, 60), source };
    cache.set(key, result);
    return result;
}

// City / area search via OpenStreetMap Nominatim (used when GPS is unavailable).
const geoCache = new TTLCache(24 * 60 * 60 * 1000);
async function geocode(q) {
    const key = q.toLowerCase();
    const cached = geoCache.get(key);
    if (cached) return cached;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } }, 15000, 'Location search');
    if (!res.ok) throw new Error(`Location search error ${res.status}`);
    const results = (await res.json()).map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
    geoCache.set(key, results);
    return results;
}

module.exports = { findNearby, haversineKm, geocode };
