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
      freeze({ id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'most capable · pricier' }),
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
    // Current GPT-6 family (checked 2026-10); older ids still work via the custom model field.
    models: freeze([
      freeze({ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', note: 'balanced', default: true }),
      freeze({ id: 'gpt-6-astra', label: 'GPT-6 Astra', note: 'deepest' }),
      freeze({ id: 'gpt-6-luna', label: 'GPT-6 Luna', note: 'fastest' }),
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
    // Current Gemini lineup (checked 2026-10; the 2.5 family retires 2026-10-20). 3.1 Pro is still a preview.
    models: freeze([
      freeze({ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'balanced', default: true }),
      freeze({ id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', note: 'deepest' }),
      freeze({ id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'fastest' }),
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
    if (!caps.temperature) {
      // Reasoning models take instructions as a `developer` message, spend max_completion_tokens on
      // reasoning too, and accept reasoning_effort "low" on every current id (Astra has no "none").
      caps.developerRole = true;
      caps.effort = 'low';
      caps.thinkingAllowance = 1024;
    }
  } else if (providerId === 'google') {
    caps.maxTemperature = 2;
    if (/^(models\/)?gemini-([3-9]|\d{2,})/i.test(mid)) {
      // Gemini 3+: thinking is set by level (MINIMAL is rejected on 3.8 Flash / 3.1 Pro) and sampling
      // params are ignored; Google advises leaving temperature at its default.
      caps.temperature = false;
      caps.thinkingLevel = 'low';
    } else if (/pro/i.test(mid)) caps.thinkingBudget = 512;
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
