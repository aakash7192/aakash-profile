// Proxy transport: POSTs a normalized request to the Sakhaon proxy (server/),
// which holds provider keys and streams the upstream SSE bytes back unchanged.
import { LLMError, fromHttp, fromFetchError } from '../errors.js';

/**
 * @param {{ baseUrl: string, token?: string, fetch?: typeof fetch }} cfg
 * @returns {import('../types.js').Transport}
 */
export function createProxyTransport({ baseUrl, token, fetch: fetchImpl } = /** @type {any} */ ({})) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new LLMError('config', 'Set a proxy URL in Settings');
  const f = (...a) => (fetchImpl || globalThis.fetch)(...a);
  const authHeaders = () => (token ? { 'x-sakhaon-token': String(token) } : {});

  return {
    kind: 'proxy',
    async open(req, _adapter, { signal } = {}) {
      /** @type {any} */
      const payload = {
        provider: req.provider,
        model: req.model,
        messages: req.messages,
        system: req.system,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
      };
      if (req.meta?.length) payload.length = req.meta.length;
      if (req.meta?.language) payload.language = req.meta.language;
      return f(`${base}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...authHeaders() },
        body: JSON.stringify(payload),
        signal,
      });
    },
    /** @returns {Promise<{id:string, models:string[]}[]>} */
    async listProviders({ signal } = {}) {
      let res;
      try {
        res = await f(`${base}/v1/providers`, { method: 'GET', headers: authHeaders(), signal });
      } catch (e) {
        throw fromFetchError(e, undefined);
      }
      if (!res.ok) throw await fromHttp(null, undefined, res);
      const j = await res.json().catch(() => null);
      const list = Array.isArray(j) ? j : (j && Array.isArray(j.providers) ? j.providers : null);
      if (!list) throw new LLMError('proxy', 'Unexpected /v1/providers response');
      return list
        .filter((p) => p && typeof p.id === 'string')
        .map((p) => ({ id: p.id, models: Array.isArray(p.models) ? p.models.filter((m) => typeof m === 'string') : [] }));
    },
  };
}
