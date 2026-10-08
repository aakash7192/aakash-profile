// Error taxonomy for the provider layer. Isomorphic: no DOM, no node:*.

/** @type {readonly string[]} */
export const ERROR_CODES = Object.freeze([
  'auth', 'permission', 'not_found', 'rate_limit', 'quota', 'overloaded',
  'invalid_request', 'context_length', 'safety', 'server', 'network',
  'aborted', 'config', 'stream', 'proxy',
]);

const RETRYABLE = new Set(['rate_limit', 'overloaded', 'server', 'network']);
const KNOWN = new Set(ERROR_CODES);

export class LLMError extends Error {
  /**
   * @param {string} code one of ERROR_CODES (unknown codes become 'proxy')
   * @param {string} [message]
   * @param {{provider?:string, status?:number, retryable?:boolean, retryAfterMs?:number, raw?:string, cause?:unknown}} [opts]
   */
  constructor(code, message, opts = {}) {
    const c = KNOWN.has(code) ? code : 'proxy';
    super(message || c, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'LLMError';
    this.code = c;
    if (opts.provider !== undefined) this.provider = opts.provider;
    if (opts.status !== undefined) this.status = opts.status;
    this.retryable = typeof opts.retryable === 'boolean' ? opts.retryable : RETRYABLE.has(c);
    if (typeof opts.retryAfterMs === 'number' && Number.isFinite(opts.retryAfterMs)) {
      this.retryAfterMs = Math.max(0, opts.retryAfterMs);
    }
    if (opts.raw !== undefined) this.raw = String(opts.raw).slice(0, 2000);
  }
}

export function isRetryableCode(code) {
  return RETRYABLE.has(code);
}

/** Status-only fallback mapping used when a body is unparseable. */
export function statusToCode(status) {
  if (status === 401) return 'auth';
  if (status === 402) return 'quota';
  if (status === 403) return 'permission';
  if (status === 404) return 'not_found';
  if (status === 408) return 'network';
  if (status === 413) return 'context_length';
  if (status === 429) return 'rate_limit';
  if (status === 503 || status === 529) return 'overloaded';
  if (status >= 500) return 'server';
  if (status >= 400) return 'invalid_request';
  return 'stream';
}

/**
 * Parse a Retry-After header: delta-seconds or an HTTP date.
 * @returns {number|undefined} milliseconds
 */
export function parseRetryAfter(value, now = Date.now()) {
  if (value == null) return undefined;
  const v = String(value).trim();
  if (!v) return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(parseFloat(v) * 1000);
  const t = Date.parse(v);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, t - now);
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

/**
 * Turn a non-2xx Response into an LLMError.
 * Order: proxy-shaped body -> adapter.parseErrorBody -> status fallback.
 */
export async function fromHttp(adapter, providerId, res, { now = Date.now() } = {}) {
  let text = '';
  try { text = await res.text(); } catch { /* body unreadable */ }
  const status = res.status;
  const retryAfterMs = parseRetryAfter(res.headers?.get?.('retry-after'), now);
  const base = { provider: providerId, status, raw: text, retryAfterMs };

  const json = safeJson(text);
  const pe = json && typeof json === 'object' && !Array.isArray(json) ? json.error : undefined;
  if (pe && typeof pe === 'object' && pe.type === 'sakhaon_proxy') {
    const code = KNOWN.has(pe.code) ? pe.code : 'proxy';
    return new LLMError(code, String(pe.message || `Proxy error (${status})`), base);
  }

  let parsed;
  try { parsed = adapter && typeof adapter.parseErrorBody === 'function' ? adapter.parseErrorBody(status, text) : undefined; } catch { parsed = undefined; }
  const code = parsed && KNOWN.has(parsed.code) ? parsed.code : statusToCode(status);
  const message = (parsed && parsed.message) || `HTTP ${status}${text ? `: ${text.slice(0, 200)}` : ''}`;
  return new LLMError(code, message, base);
}

export function isAbortError(e) {
  return !!e && (e.name === 'AbortError' || e.code === 'ABORT_ERR' || (e instanceof LLMError && e.code === 'aborted'));
}

export const NETWORK_MESSAGE = 'Could not reach the provider (network, CORS, or offline). Proxy mode may help.';

/** Map a fetch()/stream exception to an LLMError. */
export function fromFetchError(e, providerId) {
  if (e instanceof LLMError) return e;
  const opts = { provider: providerId, cause: e };
  if (isAbortError(e)) return new LLMError('aborted', 'Request aborted', opts);
  return new LLMError('network', NETWORK_MESSAGE, opts);
}
