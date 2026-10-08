// Public API of the provider layer. The UI imports only from here.
export { chat, collectText, testConnection } from './core.js';
export { LLMError, ERROR_CODES } from './errors.js';
export { PROVIDERS, listProviders, getProvider, resolveModel, defaultModel } from './registry.js';
export { createDirectTransport } from './transports/direct.js';
export { createProxyTransport } from './transports/proxy.js';
export { createTransport } from './transports/index.js';
