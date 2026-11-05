// Rule-based symptom triage. Always runs (no API key needed) and is the safety net for the AI layer:
// red flags found here can never be downgraded by the AI.
const { RED_FLAGS, CRISIS_PATTERNS, URGENT_RULES, CONDITIONS, DRUG_GROUPS } = require('../data/symptoms');

const SEVERITY_ORDER = ['mild', 'moderate', 'urgent', 'emergency'];
const maxSeverity = (a, b) => (SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hasPhrase(text, phrase) {
  return new RegExp(`(^|[^a-z])${escapeRe(phrase.toLowerCase())}([^a-z]|$)`).test(text);
}

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse "for 3 days", "since a week", "2 weeks" into days.
function parseDurationDays(text) {
  const m = text.match(/(\d+|a|an|one|two|three|four|five|six|seven)\s*(day|days|week|weeks|month|months)/);
  if (!m) return null;
  const words = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const n = words[m[1]] ?? Number(m[1]);
  const unit = m[2].startsWith('week') ? 7 : m[2].startsWith('month') ? 30 : 1;
  return n * unit;
}

function drugGroupsIn(text) {
  const t = normalise(text);
  const groups = new Set();
  for (const [group, names] of Object.entries(DRUG_GROUPS)) {
    if (names.some((n) => hasPhrase(t, n))) groups.add(group);
  }
  return groups;
}

/**
 * @param {string} input free-text symptoms
 * @param {object} ctx { age, sex, durationDays, allergies, conditions, pregnant }
 */
function analyse(input, ctx = {}) {
  const text = normalise(input);
  const result = {
    severity: 'mild',
    crisis: false,
    red_flags: [],
    urgent_reasons: [],
    conditions: [],
    warnings: [],
    duration_days: ctx.durationDays ?? parseDurationDays(text),
  };

  // 1. Mental-health crisis
  if (CRISIS_PATTERNS.some((re) => re.test(text))) {
    result.crisis = true;
    result.severity = 'emergency';
  }

  // 2. Red flags
  for (const flag of RED_FLAGS) {
    if (flag.patterns.some((re) => re.test(text))) {
      result.red_flags.push({ id: flag.id, title: flag.title, message: flag.message });
      result.severity = 'emergency';
    }
  }

  // 3. Urgent rules
  for (const rule of URGENT_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      result.urgent_reasons.push(rule.reason);
      result.severity = maxSeverity(result.severity, 'urgent');
    }
  }

  // 4. Condition matching
  for (const c of CONDITIONS) {
    const matched = c.keywords.filter((k) => hasPhrase(text, k));
    if (matched.length < (c.minMatches || 1)) continue;
    if (c.requiresAny && !c.requiresAny.some((k) => hasPhrase(text, k))) continue;
    result.conditions.push({
      id: c.id,
      name: c.name,
      matched,
      score: matched.length + (c.requiresAny ? 1 : 0),
      self_care: c.selfCare,
      otc: [...c.otc],
      avoid: c.avoid || [],
      avoidGroups: c.avoidGroups || [],
      see_doctor_if: c.seeDoctorIf,
      specialist: c.specialist,
    });
  }
  result.conditions.sort((a, b) => b.score - a.score);
  result.conditions = result.conditions.slice(0, 5);

  // If one condition says to avoid a drug class (e.g. NSAIDs in dengue), remove it everywhere.
  const avoidGroups = new Set(result.conditions.flatMap((c) => c.avoidGroups));
  // Same for anything the user is allergic to.
  const allergyGroups = drugGroupsIn(ctx.allergies || '');
  const allergyWords = normalise(ctx.allergies || '').split(/[,;/]| and /).map((s) => s.trim()).filter((s) => s.length > 2);

  for (const c of result.conditions) {
    c.otc = c.otc.filter((item) => {
      const groups = drugGroupsIn(item);
      for (const g of groups) {
        if (avoidGroups.has(g)) return false;
        if (allergyGroups.has(g)) {
          result.warnings.push(`Removed "${item}" from suggestions because your profile lists an allergy to it or a related medicine.`);
          return false;
        }
      }
      if (allergyWords.some((w) => normalise(item).includes(w))) {
        result.warnings.push(`Removed "${item}" from suggestions because it matches an allergy in your profile.`);
        return false;
      }
      return true;
    });
    delete c.avoidGroups;
  }

  // 5. Duration / context adjustments
  if (result.duration_days !== null && result.duration_days !== undefined) {
    if (result.duration_days >= 14) {
      result.severity = maxSeverity(result.severity, 'urgent');
      result.urgent_reasons.push('Symptoms have lasted 2 weeks or more');
    } else if (result.duration_days >= 4) {
      result.severity = maxSeverity(result.severity, 'moderate');
    }
  }
  if (result.conditions.length >= 3) result.severity = maxSeverity(result.severity, 'moderate');

  const age = Number(ctx.age);
  if (Number.isFinite(age) && age > 0) {
    if (age < 12) result.warnings.push('For children, check medicine choice and dose with a pharmacist or paediatrician. Never give aspirin to children or teenagers.');
    if (age < 1) result.severity = maxSeverity(result.severity, 'urgent');
    if (age >= 65) {
      result.warnings.push('Adults over 65 should see a doctor sooner, as infections and dehydration can become serious quickly.');
      result.severity = maxSeverity(result.severity, 'moderate');
    }
  }
  if (ctx.pregnant || /pregnan/.test(text)) {
    result.warnings.push('During pregnancy, check with your doctor before taking any medicine, including over-the-counter ones.');
  }
  if (ctx.conditions) {
    result.warnings.push(`Your profile lists existing conditions (${ctx.conditions}). Tell your doctor or pharmacist about them before taking any new medicine.`);
  }
  result.warnings = [...new Set(result.warnings)];

  return result;
}

module.exports = { analyse, maxSeverity, SEVERITY_ORDER, normalise };
