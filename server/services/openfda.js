// Drug label lookups via openFDA (free, no key needed; https://open.fda.gov/apis/drug/label/).
// openFDA covers US labels, so common Indian brand names are mapped to their generic names first.
const TTLCache = require('./cache');
const { openFdaApiKey } = require('../config');
const { fetchWithTimeout } = require('../net');

const cache = new TTLCache(24 * 60 * 60 * 1000);

const BRAND_TO_GENERIC = {
  paracetamol: 'acetaminophen', dolo: 'acetaminophen', crocin: 'acetaminophen', calpol: 'acetaminophen', 'p 650': 'acetaminophen',
  combiflam: 'ibuprofen', brufen: 'ibuprofen',
  disprin: 'aspirin', ecosprin: 'aspirin',
  pan: 'pantoprazole', pantocid: 'pantoprazole', 'pan d': 'pantoprazole',
  omez: 'omeprazole', rantac: 'famotidine', aciloc: 'famotidine',
  allegra: 'fexofenadine', cetzine: 'cetirizine', okacet: 'cetirizine', alerid: 'cetirizine', levocet: 'levocetirizine',
  montair: 'montelukast', glycomet: 'metformin', 'glycomet gp': 'metformin',
  augmentin: 'amoxicillin and clavulanate potassium', mox: 'amoxicillin', azee: 'azithromycin', azithral: 'azithromycin',
  telma: 'telmisartan', amlong: 'amlodipine', amlokind: 'amlodipine', stamlo: 'amlodipine',
  thyronorm: 'levothyroxine', eltroxin: 'levothyroxine',
  atorva: 'atorvastatin', storvas: 'atorvastatin', rosuvas: 'rosuvastatin',
  ecosprin_av: 'aspirin', clopilet: 'clopidogrel', deplatt: 'clopidogrel',
  zyloric: 'allopurinol', meftal: 'mefenamic acid', voveran: 'diclofenac',
};

// "Dolo 650 mg tablet" -> "dolo"
function cleanName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)?\b/g, ' ')
    .replace(/\b(tablet|tablets|tab|capsule|capsules|cap|syrup|suspension|injection|drops|cream|gel|ointment|sr|er|xr|od)\b/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveGeneric(name) {
  const c = cleanName(name);
  return BRAND_TO_GENERIC[c] || BRAND_TO_GENERIC[c.split(' ')[0]] || c;
}

const first = (v) => (Array.isArray(v) ? v[0] : v) || null;
const trim = (s, n = 900) => (s && s.length > n ? `${s.slice(0, n).trim()}…` : s);

async function fetchLabel(generic) {
  const cached = cache.get(generic);
  if (cached !== undefined) return cached;

  const q = `openfda.generic_name:"${generic}"+openfda.brand_name:"${generic}"+openfda.substance_name:"${generic}"`;
  const params = new URLSearchParams({ limit: '1' });
  if (openFdaApiKey) params.set('api_key', openFdaApiKey);
  // URLSearchParams would encode the "+" (OR) operator, so build search manually.
  const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(q).replace(/%2B/g, '+')}&${params}`;

  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'MedAssistHub/2.1' } }, 20000, 'openFDA');
  if (res.status === 404) {
    cache.set(generic, null);
    return null;
  }
  if (!res.ok) throw new Error(`openFDA error ${res.status}`);
  const data = await res.json();
  const label = data.results?.[0] || null;
  cache.set(generic, label);
  return label;
}

async function lookup(name) {
  const generic = resolveGeneric(name);
  if (!generic) return null;
  const label = await fetchLabel(generic);
  if (!label) return { query: name, generic, found: false };
  const o = label.openfda || {};
  return {
    query: name,
    generic,
    found: true,
    brand_name: first(o.brand_name),
    generic_name: first(o.generic_name),
    manufacturer: first(o.manufacturer_name),
    route: first(o.route),
    product_type: first(o.product_type),
    purpose: trim(first(label.purpose)),
    uses: trim(first(label.indications_and_usage)),
    warnings: trim(first(label.warnings) || first(label.boxed_warning) || first(label.warnings_and_cautions)),
    do_not_use: trim(first(label.do_not_use)),
    ask_doctor: trim(first(label.ask_doctor)),
    ask_doctor_or_pharmacist: trim(first(label.ask_doctor_or_pharmacist)),
    stop_use: trim(first(label.stop_use)),
    side_effects: trim(first(label.adverse_reactions), 700),
    pregnancy: trim(first(label.pregnancy_or_breast_feeding) || first(label.pregnancy), 500),
    interactions_text: first(label.drug_interactions) || null,
    source: 'U.S. FDA drug label via openFDA',
  };
}

// Heuristic interaction check: does drug A's label mention drug B (or vice versa)?
async function checkInteractions(names) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 10);
  const infos = await Promise.all(unique.map(async (n) => {
    try { return await lookup(n); } catch { return { query: n, found: false, error: true }; }
  }));

  const findings = [];
  for (let i = 0; i < infos.length; i++) {
    for (let j = 0; j < infos.length; j++) {
      if (i === j) continue;
      const a = infos[i], b = infos[j];
      if (!a?.found || !b?.found) continue;
      const text = [a.interactions_text, a.ask_doctor_or_pharmacist, a.warnings].filter(Boolean).join(' ');
      if (!text) continue;
      const terms = [b.generic, b.generic_name, b.brand_name].filter(Boolean).map((t) => t.toLowerCase().split(/[ ,]/)[0]).filter((t) => t.length > 3);
      const lower = text.toLowerCase();
      const hit = terms.find((t) => lower.includes(t));
      if (!hit) continue;
      const idx = lower.indexOf(hit);
      const start = Math.max(0, lower.lastIndexOf('.', idx) + 1);
      const endDot = lower.indexOf('.', idx);
      const excerpt = text.slice(start, endDot === -1 ? idx + 200 : endDot + 1).trim();
      const pairKey = [a.query, b.query].sort().join('|');
      if (findings.some((f) => f.key === pairKey)) continue;
      findings.push({ key: pairKey, drug_a: a.query, drug_b: b.query, excerpt: trim(excerpt, 400) });
    }
  }

  return {
    checked: infos.map((x) => ({ name: x.query, found: !!x.found, matched_as: x.generic_name || x.generic || null })),
    interactions: findings.map(({ key, ...f }) => f),
    note: 'This checks whether official FDA labels mention one medicine in another’s interaction warnings. It can miss interactions. Always confirm with your doctor or pharmacist.',
  };
}

module.exports = { lookup, checkInteractions, resolveGeneric, cleanName };
