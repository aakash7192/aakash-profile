import { h } from './dom.js';
import { icon } from './icons.js';
import { APP } from '../core/app.js';

export function createTopbar({ onMenu, onHome, onBadge, onHelp, onNew, onSettings }) {
  const provDot = h('span', { class: 's-pdot' });
  const provName = h('span', { class: 's-badge__prov' });
  const modelName = h('span', { class: 's-badge__model' });
  const badge = h('button', { type: 'button', class: 's-badge', onclick: onBadge, title: 'Change model' },
    provDot, provName, h('span', { class: 's-badge__sep', 'aria-hidden': 'true', text: '·' }), modelName);

  const el = h('header', { class: 's-topbar' },
    h('button', { type: 'button', class: 's-iconbtn s-topbar__menu', 'aria-label': 'Open conversation history', 'aria-controls': 's-rail', 'aria-expanded': 'false', onclick: onMenu }, icon('menu')),
    h('a', { class: 's-brand', href: '#/', 'aria-label': `${APP.product} home`, onclick: (e) => { e.preventDefault(); onHome(); } },
      icon('feather', 's-brand__logo'), h('span', { class: 's-brand__word', text: APP.product.toUpperCase() })),
    badge,
    h('div', { class: 's-topbar__actions' },
      h('button', { type: 'button', class: 's-helpbtn', onclick: onHelp }, icon('heart'), h('span', { class: 's-helpbtn__text', text: 'Need help now?' })),
      h('button', { type: 'button', class: 's-iconbtn', 'aria-label': 'New chat', title: 'New chat (Ctrl+K)', onclick: onNew }, icon('plus')),
      h('button', { type: 'button', class: 's-iconbtn', 'aria-label': 'Settings', title: 'Settings (Ctrl+,)', onclick: onSettings }, icon('gear')),
    ),
  );

  function update({ providerId, providerLabel, model, configured }) {
    provDot.dataset.provider = providerId;
    provDot.classList.toggle('is-off', !configured);
    provName.textContent = providerLabel;
    modelName.textContent = model;
    badge.setAttribute('aria-label', `Model: ${providerLabel} · ${model}${configured ? '' : ' (not connected)'}. Open settings.`);
  }

  function setMenuExpanded(v) { el.querySelector('.s-topbar__menu').setAttribute('aria-expanded', String(!!v)); }

  return { el, update, setMenuExpanded };
}
