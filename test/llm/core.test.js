import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chat, collectText, testConnection, LLMError, createDirectTransport, createProxyTransport, createTransport } from '../../src/llm/index.js';

const fixtureBytes = (n) => new Uint8Array(readFileSync(new URL(`../fixtures/${n}`, import.meta.url)));
const sseResponse = (bytes, chunk = 37) => new Response(new ReadableStream({
  start(c) { for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk)); c.close(); },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } });

const fakeTransport = (fn) => { const calls = []; return { kind: 'direct', calls, open: async (req, adapter, opts) => { calls.push({ req, adapter, opts }); return fn(calls.length, req); } }; };
const noSleep = async () => {};
const base = { provider: 'anthropic', model: '', messages: [{ role: 'user', content: 'hello' }] };

async function drain(it) {
  const evs = [];
  for await (const e of it) evs.push(e);
  return evs;
}

test('happy path: text events then exactly one done', async () => {
  const t = fakeTransport(() => sseResponse(fixtureBytes('anthropic-ok.sse')));
  const evs = await drain(chat({ ...base, system: '  SYS  ', temperature: 5, maxTokens: 100 }, { transport: t }));
  const done = evs.filter((e) => e.type === 'done');
  assert.equal(done.length, 1);
  assert.equal(evs[evs.length - 1].type, 'done');
  assert.equal(done[0].stopReason, 'end');
  assert.ok(evs.filter((e) => e.type === 'text').every((e) => e.text.length > 0));
  // normalized request handed to the transport
  const { req, opts } = t.calls[0];
  assert.equal(req.model, 'claude-sonnet-5-5');
  assert.equal(req.system, 'SYS');
  assert.equal(req.temperature, undefined, 'current-generation Claude models reject temperature');
  assert.equal(req.maxTokens, 100);
  assert.equal(opts.caps.temperature, false);
});

test('temperature is clamped to caps.maxTemperature on models that accept it', async () => {
  const t = fakeTransport(() => sseResponse(fixtureBytes('anthropic-ok.sse')));
  await drain(chat({ ...base, model: 'claude-sonnet-4-6', temperature: 5 }, { transport: t }));
  assert.equal(t.calls[0].req.temperature, 1);
  assert.equal(t.calls[0].opts.caps.maxTemperature, 1);
});

test('collectText joins text', async () => {
  const t = fakeTransport(() => sseResponse(fixtureBytes('openai-ok.sse')));
  const s = await collectText(chat({ provider: 'openai', model: 'gpt-5-mini', messages: base.messages, temperature: 0.3 }, { transport: t }));
  assert.equal(s, 'Breathe, मित्र. 🌿\n\n[[BG 6.35]]');
  assert.equal(t.calls[0].req.temperature, undefined, 'dropped for gpt-5*');
});

test('meta is passed through to the transport', async () => {
  const t = fakeTransport(() => sseResponse(fixtureBytes('gemini-ok.sse')));
  await drain(chat({ provider: 'google', model: '', messages: base.messages, meta: { length: 'deep', language: 'hi' } }, { transport: t }));
  assert.deepEqual(t.calls[0].req.meta, { length: 'deep', language: 'hi' });
});

test('retries on 529 before the first token', async () => {
  const t = fakeTransport((n) => (n === 1
    ? new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), { status: 529 })
    : sseResponse(fixtureBytes('anthropic-ok.sse'))));
  const waits = [];
  const evs = await drain(chat(base, { transport: t, sleep: async (ms) => { waits.push(ms); } }));
  assert.equal(t.calls.length, 2);
  assert.equal(waits.length, 1);
  assert.equal(evs[evs.length - 1].type, 'done');
});

test('honours retry-after when retrying and gives up after `retries`', async () => {
  const t = fakeTransport(() => new Response('{}', { status: 429, headers: { 'retry-after': '2' } }));
  const waits = [];
  await assert.rejects(drain(chat(base, { transport: t, retries: 2, sleep: async (ms) => { waits.push(ms); } })), (e) => e.code === 'rate_limit');
  assert.deepEqual(waits, [2000, 2000]);
  assert.equal(t.calls.length, 3);
});

