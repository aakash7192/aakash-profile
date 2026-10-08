/* Sakhaon — bootstrap, routing and wiring. */

import './sakhaon.css';
import { APP } from './core/app.js';
import { plainText } from './core/reply.js';
import { createStore } from './store.js';
import { detectCrisis } from './core/safety.js';
import { createSession, currentModel, isConfigured, providerLabel, CONTINUE_PROMPT } from './session.js';
import { h, clear, copyText, downloadJson, openLayer, closeTopLayer, hasOpenLayer, rafThrottle } from './ui/dom.js';
import { createTopbar } from './ui/topbar.js';
import { renderHero } from './ui/hero.js';
import { createThread } from './ui/thread.js';
import { createComposer } from './ui/composer.js';
import { createHistory } from './ui/history.js';
import { createSettings } from './ui/settings.js';
import { renderKeySetup } from './ui/keysetup.js';
import { createCrisisSheet } from './ui/crisis.js';
import { createToastRegion, toast } from './ui/toast.js';
import { errorCopy } from './ui/errors.js';

const WIDE = matchMedia('(min-width: 900px)');

/* ── state ──────────────────────────────────────────────────────────────── */

const store = createStore({
  onQuota: () => toast('Storage full — export or delete old chats.', { tone: 'warn', timeout: 6000 }),
});
const session = createSession({ store, emit: onSessionEvent });
let pending = null;          // { type:'send', text } | { type:'retry', msgId, auto } | { type:'reply' }
let closeSettings = null;
let closeCrisis = null;
let closeDrawer = null;

/* ── DOM ────────────────────────────────────────────────────────────────── */

const root = document.getElementById('app');
clear(root);
root.classList.add('s-app');
root.removeAttribute('aria-busy');

const scroller = h('main', { class: 's-scroll', id: 's-main', tabindex: '-1' });
const col = h('div', { class: 's-col' });
scroller.append(col);
const thread = createThread({ scroller });
const keySlot = h('div', { class: 's-keyslot' });
const announcer = h('div', { class: 's-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
const storageBanner = h('div', { class: 's-banner', role: 'status', hidden: store.persistent, text: "History won't be saved in this window." });
const scrim = h('div', { class: 's-scrim', 'aria-hidden': 'true', onclick: () => closeTopLayer() });

const topbar = createTopbar({
  onMenu: openDrawer,
  onHome: newChat,
  onBadge: openSettings,
  onHelp: openCrisis,
  onNew: newChat,
  onSettings: openSettings,
});

const composer = createComposer({
  onSend: (text) => sendText(text, { fromComposer: true }),
  onStop: () => session.stop(),
  onDraft: (text) => store.setDraft(session.getConversation()?.id || null, text),
});

const hist = createHistory({
  store,
  onOpen: (id) => { closeDrawer?.(); go(`#/c/${encodeURIComponent(id)}`); },
  onNew: () => { closeDrawer?.(); newChat(); },
  onDelete: deleteConversation,
  onRename: (id, title) => {
    store.renameConversation(id, title);
    const c = session.getConversation();
    if (c?.id === id) c.title = title;
    hist.render(c?.id || null);
  },
  onExport: exportAll,
  onClearAll: clearHistory,
  onClose: () => closeDrawer?.(),
});

const settings = createSettings({
  store,
  onChange: () => { updateTopbar(); if (!session.getConversation()?.messages.length) renderMain(); },
  onClose: () => closeSettings?.(),
  onExport: exportAll,
  onClearHistory: clearHistory,
  onClearKeys: () => {
    if (!confirm('Remove all saved API keys from this browser?')) return;
    store.clearKeys();
    updateTopbar();
    toast('Keys cleared');
  },
  toast: (t) => toast(t, { timeout: 1600 }),
});

const crisisSheet = createCrisisSheet({ onClose: () => closeCrisis?.() });

root.append(
  hist.el,
  h('div', { class: 's-shell' },
    topbar.el,
    storageBanner,
    scroller,
    h('div', { class: 's-dock' },
      h('div', { class: 's-dock__inner' }, thread.pill, keySlot, composer.el)),
  ),
  scrim,
  settings.el,
  crisisSheet,
  createToastRegion(),
  announcer,
);

/* ── rendering ─────────────────────────────────────────────────────────── */

function announce(text) {
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = text; });
}

