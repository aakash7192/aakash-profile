import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LLMError, ERROR_CODES, fromHttp, fromFetchError, parseRetryAfter, NETWORK_MESSAGE } from '../../src/llm/errors.js';
import { anthropicAdapter } from '../../src/llm/adapters/anthropic.js';
import { openaiAdapter } from '../../src/llm/adapters/openai.js';
import { geminiAdapter } from '../../src/llm/adapters/gemini.js';

const res = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const ant = (type, message = 'x') => ({ type: 'error', error: { type, message } });
const oai = (code, type = 'invalid_request_error', message = 'x') => ({ error: { message, type, param: null, code } });
const gem = (code, status, message = 'x') => ({ error: { code, message, status } });

const TABLE = [
  // [adapter, status, body, code, retryable]
  [anthropicAdapter, 401, ant('authentication_error'), 'auth', false],
  [anthropicAdapter, 403, ant('permission_error'), 'permission', false],
  [anthropicAdapter, 404, ant('not_found_error'), 'not_found', false],
  [anthropicAdapter, 429, ant('rate_limit_error'), 'rate_limit', true],
  [anthropicAdapter, 529, ant('overloaded_error'), 'overloaded', true],
  [anthropicAdapter, 503, ant('api_error'), 'overloaded', true],
  [anthropicAdapter, 500, ant('api_error'), 'server', true],
  [anthropicAdapter, 400, ant('invalid_request_error', 'prompt is too long: 300000 tokens > 200000 maximum'), 'context_length', false],
  [anthropicAdapter, 400, ant('invalid_request_error', 'messages: field required'), 'invalid_request', false],
  [anthropicAdapter, 400, ant('invalid_request_error', 'Your credit balance is too low to access the API'), 'quota', false],
  [anthropicAdapter, 402, ant('billing_error'), 'quota', false],
  [openaiAdapter, 401, oai('invalid_api_key'), 'auth', false],
  [openaiAdapter, 403, oai(null, 'invalid_request_error'), 'permission', false],
  [openaiAdapter, 404, oai('model_not_found'), 'not_found', false],
  [openaiAdapter, 400, oai('context_length_exceeded'), 'context_length', false],
  [openaiAdapter, 429, oai('insufficient_quota', 'insufficient_quota'), 'quota', false],
  [openaiAdapter, 429, oai('rate_limit_exceeded', 'requests'), 'rate_limit', true],
  [openaiAdapter, 500, oai(null, 'server_error'), 'server', true],
  [openaiAdapter, 400, oai('unsupported_value'), 'invalid_request', false],
  [geminiAdapter, 401, gem(401, 'UNAUTHENTICATED'), 'auth', false],
  [geminiAdapter, 400, gem(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.'), 'auth', false],
  [geminiAdapter, 400, gem(400, 'INVALID_ARGUMENT', 'bad field'), 'invalid_request', false],
  [geminiAdapter, 403, gem(403, 'PERMISSION_DENIED', 'Method doesn\'t allow unregistered callers'), 'permission', false],
  [geminiAdapter, 403, gem(403, 'PERMISSION_DENIED', 'Your API key was reported as leaked'), 'auth', false],
  [geminiAdapter, 429, gem(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).'), 'quota', false],
  [geminiAdapter, 429, gem(429, 'RESOURCE_EXHAUSTED', 'Too many requests'), 'rate_limit', true],
  [geminiAdapter, 404, gem(404, 'NOT_FOUND'), 'not_found', false],
  [geminiAdapter, 503, gem(503, 'UNAVAILABLE'), 'overloaded', true],
  [geminiAdapter, 500, gem(500, 'INTERNAL'), 'server', true],
  [geminiAdapter, 400, [gem(400, 'INVALID_ARGUMENT', 'bad')], 'invalid_request', false],
];

for (const [adapter, status, body, code, retryable] of TABLE) {
  test(`${adapter.id} ${status} ${JSON.stringify(body).slice(0, 70)} -> ${code}`, async () => {
    const e = await fromHttp(adapter, adapter.id, res(status, body));
    assert.ok(e instanceof LLMError);
    assert.equal(e.code, code);
    assert.equal(e.retryable, retryable);
    assert.equal(e.status, status);
    assert.equal(e.provider, adapter.id);
  });
}

test('unparseable bodies fall back to status mapping', async () => {
  for (const [status, code] of [[401, 'auth'], [403, 'permission'], [404, 'not_found'], [429, 'rate_limit'], [529, 'overloaded'], [502, 'server'], [400, 'invalid_request']]) {
    for (const ad of [anthropicAdapter, openaiAdapter, geminiAdapter]) {
      const e = await fromHttp(ad, ad.id, res(status, '<html>gateway</html>'));
      assert.equal(e.code, code, `${ad.id} ${status}`);
    }
  }
});

test('proxy-shaped error body is detected first; unknown codes become proxy', async () => {
  const e1 = await fromHttp(anthropicAdapter, 'anthropic', res(429, { error: { type: 'sakhaon_proxy', code: 'rate_limit', message: 'slow down' } }, { 'retry-after': '7' }));
  assert.equal(e1.code, 'rate_limit');
  assert.equal(e1.message, 'slow down');
  assert.equal(e1.retryAfterMs, 7000);
  const e2 = await fromHttp(openaiAdapter, 'openai', res(403, { error: { type: 'sakhaon_proxy', code: 'origin_not_allowed', message: 'no' } }));
  assert.equal(e2.code, 'proxy');
  assert.equal(e2.retryable, false);
  // Without an adapter (e.g. proxy listProviders)
  const e3 = await fromHttp(null, undefined, res(401, { error: { type: 'sakhaon_proxy', code: 'auth', message: 'bad token' } }));
  assert.equal(e3.code, 'auth');
});

test('retry-after: seconds and HTTP-date', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  assert.equal(parseRetryAfter('3', now), 3000);
  assert.equal(parseRetryAfter('1.5', now), 1500);
  assert.equal(parseRetryAfter('Thu, 08 Oct 2026 12:00:10 GMT', now), 10000);
  assert.equal(parseRetryAfter('Thu, 08 Oct 2026 11:00:00 GMT', now), 0);
  assert.equal(parseRetryAfter('soon', now), undefined);
  assert.equal(parseRetryAfter(null, now), undefined);
});

test('fromHttp parses retry-after HTTP-date header', async () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const e = await fromHttp(openaiAdapter, 'openai', res(429, oai('rate_limit_exceeded'), { 'retry-after': 'Thu, 08 Oct 2026 12:00:04 GMT' }), { now });
  assert.equal(e.retryAfterMs, 4000);
});

test('fromFetchError: AbortError -> aborted, TypeError -> network', () => {
  const a = fromFetchError(new DOMException('Aborted', 'AbortError'), 'openai');
  assert.equal(a.code, 'aborted');
  assert.equal(a.retryable, false);
  const n = fromFetchError(new TypeError('Failed to fetch'), 'openai');
  assert.equal(n.code, 'network');
  assert.equal(n.retryable, true);
  assert.equal(n.message, NETWORK_MESSAGE);
});

test('ERROR_CODES is frozen and complete; unknown code becomes proxy', () => {
  assert.ok(Object.isFrozen(ERROR_CODES));
  assert.equal(ERROR_CODES.length, 15);
  assert.equal(new LLMError('weird', 'x').code, 'proxy');
  assert.equal(new LLMError('quota').retryable, false);
  assert.equal(new LLMError('rate_limit').retryable, true);
});
