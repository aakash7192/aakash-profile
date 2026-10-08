/* Persistence: settings, API keys, conversations, drafts.
   Every storage access is wrapped; when storage is unavailable we fall back
   to memory and report `persistent === false` so the UI can say so. */

import { APP } from './core/app.js';
import { listProviders } from '../llm/index.js';
import { LENGTHS, LANGUAGES } from './core/persona.js';
import { uid } from './ui/dom.js';

const P = APP.storagePrefix;
const K = {
  settings: `${P}.settings`,
  keys: `${P}.keys`,
  index: `${P}.conversations`,
  conv: (id) => `${P}.conv.${id}`,
  draft: (id) => `${P}.draft.${id}`,
};

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

function probe(kind) {
  try {
    const s = globalThis[kind];
    if (!s) return null;
    const k = `${P}.__probe`;
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch { return null; }
}

function isQuota(e) {
  return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}

function envProxyUrl() {
  try { return (import.meta.env && import.meta.env.VITE_SAKHAON_PROXY_URL) || ''; } catch { return ''; }
}

export function defaultSettings() {
  const providers = listProviders();
  const proxyUrl = envProxyUrl();
  return {
    provider: providers[0]?.id || 'anthropic',
    mode: proxyUrl ? 'proxy' : 'direct',
    model: Object.fromEntries(providers.map((p) => [p.id, p.defaultModel])),
    customModel: {},
    proxyUrl,
    proxyToken: '',
    length: 'balanced',
    temperature: 0.7,
    language: 'auto',
    showHindi: false,
    remember: true,
  };
}

export function createStore({ onQuota } = {}) {
  const local = probe('localStorage');
  const session = probe('sessionStorage');
  const mem = memStorage();
  const L = local || mem;
  const S = session || mem;
  const persistent = !!local;

  const read = (st, key, fallback) => {
    try {
      const v = st.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  };
  const write = (st, key, val) => {
    try { st.setItem(key, JSON.stringify(val)); return true; } catch (e) {
      if (isQuota(e)) onQuota?.();
      return false;
    }
  };
  const remove = (st, key) => { try { st.removeItem(key); } catch { /* ignore */ } };

  /* ── settings ── */
  let settings = loadSettings();

  function loadSettings() {
    const d = defaultSettings();
    const saved = read(L, K.settings, null) || {};
    const s = { ...d, ...saved, model: { ...d.model, ...(saved.model || {}) }, customModel: { ...(saved.customModel || {}) } };
    const providers = listProviders();
    const ids = providers.map((p) => p.id);
    if (!ids.includes(s.provider)) s.provider = d.provider;
    // A saved pick that has left the model list (e.g. a retired model) falls back to the default;
    // ids typed by hand live in customModel and are kept.
    for (const p of providers) {
      if (!p.models.some((m) => m.id === s.model[p.id])) s.model[p.id] = p.defaultModel;
    }
    if (s.mode !== 'direct' && s.mode !== 'proxy') s.mode = d.mode;
    if (!LENGTHS[s.length]) s.length = 'balanced';
    if (!LANGUAGES.includes(s.language)) s.language = 'auto';
    const t = Number(s.temperature);
    s.temperature = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.7;
    s.remember = s.remember !== false;
    s.showHindi = !!s.showHindi;
    return s;
  }

  function getSettings() { return settings; }

  function updateSettings(patch) {
    const prevRemember = settings.remember;
    settings = { ...settings, ...patch };
    if (patch.model) settings.model = { ...patch.model };
    if (patch.customModel) settings.customModel = { ...patch.customModel };
    write(L, K.settings, settings);
    if (prevRemember !== settings.remember) migrateKeys(settings.remember);
    return settings;
  }

  /* ── keys (never exported) ── */
  function readKeys(st) { const k = read(st, K.keys, {}); return k && typeof k === 'object' ? k : {}; }

  function getKey(providerId) {
    const v = readKeys(settings.remember ? L : S)[providerId] || readKeys(settings.remember ? S : L)[providerId];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  }

  function setKey(providerId, key) {
    const target = settings.remember ? L : S;
    const other = settings.remember ? S : L;
    const keys = readKeys(target);
    if (key && key.trim()) keys[providerId] = key.trim(); else delete keys[providerId];
    write(target, K.keys, keys);
    const o = readKeys(other);
    if (providerId in o) { delete o[providerId]; write(other, K.keys, o); }
  }

  function removeKey(providerId) { setKey(providerId, ''); }

  function migrateKeys(remember) {
    const from = remember ? S : L;
    const to = remember ? L : S;
    const merged = { ...readKeys(to), ...readKeys(from) };
    write(to, K.keys, merged);
    remove(from, K.keys);
  }

  function clearKeys() { remove(L, K.keys); remove(S, K.keys); }

  /* ── conversations ── */
  function listConversations() {
    const idx = read(L, K.index, []);
    return Array.isArray(idx) ? idx.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : [];
  }

  function getConversation(id) {
    const c = read(L, K.conv(id), null);
    if (!c || !Array.isArray(c.messages)) return null;
    return c;
  }

  function newConversation() {
    const now = Date.now();
    return { id: uid(), title: '', createdAt: now, updatedAt: now, provider: settings.provider, model: '', messages: [] };
  }

  function indexEntry(c) {
    const first = c.messages.find((m) => m.role === 'user');
    return {
      id: c.id, title: c.title || 'Untitled', createdAt: c.createdAt, updatedAt: c.updatedAt,
      provider: c.provider, model: c.model, topic: c.topic,
      preview: first ? first.content.slice(0, 160) : '',
    };
  }

  function saveConversation(c, { touch = true } = {}) {
    if (!c || !c.messages.length) return false;
    if (touch) c.updatedAt = Date.now();
    // Never persist transient fields.
    const clean = { ...c, messages: c.messages.map((m) => ({ ...m, meta: m.meta ? stripTransient(m.meta) : undefined })) };
    const ok = write(L, K.conv(c.id), clean);
    const idx = listConversations().filter((e) => e.id !== c.id);
    idx.unshift(indexEntry(c));
    write(L, K.index, idx);
    return ok;
  }

  function stripTransient(meta) {
    const { pending, retryAt, ...rest } = meta;
    return rest;
  }

  function renameConversation(id, title) {
    const c = getConversation(id);
    if (!c) return null;
    c.title = title.trim().slice(0, 80) || c.title;
    saveConversation(c, { touch: false });
    return c;
  }

  function deleteConversation(id) {
    const c = getConversation(id);
    remove(L, K.conv(id));
    remove(L, K.draft(id));
    write(L, K.index, listConversations().filter((e) => e.id !== id));
    return c;
  }

  function restoreConversation(c) { if (c) saveConversation(c, { touch: false }); }

  function clearConversations() {
    for (const e of listConversations()) { remove(L, K.conv(e.id)); remove(L, K.draft(e.id)); }
    remove(L, K.index);
  }

  function exportAll() {
    const { proxyToken, ...safeSettings } = settings;
    return {
      app: APP.product,
      version: APP.version,
      exportedAt: new Date().toISOString(),
      note: 'API keys and proxy tokens are never included in exports.',
      settings: safeSettings,
      conversations: listConversations().map((e) => getConversation(e.id)).filter(Boolean),
    };
  }

  /* ── drafts ── */
  function getDraft(id) { const v = read(L, K.draft(id || 'home'), ''); return typeof v === 'string' ? v : ''; }
  function setDraft(id, text) {
    const key = K.draft(id || 'home');
    if (text && text.trim()) write(L, key, text); else remove(L, key);
  }

  return {
    persistent,
    getSettings, updateSettings,
    getKey, setKey, removeKey, clearKeys,
    listConversations, getConversation, newConversation, saveConversation,
    renameConversation, deleteConversation, restoreConversation, clearConversations, exportAll,
    getDraft, setDraft,
  };
}
