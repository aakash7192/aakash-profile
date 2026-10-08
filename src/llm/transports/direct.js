// Direct (BYOK) transport: the browser calls the provider with the user's own key.
import { LLMError } from '../errors.js';
import { getProviderEntry } from '../registry.js';

/**
 * @param {{ getKey: (providerId:string) => string|null|undefined, baseUrls?: Record<string,string>, fetch?: typeof fetch }} cfg
 * @returns {import('../types.js').Transport}
 */
export function createDirectTransport({ getKey, baseUrls = {}, fetch: fetchImpl } = /** @type {any} */ ({})) {
  return {
    kind: 'direct',
    async open(req, adapter, { signal, caps } = {}) {
      const entry = getProviderEntry(req.provider);
      let key;
      try { key = typeof getKey === 'function' ? getKey(req.provider) : undefined; } catch { key = undefined; }
      key = typeof key === 'string' ? key.trim() : '';
      if (!key) throw new LLMError('config', `Add your ${entry.label} API key in Settings`, { provider: req.provider });
      const ad = adapter || entry.adapter;
      const baseUrl = baseUrls[req.provider] ?? entry.baseUrl;
      const { url, headers, body } = ad.buildRequest(req, { apiKey: key, baseUrl, direct: true, caps });
      const f = fetchImpl || globalThis.fetch;
      return f(url, { method: 'POST', headers, body, signal });
    },
  };
}
