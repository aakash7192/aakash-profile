import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { geminiAdapter as G } from '../../src/llm/adapters/gemini.js';
import { createSSEParser } from '../../src/llm/sse.js';
import { inferCaps } from '../../src/llm/registry.js';

function replay(adapter, name) {
  const evs = [];
  const p = createSSEParser((e) => evs.push(e));
  p.push(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
  p.end();
  const state = adapter.createState();
  const out = [];
  for (const e of evs) out.push(...adapter.parseEvent(e, state));
  out.push(...adapter.finish(state));
  return out;
}

const req = { model: 'gemini-x-flash', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'q' }], system: 'SYS', temperature: 0.7, maxTokens: 400 };

test('buildRequest: url with alt=sse, key in header never in URL, roles, systemInstruction, thinkingConfig', () => {
  const r = G.buildRequest(req, { apiKey: 'AIzaSECRET', baseUrl: 'https://generativelanguage.googleapis.com', direct: true, caps: inferCaps('google', 'gemini-x-flash') });
  assert.equal(r.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x-flash:streamGenerateContent?alt=sse');
  assert.equal(r.url.includes('AIzaSECRET'), false);
  assert.equal(r.url.includes('key='), false);
  assert.equal(r.headers['x-goog-api-key'], 'AIzaSECRET');
  assert.deepEqual(JSON.parse(r.body), {
    contents: [
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'yo' }] },
      { role: 'user', parts: [{ text: 'q' }] },
    ],
    systemInstruction: { parts: [{ text: 'SYS' }] },
    generationConfig: { maxOutputTokens: 400, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
  });
});

test('buildRequest: pro budget adds to maxOutputTokens; unknown family omits thinkingConfig with 1024 headroom', () => {
  const pro = JSON.parse(G.buildRequest(req, { apiKey: 'k', baseUrl: 'https://g', caps: inferCaps('google', 'gemini-2.5-pro') }).body);
  assert.deepEqual(pro.generationConfig.thinkingConfig, { thinkingBudget: 512 });
  assert.equal(pro.generationConfig.maxOutputTokens, 912);
  const other = JSON.parse(G.buildRequest(req, { apiKey: 'k', baseUrl: 'https://g', caps: inferCaps('google', 'gemma-3') }).body);
  assert.equal('thinkingConfig' in other.generationConfig, false);
  assert.equal(other.generationConfig.maxOutputTokens, 1424);
});

test('buildRequest: Gemini 3+ sends thinkingLevel low, no temperature, 1024 headroom', () => {
  const b = JSON.parse(G.buildRequest(req, { apiKey: 'k', baseUrl: 'https://g', caps: inferCaps('google', 'gemini-3.8-flash') }).body);
  assert.deepEqual(b.generationConfig, { maxOutputTokens: 1424, thinkingConfig: { thinkingLevel: 'low' } });
  assert.deepEqual(b.systemInstruction, { parts: [{ text: 'SYS' }] });
});

test('buildRequest: model id is URL-encoded and a models/ prefix is tolerated', () => {
  const r = G.buildRequest({ ...req, model: 'models/a b' }, { apiKey: 'k', baseUrl: 'https://g/', caps: inferCaps('google', 'a b') });
  assert.equal(r.url, 'https://g/v1beta/models/a%20b:streamGenerateContent?alt=sse');
});

test('replay gemini-ok.sse (CRLF): thought parts skipped, cumulative usage overwritten', () => {
  const out = replay(G, 'gemini-ok.sse');
  assert.equal(out.filter((e) => e.type === 'text').map((e) => e.text).join(''), 'The mind wanders; मन चंचल है। ✨\n\n[[BG 6.26]]');
  const done = out.filter((e) => e.type === 'done');
  assert.equal(done.length, 1);
  assert.deepEqual(done[0], { type: 'done', stopReason: 'end', usage: { inputTokens: 50, outputTokens: 20 }, model: 'gemini-2.5-flash' });
});

test('replay gemini-error.sse: promptFeedback.blockReason throws safety', () => {
  assert.throws(() => replay(G, 'gemini-error.sse'), (e) => e.code === 'safety' && !e.retryable);
});

test('finishReason mapping', () => {
  for (const [fr, want] of [['STOP', 'end'], ['MAX_TOKENS', 'max_tokens'], ['SAFETY', 'safety'], ['RECITATION', 'safety'], ['BLOCKLIST', 'safety'], ['PROHIBITED_CONTENT', 'safety'], ['SPII', 'safety'], ['OTHER', 'other']]) {
    const s = G.createState();
    G.parseEvent({ event: 'message', data: JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: fr }] }) }, s);
    assert.equal(G.finish(s)[0].stopReason, want, fr);
  }
});

test('finish with neither finishReason nor text throws stream; in-stream error object throws mapped', () => {
  assert.throws(() => G.finish(G.createState()), (e) => e.code === 'stream');
  assert.throws(() => G.parseEvent({ event: 'message', data: JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'busy' } }) }, G.createState()), (e) => e.code === 'overloaded');
});

test('buildRequest: maxOutputTokens ceiling clamps maxOutputTokens incl. thinking headroom', () => {
  const b = JSON.parse(G.buildRequest({ ...req, maxTokens: 1400 }, { apiKey: 'k', baseUrl: 'https://g', caps: inferCaps('google', 'gemma-3'), maxOutputTokens: 1500 }).body);
  assert.equal(b.generationConfig.maxOutputTokens, 1500);
});
