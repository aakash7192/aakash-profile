import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, SAKHA_SYSTEM_PROMPT, PROMPT_VERSION, LENGTHS, LANGUAGES } from '../../src/sakhaon/core/persona.js';
import { VERSE_REFS } from '../../src/sakhaon/core/verses.js';
import { APP } from '../../src/sakhaon/core/app.js';

test('constants', () => {
  assert.equal(PROMPT_VERSION, 'sakha-v1');
  assert.deepEqual(LENGTHS.balanced, { words: '60–150', maxTokens: 800 });
  assert.deepEqual([...LANGUAGES], ['auto', 'en', 'hi', 'hinglish']);
  assert.equal(SAKHA_SYSTEM_PROMPT, buildSystemPrompt({ length: 'balanced', language: 'auto' }));
});

test('no unreplaced template variables for any option combination', () => {
  for (const length of Object.keys(LENGTHS)) {
    for (const language of LANGUAGES) {
      const p = buildSystemPrompt({ length, language });
      assert.equal(p.includes('{{'), false, `${length}/${language}`);
      assert.equal(p.includes('}}'), false);
      assert.ok(p.includes(`about ${LENGTHS[length].words} words`));
    }
  }
});

test('contains every library ref, the helplines and the persona name', () => {
  const p = SAKHA_SYSTEM_PROMPT;
  assert.ok(p.includes(VERSE_REFS.join(', ')));
  for (const s of ['14416', '1-800-891-4416', '112', '181', '1098', '988', '116 123', 'findahelpline.com']) assert.ok(p.includes(s), s);
  assert.ok(p.startsWith(`You are ${APP.persona} (सखा`));
  assert.ok(p.includes('[[BG chapter.verse]]'));
  assert.ok(p.includes('never output HTML'));
});

test('mentions no provider or model name', () => {
  for (const length of Object.keys(LENGTHS)) {
    for (const language of LANGUAGES) {
      const p = buildSystemPrompt({ length, language });
      assert.equal(/anthropic|openai|google|gemini|claude|gpt|chatgpt|llama|mistral/i.test(p), false);
    }
  }
});

test('language preference line only when not auto', () => {
  assert.equal(/The user prefers replies in/.test(buildSystemPrompt()), false);
  assert.ok(buildSystemPrompt({ language: 'en' }).includes('The user prefers replies in English unless they write otherwise.'));
  assert.ok(buildSystemPrompt({ language: 'hi' }).includes('simple Hindi in Devanagari unless'));
  assert.ok(buildSystemPrompt({ language: 'hinglish' }).includes('Hinglish in Roman script unless'));
});

test('invalid options fall back to defaults', () => {
  assert.equal(buildSystemPrompt({ length: 'huge', language: 'fr' }), SAKHA_SYSTEM_PROMPT);
  assert.equal(buildSystemPrompt(), SAKHA_SYSTEM_PROMPT);
});
