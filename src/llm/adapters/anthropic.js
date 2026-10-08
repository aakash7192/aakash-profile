// Anthropic Messages API adapter (pure; no I/O).
import { LLMError, statusToCode } from '../errors.js';

const STOP = { end_turn: 'end', max_tokens: 'max_tokens', stop_sequence: 'stop_sequence', refusal: 'safety' };

const ERR = {
  authentication_error: 'auth',
  permission_error: 'permission',
  not_found_error: 'not_found',
  rate_limit_error: 'rate_limit',
  overloaded_error: 'overloaded',
  invalid_request_error: 'invalid_request',
  api_error: 'server',
  timeout_error: 'server',
  request_too_large: 'context_length',
  billing_error: 'quota',
};

function mapError(type, message, status) {
  const msg = String(message || '');
  if (status === 529 || status === 503) return 'overloaded';
  if (status === 402 || type === 'billing_error' || /billing|credit balance/i.test(msg)) return 'quota';
  if (type === 'invalid_request_error' && /prompt is too long|too many tokens/i.test(msg)) return 'context_length';
  if (type && ERR[type]) return ERR[type];
  return status ? statusToCode(status) : 'stream';
}

/** Apply an optional hard ceiling (e.g. the proxy's MAX_TOKENS_CAP) to the final provider budget. */
function capTotal(n, ceiling) {
  return Number.isFinite(ceiling) && ceiling > 0 ? Math.min(n, Math.floor(ceiling)) : n;
}

function makeDone(state) {
  state.done = true;
  /** @type {any} */
  const ev = { type: 'done', stopReason: state.stopReason || 'other' };
  if (state.usage.inputTokens !== undefined || state.usage.outputTokens !== undefined) ev.usage = { ...state.usage };
  if (state.model) ev.model = state.model;
  return ev;
}

export const anthropicAdapter = {
  id: 'anthropic',

  buildRequest(req, { apiKey, baseUrl, direct = false, caps = {}, maxOutputTokens } = {}) {
    const headers = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (apiKey) headers['x-api-key'] = apiKey;
    if (direct) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    /** @type {any} */
    const body = {
      model: req.model,
      max_tokens: capTotal((req.maxTokens ?? caps.defaultMaxTokens ?? 800) + (caps.thinkingAllowance || 0), maxOutputTokens),
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (req.system) body.system = req.system;
    if (typeof req.temperature === 'number' && caps.temperature !== false) body.temperature = req.temperature;
    if (caps.effort) body.output_config = { effort: caps.effort };
    return { url: `${String(baseUrl).replace(/\/+$/, '')}/v1/messages`, headers, body: JSON.stringify(body) };
  },

  createState() {
    return { done: false, sawText: false, stopReason: null, usage: {}, model: undefined };
  },

  parseEvent(ev, state) {
    if (state.done) return [];
    let j;
    try { j = JSON.parse(ev.data); } catch {
      throw new LLMError('stream', `Malformed stream event: ${String(ev.data).slice(0, 120)}`, { provider: 'anthropic' });
    }
    const type = (j && j.type) || ev.event;
    switch (type) {
      case 'message_start': {
        const u = j.message?.usage;
        if (u && typeof u.input_tokens === 'number') state.usage.inputTokens = u.input_tokens;
        if (j.message?.model) state.model = j.message.model;
        return [];
      }
      case 'content_block_delta': {
        const d = j.delta;
        if (d && d.type === 'text_delta' && typeof d.text === 'string' && d.text) {
          state.sawText = true;
          return [{ type: 'text', text: d.text }];
        }
        return [];
      }
      case 'message_delta': {
        if (j.delta?.stop_reason) state.stopReason = STOP[j.delta.stop_reason] || 'other';
        if (j.usage && typeof j.usage.output_tokens === 'number') state.usage.outputTokens = j.usage.output_tokens;
        return [];
      }
      case 'message_stop':
        return [makeDone(state)];
      case 'error': {
        const e = j.error || {};
        throw new LLMError(mapError(e.type, e.message), e.message || 'Stream error', { provider: 'anthropic', raw: ev.data });
      }
      default:
        return []; // ping, content_block_start/stop, unknown
    }
  },

  finish(state) {
    if (state.done) return [];
    if (!state.sawText && !state.stopReason) {
      throw new LLMError('stream', 'The stream ended before any reply arrived', { provider: 'anthropic' });
    }
    return [makeDone(state)];
  },

  parseErrorBody(status, text) {
    let j;
    try { j = JSON.parse(text); } catch { j = undefined; }
    const e = j && j.error;
    const type = e && e.type;
    const message = (e && e.message) || undefined;
    return { code: mapError(type, message, status), message: message || `HTTP ${status}` };
  },
};

export default anthropicAdapter;
