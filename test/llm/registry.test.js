import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, listProviders, getProvider, resolveModel, defaultModel, inferCaps } from '../../src/llm/registry.js';

test('providers are ordered anthropic, openai, google', () => {
  assert.deepEqual(listProviders().map((p) => p.id), ['anthropic', 'openai', 'google']);
});

test('every provider has exactly one default model, matching defaultModel()', () => {
  for (const p of Object.values(PROVIDERS)) {
    const defs = p.models.filter((m) => m.default);
    assert.equal(defs.length, 1, p.id);
    assert.equal(defaultModel(p.id), defs[0].id);
    assert.equal(getProvider(p.id).defaultModel, defs[0].id);
  }
  assert.equal(defaultModel('anthropic'), 'claude-sonnet-5-5');
  assert.equal(defaultModel('openai'), 'gpt-5-mini');
  assert.equal(defaultModel('google'), 'gemini-2.5-flash');
});

test('listProviders() objects carry no adapter or secrets and are copies', () => {
  for (const p of listProviders()) {
    assert.equal('adapter' in p, false);
    assert.equal('keyEnv' in p, false);
    for (const k of ['id', 'label', 'keyHint', 'keyUrl', 'browserOk', 'models', 'defaultModel']) assert.ok(k in p, k);
    p.models.push({ id: 'mutated' });
  }
  assert.equal(PROVIDERS.anthropic.models.some((m) => m.id === 'mutated'), false);
});

test('unknown provider throws config', () => {
  assert.throws(() => getProvider('nope'), (e) => e.code === 'config');
  assert.throws(() => resolveModel('nope'), (e) => e.code === 'config');
  assert.throws(() => getProvider('__proto__'), (e) => e.code === 'config');
});

test('resolveModel: empty -> default; known; unknown custom id allowed with known:false', () => {
  assert.equal(resolveModel('anthropic').id, 'claude-sonnet-5-5');
  assert.equal(resolveModel('anthropic', '  ').id, 'claude-sonnet-5-5');
  const k = resolveModel('anthropic', 'claude-opus-5-5');
  assert.equal(k.known, true);
  assert.equal(k.label, 'Claude Opus 5.5');
  const c = resolveModel('openai', ' my-finetune ');
  assert.deepEqual({ id: c.id, known: c.known, label: c.label }, { id: 'my-finetune', known: false, label: 'my-finetune' });
});

test('inferCaps heuristics', () => {
  assert.deepEqual(inferCaps('anthropic', 'any'), { temperature: true, maxTemperature: 1, defaultMaxTokens: 800 });
  assert.equal(inferCaps('openai', 'gpt-5-mini').temperature, false);
  assert.equal(inferCaps('openai', 'o4-mini').temperature, false);
  assert.equal(inferCaps('openai', 'gpt-4.1').temperature, true);
  assert.equal(inferCaps('openai', 'gpt-4.1').maxTemperature, 2);
  assert.equal(inferCaps('google', 'gemini-2.5-pro').thinkingBudget, 512);
  assert.equal(inferCaps('google', 'gemini-2.5-flash-lite').thinkingBudget, 0);
  assert.equal(inferCaps('google', 'gemma-3-27b').thinkingBudget, undefined);
});

test('inferCaps: current-generation Claude ids disable temperature and set effort/thinking allowance', () => {
  for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet-5', 'claude-opus-4-7']) {
    const c = inferCaps('anthropic', id);
    assert.equal(c.temperature, false, id);
    assert.equal(c.effort, 'low', id);
    assert.ok(c.thinkingAllowance > 0, id);
  }
  assert.equal(inferCaps('anthropic', 'claude-sonnet-4-6').temperature, true);
  assert.equal(inferCaps('anthropic', 'claude-opus-4-6').effort, undefined);
});