test('does not retry non-retryable errors', async () => {
  const t = fakeTransport(() => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }), { status: 401 }));
  await assert.rejects(drain(chat(base, { transport: t, sleep: noSleep })), (e) => e instanceof LLMError && e.code === 'auth' && e.status === 401);
  assert.equal(t.calls.length, 1);
});

test('no retry after a token has been yielded', async () => {
  const bytes = fixtureBytes('anthropic-ok.sse');
  const head = new TextDecoder().decode(bytes).split('event: content_block_stop')[0];
  const mid = new TextEncoder().encode(head + 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n');
  const t = fakeTransport(() => sseResponse(mid));
  const got = [];
  await assert.rejects((async () => { for await (const e of chat(base, { transport: t, sleep: noSleep })) got.push(e); })(), (e) => e.code === 'overloaded');
  assert.ok(got.some((e) => e.type === 'text'));
  assert.equal(t.calls.length, 1);
});

test('abort mid-stream throws aborted and cancels the reader', async () => {
  let cancelled = false;
  const enc = new TextEncoder();
  const t = fakeTransport(() => new Response(new ReadableStream({
    start(c) { c.enqueue(enc.encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n')); },
    pull() { return new Promise(() => {}); },
    cancel() { cancelled = true; },
  }), { status: 200 }));
  const ac = new AbortController();
  const got = [];
  await assert.rejects((async () => {
    for await (const e of chat(base, { transport: t, signal: ac.signal, sleep: noSleep })) {
      got.push(e);
      if (e.type === 'text') setTimeout(() => ac.abort(), 5);
    }
  })(), (e) => e instanceof LLMError && e.code === 'aborted');
  assert.deepEqual(got, [{ type: 'text', text: 'Hi' }]);
  assert.equal(cancelled, true);
  assert.equal(t.calls.length, 1);
});

test('already-aborted signal throws aborted without opening', async () => {
  const t = fakeTransport(() => sseResponse(fixtureBytes('anthropic-ok.sse')));
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(drain(chat(base, { transport: t, signal: ac.signal })), (e) => e.code === 'aborted');
  assert.equal(t.calls.length, 0);
});

test('missing terminal signal with no text throws stream (not retried)', async () => {
  const t = fakeTransport(() => sseResponse(new TextEncoder().encode('event: ping\ndata: {"type":"ping"}\n\n')));
  await assert.rejects(drain(chat(base, { transport: t, sleep: noSleep })), (e) => e.code === 'stream');
  assert.equal(t.calls.length, 1);
});

test('text without terminal signal yields done{other}', async () => {
  const t = fakeTransport(() => sseResponse(new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"cut"}}\n\n')));
  const evs = await drain(chat(base, { transport: t }));
  assert.deepEqual(evs, [{ type: 'text', text: 'cut' }, { type: 'done', stopReason: 'other' }]);
});

test('network failure from transport maps to network and is retried', async () => {
  const t = fakeTransport((n) => { if (n === 1) throw new TypeError('Failed to fetch'); return sseResponse(fixtureBytes('anthropic-ok.sse')); });
  const evs = await drain(chat(base, { transport: t, sleep: noSleep }));
  assert.equal(evs[evs.length - 1].type, 'done');
  assert.equal(t.calls.length, 2);
});

test('invalid request (no user message) throws invalid_request; unknown provider throws config; no transport throws config', async () => {
  const t = fakeTransport(() => sseResponse(fixtureBytes('anthropic-ok.sse')));
  await assert.rejects(drain(chat({ ...base, messages: [] }, { transport: t })), (e) => e.code === 'invalid_request');
  await assert.rejects(drain(chat({ ...base, provider: 'nope' }, { transport: t })), (e) => e.code === 'config');
  await assert.rejects(drain(chat(base, {})), (e) => e.code === 'config');
  assert.equal(t.calls.length, 0);
});

test('direct transport with no key throws config and never calls fetch', async () => {
  let fetched = 0;
  const transport = createDirectTransport({ getKey: () => '', fetch: async () => { fetched++; return new Response(''); } });
  await assert.rejects(drain(chat(base, { transport })), (e) => e.code === 'config' && /Anthropic API key/.test(e.message));
  assert.equal(fetched, 0);
});

test('direct transport builds the provider request with the key and browser header', async () => {
  const seen = [];
  const transport = createDirectTransport({
    getKey: (p) => (p === 'anthropic' ? 'sk-ant-test' : null),
    baseUrls: { anthropic: 'https://example.test' },
    fetch: async (url, init) => { seen.push({ url, init }); return sseResponse(fixtureBytes('anthropic-ok.sse')); },
  });
  assert.equal(transport.kind, 'direct');
  await drain(chat(base, { transport }));
  assert.equal(seen[0].url, 'https://example.test/v1/messages');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(seen[0].init.headers['anthropic-dangerous-direct-browser-access'], 'true');
});

test('proxy transport posts the normalized body with token and meta; listProviders()', async () => {
  const seen = [];
  const transport = createProxyTransport({
    baseUrl: 'https://proxy.test/', token: 'tok',
    fetch: async (url, init) => {
      seen.push({ url, init });
      if (url.endsWith('/v1/providers')) return new Response(JSON.stringify([{ id: 'openai', models: ['gpt-5-mini'] }]), { status: 200 });
      return sseResponse(fixtureBytes('openai-ok.sse'));
    },
  });
  assert.equal(transport.kind, 'proxy');
  const text = await collectText(chat({ provider: 'openai', model: 'gpt-4.1', messages: base.messages, system: 'S', temperature: 0.4, maxTokens: 50, meta: { length: 'brief', language: 'en' } }, { transport }));
  assert.ok(text.includes('Breathe'));
  assert.equal(seen[0].url, 'https://proxy.test/v1/chat');
  assert.equal(seen[0].init.headers['x-sakhaon-token'], 'tok');
  assert.deepEqual(JSON.parse(seen[0].init.body), { provider: 'openai', model: 'gpt-4.1', messages: base.messages, system: 'S', temperature: 0.4, maxTokens: 50, length: 'brief', language: 'en' });
  assert.deepEqual(await transport.listProviders(), [{ id: 'openai', models: ['gpt-5-mini'] }]);
  assert.equal(seen[1].url, 'https://proxy.test/v1/providers');
});

test('createTransport selects modes; proxy without url throws config', () => {
  assert.equal(createTransport({ mode: 'direct', getKey: () => 'k' }).kind, 'direct');
  assert.equal(createTransport({ mode: 'proxy', proxyUrl: 'http://localhost:8787' }).kind, 'proxy');
  assert.throws(() => createTransport({ mode: 'proxy', proxyUrl: '' }), (e) => e.code === 'config' && e.message === 'Set a proxy URL in Settings');
});

test('testConnection returns ok/ms/model and sends the probe request', async () => {
  const t = fakeTransport(() => sseResponse(fixtureBytes('gemini-ok.sse')));
  let clock = 1000;
  const r = await testConnection({ provider: 'google', model: '', transport: t, now: () => (clock += 412) });
  assert.deepEqual(r, { ok: true, ms: 412, model: 'gemini-2.5-flash' });
  const { req } = t.calls[0];
  assert.equal(req.maxTokens, 16);
  assert.equal(req.system, undefined);
  assert.deepEqual(req.messages, [{ role: 'user', content: 'Reply with the single word: ok' }]);
});

test('testConnection throws LLMError on failure without retrying', async () => {
  const t = fakeTransport(() => new Response('{"error":{"message":"x","type":"server_error"}}', { status: 500 }));
  await assert.rejects(testConnection({ provider: 'openai', model: 'gpt-4.1', transport: t }), (e) => e.code === 'server');
  assert.equal(t.calls.length, 1);
});
