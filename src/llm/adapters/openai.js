// OpenAI Chat Completions adapter (pure; no I/O).
// Chat Completions is the interoperable protocol, so OpenAI-compatible providers
// (OpenRouter, Groq, Ollama, ...) can reuse this adapter with a different baseUrl.
import { LLMError, statusToCode } from '../errors.js';

const STOP = { stop: 'end', length: 'max_tokens', content_filter: 'safety' };

function mapError(status, e) {
  const code = e && e.code;
  const type = e && e.type;
  const msg = String((e && e.message) || '');
  if (code === 'insufficient_quota' || type === 'insufficient_quota' || /billing|quota/i.test(code || '')) return 'quota';
  if (code === 'invalid_api_key' || status === 401) return 'auth';
  if (code === 'context_length_exceeded' || /maximum context length/i.test(msg)) return 'context_length';
  if (code === 'model_not_found' || status === 404) return 'not_found';
  if (status === 403) return 'permission';
  if (status === 429 || code === 'rate_limit_exceeded' || type === 'rate_limit_error') return 'rate_limit';
  if (status === 503 || status === 529) return 'overloaded';
  if (status >= 500 || type === 'server_error') return 'server';
  if (status >= 400 || type === 'invalid_request_error') return 'invalid_request';
  return status ? statusToCode(status) : 'stream';
}

function makeDone(state) {
  state.done = true;
  /** @type {any} */
  const ev = { type: 'done', stopReason: state.stopReason || (state.terminal ? 'end' : 'other') };
  if (state.usage.inputTokens !== undefined || state.usage.outputTokens !== undefined) ev.usage = { ...state.usage };
  if (state.model) ev.model = state.model;
  return ev;
}

export const openaiAdapter = {
  id: 'openai',

  buildRequest(req, { apiKey, baseUrl, caps = {}, maxOutputTokens } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const messages = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    for (const m of req.messages) messages.push({ role: m.role, content: m.content });
    /** @type {any} */
    const body = {
      model: req.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };
    let max = req.maxTokens ?? caps.defaultMaxTokens ?? 800;
    if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) max = Math.min(max, Math.floor(maxOutputTokens));
    if (caps.legacyMaxTokens) body.max_tokens = max;
    else body.max_completion_tokens = max;
    if (typeof req.temperature === 'number' && caps.temperature !== false) body.temperature = req.temperature;
    return { url: `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, headers, body: JSON.stringify(body) };
  },

  createState() {
    return { done: false, terminal: false, sawText: false, stopReason: null, usage: {}, model: undefined };
  },

  parseEvent(ev, state) {
    if (state.done) return [];
    const data = String(ev.data).trim();
    if (data === '[DONE]') {
      state.terminal = true;
      return [makeDone(state)];
    }
    let j;
    try { j = JSON.parse(data); } catch {
      throw new LLMError('stream', `Malformed stream chunk: ${data.slice(0, 120)}`, { provider: 'openai' });
    }
    if (j && j.error) {
      const e = j.error;
      throw new LLMError(mapError(0, e), e.message || 'Stream error', { provider: 'openai', raw: data });
    }
    if (j.model) state.model = j.model;
    if (j.usage) {
      if (typeof j.usage.prompt_tokens === 'number') state.usage.inputTokens = j.usage.prompt_tokens;
      if (typeof j.usage.completion_tokens === 'number') state.usage.outputTokens = j.usage.completion_tokens;
    }
    const out = [];
    const ch = Array.isArray(j.choices) ? j.choices[0] : undefined;
    if (ch) {
      const t = ch.delta && ch.delta.content;
      if (typeof t === 'string' && t) {
        state.sawText = true;
        out.push({ type: 'text', text: t });
      }
      if (ch.finish_reason) state.stopReason = STOP[ch.finish_reason] || 'other';
    }
    return out;
  },

  finish(state) {
    if (state.done) return [];
    if (!state.sawText && !state.stopReason) {
      throw new LLMError('stream', 'The stream ended before any reply arrived', { provider: 'openai' });
    }
    return [makeDone(state)];
  },

  parseErrorBody(status, text) {
    let j;
    try { j = JSON.parse(text); } catch { j = undefined; }
    const e = j && typeof j.error === 'object' ? j.error : undefined;
    return { code: mapError(status, e), message: (e && e.message) || `HTTP ${status}` };
  },
};

export default openaiAdapter;