function threadCtx() {
  return {
    streamingId: session.streamingMessageId(),
    settings: store.getSettings(),
    providerLabel,
    onCopy: copy,
    onRegenerate: () => guarded({ type: 'regenerate' }),
    onRetry: (msg, opts = {}) => guarded({ type: 'retry', msgId: msg.id, auto: !!opts.auto }),
    onContinue: () => sendText(CONTINUE_PROMPT),
    onAction: (a) => {
      if (a === 'settings') openSettings();
      else if (a === 'new') newChat();
      else if (a === 'continue') sendText(CONTINUE_PROMPT);
    },
    onAskVerse: (v) => {
      // Never silently overwrite a draft: append the verse question after what is already typed.
      const ask = `Tell me more about BG ${v.id} — how could it apply to my situation?`;
      const draft = composer.getValue().trim();
      const next = draft ? `${draft}\n\n${ask}` : ask;
      composer.setValue(next, { focus: true });
      store.setDraft(session.getConversation()?.id || null, next);
    },
    onDismissCrisis: (id) => session.dismissCrisis(id),
    onReplyToLast: () => guarded({ type: 'reply' }),
  };
}

function updateTopbar() {
  const s = store.getSettings();
  topbar.update({
    providerId: s.provider,
    providerLabel: providerLabel(s.provider),
    model: currentModel(s),
    configured: isConfigured(s, store),
  });
}

function renderMain({ forceBottom = false } = {}) {
  const conv = session.getConversation();
  const s = store.getSettings();
  const home = !conv || !conv.messages.length;
  root.classList.toggle('is-home', home);
  if (home) {
    clear(col);
    col.append(renderHero({
      settings: s,
      configured: isConfigured(s, store),
      recent: store.listConversations().slice(0, 3),
      onStarter: (st) => { sendText(st.prompt); rescueFocus(); },
      onReflect: (v) => { sendText(`Help me reflect on BG ${v.id} in my life.`); rescueFocus(); },
      onCopy: copy,
      onSetup: openSettings,
    }));
    thread.pill.hidden = true;
  } else {
    if (thread.el.parentNode !== col) { clear(col); col.append(thread.el); }
    thread.render(conv, threadCtx(), { forceBottom });
  }
  hist.render(conv?.id || null);
  updateTopbar();
}

const renderStreaming = rafThrottle((msg) => {
  const conv = session.getConversation();
  if (!conv || !conv.messages.includes(msg) || session.streamingMessageId() !== msg.id) return;
  thread.updateStreaming(msg, threadCtx());
});

/* ── session events ───────────────────────────────────────────────────── */

function onSessionEvent(type, detail) {
  const current = session.getConversation();
  const isCurrent = current && detail.conv && current.id === detail.conv.id;
  switch (type) {
    case 'conv':
      if (detail.reason === 'send' && isCurrent) {
        const want = `#/c/${encodeURIComponent(current.id)}`;
        if (location.hash !== want) history.pushState(null, '', want);
        if (detail.crisis) announce('You matter. Support helplines are shown in the conversation.');
      }
      if (isCurrent) renderMain({ forceBottom: detail.reason === 'send' });
      break;
    case 'stream-start':
      composer.setStreaming(true);
      if (isCurrent) renderMain({ forceBottom: true });
      announce(`${APP.persona} is replying`);
      break;
    case 'stream':
      if (isCurrent) renderStreaming(detail.msg);
      break;
    case 'stream-end': {
      composer.setStreaming(false);
      if (isCurrent) renderMain();
      else hist.render(current?.id || null);
      const m = detail.msg;
      if (m.meta?.error) announce(errorCopy(m.meta.error, { providerLabel: providerLabel(m.meta.provider) }).text);
      else if (m.content) announce(`${APP.persona}: ${plainText(m.content)}${m.meta?.stopped ? ' (stopped)' : ''}`);
      break;
    }
    default:
  }
}

