// Provider-agnostic chat core. Isomorphic: no DOM, no node:*.
import { LLMError, fromHttp, fromFetchError, isAbortError } from './errors.js';
import { iterateSSE } from './sse.js';
import { normalizeMessages } from './messages.js';
import { getProviderEntry, resolveModel } from './registry.js';

/**
 * @typedef {import('./types.js').ChatRequest} ChatRequest
 * @typedef {import('./types.js').ChatEvent} ChatEvent
 * @typedef {import('./types.js').Transport} Transport
 */

const MAX_AUTO_RETRY_WAIT_MS = 10_000;

function abortedError(provider, cause) {
  return new LLMError('aborted', 'Request aborted', { provider, cause });
}

/** Abortable sleep. */
export function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortedError()); return; }
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(t); reject(abortedError()); }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function backoffMs(attempt, err) {
  if (typeof err.retryAfterMs === 'number') return err.retryAfterMs;
  return Math.min(8000, 600 * 2 ** attempt);
}

function toLLMError(e, provider, signal) {
  if (signal?.aborted || isAbortError(e)) {
    return e instanceof LLMError && e.code === 'aborted' ? e : abortedError(provider, e);
  }
  if (e instanceof LLMError) {
    if (e.provider === undefined && provider) e.provider = provider;
    return e;
  }
  if (e && e.name === 'TypeError') return fromFetchError(e, provider);
  return new LLMError('stream', (e && e.message) || 'Unexpected error', { provider, cause: e });
}

/**
 * Prepare a request: normalize messages, resolve model + caps, clamp params.
 * @param {ChatRequest} req
 */
export function prepareRequest(req) {
  if (!req || typeof req !== 'object') throw new LLMError('invalid_request', 'Missing request');
  const entry = getProviderEntry(req.provider);
  const resolved = resolveModel(req.provider, req.model);
  const { caps } = resolved;
  const messages = normalizeMessages(req.messages);
  let temperature;
  if (caps.temperature && typeof req.temperature === 'number' && Number.isFinite(req.temperature)) {
    temperature = Math.min(caps.maxTemperature, Math.max(0, req.temperature));
  }
  const maxTokens = Number.isFinite(req.maxTokens) && req.maxTokens > 0 ? Math.floor(req.maxTokens) : caps.defaultMaxTokens;
  /** @type {any} */
  const out = { provider: entry.id, model: resolved.id, messages, maxTokens };
  const system = typeof req.system === 'string' ? req.system.trim() : '';
  if (system) out.system = system;
  if (temperature !== undefined) out.temperature = temperature;
  if (req.meta && typeof req.meta === 'object') out.meta = { ...req.meta };
  return { req: out, entry, caps, resolved };
}

/**
 * Stream a chat completion.
 * Yields >=0 {type:'text'} events, then exactly one {type:'done'}. Errors are thrown as LLMError.
 * @param {ChatRequest} req
 * @param {{ transport: Transport, signal?: AbortSignal, retries?: number, sleep?: (ms:number, signal?:AbortSignal)=>Promise<void> }} opts
 * @returns {AsyncGenerator<ChatEvent>}
 */
export async function* chat(req, opts = {}) {
  const { transport, signal, retries = 2, sleep = defaultSleep } = opts;
  const provider = req && req.provider;
  if (!transport || typeof transport.open !== 'function') {
    throw new LLMError('config', 'No transport configured', { provider });
  }
  let prepared;
  try { prepared = prepareRequest(req); } catch (e) { throw toLLMError(e, provider, undefined); }
  const { req: nreq, entry, caps } = prepared;
  const adapter = entry.adapter;

  for (let attempt = 0; ; attempt++) {
    let yieldedText = false;
    try {
      if (signal?.aborted) throw abortedError(provider);
      let res;
      try {
        res = await transport.open(nreq, adapter, { signal, caps });
      } catch (e) {
        throw e instanceof LLMError ? e : (signal?.aborted ? abortedError(provider, e) : fromFetchError(e, provider));
      }
      if (!res || typeof res.status !== 'number') throw new LLMError('stream', 'Transport returned no response', { provider });
      if (!res.ok) throw await fromHttp(adapter, provider, res);
      if (!res.body) throw new LLMError('stream', 'Response has no body', { provider, status: res.status });

      const state = adapter.createState();
      let done = null;
      outer: for await (const ev of iterateSSE(res.body, signal)) {
        for (const out of adapter.parseEvent(ev, state)) {
          if (out.type === 'text') {
            if (!out.text) continue;
            yieldedText = true;
            yield out;
          } else if (out.type === 'done') {
            done = out;
            break outer;
          }
        }
      }
      if (signal?.aborted) throw abortedError(provider);
      if (!done) {
        for (const out of adapter.finish(state)) {
          if (out.type === 'text' && out.text) { yieldedText = true; yield out; }
          else if (out.type === 'done') done = out;
        }
      }
      if (!done) throw new LLMError('stream', 'The stream ended unexpectedly', { provider });
      yield done;
      return;
    } catch (e) {
      const err = toLLMError(e, provider, signal);
      if (err.code === 'aborted') throw err;
      const wait = err.retryable ? backoffMs(attempt, err) : 0;
      if (!yieldedText && err.retryable && attempt < retries && wait <= MAX_AUTO_RETRY_WAIT_MS) {
        try { await sleep(wait, signal); } catch (se) { throw toLLMError(se, provider, signal); }
        if (signal?.aborted) throw abortedError(provider);
        continue;
      }
      throw err;
    }
  }
}

/**
 * @param {AsyncIterable<ChatEvent>} iter
 * @returns {Promise<string>}
 */
export async function collectText(iter) {
  let s = '';
  for await (const ev of iter) if (ev.type === 'text') s += ev.text;
  return s;
}

/**
 * Minimal round-trip to verify provider + model + key/proxy.
 * @returns {Promise<{ok:true, ms:number, model:string}>}
 */
export async function testConnection({ provider, model, transport, signal, now = () => Date.now() }) {
  const t0 = now();
  const resolved = resolveModel(provider, model);
  let doneModel;
  const it = chat(
    { provider, model: resolved.id, messages: [{ role: 'user', content: 'Reply with the single word: ok' }], maxTokens: 16 },
    { transport, signal, retries: 0 },
  );
  for await (const ev of it) if (ev.type === 'done') doneModel = ev.model;
  return { ok: true, ms: Math.max(0, Math.round(now() - t0)), model: doneModel || resolved.id };
}
