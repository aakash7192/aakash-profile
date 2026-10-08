import { h } from './dom.js';

let region = null;

export function createToastRegion() {
  region = h('div', { class: 's-toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
  return region;
}

/** Show a toast. Returns a dismiss function. */
export function toast(text, { action, timeout = 3200, tone } = {}) {
  if (!region) return () => {};
  let timer;
  const el = h('div', { class: 's-toast' + (tone ? ` is-${tone}` : '') },
    h('span', { class: 's-toast__text', text }),
    action && h('button', {
      type: 'button', class: 's-toast__action', text: action.label,
      onclick: () => { dismiss(); action.fn(); },
    }),
  );
  function dismiss() {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 180);
  }
  region.append(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  timer = setTimeout(dismiss, timeout);
  return dismiss;
}
