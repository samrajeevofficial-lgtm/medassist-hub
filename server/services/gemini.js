// Optional AI layer using the Google Gemini API (free tier, key from https://aistudio.google.com/apikey).
// Uses plain fetch - no SDK needed. Returns null when no key is configured.
const { geminiApiKey, geminiModel } = require('../config');
const { fetchWithTimeout } = require('../net');

const SYSTEM_PROMPT = `You are the symptom-triage assistant inside "MedAssist Hub", a health app.
You help a layperson understand possible causes of their symptoms and what to do next.

Rules you must follow:
- You are not a doctor and do not diagnose. Use cautious language ("could be", "may be").
- Be conservative with severity. If anything suggests an emergency (chest pain, breathing difficulty, stroke signs, severe bleeding, fainting, seizures, severe allergic reaction, suicidal thoughts), set severity to "emergency".
- Only suggest over-the-counter medicines by generic name. Never suggest prescription-only medicines (antibiotics, steroids, sleeping pills, opioids).
- Never give doses, amounts or dosing schedules. Tell the user to follow the pack label or ask a pharmacist.
- Respect the user's allergies and existing conditions in the context; never suggest something they are allergic to.
- For children, pregnancy and older adults, advise checking with a doctor or pharmacist before taking any medicine.
- Keep each list item to one short sentence. Use simple English.
- Respond with JSON only, matching exactly this shape:
{
  "summary": "2-3 sentence plain-language overview",
  "severity": "mild" | "moderate" | "urgent" | "emergency",
  "possible_conditions": [{ "name": "string", "likelihood": "low" | "medium" | "high", "explanation": "one sentence" }],
  "self_care": ["string"],
  "otc_options": ["generic medicine name and what it helps with"],
  "avoid": ["things to avoid"],
  "see_doctor_if": ["warning signs"],
  "specialist": "type of doctor to see if needed",
  "follow_up_questions": ["questions that would help narrow this down"]
}
Return at most 4 possible conditions and at most 5 items in each list.`;

const SEVERITIES = ['mild', 'moderate', 'urgent', 'emergency'];

function isEnabled() {
  return Boolean(geminiApiKey);
}

function buildUserPrompt(symptoms, ctx) {
  const lines = [`Symptoms (in the user's words): """${symptoms}"""`];
  if (ctx.durationDays != null) lines.push(`Duration: about ${ctx.durationDays} day(s)`);
  if (ctx.age) lines.push(`Age: ${ctx.age}`);
  if (ctx.sex) lines.push(`Sex: ${ctx.sex}`);
  if (ctx.allergies) lines.push(`Known allergies: ${ctx.allergies}`);
  if (ctx.conditions) lines.push(`Existing conditions: ${ctx.conditions}`);
  if (ctx.currentMeds?.length) lines.push(`Current medicines: ${ctx.currentMeds.join(', ')}`);
  return lines.join('\n');
}

function parseJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

const strList = (v, n = 5) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, n) : []);

// Make sure whatever the model returns fits our shape.
function sanitise(raw) {
  return {
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 800) : '',
    severity: SEVERITIES.includes(raw.severity) ? raw.severity : 'moderate',
    possible_conditions: Array.isArray(raw.possible_conditions)
      ? raw.possible_conditions.slice(0, 4).map((c) => ({
          name: String(c?.name || '').slice(0, 120),
          likelihood: ['low', 'medium', 'high'].includes(c?.likelihood) ? c.likelihood : 'low',
          explanation: String(c?.explanation || '').slice(0, 300),
        })).filter((c) => c.name)
      : [],
    self_care: strList(raw.self_care),
    otc_options: strList(raw.otc_options),
    avoid: strList(raw.avoid),
    see_doctor_if: strList(raw.see_doctor_if),
    specialist: typeof raw.specialist === 'string' ? raw.specialist.slice(0, 80) : '',
    follow_up_questions: strList(raw.follow_up_questions, 3),
  };
}

const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 40000;
const THINKING_LEVEL = (process.env.GEMINI_THINKING_LEVEL || 'low').trim();

async function callGemini(prompt, { withThinkingConfig = true } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const generationConfig = {
    temperature: 0.2,
    responseMimeType: 'application/json',
    // Thinking tokens count towards this limit, so leave plenty of room.
    maxOutputTokens: 4096,
  };
  // Newer Gemini models "think" before answering (medium by default), which is slow.
  // Triage only needs light reasoning, so ask for a low thinking level.
  if (withThinkingConfig && THINKING_LEVEL && THINKING_LEVEL !== 'default') {
    generationConfig.thinkingConfig = { thinkingLevel: THINKING_LEVEL };
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
  }, TIMEOUT_MS, 'AI analysis');

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const messages = {
      400: 'AI request was rejected (400)',
      401: 'Gemini API key is invalid (401)',
      403: 'Gemini API key is not allowed to use this model (403)',
      404: `AI model "${geminiModel}" was not found - check GEMINI_MODEL in .env (run "npm run check" to list models)`,
      429: 'AI free-tier limit reached - try again in a minute',
    };
    const err = new Error(messages[res.status] || `Gemini API error ${res.status}`);
    err.status = res.status;
    err.detail = body.slice(0, 400);
    throw err;
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || '').join('') || '';
  if (!text) {
    const reason = candidate?.finishReason || data?.promptFeedback?.blockReason || 'no text';
    throw new Error(`AI returned an empty response (${reason})`);
  }
  return sanitise(parseJson(text));
}

async function analyseWithGemini(symptoms, ctx = {}) {
  if (!isEnabled()) return null;
  const prompt = buildUserPrompt(symptoms, ctx);
  try {
    return await callGemini(prompt);
  } catch (e) {
    // Older models don't accept thinkingLevel: retry once without it.
    if (e.status === 400 && /thinking/i.test(e.detail || '')) return callGemini(prompt, { withThinkingConfig: false });
    // Transient server problems: one quick retry.
    if (e.status === 500 || e.status === 503) return callGemini(prompt);
    throw e;
  }
}

module.exports = { analyseWithGemini, isEnabled };
