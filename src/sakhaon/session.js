/* Conversation orchestration on top of chat(): send / stop / retry /
   regenerate / continue. Exactly one stream at a time. */

import { chat, createTransport, defaultModel, getProvider } from '../llm/index.js';
import { buildSystemPrompt, LENGTHS } from './core/persona.js';
import { detectCrisis } from './core/safety.js';
import { uid } from './ui/dom.js';

export const CONTINUE_PROMPT = 'Please continue.';
const TITLE_MAX = 48;

/** The model id that will actually be sent for a provider. */
export function currentModel(settings, providerId = settings.provider) {
  const custom = (settings.customModel?.[providerId] || '').trim();
  return custom || settings.model?.[providerId] || defaultModel(providerId);
}

export function providerLabel(id) {
  try { return getProvider(id).label; } catch { return id; }
}

/** True when a send could reach a model with the current settings. */
export function isConfigured(settings, store) {
  if (settings.mode === 'proxy') return !!(settings.proxyUrl || '').trim();
  return !!store.getKey(settings.provider);
}

export function titleFrom(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1).trimEnd() + '…' : t;
}

/**
 * @param {{ store, emit:(type:string, detail:object)=>void }} deps
 * emit types: 'conv' (structure changed), 'stream-start', 'stream' (text delta), 'stream-end'
 */
export function createSession({ store, emit }) {
  let conv = null;
  let active = null; // { convId, msgId, controller }

  const isStreaming = () => !!active;
  const getConversation = () => conv;
  const streamingMessageId = () => active?.msgId || null;

  function setConversation(c) {
    if (active && (!c || c.id !== active.convId)) stop();
    conv = c;
  }

  function stop() { active?.controller.abort(); }

  function history(c, excludeId) {
    return c.messages
      .filter((m) => m.id !== excludeId)
      .filter((m) => m.content && m.content.trim())
      .filter((m) => !(m.role === 'assistant' && m.meta?.error))
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function send(text) {
    const body = (text || '').trim();
    if (!body || active) return false;
    if (!conv) conv = store.newConversation();
    const user = { id: uid(), role: 'user', content: body, createdAt: Date.now(), meta: {} };
    if (detectCrisis(body)) user.meta.crisis = true;
    conv.messages.push(user);
    if (!conv.title) conv.title = titleFrom(body);
    store.saveConversation(conv);
    emit('conv', { conv, reason: 'send', crisis: !!user.meta.crisis });
    await runAssistant(conv);
    return true;
  }

  async function runAssistant(c, { autoRetried = false } = {}) {
    const s = store.getSettings();
    const p = s.provider;
    const model = currentModel(s, p);
    const msg = {
      id: uid(), role: 'assistant', content: '', createdAt: Date.now(),
      meta: { provider: p, model, pending: true, ...(autoRetried ? { autoRetried: true } : {}) },
    };
    c.messages.push(msg);
    c.provider = p;
    c.model = model;
    const controller = new AbortController();
    active = { convId: c.id, msgId: msg.id, controller };
    const t0 = performance.now();
    let lastSave = Date.now();
    emit('stream-start', { conv: c, msg });

    try {
      const transport = createTransport({
        mode: s.mode,
        getKey: (id) => store.getKey(id),
        proxyUrl: (s.proxyUrl || '').trim(),
        proxyToken: (s.proxyToken || '').trim() || undefined,
      });
      const length = LENGTHS[s.length] ? s.length : 'balanced';
      const req = {
        provider: p,
        model,
        messages: history(c, msg.id),
        system: buildSystemPrompt({ length, language: s.language }),
        temperature: s.temperature,
        maxTokens: LENGTHS[length].maxTokens,
        meta: { length, language: s.language },
      };
      for await (const ev of chat(req, { transport, signal: controller.signal })) {
        if (ev.type === 'text') {
          if (!ev.text) continue;
          msg.content += ev.text;
          if (msg.meta.pending) delete msg.meta.pending;
          emit('stream', { conv: c, msg });
          if (Date.now() - lastSave > 1000) { lastSave = Date.now(); store.saveConversation(c); }
        } else if (ev.type === 'done') {
          msg.meta.stopReason = ev.stopReason;
          if (ev.model) msg.meta.model = ev.model;
          if (ev.usage) msg.meta.usage = ev.usage;
        }
      }
      if (!msg.content.trim()) {
        msg.meta.error = msg.meta.stopReason === 'safety'
          ? { code: 'safety', message: 'The provider returned no text (safety).' }
          : { code: 'stream', message: 'The model returned an empty reply.' };
      }
    } catch (e) {
      const code = (e && e.code) || 'stream';
      if (code === 'aborted') {
        msg.meta.stopped = true;
      } else {
        msg.meta.error = {
          code,
          message: String(e?.message || e || 'Unknown error'),
          ...(e?.retryAfterMs ? { retryAfterMs: e.retryAfterMs } : {}),
          ...(e?.status ? { status: e.status } : {}),
        };
      }
    } finally {
      delete msg.meta.pending;
      msg.meta.ms = Math.round(performance.now() - t0);
      // A stop before any text leaves nothing worth keeping.
      if (msg.meta.stopped && !msg.content.trim()) {
        c.messages = c.messages.filter((m) => m.id !== msg.id);
      }
      if (active?.msgId === msg.id) active = null;
      store.saveConversation(c);
      emit('stream-end', { conv: c, msg });
    }
  }

  function lastAssistant() {
    const last = conv?.messages[conv.messages.length - 1];
    return last && last.role === 'assistant' ? last : null;
  }

  async function regenerate() {
    if (!conv || active) return;
    const last = lastAssistant();
    if (!last) return;
    conv.messages = conv.messages.filter((m) => m.id !== last.id);
    emit('conv', { conv, reason: 'regenerate' });
    await runAssistant(conv);
  }

  async function retry(msgId, { auto = false } = {}) {
    if (!conv || active) return;
    const last = lastAssistant();
    if (!last || (msgId && last.id !== msgId)) return;
    conv.messages = conv.messages.filter((m) => m.id !== last.id);
    emit('conv', { conv, reason: 'retry' });
    await runAssistant(conv, { autoRetried: auto });
  }

  /** Re-run when the last message is a user turn with no reply (e.g. after a reload mid-send). */
  async function replyToLast() {
    if (!conv || active) return;
    const last = conv.messages[conv.messages.length - 1];
    if (last?.role === 'user') await runAssistant(conv);
  }

  const continueReply = () => send(CONTINUE_PROMPT);

  function dismissCrisis(msgId) {
    const m = conv?.messages.find((x) => x.id === msgId);
    if (!m) return;
    m.meta = { ...(m.meta || {}), crisisDismissed: true };
    store.saveConversation(conv, { touch: false });
    emit('conv', { conv, reason: 'crisis-dismiss' });
  }

  return {
    isStreaming, streamingMessageId, getConversation, setConversation,
    send, stop, regenerate, retry, replyToLast, continueReply, dismissCrisis,
  };
}
