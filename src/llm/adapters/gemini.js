// Google Gemini (Generative Language API) adapter (pure; no I/O).
// The API key always travels in the x-goog-api-key header, never in the URL.
import { LLMError, statusToCode } from '../errors.js';

const SAFETY = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);

function mapFinish(r) {
  if (r === 'STOP') return 'end';
  if (r === 'MAX_TOKENS') return 'max_tokens';
  if (SAFETY.has(r)) return 'safety';
  return 'other';
}

function mapError(status, e) {
  const st = e && e.status;
  const msg = String((e && e.message) || '');
  switch (st) {
    case 'UNAUTHENTICATED': return 'auth';
    case 'PERMISSION_DENIED': return /api key/i.test(msg) ? 'auth' : 'permission';
    case 'INVALID_ARGUMENT':
    case 'FAILED_PRECONDITION':
      if (/api key/i.test(msg)) return 'auth';
      if (/token count|too long|exceeds the maximum/i.test(msg)) return 'context_length';
      return 'invalid_request';
    case 'RESOURCE_EXHAUSTED': return /quota|billing/i.test(msg) ? 'quota' : 'rate_limit';
    case 'NOT_FOUND': return 'not_found';
    case 'UNAVAILABLE': return 'overloaded';
    case 'INTERNAL': return 'server';
    case 'DEADLINE_EXCEEDED': return 'server';
    default: return status ? statusToCode(status) : 'stream';
  }
}

function modelPath(model) {
  return encodeURIComponent(String(model).replace(/^models\//, ''));
}

function makeDone(state) {
  state.done = true;
  /** @type {any} */
  const ev = { type: 'done', stopReason: state.stopReason || 'other' };
  if (state.usage.inputTokens !== undefined || state.usage.outputTokens !== undefined) ev.usage = { ...state.usage };
  if (state.model) ev.model = state.model;
  return ev;
}

export const geminiAdapter = {
  id: 'google',

  buildRequest(req, { apiKey, baseUrl, caps = {}, maxOutputTokens } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (apiKey) headers['x-goog-api-key'] = apiKey;
    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const max = req.maxTokens ?? caps.defaultMaxTokens ?? 800;
    const budget = caps.thinkingBudget;
    /** @type {any} */
    let total = max + (typeof budget === 'number' ? budget : 1024);
    // Optional hard ceiling (the proxy's MAX_TOKENS_CAP) applies to the whole provider budget, thinking included.
    if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) total = Math.min(total, Math.floor(maxOutputTokens));
    const generationConfig = { maxOutputTokens: total };
    if (typeof req.temperature === 'number' && caps.temperature !== false) generationConfig.temperature = req.temperature;
    if (typeof budget === 'number') generationConfig.thinkingConfig = { thinkingBudget: budget };
    /** @type {any} */
    const body = { contents };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    body.generationConfig = generationConfig;
    const base = String(baseUrl).replace(/\/+$/, '');
    return {
      url: `${base}/v1beta/models/${modelPath(req.model)}:streamGenerateContent?alt=sse`,
      headers,
      body: JSON.stringify(body),
    };
  },

  createState() {
    return { done: false, terminal: false, sawText: false, stopReason: null, usage: {}, model: undefined };
  },

  parseEvent(ev, state) {
    if (state.done) return [];
    let j;
    try { j = JSON.parse(ev.data); } catch {
      throw new LLMError('stream', `Malformed stream chunk: ${String(ev.data).slice(0, 120)}`, { provider: 'google' });
    }
    if (Array.isArray(j)) j = j[0] || {};
    if (j && j.error) {
      throw new LLMError(mapError(j.error.code || 0, j.error), j.error.message || 'Stream error', { provider: 'google', raw: ev.data });
    }
    if (j.promptFeedback && j.promptFeedback.blockReason) {
      throw new LLMError('safety', `Prompt blocked: ${j.promptFeedback.blockReason}`, { provider: 'google', raw: ev.data });
    }
    if (j.modelVersion) state.model = j.modelVersion;
    const u = j.usageMetadata;
    if (u) { // cumulative: overwrite
      if (typeof u.promptTokenCount === 'number') state.usage.inputTokens = u.promptTokenCount;
      if (typeof u.candidatesTokenCount === 'number') state.usage.outputTokens = u.candidatesTokenCount;
    }
    const out = [];
    const cand = Array.isArray(j.candidates) ? j.candidates[0] : undefined;
    if (cand) {
      const parts = (cand.content && cand.content.parts) || [];
      for (const p of parts) {
        if (p && !p.thought && typeof p.text === 'string' && p.text) {
          state.sawText = true;
          out.push({ type: 'text', text: p.text });
        }
      }
      if (cand.finishReason) {
        state.terminal = true;
        state.stopReason = mapFinish(cand.finishReason);
      }
    }
    return out;
  },

  finish(state) {
    if (state.done) return [];
    if (!state.terminal && !state.sawText) {
      throw new LLMError('stream', 'The stream ended before any reply arrived', { provider: 'google' });
    }
    return [makeDone(state)];
  },

  parseErrorBody(status, text) {
    let j;
    try { j = JSON.parse(text); } catch { j = undefined; }
    if (Array.isArray(j)) j = j[0];
    const e = j && typeof j.error === 'object' ? j.error : undefined;
    return { code: mapError(status, e), message: (e && e.message) || `HTTP ${status}` };
  },
};

export default geminiAdapter;
