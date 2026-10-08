import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from '../../server/handler.js';
import { SAKHA_SYSTEM_PROMPT, buildSystemPrompt } from '../../src/sakhaon/core/persona.js';

const ORIGIN = 'http://localhost:5173';
const SSE = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":3}}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"नमस्ते 🙏"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';

function stubFetch(responder) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    return responder ? responder(url, init) : new Response(SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  fn.calls = calls;
  return fn;
}

async function withServer(env, fetchImpl, fn) {
  const server = http.createServer(createHandler({ env: { ANTHROPIC_API_KEY: 'sk-ant-SECRET', ...env }, fetch: fetchImpl, log: () => {} }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try { return await fn(port); } finally { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); }
}

function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const h = { ...headers };
    if (data) { h['content-type'] = h['content-type'] || 'application/json'; h['content-length'] = String(data.length); }
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        let json;
        try { json = JSON.parse(text); } catch { json = undefined; }
        resolve({ status: res.statusCode, headers: res.headers, buf, text, json });
      });
    });
    req.on('error', reject);
    if (data) req.end(data); else req.end();
  });
}

const chatBody = (over = {}) => ({ provider: 'anthropic', model: 'claude-test', messages: [{ role: 'user', content: 'hi' }], system: 'EVIL OVERRIDE', temperature: 0.5, maxTokens: 999999, ...over });

test('GET /healthz', async () => {
  await withServer({}, stubFetch(), async (port) => {
    const r = await request(port, { path: '/healthz' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true });
  });
});

test('CORS preflight for an allowed origin', async () => {
  await withServer({}, stubFetch(), async (port) => {
    const r = await request(port, { method: 'OPTIONS', path: '/v1/chat', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers['access-control-allow-origin'], ORIGIN);
    assert.match(r.headers['access-control-allow-headers'], /x-sakhaon-token/);
    assert.match(r.headers['access-control-allow-methods'], /POST/);
  });
});

test('bad origin gets 403 with proxy error shape', async () => {
  const f = stubFetch();
  await withServer({}, f, async (port) => {
    const r = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: 'https://evil.example' }, body: chatBody() });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.type, 'sakhaon_proxy');
    assert.equal(r.headers['access-control-allow-origin'], undefined);
    assert.equal(f.calls.length, 0);
  });
});

test('unconfigured or unknown provider gets 400', async () => {
  await withServer({}, stubFetch(), async (port) => {
    const r = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody({ provider: 'openai' }) });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'config');
    const r2 = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody({ provider: 'nope' }) });
    assert.equal(r2.status, 400);
    assert.equal(r2.json.error.code, 'invalid_request');
  });
});

test('oversized body gets 413', async () => {
  const f = stubFetch();
  await withServer({}, f, async (port) => {
    const big = chatBody({ messages: [{ role: 'user', content: 'x'.repeat(70 * 1024) }] });
    const r = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: big });
    assert.equal(r.status, 413);
    assert.equal(r.json.error.type, 'sakhaon_proxy');
    assert.equal(f.calls.length, 0);
  });
});

test('message validation: too many / too long / bad role', async () => {
  await withServer({}, stubFetch(), async (port) => {
    const send = (b) => request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: b });
    assert.equal((await send(chatBody({ messages: Array.from({ length: 51 }, () => ({ role: 'user', content: 'a' })) }))).status, 400);
    assert.equal((await send(chatBody({ messages: [{ role: 'user', content: 'x'.repeat(24001) }] }))).status, 400);
    assert.equal((await send(chatBody({ messages: [{ role: 'system', content: 'x' }] }))).status, 400);
    assert.equal((await send(chatBody({ model: 'm'.repeat(101) }))).status, 400);
    assert.equal((await send('not json')).status, 400);
  });
});

test('model allowlist gives 403', async () => {
  await withServer({ ALLOWED_MODELS: 'anthropic:claude-ok,other-model' }, stubFetch(), async (port) => {
    const r = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody({ model: 'claude-test' }) });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'permission');
    const ok = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody({ model: 'claude-ok' }) });
    assert.equal(ok.status, 200);
  });
});

test('rate limit gives 429 with retry-after', async () => {
  await withServer({ RATE_LIMIT_RPM: '2' }, stubFetch(), async (port) => {
    const send = () => request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody() });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    const r = await send();
    assert.equal(r.status, 429);
    assert.equal(r.json.error.code, 'rate_limit');
    assert.ok(Number(r.headers['retry-after']) >= 1);
    assert.match(r.headers['access-control-expose-headers'], /retry-after/);
  });
});

test('proxy token required when configured', async () => {
  await withServer({ PROXY_TOKEN: 'tok' }, stubFetch(), async (port) => {
    const bad = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody() });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.error.code, 'auth');
    const good = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN, 'x-sakhaon-token': 'tok' }, body: chatBody() });
    assert.equal(good.status, 200);
  });
});

test('happy path: key injected upstream, maxTokens clamped, persona pinned, bytes pass through, key never echoed', async () => {
  const f = stubFetch();
  await withServer({ MAX_TOKENS_CAP: '1200' }, f, async (port) => {
    const r = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody({ length: 'brief', language: 'hi' }) });
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/event-stream/);
    assert.equal(r.headers['cache-control'], 'no-cache, no-transform');
    assert.equal(r.headers['x-accel-buffering'], 'no');
    assert.equal(r.headers['access-control-allow-origin'], ORIGIN);
    assert.ok(r.buf.equals(Buffer.from(SSE, 'utf8')), 'bytes unchanged');
    assert.equal(r.text.includes('SECRET'), false);
    assert.equal(JSON.stringify(r.headers).includes('SECRET'), false);

    const [call] = f.calls;
    assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(call.init.headers['x-api-key'], 'sk-ant-SECRET');
    assert.equal('anthropic-dangerous-direct-browser-access' in call.init.headers, false);
    assert.equal(call.body.max_tokens, 1200);
    assert.equal(call.body.model, 'claude-test');
    assert.equal(call.body.system, buildSystemPrompt({ length: 'brief', language: 'hi' }));
    assert.notEqual(call.body.system, 'EVIL OVERRIDE');
    assert.equal(call.body.temperature, 0.5);
  });
});

