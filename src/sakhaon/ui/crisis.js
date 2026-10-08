import { h } from './dom.js';
import { icon } from './icons.js';
import { HELPLINES, HELPLINES_LAST_VERIFIED, SUPPORT_COPY, DISCLAIMER } from '../core/safety.js';

function telHref(phone) { return 'tel:' + String(phone).replace(/[^\d+]/g, ''); }

export function helplineList({ compact = false } = {}) {
  const list = compact ? HELPLINES.filter((x) => x.primary) : HELPLINES;
  return h('ul', { class: 's-helplines' },
    list.map((line) => h('li', { class: 's-helpline' + (line.primary ? ' is-primary' : '') },
      h('div', { class: 's-helpline__who' },
        h('span', { class: 's-helpline__region', text: line.region }),
        h('span', { class: 's-helpline__name', text: line.name }),
        line.note && h('span', { class: 's-helpline__note', text: line.note }),
      ),
      h('div', { class: 's-helpline__how' },
        line.phone && h('a', { class: 's-helpline__call', href: telHref(line.phone) }, icon('phone'), h('span', { text: line.phone })),
        line.alt && h('a', { class: 's-helpline__alt', href: telHref(line.alt), text: line.alt }),
        line.url && h('a', { class: 's-helpline__alt', href: line.url, target: '_blank', rel: 'noopener noreferrer', text: line.url.replace(/^https:\/\//, '') + ' ↗' }),
      ),
    )),
  );
}

/** Support card pinned in the thread under a message that tripped detectCrisis(). */
export function renderSupportCard({ onDismiss }) {
  return h('aside', { class: 's-support', role: 'note', 'aria-label': SUPPORT_COPY.title },
    h('div', { class: 's-support__head' }, icon('heart'), h('strong', { text: SUPPORT_COPY.title })),
    h('p', { class: 's-support__body', text: SUPPORT_COPY.body }),
    helplineList({ compact: false }),
    h('div', { class: 's-support__foot' },
      h('button', { type: 'button', class: 's-btn s-btn--ghost', text: SUPPORT_COPY.dismiss, onclick: onDismiss }),
    ),
  );
}

/** The always-available "Need help now?" sheet. */
export function createCrisisSheet({ onClose }) {
  const titleId = 's-crisis-title';
  const el = h('section', { class: 's-sheet s-sheet--crisis', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, hidden: true, tabindex: '-1' },
    h('header', { class: 's-sheet__head' },
      h('h2', { id: titleId, class: 's-sheet__title', text: 'Need help now?' }),
      h('button', { type: 'button', class: 's-iconbtn', 'aria-label': 'Close', onclick: () => onClose() }, icon('close')),
    ),
    h('div', { class: 's-sheet__body' },
      h('p', { class: 's-crisis__lead' }, h('strong', { text: SUPPORT_COPY.title + ' ' }), SUPPORT_COPY.body),
      h('p', { class: 's-crisis__lead', text: 'If you might be in immediate danger, call 112 (India) or your local emergency number, or go to the nearest hospital emergency department. Tell someone you trust who is nearby.' }),
      helplineList(),
      h('p', { class: 's-micro', text: `Helplines last verified ${HELPLINES_LAST_VERIFIED}` }),
      h('p', { class: 's-disclaimer', text: DISCLAIMER }),
    ),
  );
  return el;
}
