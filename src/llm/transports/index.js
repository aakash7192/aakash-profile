import { LLMError } from '../errors.js';
import { createDirectTransport } from './direct.js';
import { createProxyTransport } from './proxy.js';

/**
 * Pick a transport from settings.
 * @param {{ mode:'direct'|'proxy', getKey?: (id:string)=>string|null|undefined, proxyUrl?: string, proxyToken?: string, baseUrls?: Record<string,string>, fetch?: typeof fetch }} cfg
 * @returns {import('../types.js').Transport}
 */
export function createTransport(cfg = /** @type {any} */ ({})) {
  const { mode = 'direct', getKey, proxyUrl, proxyToken, baseUrls, fetch } = cfg;
  if (mode === 'proxy') {
    if (!proxyUrl || !String(proxyUrl).trim()) throw new LLMError('config', 'Set a proxy URL in Settings');
    return createProxyTransport({ baseUrl: proxyUrl, token: proxyToken || undefined, fetch });
  }
  if (mode !== 'direct') throw new LLMError('config', `Unknown connection mode: ${mode}`);
  return createDirectTransport({ getKey: getKey || (() => undefined), baseUrls, fetch });
}
