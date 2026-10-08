import { h } from './dom.js';
import { icon } from './icons.js';
import { externalVerseUrl, CHAPTERS } from '../core/verses.js';

function iastLines(iast) {
  return String(iast || '').split(/\s*\/\s*/).filter(Boolean);
}

export function verseCopyText(v) {
  return `Bhagavad Gita ${v.id} (${v.chapterName})\n\n${iastLines(v.iast).join('\n')}\n\n${v.en}${v.hi ? `\n\n${v.hi}` : ''}`;
}

function verseHeader(chapter, verse, chapterName) {
  return h('div', { class: 's-verse__ref' },
    h('span', { text: 'BHAGAVAD GITA' }), h('span', { class: 's-sep', text: '·' }),
    h('span', { text: `${chapter}.${verse}` }),
    chapterName && [h('span', { class: 's-sep', text: '·' }), h('span', { class: 's-verse__chap', text: chapterName })],
  );
}

function hindiBlock(v, openByDefault) {
  const id = `s-hi-${v.id.replace('.', '-')}-${Math.random().toString(36).slice(2, 7)}`;
  const body = h('p', { class: 's-verse__hi', lang: 'hi', id, text: v.hi, hidden: !openByDefault });
  const btn = h('button', {
    type: 'button', class: 's-chipbtn', 'aria-expanded': String(!!openByDefault), 'aria-controls': id,
    onclick: () => {
      const open = body.hidden;
      body.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide हिन्दी' : 'हिन्दी अर्थ';
    },
    text: openByDefault ? 'Hide हिन्दी' : 'हिन्दी अर्थ',
  });
  return { body, btn };
}

/** Render a verse segment from parseReply(). */
export function renderVerseCard(seg, { showHindi = false, onAsk, onCopy } = {}) {
  if (seg.status === 'invalid') {
    return h('span', { class: 's-verse-invalid', title: 'This reference may be inaccurate' },
      icon('warn'), h('span', { text: `BG ${seg.chapter}.${seg.verse}` }),
      h('span', { class: 's-sr', text: ' (this reference may be inaccurate)' }));
  }
  if (seg.status === 'unverified' || !seg.data) {
    return h('figure', { class: 's-verse is-unverified' },
      verseHeader(seg.chapter, seg.verse, CHAPTERS.find((c) => c.n === seg.chapter)?.name || ''),
      h('p', { class: 's-verse__note', text: "Sakha referenced this verse; its text isn't in the local library." }),
      h('div', { class: 's-verse__actions' },
        h('a', { class: 's-chipbtn', href: externalVerseUrl(seg.chapter, seg.verse), target: '_blank', rel: 'noopener noreferrer' }, 'Read it ', icon('external')),
      ),
    );
  }
  const v = seg.data;
  const hi = v.hi ? hindiBlock(v, showHindi) : null;
  return h('figure', { class: 's-verse' },
    verseHeader(v.chapter, v.verse, v.chapterName),
    h('blockquote', { class: 's-verse__iast', lang: 'sa-Latn' }, iastLines(v.iast).map((l) => h('span', { text: l }))),
    h('figcaption', { class: 's-verse__en', text: v.en }),
    hi && hi.body,
    h('div', { class: 's-verse__actions' },
      hi && hi.btn,
      h('button', { type: 'button', class: 's-chipbtn', onclick: () => onCopy?.(verseCopyText(v)) }, icon('copy'), 'Copy'),
      h('button', { type: 'button', class: 's-chipbtn', onclick: () => onAsk?.(v) }, 'Ask about this verse'),
    ),
  );
}

/** The home-screen "Verse of the day" card. */
export function renderVerseOfDay(v, { showHindi = false, onReflect, onCopy } = {}) {
  const hi = v.hi ? hindiBlock(v, showHindi) : null;
  return h('section', { class: 's-votd', 'aria-labelledby': 's-votd-label' },
    h('div', { class: 's-votd__label', id: 's-votd-label' }, h('span', { class: 's-dot' }), 'Verse of the day'),
    h('blockquote', { class: 's-verse__iast s-votd__iast', lang: 'sa-Latn' }, iastLines(v.iast).map((l) => h('span', { text: l }))),
    h('p', { class: 's-votd__en', text: v.en }),
    hi && hi.body,
    h('div', { class: 's-votd__foot' },
      h('div', { class: 's-verse__ref' },
        h('span', { text: 'BHAGAVAD GITA' }), h('span', { class: 's-sep', text: '·' }),
        h('span', { text: v.id }), h('span', { class: 's-sep', text: '·' }), h('span', { class: 's-verse__chap', text: v.chapterName })),
      h('div', { class: 's-verse__actions' },
        hi && hi.btn,
        h('button', { type: 'button', class: 's-chipbtn', onclick: () => onCopy?.(verseCopyText(v)) }, icon('copy'), 'Copy'),
        h('button', { type: 'button', class: 's-chipbtn is-accent', onclick: () => onReflect?.(v) }, 'Reflect on this ', icon('arrowRight')),
      ),
    ),
  );
}
