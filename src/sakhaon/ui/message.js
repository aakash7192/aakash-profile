import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { parseReply, plainText } from '../core/reply.js';
import { renderVerseCard } from './verse-card.js';
import { errorCopy, ACTION_LABELS } from './errors.js';
import { APP } from '../core/app.js';

const BLOCKS = new Set(['P', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);

/**
 * ctx: { streamingId, isLast, settings, providerLabel(id), onCopy(text), onRegenerate(), onRetry(msg, {auto}),
 *        onContinue(), onAction(action), onAskVerse(verse) }
 */
export function renderMessage(msg, ctx) {
  return msg.role === 'user' ? renderUser(msg, ctx) : renderSakha(msg, ctx);
}

function renderUser(msg, ctx) {
  return h('article', { class: 's-msg s-msg--user', dataset: { id: msg.id }, 'aria-label': 'You said' },
    h('div', { class: 's-msg__bubble', dir: 'auto' }, msg.content),
    h('div', { class: 's-msg__tools' },
      h('button', { type: 'button', class: 's-iconbtn s-iconbtn--sm', 'aria-label': 'Copy your message', title: 'Copy', onclick: () => ctx.onCopy(msg.content) }, icon('copy')),
    ),
  );
}

function renderSakha(msg, ctx) {
  const streaming = ctx.streamingId === msg.id;
  const body = h('div', { class: 's-msg__body', dir: 'auto' });
  renderSakhaBody(body, msg, streaming, ctx);
  const el = h('article', { class: 's-msg s-msg--sakha' + (streaming ? ' is-streaming' : ''), dataset: { id: msg.id }, 'aria-label': `${APP.persona} said` },
    h('div', { class: 's-msg__avatar', 'aria-hidden': 'true' }, icon('feather')),
    h('div', { class: 's-msg__main' },
      h('div', { class: 's-msg__label', text: APP.persona.toUpperCase() }),
      body,
      streaming ? null : renderFooter(msg, ctx),
    ),
  );
  return el;
}

/** (Re)render only the body of an assistant message; used per animation frame while streaming. */
export function renderSakhaBody(body, msg, streaming, ctx) {
  clear(body);
  if (streaming && !msg.content) {
    body.append(h('div', { class: 's-typing' },
      h('span', { class: 's-typing__dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { text: `${APP.persona} is reflecting…` })));
    return;
  }
  if (!msg.content) return;
  const showHindi = ctx.settings.showHindi || ctx.settings.language === 'hi' || ctx.settings.language === 'hinglish';
  let lastHtml = null;
  for (const seg of parseReply(msg.content, { streaming })) {
    if (seg.type === 'html') {
      if (!seg.html) continue;
      // reply.js output: escaped-first, allowlisted markdown subset.
      lastHtml = h('div', { class: 's-md', trustedHtml: seg.html });
      body.append(lastHtml);
    } else if (seg.type === 'verse') {
      lastHtml = null;
      body.append(renderVerseCard(seg, { showHindi, onAsk: ctx.onAskVerse, onCopy: ctx.onCopy }));
    }
  }
  if (streaming) {
    let target = lastHtml || body;
    while (target.lastElementChild && BLOCKS.has(target.lastElementChild.tagName)) target = target.lastElementChild;
    target.append(h('span', { class: 's-caret', 'aria-hidden': 'true' }));
  }
}

function renderFooter(msg, ctx) {
  const meta = msg.meta || {};
  const parts = [];

  if (meta.stopped) parts.push(h('div', { class: 's-msg__note' }, h('span', { text: '(stopped)' }),
    ctx.isLast && h('button', { type: 'button', class: 's-linkbtn', text: 'Continue', onclick: ctx.onContinue })));
  else if (meta.stopReason === 'max_tokens' && !meta.error) parts.push(h('div', { class: 's-msg__note' }, h('span', { text: '(cut short)' }),
    ctx.isLast && h('button', { type: 'button', class: 's-linkbtn', text: 'Continue', onclick: ctx.onContinue })));

  if (meta.error) parts.push(renderError(msg, ctx));

  const hasText = !!(msg.content && msg.content.trim());
  const tools = h('div', { class: 's-msg__actions' },
    hasText && h('button', { type: 'button', class: 's-iconbtn s-iconbtn--sm', 'aria-label': 'Copy reply', title: 'Copy', onclick: () => ctx.onCopy(plainText(msg.content)) }, icon('copy')),
    hasText && ctx.isLast && !meta.error && h('button', { type: 'button', class: 's-iconbtn s-iconbtn--sm', 'aria-label': 'Regenerate reply', title: 'Regenerate', onclick: ctx.onRegenerate }, icon('refresh')),
    h('span', { class: 's-msg__meta', text: [meta.model, typeof meta.ms === 'number' ? `${(meta.ms / 1000).toFixed(1)}s` : null].filter(Boolean).join(' · ') }),
  );
  parts.push(tools);
  return h('footer', { class: 's-msg__foot' }, parts);
}

function renderError(msg, ctx) {
  const err = msg.meta.error;
  const copy = errorCopy(err, { providerLabel: ctx.providerLabel(msg.meta.provider) });
  // No live role: the error is announced once (politely) by main.js on stream-end. A role=alert here
  // would re-announce on every renderMain() rebuild and on each countdown tick.
  const box = h('div', { class: 's-error' });
  const text = h('p', { class: 's-error__text' }, icon('warn'), h('span', { text: copy.text }));
  box.append(text);

  const actions = h('div', { class: 's-error__actions' });
  if (ctx.isLast && err.code !== 'safety') {
    actions.append(h('button', { type: 'button', class: 's-btn s-btn--small', text: 'Retry', onclick: () => ctx.onRetry(msg) }));
  }
  if (copy.action && copy.action !== 'retry' && copy.action !== 'continue') {
    actions.append(h('button', { type: 'button', class: 's-btn s-btn--small s-btn--ghost', text: ACTION_LABELS[copy.action], dataset: { focusKey: `err-${copy.action}` }, onclick: () => ctx.onAction(copy.action) }));
  }
  if (actions.childElementCount) box.append(actions);

  if (copy.details) {
    box.append(h('details', { class: 's-error__details' }, h('summary', { text: 'Details' }), h('code', { text: `${err.code}${err.status ? ` · ${err.status}` : ''} — ${copy.details}` })));
  }

  if (copy.countdown && ctx.isLast && !msg.meta.autoRetried) {
    if (!msg.meta.retryAt) msg.meta.retryAt = Date.now() + Math.min(Math.max(err.retryAfterMs || 5000, 1000), 60000);
    const span = h('span', { class: 's-error__count', 'aria-hidden': 'true' });
    text.append(span);
    const born = Date.now();
    let seen = false;
    const tick = () => {
      if (msg.meta.autoRetried) { clearInterval(timer); return; }
      if (span.isConnected) seen = true;
      else { if (seen || Date.now() - born > 2000) clearInterval(timer); return; }
      const left = Math.ceil((msg.meta.retryAt - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        msg.meta.autoRetried = true;
        ctx.onRetry(msg, { auto: true });
        return;
      }
      span.textContent = ` Retrying in ${left}s…`;
    };
    const timer = setInterval(tick, 250);
  }
  return box;
}
