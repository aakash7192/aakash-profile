import { h, clear, rovingRadios } from './dom.js';
import { icon } from './icons.js';
import { listProviders } from '../../llm/index.js';
import { APP } from '../core/app.js';

/**
 * Inline first-run card shown when the user sends while unconfigured.
 * deps: { settings, hasKey(providerId), onSave({provider, key?, remember, proxyUrl?, proxyToken?}), onCancel(), onOpenSettings() }
 */
export function renderKeySetup(deps) {
  const providers = listProviders();
  let provider = deps.settings.provider;
  const mode = deps.settings.mode;
  const el = h('section', { class: 's-keysetup', 'aria-labelledby': 's-keysetup-title' });

  function draw() {
    clear(el);
    const p = providers.find((x) => x.id === provider) || providers[0];
    const keyInput = h('input', {
      id: 's-ks-key', class: 's-input s-input--mono', type: 'password', autocomplete: 'off', spellcheck: 'false',
      placeholder: p.keyHint, 'aria-describedby': 's-ks-note',
    });
    const remember = h('input', { type: 'checkbox', id: 's-ks-remember', checked: deps.settings.remember });
    const urlInput = h('input', { id: 's-ks-url', class: 's-input s-input--mono', type: 'url', placeholder: 'https://your-proxy.example.com', value: deps.settings.proxyUrl || '' });
    const tokenInput = h('input', { id: 's-ks-token', class: 's-input s-input--mono', type: 'password', autocomplete: 'off', placeholder: 'optional', value: deps.settings.proxyToken || '' });
    const errorLine = h('p', { class: 's-field__err', role: 'alert' });

    const form = h('form', {
      class: 's-keysetup__form', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        if (mode === 'proxy') {
          const url = urlInput.value.trim();
          if (!/^https?:\/\//i.test(url)) { errorLine.textContent = 'Enter the full proxy URL, starting with https://'; urlInput.focus(); return; }
          deps.onSave({ provider, proxyUrl: url.replace(/\/+$/, ''), proxyToken: tokenInput.value.trim(), remember: deps.settings.remember });
        } else {
          const key = keyInput.value.trim();
          if (key.length < 8) { errorLine.textContent = `Paste your ${p.label} API key.`; keyInput.focus(); return; }
          deps.onSave({ provider, key, remember: remember.checked });
        }
      },
    },
      rovingRadios(h('div', { class: 's-seg', role: 'radiogroup', 'aria-label': 'Provider' },
        providers.map((x) => h('button', {
          type: 'button', role: 'radio', class: 's-seg__opt', 'aria-checked': String(x.id === provider), dataset: { k: `ks-${x.id}` },
          onclick: (e) => {
            const fromKeys = e.detail === 0; // keyboard / arrow-key selection: keep focus on the radio
            if (x.id !== provider) { provider = x.id; draw(); }
            el.querySelector(fromKeys ? `[data-k="ks-${x.id}"]` : (mode === 'proxy' ? '#s-ks-url' : '#s-ks-key'))?.focus();
          },
        }, h('span', { class: 's-pdot' + (deps.hasKey(x.id) ? '' : ' is-off'), dataset: { provider: x.id }, 'aria-hidden': 'true' }), x.label,
        h('span', { class: 's-sr', text: deps.hasKey(x.id) ? ' (key saved)' : ' (no key)' }))))),
      mode === 'proxy'
        ? [
          h('label', { class: 's-field' }, h('span', { class: 's-field__label', text: 'Proxy URL' }), urlInput),
          h('label', { class: 's-field' }, h('span', { class: 's-field__label', text: 'Proxy token' }), tokenInput),
        ]
        : [
          h('div', { class: 's-field' },
            h('div', { class: 's-field__row' },
              h('label', { class: 's-field__label', for: 's-ks-key', text: `${p.label} API key` }),
              h('a', { class: 's-linkbtn', href: p.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Get a key ', icon('external'))),
            keyInput),
          h('label', { class: 's-check' }, remember, h('span', { text: 'Remember on this device' })),
        ],
      errorLine,
      h('p', { class: 's-micro s-keysetup__note', id: 's-ks-note',
        text: mode === 'proxy' ? 'Your proxy holds the provider keys.' : 'Stored only in this browser. Use a key with a spending limit.' }),
      h('div', { class: 's-keysetup__actions' },
        h('button', { type: 'submit', class: 's-btn s-btn--primary' }, 'Save & send'),
        h('button', { type: 'button', class: 's-btn s-btn--ghost', onclick: deps.onOpenSettings, text: 'More options' }),
        h('button', { type: 'button', class: 's-linkbtn', onclick: deps.onCancel, text: 'Cancel' }),
      ),
    );

    el.append(
      h('div', { class: 's-keysetup__head' },
        icon('feather'),
        h('h2', { id: 's-keysetup-title', class: 's-keysetup__title', text: mode === 'proxy' ? 'Connect your proxy' : `Connect a model to talk with ${APP.persona}` })),
      h('p', { class: 's-keysetup__lead', text: 'Your message is waiting — it will be sent as soon as you save.' }),
      form,
    );
  }
  draw();
  requestAnimationFrame(() => el.querySelector(mode === 'proxy' ? '#s-ks-url' : '#s-ks-key')?.focus());
  return el;
}