test('PIN_SYSTEM_PROMPT=0 keeps the client system prompt; invalid length/language fall back to defaults when pinned', async () => {
  const f = stubFetch();
  await withServer({ PIN_SYSTEM_PROMPT: '0' }, f, async (port) => {
    await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody() });
    assert.equal(f.calls[0].body.system, 'EVIL OVERRIDE');
  });
  const f2 = stubFetch();
  await withServer({}, f2, async (port) => {
    await request(port, { method: 'POST', path: '/v1/chat', body: chatBody({ length: 'x', language: 'fr' }) });
    assert.equal(f2.calls[0].body.system, SAKHA_SYSTEM_PROMPT);
  });
});

test('upstream 401 body and status are forwarded', async () => {
  const upstreamBody = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  const f = stubFetch(() => new Response(upstreamBody, { status: 401, headers: { 'content-type': 'application/json' } }));
  await withServer({}, f, async (port) => {
    const r = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody() });
    assert.equal(r.status, 401);
    assert.equal(r.text, upstreamBody);
    assert.equal(r.headers['access-control-allow-origin'], ORIGIN);
  });
});

test('upstream network failure gives 502 proxy error', async () => {
  const f = stubFetch(() => { throw new TypeError('fetch failed'); });
  await withServer({}, f, async (port) => {
    const r = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody() });
    assert.equal(r.status, 502);
    assert.equal(r.json.error.type, 'sakhaon_proxy');
  });
});

test('gemini upstream uses header key, never URL', async () => {
  const f = stubFetch();
  await withServer({ GEMINI_API_KEY: 'AIzaSECRET' }, f, async (port) => {
    await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody({ provider: 'google', model: '' }) });
    const [call] = f.calls;
    assert.equal(call.url.includes('AIzaSECRET'), false);
    assert.equal(call.init.headers['x-goog-api-key'], 'AIzaSECRET');
    assert.match(call.url, /:streamGenerateContent\?alt=sse$/);
  });
});

test('GET /v1/providers lists only configured providers', async () => {
  await withServer({ OPENAI_API_KEY: 'sk-x', ALLOWED_MODELS: 'gpt-6-luna,openai:my-ft,claude-sonnet-5-5' }, stubFetch(), async (port) => {
    const r = await request(port, { path: '/v1/providers', headers: { origin: ORIGIN } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.map((p) => p.id), ['anthropic', 'openai']);
    assert.deepEqual(r.json.find((p) => p.id === 'openai').models, ['gpt-6-luna', 'my-ft']);
    assert.deepEqual(r.json.find((p) => p.id === 'anthropic').models, ['claude-sonnet-5-5']);
  });
});

test('unknown route gets 404; GET /v1/chat gets 405', async () => {
  await withServer({}, stubFetch(), async (port) => {
    assert.equal((await request(port, { path: '/nope' })).status, 404);
    assert.equal((await request(port, { path: '/v1/chat' })).status, 405);
  });
});

test('client disconnect aborts the upstream request', async () => {
  let upstreamSignal;
  const f = stubFetch((url, init) => {
    upstreamSignal = init.signal;
    return new Response(new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('event: ping\ndata: {"type":"ping"}\n\n')); },
      pull() { return new Promise(() => {}); },
    }), { status: 200 });
  });
  await withServer({}, f, async (port) => {
    await new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify(chatBody()));
      const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/chat', headers: { 'content-type': 'application/json', 'content-length': data.length } }, (res) => {
        res.once('data', () => { req.destroy(); setTimeout(resolve, 50); });
      });
      req.on('error', () => {});
      req.end(data);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });
    assert.equal(upstreamSignal.aborted, true);
  });
});

test('clientIp: TRUST_PROXY hop count uses the right of X-Forwarded-For, ignoring spoofed left entries', async () => {
  const { clientIp, parseTrustProxy } = await import('../../server/handler.js');
  assert.equal(parseTrustProxy(undefined), 0);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('true'), 1);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('0'), 0);
  assert.equal(clientIp('6.6.6.6, 1.2.3.4', '10.0.0.1', 1), '1.2.3.4');
  assert.equal(clientIp('6.6.6.6, 1.2.3.4, 10.0.0.2', '10.0.0.1', 2), '1.2.3.4');
  assert.equal(clientIp('6.6.6.6', '10.0.0.1', 0), '10.0.0.1');
  assert.equal(clientIp('', '10.0.0.1', 1), '10.0.0.1');
});

test('merged long turns (> 8000 chars) are accepted; MAX_TOKENS_CAP bounds the final upstream budget', async () => {
  const f = stubFetch();
  await withServer({ MAX_TOKENS_CAP: '1500' }, f, async (port) => {
    const big = 'a'.repeat(15000);
    const r = await request(port, { method: 'POST', path: '/v1/chat', headers: { origin: ORIGIN }, body: chatBody({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: big }], maxTokens: 1400 }) });
    assert.equal(r.status, 200);
    const [call] = f.calls;
    assert.equal(call.body.max_tokens, 1500, 'thinking allowance clamped to the cap');
    assert.equal('temperature' in call.body, false);
    assert.deepEqual(call.body.output_config, { effort: 'low' });
  });
});
