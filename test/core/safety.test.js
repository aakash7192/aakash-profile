import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCrisis, HELPLINES, HELPLINES_LAST_VERIFIED, formatHelplinesText, SUPPORT_COPY, DISCLAIMER } from '../../src/sakhaon/core/safety.js';

const POSITIVE = [
  // English
  'I want to die',
  'I keep thinking about suicide',
  "I've been feeling suicidal lately",
  'I want to kill myself',
  'sometimes I hurt myself',
  'I want to end my life',
  'I just want to end it all',
  'I don’t want to live anymore',
  'I dont want to wake up tomorrow',
  'Everyone would be better off without me',
  'what’s the point of going on',
  'I feel like a burden to everyone',
  'I wish I was dead',
  'I want to disappear forever',
  // Hinglish
  'sab khatam kar dena chahta hoon',
  'mujhe jeena nahi chahta',
  'ab jeene ka mann nahi karta',
  'main marna chahta hoon',
  'khud ko khatam kar dunga',
  'zindagi se thak gaya hoon',
  'khudkushi ke baare mein soch raha hoon',
  // Hindi (Devanagari)
  'मैं जीना नहीं चाहता',
  'मैं मरना चाहती हूँ',
  'आत्महत्या के विचार आते हैं',
  'सब ख़त्म कर दूँ',
  'खुद को खत्म करना चाहता हूँ',
  'जीने का मन नहीं करता',
  'ज़िंदगी से थक गया हूँ',
];

const NEGATIVE = [
  '',
  'How do I deal with anger at my brother?',
  'I am anxious about my exam results',
  'I killed it at my presentation today!',
  'I am dying to read chapter 2',
  'This deadline is a nightmare',
  'What does karma yoga mean?',
  'मुझे अपने काम पर ध्यान देना है',
  'mujhe gussa bahut aata hai',
  'I want to end my subscription',
  'The movie character dies at the end',
];

for (const t of POSITIVE) test(`crisis: ${t}`, () => assert.equal(detectCrisis(t), true));
for (const t of NEGATIVE) test(`benign: ${JSON.stringify(t)}`, () => assert.equal(detectCrisis(t), false));

test('non-strings are not crises', () => {
  assert.equal(detectCrisis(undefined), false);
  assert.equal(detectCrisis(null), false);
});

test('helplines: Tele-MANAS and 112 primary, no KIRAN, includes 988 / Samaritans / findahelpline', () => {
  assert.equal(HELPLINES_LAST_VERIFIED, '2026-10');
  const primary = HELPLINES.filter((h) => h.primary).map((h) => h.phone);
  assert.deepEqual(primary, ['14416', '112']);
  const text = formatHelplinesText();
  for (const s of ['14416', '1-800-891-4416', '112', '181', '1098', '988', '116 123', 'https://findahelpline.com']) assert.ok(text.includes(s), s);
  assert.equal(/kiran/i.test(text), false);
  assert.ok(text.split('\n').every((l) => l.startsWith('- ')));
});

test('support copy and disclaimer', () => {
  assert.equal(SUPPORT_COPY.title, 'You matter.');
  assert.equal(SUPPORT_COPY.dismiss, "I'm safe — continue");
  assert.ok(DISCLAIMER.includes('Tele-MANAS 14416'));
  assert.ok(DISCLAIMER.includes('not a therapist'));
});
