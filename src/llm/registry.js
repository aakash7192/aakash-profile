// Provider registry: the ONLY place model ids appear in the codebase.
// Adding a provider = one row here (+ an adapter if it speaks a new protocol).
import { LLMError } from './errors.js';
import { anthropicAdapter } from './adapters/anthropic.js';
import { openaiAdapter } from './adapters/openai.js';
import { geminiAdapter } from './adapters/gemini.js';

/**
 * @typedef {import('./types.js').ModelCaps} ModelCaps
 * @typedef {import('./types.js').ModelInfo} ModelInfo
 * @typedef {import('./types.js').ProviderInfo} ProviderInfo
 */

const freeze = (o) => Object.freeze(o);

export const PROVIDERS = freeze({
  anthropic: freeze({
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    browserOk: true,
    keyHint: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/en/api/messages',
    keyEnv: 'ANTHROPIC_API_KEY',
    adapter: anthropicAdapter,
    models: freeze([
      freeze({ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'balanced', default: true }),
      freeze({ id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'deepest' }),
      freeze({ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'fastest' }),
    ]),
  }),
  openai: freeze({
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    browserOk: true,
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    keyEnv: 'OPENAI_API_KEY',
    adapter: openaiAdapter,
    // verify against provider model list
    models: freeze([
      freeze({ id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'balanced', default: true }),
      freeze({ id: 'gpt-5', label: 'GPT-5', note: 'deepest' }),
      freeze({ id: 'gpt-4.1', label: 'GPT-4.1', note: 'classic' }),
    ]),
  }),
  google: freeze({
    id: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    browserOk: true,
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/api/generate-content',
    keyEnv: 'GEMINI_API_KEY',
    adapter: geminiAdapter,
    // verify against provider model list
    models: freeze([
      freeze({ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'balanced', default: true }),
      freeze({ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'deepest' }),
      freeze({ id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', note: 'fastest' }),
    ]),
  }),
  // Example of a future OpenAI-compatible provider (one row, reuses openaiAdapter):
  // openrouter: freeze({
  //   id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', browserOk: true,
  //   keyHint: 'sk-or-…', keyUrl: 'https://openrouter.ai/keys', keyEnv: 'OPENROUTER_API_KEY',
  //   adapter: openaiAdapter,
  //   models: freeze([freeze({ id: '<vendor>/<model>', label: '…', default: true })]),
  // }),
});

/** Internal: full registry entry (with adapter). Throws LLMError('config') if unknown. */
export function getProviderEntry(id) {
  const p = typeof id === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id] : undefined;
  if (!p) throw new LLMError('config', `Unknown provider: ${id}`);
  return p;
}

function toInfo(p) {
  /** @type {ProviderInfo} */
  const info = {
    id: p.id,
    label: p.label,
    keyHint: p.keyHint,
    keyUrl: p.keyUrl,
    browserOk: p.browserOk,
    models: p.models.map((m) => ({ ...m })),
    defaultModel: defaultModel(p.id),
  };
  if (p.docsUrl) info.docsUrl = p.docsUrl;
  return info;
}

/** @returns {ProviderInfo[]} UI-safe provider list, ordered anthropic, openai, google. */
export function listProviders() {
  return Object.values(PROVIDERS).map(toInfo);
}

/** @returns {ProviderInfo} */
export function getProvider(id) {
  return toInfo(getProviderEntry(id));
}

export function defaultModel(providerId) {
  const p = getProviderEntry(providerId);
  const d = p.models.find((m) => m.default) || p.models[0];
  return d.id;
}

/**
 * Capability heuristics for any model id (known or custom).
 * @returns {ModelCaps}
 */
export function inferCaps(providerId, id) {
  /** @type {ModelCaps} */
  const caps = { temperature: true, maxTemperature: 1, defaultMaxTokens: 800 };
  const mid = String(id || '');
  if (providerId === 'anthropic') {
    caps.maxTemperature = 1;
    // Current-generation Claude models reject `temperature` (Opus 5.5 / Opus 5 / Opus 4.7-4.8 / Fable / Mythos:
    // removed; Sonnet 5.5 / Haiku 5.5: any non-default value is a 400). They also run adaptive thinking,
    // which spends max_tokens, so we pin a low effort for chat and reserve a thinking allowance on top of
    // the visible-reply budget. Older ids (4.6 and earlier) keep temperature and get neither field.
    if (/^claude-(opus|sonnet|haiku|fable|mythos)-5(?!\d)/i.test(mid) || /^claude-opus-4-[78](?!\d)/i.test(mid)) {
      caps.temperature = false;
      caps.effort = 'low';
      caps.thinkingAllowance = 2048;
    }
  } else if (providerId === 'openai') {
    caps.maxTemperature = 2;
    // Reasoning models (o-series, gpt-5 and later, codex) reject any temperature but the default 1.
    // Allowlist the classic families that do accept it, so new, fine-tuned (`ft:…`) or prefixed
    // (`openai/…`) reasoning ids never get a 400.
    caps.temperature = /(^|[:/])(gpt-4|gpt-3\.5|chatgpt-4o)/i.test(mid);
  } else if (providerId === 'google') {
    caps.maxTemperature = 2;
    if (/pro/i.test(mid)) caps.thinkingBudget = 512;
    else if (/flash/i.test(mid)) caps.thinkingBudget = 0;
  }
  return caps;
}

/**
 * @returns {{ id:string, label:string, caps:ModelCaps, known:boolean }}
 */
export function resolveModel(providerId, modelId) {
  const p = getProviderEntry(providerId);
  const wanted = typeof modelId === 'string' ? modelId.trim() : '';
  const id = wanted || defaultModel(providerId);
  const found = p.models.find((m) => m.id === id);
  return {
    id,
    label: found ? found.label : id,
    caps: inferCaps(providerId, id),
    known: !!found,
  };
}
