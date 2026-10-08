import { h } from './dom.js';
import { icon } from './icons.js';
import { APP } from '../core/app.js';

export const MAX_CHARS = 8000;
const HINT_AT = 2000;
const MAX_ROWS = 8;

export function createComposer({ onSend, onStop, onDraft }) {
  let streaming = false;
  let offline = false;
  let draftTimer;

  const ta = h('textarea', {
    id: 's-input', class: 's-composer__input', rows: '1', maxlength: String(MAX_CHARS),
    placeholder: `Tell ${APP.persona} what's on your mind…`, autocomplete: 'off', spellcheck: 'true', dir: 'auto',
    'aria-describedby': 's-composer-hint',
  });
  const btn = h('button', { type: 'submit', class: 's-send', 'aria-label': 'Send message' }, icon('send'));
  const hint = h('div', { class: 's-composer__hint', id: 's-composer-hint', 'aria-live': 'polite' });
  const offlineBanner = h('div', { class: 's-composer__offline', role: 'status', hidden: true, text: "You're offline. Your message is saved here — send it when you're back." });

  const form = h('form', { class: 's-composer', 'aria-label': `Message ${APP.persona}`, novalidate: true },
    offlineBanner,
    h('div', { class: 's-composer__box' },
      h('label', { class: 's-sr', for: 's-input', text: `Message ${APP.persona}` }),
      ta, btn),
    hint,
  );

  const coarse = matchMedia('(pointer: coarse)');

  function grow() {
    ta.style.height = 'auto';
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || 24;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const max = lh * MAX_ROWS + pad;
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }

  function sync() {
    const len = ta.value.length;
    if (len > HINT_AT) {
      hint.textContent = `${len.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
      hint.classList.toggle('is-max', len >= MAX_CHARS);
    } else hint.textContent = '';
    if (streaming) {
      btn.disabled = false;
      btn.classList.add('is-stop');
      btn.setAttribute('aria-label', 'Stop reply');
      btn.replaceChildren(icon('stop'));
    } else {
      btn.classList.remove('is-stop');
      btn.setAttribute('aria-label', 'Send message');
      btn.replaceChildren(icon('send'));
      btn.disabled = offline || !ta.value.trim();
    }
  }

  function submit() {
    if (streaming) { onStop(); return; }
    if (offline) return;
    const text = ta.value.trim();
    if (!text) return;
    onSend(text);
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  ta.addEventListener('input', () => {
    grow(); sync();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => onDraft?.(ta.value), 300);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    if (coarse.matches && !(e.metaKey || e.ctrlKey)) return; // newline on touch keyboards
    e.preventDefault();
    if (!streaming) submit();
  });

  function setValue(text, { focus = false } = {}) {
    ta.value = text || '';
    grow(); sync();
    if (focus) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  function setStreaming(v) { streaming = !!v; sync(); }
  function setOffline(v) { offline = !!v; offlineBanner.hidden = !offline; sync(); }

  requestAnimationFrame(() => { grow(); sync(); });

  return {
    el: form,
    input: ta,
    getValue: () => ta.value,
    setValue,
    clear: () => { setValue(''); clearTimeout(draftTimer); onDraft?.(''); },
    focus: () => ta.focus(),
    setStreaming,
    setOffline,
  };
}
