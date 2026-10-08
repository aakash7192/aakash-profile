// Safety data and crisis detection. Pure: no DOM, no node:*.
// Detection is defence in depth only: the UI shows a support card AND still sends the message;
// the system prompt carries the real crisis protocol.

export const HELPLINES_LAST_VERIFIED = '2026-10';

export const HELPLINES = Object.freeze([
  Object.freeze({ region: 'India', name: 'Tele-MANAS (mental health, 24×7, free)', phone: '14416', alt: '1-800-891-4416', primary: true }),
  Object.freeze({ region: 'India', name: 'Emergency', phone: '112', primary: true, note: 'Police, ambulance, immediate danger' }),
  Object.freeze({ region: 'India', name: 'Women Helpline', phone: '181' }),
  Object.freeze({ region: 'India', name: 'Childline', phone: '1098' }),
  Object.freeze({ region: 'US / Canada', name: '988 Suicide & Crisis Lifeline', phone: '988', note: 'Call or text' }),
  Object.freeze({ region: 'UK / Ireland', name: 'Samaritans', phone: '116 123' }),
  Object.freeze({ region: 'Elsewhere', name: 'Find A Helpline', url: 'https://findahelpline.com' }),
]);

/** Plain bullet lines, used inside the system prompt. */
export function formatHelplinesText() {
  return HELPLINES.map((h) => {
    let s = `- ${h.region}: ${h.name}`;
    if (h.phone) s += ` — ${h.phone}`;
    if (h.alt) s += ` or ${h.alt}`;
    if (h.url) s += ` — ${h.url}`;
    if (h.note) s += ` (${h.note})`;
    return s;
  }).join('\n');
}

export const SUPPORT_COPY = Object.freeze({
  title: 'You matter.',
  body: "If you're thinking about hurting yourself, please reach out to someone right now. You deserve support from a real person.",
  dismiss: "I'm safe — continue",
});

export const DISCLAIMER =
  'Sakha is an AI companion for reflection inspired by the Bhagavad Gita — not a therapist or a substitute for professional help, and it can make mistakes, including about verses. In crisis? Call Tele-MANAS 14416 or 112.';

// English (applied to lower-cased, apostrophe-normalised text).
const EN = [
  /\bsuicid(e|al)\b/,
  /\bkill(ing)?\s+my\s*self\b/,
  /\b(hurt|harm|cut|cutting|hurting|harming)\s+my\s*self\b/,
  /\bself[-\s]?harm/,
  /\b(end|take|ending|taking)\s+my\s+(own\s+)?life\b/,
  /\bend\s+it\s+all\b/,
  /\b(want|wanna|wanted|going|ready)\s+(to\s+)?die\b/,
  /\bwish\s+i\s+(was|were)\s+dead\b/,
  /\bwish\s+i\s+(had\s+)?never\s+(been\s+)?born\b/,
  /\b(don'?t|do\s+not|no\s+longer)\s+want\s+to\s+(live|be\s+alive|exist|wake\s+up|be\s+here\s+anymore)\b/,
  /\bbetter\s+off\s+(dead|without\s+me)\b/,
  /\bno\s+(reason|point)\s+(to|in)\s+(live|living|go\s+on|going\s+on)\b/,
  /\bwhat'?s\s+the\s+point\s+(of|in)\s+(living|going\s+on|life|being\s+alive)\b/,
  /\b(i\s+am|i'?m|i\s+feel\s+like)\s+(just\s+)?a\s+burden\b/,
  /\b(disappear|vanish)\s+forever\b/,
  /\b(overdose|od)\s+on\b/,
  /\b(going|want|plan(ning)?)\s+to\s+(hurt|kill)\s+(him|her|them|someone|somebody)\b/,
  /\b(he|she|they)\s+(hits|beats|chokes)\s+me\b/,
];

// Hinglish (Roman-script Hindi).
const HINGLISH = [
  /\b(khud\s*khushi|khudkushi|aatm\s*hatya|atm\s*hatya|aatmahatya|atmahatya)\b/,
  /\b(marna|mar\s*jana|mar\s*jaana|mar\s*jaun|mar\s*jaaun|mar\s*jau)\s+(chahta|chahti|chahata|hai|hoon|hu|hun)\b/,
  /\bjeena\s+nahi\s*(chahta|chahti|hai)\b/,
  /\bjeene\s+ka\s+(mann?|dil)\s+nahi\b/,
  /\bkhud\s*ko\s+(khatam|khatm|maar|mar|nuksan|nuksaan|hurt)\b/,
  /\bsab\s+(khatam|khatm)\s+kar\s*(dena|du|doon|dun|dunga|dungi|lena|lu|loon)\b/,
  /\b(zindagi|zindgi|jindagi)\s+(khatam|khatm)\s+kar/,
  /\b(zindagi|zindgi|jindagi)\s+se\s+thak\s+(gaya|gayi|gyi|gya)\b/,
  /\bmain\s+(bojh|boj)\s+hoon\b/,
];

// Hindi in Devanagari (no \b: JS word boundaries don't apply to Devanagari).
const N = '\u093C?'; // optional nukta (NFC keeps ख़/ज़ decomposed)
const HINDI = [
  /आत्महत्या/,
  new RegExp(`ख${N}ुद\\s*कुशी`),
  /(मरना|मर\s*जाना|मर\s*जाऊँ|मर\s*जाऊं)\s*(चाहता|चाहती|है)/,
  /जीना\s*नहीं\s*(चाहता|चाहती)/,
  /जीने\s*का\s*(मन|दिल)\s*नहीं/,
  new RegExp(`(ख${N}ुद|अपने\\s*आप)\\s*को\\s*(ख${N}त्म|खतम|मार|नुकसान|चोट)`),
  new RegExp(`सब\\s*(ख${N}त्म|खतम)\\s*कर\\s*(दूँ|दूं|दू|देना|दूँगा|दूंगा|दूँगी|दूंगी|लूँ|लूं)`),
  new RegExp(`(ज${N}िंदगी|ज${N}िन्दगी)\\s*(ख${N}त्म|खतम|से\\s*थक)`),
  /मैं\s*बोझ\s*(हूँ|हूं)/,
];

/** True when text suggests self-harm, suicide, harm to others or abuse (EN, Hindi, Hinglish). */
export function detectCrisis(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const t = text.normalize('NFC').replace(/[‘’ʼ`´]/g, "'").toLowerCase();
  return EN.some((r) => r.test(t)) || HINGLISH.some((r) => r.test(t)) || HINDI.some((r) => r.test(t));
}
