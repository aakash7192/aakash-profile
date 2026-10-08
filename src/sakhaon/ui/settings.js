import { h, clear, rovingRadios } from './dom.js';
import { icon } from './icons.js';
import { listProviders, resolveModel, createTransport, testConnection } from '../../llm/index.js';
import { APP } from '../core/app.js';
import { PROMPT_VERSION } from '../core/persona.js';
import { DISCLAIMER } from '../core/safety.js';
import { currentModel } from '../session.js';
import { errorCopy } from './errors.js';

const LENGTH_OPTS = [['brief', 'Brief'], ['balanced', 'Balanced'], ['deep', 'Deep']];
const LANG_OPTS = [['auto', 'Auto'], ['en', 'English'], ['hi', 'हिन्दी'], ['hinglish', 'Hinglish']];

function portfolioUrl() {
  try { return import.meta.env.BASE_URL || '../'; } catch { return '../'; }
}

/**
 * deps: { store, onChange(settings), onClose(), onExport(), onClearHistory(), onClearKeys(), toast(text) }
 */
export function createSettings(deps) {
  const { store } = deps;
  let proxyInfo = null;       // [{id, models}] when the proxy answered /v1/providers
  let proxyInfoFor = '';
  let test = { state: 'idle', text: '' };
  let testCtl = null;
  let showKey = false;
  let savedTimer;

  const body = h('div', { class: 's-sheet__body' });
  const el = h('section', { class: 's-sheet s-sheet--settings', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 's-settings-title', hidden: true, tabindex: '-1' },
    h('header', { class: 's-sheet__head' },
      h('h2', { id: 's-settings-title', class: 's-sheet__title', text: 'Settings' }),
      h('button', { type: 'button', class: 's-iconbtn', 'aria-label': 'Close settings', onclick: () => deps.onClose() }, icon('close'))),
    body,
  );

  const S = () => store.getSettings();

  function saved() {
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => deps.toast('Saved'), 500);
  }

  function update(patch, { rerender = true } = {}) {
    const s = store.updateSettings(patch);
    deps.onChange(s);
    saved();
    if ('provider' in patch || 'mode' in patch || 'proxyUrl' in patch || 'model' in patch || 'customModel' in patch) {
      test = { state: 'idle', text: '' };
      testCtl?.abort();
    }
    if (rerender) render();
  }

  async function refreshProxyInfo() {
    const s = S();
    const url = (s.proxyUrl || '').trim();
    if (s.mode !== 'proxy' || !url) { proxyInfo = null; proxyInfoFor = ''; return; }
    if (proxyInfoFor === url + '|' + s.proxyToken) return;
    proxyInfoFor = url + '|' + s.proxyToken;
    try {
      const t = createTransport({ mode: 'proxy', proxyUrl: url, proxyToken: s.proxyToken || undefined });
      const list = t.listProviders ? await t.listProviders() : null;
      proxyInfo = Array.isArray(list) ? list : null;
    } catch { proxyInfo = null; }
    if (!el.hidden) render();
  }

  function providerConfigured(id) {
    const s = S();
    if (s.mode === 'proxy') return proxyInfo ? proxyInfo.some((p) => p.id === id) : !!s.proxyUrl;
    return !!store.getKey(id);
  }

  function section(title, ...children) {
    return h('section', { class: 's-set' }, h('h3', { class: 's-micro s-set__title', text: title }), children);
  }

  function seg(label, opts, value, onPick, k) {
    return rovingRadios(h('div', { class: 's-seg', role: 'radiogroup', 'aria-label': label },
      opts.map(([v, text, extra, srText]) => h('button', {
        type: 'button', role: 'radio', class: 's-seg__opt', 'aria-checked': String(v === value), dataset: { k: `${k}-${v}` },
        onclick: () => { if (v !== value) onPick(v); },
      }, extra || null, text, srText ? h('span', { class: 's-sr', text: srText }) : null))));
  }

  function render() {
    const focusKey = document.activeElement?.dataset?.k;
    const scrollTop = body.scrollTop;
    clear(body);
    const s = S();
    const providers = listProviders();
    const p = providers.find((x) => x.id === s.provider) || providers[0];
    const sendModel = currentModel(s, p.id);
    const resolved = resolveModel(p.id, sendModel);
    const proxyEntry = proxyInfo?.find((x) => x.id === p.id);

    /* 1 · Provider */
    const providerSec = section('Provider',
      seg('Provider', providers.map((x) => [x.id, x.label,
        h('span', { class: 's-pdot' + (providerConfigured(x.id) ? '' : ' is-off'), dataset: { provider: x.id }, 'aria-hidden': 'true' }),
        providerConfigured(x.id) ? ' (connected)' : (S().mode === 'proxy' ? ' (not on proxy)' : ' (no key)')]),
      p.id, (v) => update({ provider: v }), 'prov'),
      proxyInfo && !proxyEntry && h('p', { class: 's-field__warn', text: `${p.label} is not on your proxy.` }),
    );

    /* 2 · Model */
    const known = p.models.some((m) => m.id === s.model[p.id]);
    const select = h('select', {
      id: 's-model', class: 's-input', dataset: { k: 'model' },
      onchange: () => update({ model: { ...s.model, [p.id]: select.value } }),
    },
      p.models.map((m) => h('option', { value: m.id, selected: m.id === s.model[p.id] },
        `${m.label}${m.note ? ` — ${m.note}` : ''}${proxyEntry && !proxyEntry.models.includes(m.id) ? ' (not on proxy)' : ''}`)),
      !known && s.model[p.id] && h('option', { value: s.model[p.id], selected: true, text: s.model[p.id] }),
    );
    const willSend = h('span', { class: 's-mono', text: sendModel });
    const customInput = h('input', {
      id: 's-custom', class: 's-input s-input--mono', type: 'text', spellcheck: 'false', autocomplete: 'off',
      placeholder: 'e.g. a newer model id', value: s.customModel[p.id] || '', dataset: { k: 'custom' }, maxlength: '100',
      oninput: () => {
        const v = customInput.value.trim();
        const next = { ...S().customModel };
        if (v) next[p.id] = v; else delete next[p.id];
        update({ customModel: next }, { rerender: false });
        willSend.textContent = currentModel(S(), p.id);
        syncTemp();
      },
      onchange: () => render(),
    });
    const modelSec = section('Model',
      h('label', { class: 's-field' }, h('span', { class: 's-field__label', text: 'Model' }), select),
      h('label', { class: 's-field' },
        h('span', { class: 's-field__label', text: 'Custom model id' }),
        customInput,
        h('span', { class: 's-field__help', text: 'When filled, this overrides the list — useful for brand-new model ids.' })),
      h('p', { class: 's-field__hint' }, 'Will send: ', willSend,
        !resolved.known && h('span', { class: 's-tag', text: 'custom' }),
        proxyEntry && !proxyEntry.models.includes(sendModel) && proxyEntry.models.length > 0 && h('span', { class: 's-tag is-warn', text: 'not on proxy' })),
    );

    /* 3 · Connection */
    const conn = [
      seg('Connection', [['direct', 'Direct (your key)'], ['proxy', 'Proxy']], s.mode, (v) => {
        update({ mode: v });
        if (v === 'proxy') refreshProxyInfo();
      }, 'mode'),
    ];
    if (s.mode === 'direct') {
      const hasKey = !!store.getKey(p.id);
      const keyInput = h('input', {
        id: 's-key', class: 's-input s-input--mono', type: showKey ? 'text' : 'password', autocomplete: 'off', spellcheck: 'false',
        placeholder: hasKey ? '•••••••• saved — paste to replace' : p.keyHint, dataset: { k: 'key' },
        onchange: () => {
          const v = keyInput.value.trim();
          if (!v) return;
          store.setKey(p.id, v);
          keyInput.value = '';
          deps.onChange(S());
          deps.toast(`${p.label} key saved`);
          test = { state: 'idle', text: '' };
          render();
        },
      });
      conn.push(
        h('div', { class: 's-field' },
          h('div', { class: 's-field__row' },
            h('label', { class: 's-field__label', for: 's-key', text: `${p.label} API key` }),
            h('a', { class: 's-linkbtn', href: p.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Get a key ', icon('external'))),
          h('div', { class: 's-inputrow' },
            keyInput,
            h('button', { type: 'button', class: 's-iconbtn', 'aria-label': showKey ? 'Hide key' : 'Show key', 'aria-pressed': String(showKey), dataset: { k: 'showkey' },
              onclick: () => { showKey = !showKey; render(); } }, icon(showKey ? 'eyeOff' : 'eye'))),
          h('p', { class: 's-field__hint' },
            h('span', { class: 's-pdot' + (hasKey ? '' : ' is-off'), dataset: { provider: p.id } }),
            hasKey ? 'Key saved' : 'No key yet',
            hasKey && h('button', { type: 'button', class: 's-linkbtn is-danger', dataset: { k: 'rmkey' },
              onclick: () => { store.removeKey(p.id); deps.onChange(S()); deps.toast('Key removed'); render(); } }, 'Remove key')),
        ),
        h('label', { class: 's-check' },
          h('input', { type: 'checkbox', checked: s.remember, dataset: { k: 'remember' }, onchange: (e) => update({ remember: e.target.checked }) }),
          h('span', { text: 'Remember keys on this device' })),
        h('p', { class: 's-field__help', text: 'Stored only in this browser. Use a key with a spending limit.' }),
      );
    } else {
      const url = h('input', {
        id: 's-proxy-url', class: 's-input s-input--mono', type: 'url', placeholder: 'https://your-proxy.example.com', value: s.proxyUrl || '',
        dataset: { k: 'purl' }, onchange: () => { update({ proxyUrl: url.value.trim().replace(/\/+$/, '') }); refreshProxyInfo(); },
      });
      const tok = h('input', {
        id: 's-proxy-token', class: 's-input s-input--mono', type: 'password', autocomplete: 'off', placeholder: 'optional', value: s.proxyToken || '',
        dataset: { k: 'ptok' }, onchange: () => { update({ proxyToken: tok.value.trim() }); proxyInfoFor = ''; refreshProxyInfo(); },
      });
      conn.push(
        h('label', { class: 's-field' }, h('span', { class: 's-field__label', text: 'Proxy URL' }), url),
        h('label', { class: 's-field' }, h('span', { class: 's-field__label', text: 'Proxy token' }), tok),
        h('p', { class: 's-field__help', text: 'The proxy keeps provider keys on the server. See server/README.md to run one.' }),
      );
    }
    const testStatus = h('span', { class: 's-test is-' + test.state, role: 'status', text: test.text });
    conn.push(h('div', { class: 's-field__row s-testrow' },
      h('button', { type: 'button', class: 's-btn s-btn--small', dataset: { k: 'test' }, disabled: test.state === 'testing', onclick: runTest },
        test.state === 'testing' ? 'Testing…' : 'Test connection'),
      testStatus));
    const connSec = section('Connection', conn);

    /* 4 · Conversation */
    const tempRange = h('input', {
      id: 's-temp', type: 'range', min: '0', max: '1', step: '0.1', value: String(s.temperature), class: 's-range', dataset: { k: 'temp' },
      oninput: () => { tempVal.textContent = Number(tempRange.value).toFixed(1); },
      onchange: () => update({ temperature: Number(tempRange.value) }, { rerender: false }),
    });
    const tempVal = h('span', { class: 's-mono', text: Number(s.temperature).toFixed(1) });
    const tempNote = h('span', { class: 's-field__help', text: 'Not supported by this model.' });
    function syncTemp() {
      const caps = resolveModel(p.id, currentModel(S(), p.id)).caps;
      tempRange.disabled = !caps.temperature;
      tempNote.hidden = !!caps.temperature;
    }
    syncTemp();
    const convSec = section('Conversation',
      h('div', { class: 's-field' }, h('span', { class: 's-field__label', text: 'Response length' }),
        seg('Response length', LENGTH_OPTS, s.length, (v) => update({ length: v }), 'len')),
      h('div', { class: 's-field' },
        h('div', { class: 's-field__row' }, h('label', { class: 's-field__label', for: 's-temp', text: 'Temperature' }), tempVal),
        tempRange, tempNote),
      h('div', { class: 's-field' }, h('span', { class: 's-field__label', text: 'Reply language' }),
        seg('Reply language', LANG_OPTS, s.language, (v) => update({ language: v }), 'lang')),
      h('label', { class: 's-check' },
        h('input', { type: 'checkbox', checked: s.showHindi, dataset: { k: 'hindi' }, onchange: (e) => update({ showHindi: e.target.checked }) }),
        h('span', { text: 'Show Hindi meaning on verse cards' })),
    );

    /* 5 · Privacy & data */
    const dataSec = section('Privacy & data',
      h('p', { class: 's-field__help', text: 'Conversations are stored only in this browser. Exports never include API keys.' }),
      h('div', { class: 's-btnrow' },
        h('button', { type: 'button', class: 's-btn s-btn--small', onclick: deps.onExport }, icon('download'), 'Export all (JSON)'),
        h('button', { type: 'button', class: 's-btn s-btn--small s-btn--ghost', onclick: deps.onClearHistory }, 'Clear history'),
        h('button', { type: 'button', class: 's-btn s-btn--small s-btn--danger', onclick: () => { deps.onClearKeys(); render(); } }, 'Clear keys')),
    );

    /* 6 · About */
    const aboutSec = section('About',
      h('p', { class: 's-about__line' }, h('strong', { text: APP.product }), ` — ${APP.tagline}`),
      h('p', { class: 's-mono s-about__ver', text: `v${APP.version} · prompt ${PROMPT_VERSION}` }),
      h('p', { class: 's-disclaimer', text: DISCLAIMER }),
      h('p', { class: 's-field__help', text: 'Verse translations are faithful renderings, not copied from a copyrighted edition.' }),
      h('a', { class: 's-linkbtn', href: portfolioUrl() }, icon('back'), 'Back to the portfolio'),
    );

    body.append(providerSec, modelSec, connSec, convSec, dataSec, aboutSec);
    body.scrollTop = scrollTop;
    if (focusKey) body.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus();
  }

  async function runTest() {
    const s = S();
    testCtl?.abort();
    testCtl = new AbortController();
    test = { state: 'testing', text: 'Testing…' };
    render();
    try {
      const transport = createTransport({
        mode: s.mode, getKey: (id) => store.getKey(id),
        proxyUrl: (s.proxyUrl || '').trim(), proxyToken: (s.proxyToken || '').trim() || undefined,
      });
      const r = await testConnection({ provider: s.provider, model: currentModel(s), transport, signal: testCtl.signal });
      test = { state: 'ok', text: `✓ Connected · ${Math.round(r.ms)} ms` };
    } catch (e) {
      if (e?.code === 'aborted') return;
      const label = listProviders().find((x) => x.id === s.provider)?.label;
      const copy = errorCopy(e, { providerLabel: label });
      test = { state: 'err', text: `✗ ${copy.text || e?.message || 'Failed'}` };
    }
    if (!el.hidden) render();
  }

  return {
    el,
    open() { render(); refreshProxyInfo(); },
    render,
    onClosed() { testCtl?.abort(); },
  };
}