/* ── actions ───────────────────────────────────────────────────────────── */

/**
 * Send text from any source. Only text that came from the composer clears the composer and its saved
 * draft; starters, verse prompts, Continue and pending sends leave whatever the user is typing alone.
 */
function sendText(text, { fromComposer = false } = {}) {
  const body = (text || '').trim();
  if (!body || session.isStreaming()) return;
  // Safety first: a crisis message must surface helplines even when we cannot send it
  // (offline, or no model connected yet). session.send() handles the online, configured path.
  const crisis = detectCrisis(body);
  const offline = !navigator.onLine;
  const configured = isConfigured(store.getSettings(), store);
  if (crisis && (offline || !configured)) {
    announce('You matter. Support helplines are shown now.');
  }
  if (offline) {
    toast(fromComposer ? "You're offline — your message is kept in the box." : "You're offline — try again when you're back online.");
    if (crisis) openCrisis();
    return;
  }
  if (!configured) {
    pending = { type: 'send', text: body, fromComposer };
    showKeySetup();
    if (crisis) openCrisis();
    return;
  }
  hideKeySetup();
  if (fromComposer) composer.clear();
  session.send(body).then(() => {
    if (fromComposer) store.setDraft(session.getConversation()?.id || null, composer.getValue());
  });
}

/** After a control that triggered a re-render is gone, keep focus in the app instead of <body>. */
function rescueFocus(target) {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  (target || scroller).focus({ preventScroll: true });
}

function guarded(action) {
  if (session.isStreaming()) return;
  if (!isConfigured(store.getSettings(), store)) {
    pending = action;
    showKeySetup();
    return;
  }
  runAction(action);
}

function runAction(action) {
  if (!action) return;
  if (action.type === 'send') sendText(action.text, { fromComposer: !!action.fromComposer });
  else if (action.type === 'retry') session.retry(action.msgId, { auto: action.auto });
  else if (action.type === 'regenerate') session.regenerate();
  else if (action.type === 'reply') session.replyToLast();
}

function showKeySetup() {
  clear(keySlot);
  keySlot.append(renderKeySetup({
    settings: store.getSettings(),
    hasKey: (id) => !!store.getKey(id),
    onSave: ({ provider, key, remember, proxyUrl, proxyToken }) => {
      if (key) {
        store.updateSettings({ provider, remember });
        store.setKey(provider, key);
      } else {
        store.updateSettings({ provider, proxyUrl, proxyToken });
      }
      updateTopbar();
      hideKeySetup();
      toast('Connected. Sending…', { timeout: 1600 });
      const next = pending;
      pending = null;
      runAction(next);
      composer.focus();
    },
    onCancel: () => { pending = null; hideKeySetup(); composer.focus(); },
    onOpenSettings: openSettings,
  }));
  keySlot.hidden = false;
}

function hideKeySetup() { clear(keySlot); keySlot.hidden = true; }

/** If the user connected through Settings ("More options") while a message was waiting, send it now. */
function reconcilePending() {
  if (keySlot.hidden || !isConfigured(store.getSettings(), store)) return;
  hideKeySetup();
  const next = pending;
  pending = null;
  if (next) {
    toast('Connected. Sending…', { timeout: 1600 });
    runAction(next);
  }
}

async function copy(text) {
  const ok = await copyText(text);
  toast(ok ? 'Copied' : "Couldn't copy", { timeout: 1400 });
}

