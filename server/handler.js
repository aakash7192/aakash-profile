// Sakhaon proxy request handler (node:http, zero dependencies).
// Holds provider keys in env vars, pins the Sakha persona, and streams upstream SSE bytes back unchanged.
import { Readable } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import { PROVIDERS, resolveModel } from '../src/llm/registry.js';
import { normalizeMessages } from '../src/llm/messages.js';
import { buildSystemPrompt, LENGTHS, LANGUAGES } from '../src/sakhaon/core/persona.js';
import { createRateLimiter } from './ratelimit.js';

export const DEFAULTS = Object.freeze({
  PORT: '8787',
  ALLOWED_ORIGINS: 'https://aakash7192.github.io,http://localhost:5173,http://localhost:4173',
  RATE_LIMIT_RPM: '20',
  MAX_TOKENS_CAP: '4096',
  PIN_SYSTEM_PROMPT: '1',
});

export const BODY_LIMIT = 64 * 1024;
const MAX_MESSAGES = 50;
// Per-message limit on what the proxy receives. Clients merge adjacent same-role turns before sending
// (normalizeMessages), so one message can legitimately hold several 8000-char composer turns; this
// matches normalizeMessages' 24000-char window. The 64 KB body cap still bounds the total.
const MAX_CONTENT = 24000;
const MAX_SYSTEM = 20000;
const MAX_MODEL_LEN = 100;

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const truthy = (s) => !/^(0|false|no|off)$/i.test(String(s).trim());

function keyFor(env, p) {
  const names = [p.keyEnv, `${p.id.toUpperCase()}_API_KEY`];
  if (p.id === 'google') names.push('GOOGLE_API_KEY');
  for (const n of names) if (n && env[n] && String(env[n]).trim()) return String(env[n]).trim();
  return '';
}

/** Parse env into a config object. */
export function loadConfig(env = {}) {
  const get = (k) => (env[k] !== undefined && env[k] !== '' ? env[k] : DEFAULTS[k]);
  const keys = {};
  const baseUrls = {};
  for (const p of Object.values(PROVIDERS)) {
    const k = keyFor(env, p);
    if (k) keys[p.id] = k;
    const b = env[`${p.id.toUpperCase()}_BASE_URL`];
    baseUrls[p.id] = b && String(b).trim() ? String(b).trim() : p.baseUrl;
  }
  return {
    allowedOrigins: list(get('ALLOWED_ORIGINS')),
    rpm: Math.max(0, parseInt(get('RATE_LIMIT_RPM'), 10) || 0),
    maxTokensCap: Math.max(1, parseInt(get('MAX_TOKENS_CAP'), 10) || 4096),
    pinSystemPrompt: truthy(get('PIN_SYSTEM_PROMPT')),
    allowedModels: list(env.ALLOWED_MODELS),
    proxyToken: env.PROXY_TOKEN ? String(env.PROXY_TOKEN) : '',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    keys,
    baseUrls,
  };
}

/**
 * TRUST_PROXY = number of trusted reverse-proxy hops in front of this server (0 = off).
 * "1"/"true"/"yes" mean one hop. Any other non-numeric truthy value also means one hop.
 */
export function parseTrustProxy(v) {
  if (v === undefined || v === null || String(v).trim() === '') return 0;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Math.min(parseInt(s, 10), 10);
  return truthy(s) ? 1 : 0;
}

/**
 * Client IP for rate limiting. Each trusted proxy APPENDS the address it saw to X-Forwarded-For,
 * so only the rightmost `hops` entries are trustworthy; anything to their left is client-supplied.
 * With hops = n we take the n-th address from the right of [...xff, socketAddress] (Express semantics).
 */
export function clientIp(xff, remote, hops) {
  const r = remote || 'unknown';
  if (!(hops > 0)) return r;
  const chain = String(xff || '').split(',').map((x) => x.trim()).filter(Boolean);
  chain.push(r);
  const i = chain.length - 1 - hops;
  return chain[Math.max(0, i)];
}

