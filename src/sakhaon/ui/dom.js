/* Tiny DOM helpers. Text always goes in via textContent; the only HTML
   insertion points are `trustedHtml` (used solely for reply.js output and
   static icons.js strings). */

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'trustedHtml') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function uid() {
  try { if (globalThis.crypto?.randomUUID) return crypto.randomUUID(); } catch { /* fall through */ }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' }, readonly: true });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),summary';

export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
}

/* ── Overlay stack: focus trap, Esc, focus restore ──────────────────────── */

const layers = [];

/** Open a modal layer. `panel` must already be in the DOM. Returns a close fn. */
/**
 * fallbackFocus: element (or fn returning one) to focus on close when the opener was re-rendered away.
 * An opener carrying data-focus-key is first looked up again by that key.
 */
export function openLayer(panel, { onClose, initialFocus, scrim, fallbackFocus } = {}) {
  const existing = layers.find((l) => l.panel === panel);
  if (existing) return existing.close;
  const opener = document.activeElement;
  const focusKey = opener && opener.dataset ? opener.dataset.focusKey : undefined;
  const onKey = (e) => {
    if (e.key !== 'Tab' || layers[layers.length - 1]?.panel !== panel) return;
    const f = focusables(panel);
    if (!f.length) { e.preventDefault(); panel.focus(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const layer = {
    panel,
    close: () => {
      const i = layers.indexOf(layer);
      if (i === -1) return;
      layers.splice(i, 1);
      document.removeEventListener('keydown', onKey, true);
      scrim?.classList.toggle('is-open', layers.some((l) => l.scrim === scrim));
      onClose?.();
      let target = opener && opener.isConnected && opener !== document.body ? opener : null;
      if (!target && focusKey) target = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
      if (!target) target = typeof fallbackFocus === 'function' ? fallbackFocus() : fallbackFocus;
      if (target && typeof target.focus === 'function') target.focus();
    },
    scrim,
  };
  layers.push(layer);
  document.addEventListener('keydown', onKey, true);
  scrim?.classList.add('is-open');
  requestAnimationFrame(() => {
    const target = (typeof initialFocus === 'function' ? initialFocus() : initialFocus) || focusables(panel)[0] || panel;
    target?.focus?.();
  });
  return layer.close;
}

export function closeTopLayer() {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function hasOpenLayer() { return layers.length > 0; }

export function closeAllLayers() {
  while (layers.length) layers[layers.length - 1].close();
}

export function rafThrottle(fn) {
  let queued = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

export function relativeDay(ts, now = Date.now()) {
  const d = new Date(ts);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const diff = start.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(diff / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  return 'Older';
}

export function formatStamp(ts) {
  const d = new Date(ts);
  const day = relativeDay(ts);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (day === 'Today' || day === 'Yesterday') return `${day} · ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} · ${time}`;
}

/**
 * ARIA radio-group keyboard pattern for a container of role="radio" buttons: roving tabindex
 * (only the checked option is a Tab stop) and Arrow/Home/End keys that move focus AND select.
 * Selection goes through the option's own click handler, so callers keep one code path.
 * Focus moves before the click so callers that re-render can restore focus to the new option.
 */
export function rovingRadios(group) {
  const radios = () => [...group.querySelectorAll('[role="radio"]')];
  const all = radios();
  const checked = all.find((r) => r.getAttribute('aria-checked') === 'true') || all[0];
  for (const r of all) r.tabIndex = r === checked ? 0 : -1;
  group.addEventListener('keydown', (e) => {
    const list = radios();
    const i = list.indexOf(document.activeElement);
    if (i === -1) return;
    let j;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    else return;
    e.preventDefault();
    const next = list[j];
    for (const r of list) r.tabIndex = r === next ? 0 : -1;
    next.focus();
    next.click();
  });
  return group;
}
