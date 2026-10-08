// JSDoc typedefs only (no runtime code).

/** @typedef {{ role: 'user'|'assistant', content: string }} ChatMessage */

/**
 * @typedef {Object} ChatRequest
 * @property {string} provider              registry id: 'anthropic' | 'openai' | 'google' | future
 * @property {string} model                 any string; free-text ids allowed
 * @property {ChatMessage[]} messages        full history; core normalizes/truncates
 * @property {string} [system]
 * @property {number} [temperature]          clamped to caps; dropped if caps.temperature === false
 * @property {number} [maxTokens]            default caps.defaultMaxTokens
 * @property {{ length?: 'brief'|'balanced'|'deep', language?: 'auto'|'en'|'hi'|'hinglish' }} [meta]  forwarded by the proxy transport only
 */

/**
 * @typedef {{ type: 'text', text: string }
 *   | { type: 'done', stopReason: 'end'|'max_tokens'|'safety'|'stop_sequence'|'other',
 *       usage?: { inputTokens?: number, outputTokens?: number }, model?: string }} ChatEvent
 */

/**
 * @typedef {Object} ModelCaps
 * @property {boolean} temperature
 * @property {number} maxTemperature
 * @property {number} defaultMaxTokens
 * @property {number} [thinkingBudget]          Gemini: thinking token budget (added on top of maxTokens)
 * @property {'low'|'medium'|'high'} [effort]    Anthropic: output_config.effort for adaptive-thinking models
 * @property {number} [thinkingAllowance]        Anthropic: extra max_tokens reserved for adaptive thinking
 * @property {boolean} [legacyMaxTokens]
 */

/** @typedef {{ id: string, label: string, note?: string, default?: boolean }} ModelInfo */

/**
 * @typedef {Object} ProviderInfo
 * @property {string} id
 * @property {string} label
 * @property {string} keyHint
 * @property {string} keyUrl
 * @property {string} [docsUrl]
 * @property {boolean} browserOk
 * @property {ModelInfo[]} models
 * @property {string} defaultModel
 */

/**
 * @typedef {Object} Adapter
 * @property {string} id
 * @property {(req: ChatRequest, opts: { apiKey?: string, baseUrl: string, direct?: boolean, caps: ModelCaps, maxOutputTokens?: number }) => { url: string, headers: Record<string,string>, body: string }} buildRequest
 * @property {() => any} createState
 * @property {(ev: { event: string, data: string, id?: string }, state: any) => ChatEvent[]} parseEvent
 * @property {(state: any) => ChatEvent[]} finish
 * @property {(status: number, text: string) => { code: string, message: string }} parseErrorBody
 */

/**
 * @typedef {Object} Transport
 * @property {'direct'|'proxy'} kind
 * @property {(req: ChatRequest, adapter: Adapter, opts: { signal?: AbortSignal, caps: ModelCaps }) => Promise<Response>} open
 * @property {() => Promise<{ id: string, models: string[] }[]>} [listProviders]
 */

export {};
