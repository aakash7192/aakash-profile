import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anthropicAdapter as A } from '../../src/llm/adapters/anthropic.js';
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

const caps = inferCaps('anthropic', 'x');
const req = { model: 'm-1', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'q' }], system: 'SYS', temperature: 0.5, maxTokens: 321 };

test('buildRequest (direct): url, headers incl. browser header, body', () => {
  const r = A.buildRequest(req, { apiKey: 'sk-ant-x', baseUrl: 'https://api.anthropic.com/', direct: true, caps });
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.headers['x-api-key'], 'sk-ant-x');
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(r.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(r.body), {
    model: 'm-1', max_tokens: 321, stream: true, system: 'SYS', temperature: 0.5,
    messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'q' }],
  });
});

test('buildRequest (server/proxy): no browser header; no system/temperature when absent', () => {
  const r = A.buildRequest({ model: 'm', messages: [{ role: 'user', content: 'x' }] }, { apiKey: 'k', baseUrl: 'https://a', direct: false, caps });
  assert.equal('anthropic-dangerous-direct-browser-access' in r.headers, false);
  const b = JSON.parse(r.body);
  assert.equal('system' in b, false);
  assert.equal('temperature' in b, false);
  assert.equal(b.max_tokens, 800);
});

test('buildRequest omits temperature when caps say unsupported', () => {
  const r = A.buildRequest(req, { apiKey: 'k', baseUrl: 'https://a', caps: { ...caps, temperature: false } });
  assert.equal('temperature' in JSON.parse(r.body), false);
});

test('replay anthropic-ok.sse', () => {
  const out = replay(A, 'anthropic-ok.sse');
  const text = out.filter((e) => e.type === 'text').map((e) => e.text).join('');
  assert.equal(text, 'नमस्ते, friend. You are not alone 🙏\n\n[[BG 2.47]]');
  const done = out.filter((e) => e.type === 'done');
  assert.equal(done.length, 1);
  assert.deepEqual(done[0], { type: 'done', stopReason: 'end', usage: { inputTokens: 42, outputTokens: 17 }, model: 'claude-sonnet-5-5' });
});

test('replay anthropic-error.sse throws overloaded (retryable)', () => {
  assert.throws(() => replay(A, 'anthropic-error.sse'), (e) => e.name === 'LLMError' && e.code === 'overloaded' && e.retryable === true);
});

test('stop_reason mapping', () => {
  for (const [sr, want] of [['end_turn', 'end'], ['max_tokens', 'max_tokens'], ['stop_sequence', 'stop_sequence'], ['refusal', 'safety'], ['tool_use', 'other']]) {
    const s = A.createState();
    A.parseEvent({ event: 'message_delta', data: JSON.stringify({ type: 'message_delta', delta: { stop_reason: sr }, usage: { output_tokens: 1 } }) }, s);
    const [d] = A.parseEvent({ event: 'message_stop', data: '{"type":"message_stop"}' }, s);
    assert.equal(d.stopReason, want, sr);
  }
});

test('finish: no terminal and no text -> stream error; text without terminal -> done other', () => {
  assert.throws(() => A.finish(A.createState()), (e) => e.code === 'stream');
  const s = A.createState();
  A.parseEvent({ event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }) }, s);
  assert.deepEqual(A.finish(s), [{ type: 'done', stopReason: 'other' }]);
});

test('malformed JSON throws stream', () => {
  assert.throws(() => A.parseEvent({ event: 'x', data: '{nope' }, A.createState()), (e) => e.code === 'stream');
});

test('current-generation Claude ids: no temperature, low effort, thinking allowance on max_tokens', () => {
  for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-8', 'claude-fable-5-1']) {
    const c = inferCaps('anthropic', id);
    const b = JSON.parse(A.buildRequest({ ...req, model: id }, { apiKey: 'k', baseUrl: 'https://a', caps: c }).body);
    assert.equal('temperature' in b, false, id);
    assert.deepEqual(b.output_config, { effort: 'low' }, id);
    assert.equal(b.max_tokens, 321 + c.thinkingAllowance, id);
  }
  // Older ids keep temperature and get no effort field.
  const old = JSON.parse(A.buildRequest(req, { apiKey: 'k', baseUrl: 'https://a', caps: inferCaps('anthropic', 'claude-sonnet-4-6') }).body);
  assert.equal(old.temperature, 0.5);
  assert.equal('output_config' in old, false);
  assert.equal(old.max_tokens, 321);
});

test('maxOutputTokens ceiling clamps the final Anthropic budget (thinking allowance included)', () => {
  const b = JSON.parse(A.buildRequest(req, { apiKey: 'k', baseUrl: 'https://a', caps: inferCaps('anthropic', 'claude-opus-5-5'), maxOutputTokens: 1000 }).body);
  assert.equal(b.max_tokens, 1000);
});