/** ALLOWED_MODELS entries are "model" (any provider) or "provider:model". Empty list = any. */
export function modelAllowed(cfg, provider, model) {
  if (!cfg.allowedModels.length) return true;
  return cfg.allowedModels.some((e) => e === model || e === `${provider}:${model}`);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * @param {{ env?: Record<string,string|undefined>, fetch?: typeof fetch, now?: () => number, log?: (line:string)=>void }} [opts]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createHandler({ env = process.env, fetch: fetchImpl = globalThis.fetch, now = Date.now, log = (l) => console.log(l) } = {}) {
  const cfg = loadConfig(env);
  const limiter = createRateLimiter({ rpm: cfg.rpm, now });
  const anyOrigin = cfg.allowedOrigins.includes('*');

  return function handler(req, res) {
    const t0 = now();
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = req.headers.origin;
    const info = { provider: '-', model: '-' };

    res.on('finish', () => {
      try { log(`${req.method} ${path} ${info.provider} ${info.model} ${res.statusCode} ${now() - t0}ms`); } catch { /* ignore */ }
    });

    const cors = {};
    if (origin && (anyOrigin || cfg.allowedOrigins.includes(origin))) {
      cors['access-control-allow-origin'] = origin;
      cors['access-control-expose-headers'] = 'retry-after';
      cors.vary = 'Origin';
    }

    const sendJson = (status, obj, extra = {}) => {
      if (res.headersSent) { res.end(); return; }
      const body = JSON.stringify(obj);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors, ...extra });
      res.end(body);
    };
    const fail = (status, code, message, extra) => sendJson(status, { error: { type: 'sakhaon_proxy', code, message } }, extra);

    if (origin && !cors['access-control-allow-origin']) {
      req.resume();
      fail(403, 'origin_not_allowed', 'This origin is not allowed to use the proxy');
      return;
    }

    if (req.method === 'OPTIONS') {
      req.resume();
      res.writeHead(204, {
        ...cors,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-sakhaon-token',
        'access-control-max-age': '600',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && path === '/healthz') { req.resume(); sendJson(200, { ok: true }); return; }

    const tokenOk = () => !cfg.proxyToken || safeEqual(req.headers['x-sakhaon-token'] || '', cfg.proxyToken);

    if (req.method === 'GET' && path === '/v1/providers') {
      req.resume();
      if (!tokenOk()) { fail(401, 'auth', 'Invalid or missing proxy token'); return; }
      const out = Object.values(PROVIDERS)
        .filter((p) => cfg.keys[p.id])
        .map((p) => {
          const models = p.models.map((m) => m.id).filter((m) => modelAllowed(cfg, p.id, m));
          for (const e of cfg.allowedModels) {
            const [pid, ...rest] = e.split(':');
            const mid = rest.join(':');
            if (rest.length && pid === p.id && mid && !models.includes(mid)) models.push(mid);
          }
          return { id: p.id, models };
        });
      sendJson(200, out);
      return;
    }

    if (path !== '/v1/chat') { req.resume(); fail(404, 'not_found', 'Not found'); return; }
    if (req.method !== 'POST') { req.resume(); fail(405, 'invalid_request', 'Use POST', { allow: 'POST, OPTIONS' }); return; }
    if (!tokenOk()) { req.resume(); fail(401, 'auth', 'Invalid or missing proxy token'); return; }

    const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, cfg.trustProxy);
    const rl = limiter.check(ip);
    if (!rl.ok) {
      req.resume();
      fail(429, 'rate_limit', 'Too many requests to the proxy', { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) });
      return;
    }

    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > BODY_LIMIT) {
      req.resume();
      fail(413, 'context_length', 'Request body too large', { connection: 'close' });
      return;
    }

    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > BODY_LIMIT) { tooBig = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('error', () => { if (!res.headersSent) res.destroy(); });
    req.on('end', () => {
      if (tooBig) { fail(413, 'context_length', 'Request body too large', { connection: 'close' }); return; }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
        fail(400, 'invalid_request', 'Body must be JSON'); return;
      }
      handleChat(body).catch((e) => {
        if (!res.headersSent) fail(502, 'server', 'Proxy failure');
        else res.destroy(e);
      });
    });

    async function handleChat(body) {
      if (!body || typeof body !== 'object' || Array.isArray(body)) { fail(400, 'invalid_request', 'Body must be a JSON object'); return; }
      const { provider, model } = body;
      const entry = typeof provider === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, provider) ? PROVIDERS[provider] : null;
      if (!entry) { fail(400, 'invalid_request', `Unknown provider: ${String(provider).slice(0, 40)}`); return; }
      info.provider = entry.id;
      const apiKey = cfg.keys[entry.id];
      if (!apiKey) { fail(400, 'config', `The proxy has no ${entry.label} key configured`); return; }

      let modelId = model === undefined || model === null ? '' : model;
      if (typeof modelId !== 'string' || modelId.length > MAX_MODEL_LEN) { fail(400, 'invalid_request', 'model must be a string of at most 100 characters'); return; }
      const resolved = resolveModel(entry.id, modelId);
      modelId = resolved.id;
      info.model = modelId;
      if (!modelAllowed(cfg, entry.id, modelId)) { fail(403, 'permission', `Model not allowed on this proxy: ${modelId}`); return; }

      const msgs = body.messages;
      if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > MAX_MESSAGES) {
        fail(400, 'invalid_request', `messages must be an array of 1–${MAX_MESSAGES} items`); return;
      }
      for (const m of msgs) {
        if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length > MAX_CONTENT) {
          fail(400, 'invalid_request', `Each message needs role user|assistant and content of at most ${MAX_CONTENT} characters`); return;
        }
      }
      let messages;
      try { messages = normalizeMessages(msgs); } catch (e) { fail(400, 'invalid_request', e.message); return; }

      let system;
      if (cfg.pinSystemPrompt) {
        const length = Object.prototype.hasOwnProperty.call(LENGTHS, body.length) ? body.length : undefined;
        const language = LANGUAGES.includes(body.language) ? body.language : undefined;
        system = buildSystemPrompt({ length, language });
      } else if (typeof body.system === 'string' && body.system.trim()) {
        if (body.system.length > MAX_SYSTEM) { fail(400, 'invalid_request', 'system prompt too long'); return; }
        system = body.system.trim();
      }

      const { caps } = resolved;
      let maxTokens = Number.isFinite(body.maxTokens) && body.maxTokens > 0 ? Math.floor(body.maxTokens) : caps.defaultMaxTokens;
      maxTokens = Math.min(maxTokens, cfg.maxTokensCap);
      let temperature;
      if (caps.temperature && typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
        temperature = Math.min(caps.maxTemperature, Math.max(0, body.temperature));
      }

      const nreq = { provider: entry.id, model: modelId, messages, maxTokens };
      if (system) nreq.system = system;
      if (temperature !== undefined) nreq.temperature = temperature;
      // maxOutputTokens: MAX_TOKENS_CAP bounds the FINAL upstream budget, including any thinking allowance
      // the adapter adds on top of maxTokens (Anthropic adaptive thinking, Gemini thinking headroom).
      const up = entry.adapter.buildRequest(nreq, { apiKey, baseUrl: cfg.baseUrls[entry.id], direct: false, caps, maxOutputTokens: cfg.maxTokensCap });

      const ac = new AbortController();
      res.on('close', () => { if (!res.writableFinished) ac.abort(); });

      let upstream;
      try {
        upstream = await fetchImpl(up.url, { method: 'POST', headers: up.headers, body: up.body, signal: ac.signal });
      } catch {
        if (ac.signal.aborted) { res.destroy(); return; }
        fail(502, 'server', `Could not reach ${entry.label}`); return;
      }

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        const h = { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', ...cors };
        const ra = upstream.headers.get('retry-after');
        if (ra) h['retry-after'] = ra;
        res.writeHead(upstream.status, h);
        res.end(text);
        return;
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
        connection: 'keep-alive',
        ...cors,
      });
      if (!upstream.body) { res.end(); return; }
      const stream = Readable.fromWeb(upstream.body);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    }
  };
}
