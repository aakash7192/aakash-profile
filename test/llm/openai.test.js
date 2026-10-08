import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openaiAdapter as O } from '../../src/llm/adapters/openai.js';
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

const req = { model: 'm', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'q' }], system: 'SYS', temperature: 1.2, maxTokens: 500 };

test('buildRequest: url, bearer header, system first, stream_options, max_completion_tokens', () => {
  const r = O.buildRequest(req, { apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1/', direct: true, caps: inferCaps('openai', 'gpt-4.1') });
  assert.equal(r.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(r.headers.authorization, 'Bearer sk-x');
  assert.equal('anthropic-dangerous-direct-browser-access' in r.headers, false);
  assert.deepEqual(JSON.parse(r.body), {
    model: 'm',
    messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'q' }],
    stream: true, stream_options: { include_usage: true }, max_completion_tokens: 500, temperature: 1.2,
  });
});

test('buildRequest: temperature omitted for gpt-5*/o* caps; legacyMaxTokens uses max_tokens', () => {
  const b = JSON.parse(O.buildRequest(req, { apiKey: 'k', baseUrl: 'https://x', caps: inferCaps('openai', 'gpt-5-mini') }).body);
  assert.equal('temperature' in b, false);
  const b2 = JSON.parse(O.buildRequest(req, { apiKey: 'k', baseUrl: 'https://x', caps: { ...inferCaps('openai', 'gpt-4.1'), legacyMaxTokens: true } }).body);
  assert.equal(b2.max_tokens, 500);
  assert.equal('max_completion_tokens' in b2, false);
});

test('buildRequest: no system message when system is absent', () => {
  const b = JSON.parse(O.buildRequest({ model: 'm', messages: [{ role: 'user', content: 'x' }] }, { apiKey: 'k', baseUrl: 'https://x', caps: inferCaps('openai', 'gpt-4.1') }).body);
  assert.deepEqual(b.messages, [{ role: 'user', content: 'x' }]);
});

test('replay openai-ok.sse: text, usage chunk after finish_reason, done on [DONE]', () => {
  const out = replay(O, 'openai-ok.sse');
  assert.equal(out.filter((e) => e.type === 'text').map((e) => e.text).join(''), 'Breathe, मित्र. 🌿\n\n[[BG 6.35]]');
  const done = out.filter((e) => e.type === 'done');
  assert.equal(done.length, 1);
  assert.deepEqual(done[0], { type: 'done', stopReason: 'end', usage: { inputTokens: 30, outputTokens: 12 }, model: 'gpt-5-mini' });
});

test('replay openai-error.sse throws server (retryable)', () => {
  assert.throws(() => replay(O, 'openai-error.sse'), (e) => e.code === 'server' && e.retryable);
});

test('finish_reason mapping', () => {
  for (const [fr, want] of [['stop', 'end'], ['length', 'max_tokens'], ['content_filter', 'safety'], ['tool_calls', 'other']]) {
    const s = O.createState();
    O.parseEvent({ event: 'message', data: JSON.stringify({ choices: [{ delta: {}, finish_reason: fr }] }) }, s);
    const [d] = O.parseEvent({ event: 'message', data: '[DONE]' }, s);
    assert.equal(d.stopReason, want);
  }
});

test('finish without [DONE]: finish_reason seen -> done; nothing -> stream', () => {
  const s = O.createState();
  O.parseEvent({ event: 'message', data: JSON.stringify({ choices: [{ delta: { content: 'a' }, finish_reason: 'length' }] }) }, s);
  assert.deepEqual(O.finish(s), [{ type: 'done', stopReason: 'max_tokens' }]);
  assert.throws(() => O.finish(O.createState()), (e) => e.code === 'stream');
});