function newChat() {
  closeDrawer?.();
  if (location.hash && location.hash !== '#/' && location.hash !== '#') go('#/');
  else goHome();
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function deleteConversation(id) {
  const current = session.getConversation();
  if (session.isStreaming() && current?.id === id) {
    toast('Stop the reply before deleting this conversation.');
    return;
  }
  const removed = store.deleteConversation(id);
  if (current?.id === id) newChat();
  hist.render(session.getConversation()?.id || null);
  if (!session.getConversation()) renderMain();
  toast('Conversation deleted', {
    timeout: 6000,
    action: removed && {
      label: 'Undo',
      fn: () => { store.restoreConversation(removed); hist.render(session.getConversation()?.id || null); if (!session.getConversation()) renderMain(); },
    },
  });
}

function exportAll() {
  const day = new Date().toISOString().slice(0, 10);
  downloadJson(`${APP.slug}-export-${day}.json`, store.exportAll());
  toast('Exported — keys are never included');
}

function clearHistory() {
  if (!confirm('Delete every conversation stored in this browser? This cannot be undone.')) return;
  session.stop();
  store.clearConversations();
  newChat();
  renderMain();
  toast('History cleared');
}

/* ── overlays ──────────────────────────────────────────────────────────── */

function openSettings() {
  if (closeSettings) return;
  closeDrawer?.();
  settings.el.hidden = false;
  settings.open();
  closeSettings = openLayer(settings.el, {
    scrim,
    // The opener (hero "Set up", an error's "Open settings", the key card's "More options") may be
    // re-rendered away by renderMain(); fall back to the composer so focus never drops to <body>.
    fallbackFocus: () => composer.input,
    onClose: () => {
      settings.el.hidden = true;
      settings.onClosed();
      closeSettings = null;
      updateTopbar();
      renderMain();
      reconcilePending();
    },
  });
}

function openCrisis() {
  if (closeCrisis) return;
  crisisSheet.hidden = false;
  closeCrisis = openLayer(crisisSheet, {
    scrim,
    initialFocus: () => crisisSheet.querySelector('.s-helpline__call') || crisisSheet,
    onClose: () => { crisisSheet.hidden = true; closeCrisis = null; },
  });
}

function openDrawer() {
  if (WIDE.matches) { hist.focusSearch(); return; }
  if (closeDrawer) return;
  hist.el.classList.add('is-open');
  topbar.setMenuExpanded(true);
  closeDrawer = openLayer(hist.el, {
    scrim,
    onClose: () => { hist.el.classList.remove('is-open'); topbar.setMenuExpanded(false); closeDrawer = null; },
  });
}

WIDE.addEventListener('change', () => { if (WIDE.matches) closeDrawer?.(); });

/* ── routing ───────────────────────────────────────────────────────────── */

function goHome() {
  session.setConversation(null);
  hideKeySetup();
  pending = null;
  renderMain();
  composer.setValue(store.getDraft(null));
  scroller.scrollTop = 0;
}

function openConversation(c) {
  // A reply that was mid-stream when the page closed: mark it stopped.
  const last = c.messages[c.messages.length - 1];
  if (last?.role === 'assistant' && last.meta && !('ms' in last.meta) && !last.meta.error && !last.meta.stopped) {
    last.meta.stopped = true;
  }
  session.setConversation(c);
  hideKeySetup();
  pending = null;
  renderMain({ forceBottom: true });
  composer.setValue(store.getDraft(c.id));
}

function route() {
  const m = location.hash.match(/^#\/c\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const current = session.getConversation();
    if (current?.id === id) { renderMain(); return; }
    const c = store.getConversation(id);
    if (c) { openConversation(c); return; }
    history.replaceState(null, '', '#/');
    toast("That conversation isn't in this browser.");
  }
  goHome();
}

window.addEventListener('hashchange', route);

/* ── global behaviour ─────────────────────────────────────────────────── */

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (e.key === 'Escape') {
    if (hasOpenLayer()) { e.preventDefault(); closeTopLayer(); return; }
    if (session.isStreaming()) { e.preventDefault(); session.stop(); return; }
    return;
  }
  if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); newChat(); composer.focus(); return; }
  if (mod && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (e.key === '/' && !mod && !typing && !hasOpenLayer()) { e.preventDefault(); composer.focus(); }
});

function syncOnline() { composer.setOffline(!navigator.onLine); }
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);

// Keep the composer above the iOS on-screen keyboard.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const sync = () => document.documentElement.style.setProperty('--s-vvh', `${Math.round(vv.height)}px`);
  vv.addEventListener('resize', sync);
  sync();
}

/* ── boot ──────────────────────────────────────────────────────────────── */

syncOnline();
route();
if (new URLSearchParams(location.search).has('settings')) openSettings();
