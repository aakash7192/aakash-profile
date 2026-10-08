import { h, clear, formatStamp } from './dom.js';
import { icon } from './icons.js';
import { renderMessage, renderSakhaBody } from './message.js';
import { renderSupportCard } from './crisis.js';
import { APP } from '../core/app.js';

const STICK_PX = 90;
const DIVIDER_GAP_MS = 60 * 60 * 1000;

/**
 * The message log. `scroller` is the scrolling container that hosts it.
 */
export function createThread({ scroller }) {
  const el = h('div', { class: 's-thread', role: 'log', 'aria-live': 'off', 'aria-label': `Conversation with ${APP.persona}` });
  const pill = h('button', { type: 'button', class: 's-newpill', hidden: true, onclick: () => scrollToBottom(true) },
    icon('arrowDown'), 'New message');

  scroller.addEventListener('scroll', () => { if (isNearBottom()) pill.hidden = true; }, { passive: true });

  function isNearBottom() {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= STICK_PX;
  }

  function scrollToBottom(smooth = false) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    pill.hidden = true;
  }

  function afterGrow(wasNear, force) {
    if (force || wasNear) scrollToBottom(false);
    else pill.hidden = false;
  }

  /** Full render of a conversation. */
  function render(conv, ctx, { forceBottom = false } = {}) {
    const wasNear = isNearBottom();
    const prevTop = scroller.scrollTop;
    clear(el);
    const msgs = conv?.messages || [];
    let prevTs = 0;
    msgs.forEach((m, i) => {
      if (prevTs && m.createdAt - prevTs > DIVIDER_GAP_MS) {
        el.append(h('div', { class: 's-divider', role: 'separator' }, h('span', { text: formatStamp(m.createdAt) })));
      } else if (!prevTs && msgs.length) {
        el.append(h('div', { class: 's-divider is-first', role: 'separator' }, h('span', { text: formatStamp(m.createdAt) })));
      }
      prevTs = m.createdAt;
      const isLast = i === msgs.length - 1;
      el.append(renderMessage(m, { ...ctx, isLast }));
      if (m.role === 'user' && m.meta?.crisis && !m.meta?.crisisDismissed) {
        el.append(renderSupportCard({ onDismiss: () => ctx.onDismissCrisis(m.id) }));
      }
    });
    const last = msgs[msgs.length - 1];
    if (last?.role === 'user' && !ctx.streamingId) {
      el.append(h('div', { class: 's-noreply' },
        h('span', { class: 's-micro', text: 'No reply yet' }),
        h('button', { type: 'button', class: 's-btn s-btn--small', onclick: () => ctx.onReplyToLast() }, icon('refresh'), `Ask ${APP.persona}`)));
    }
    if (forceBottom || wasNear) scrollToBottom(false);
    else scroller.scrollTop = prevTop;
  }

  /** Cheap per-frame update of the streaming message body. */
  function updateStreaming(msg, ctx) {
    const node = el.querySelector(`[data-id="${CSS.escape(msg.id)}"] .s-msg__body`);
    if (!node) return;
    const wasNear = isNearBottom();
    const before = scroller.scrollHeight;
    renderSakhaBody(node, msg, true, ctx);
    if (scroller.scrollHeight !== before) afterGrow(wasNear, false);
  }

  return { el, pill, render, updateStreaming, scrollToBottom, isNearBottom };
}
