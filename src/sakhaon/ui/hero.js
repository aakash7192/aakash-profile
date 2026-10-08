import { h } from './dom.js';
import { icon } from './icons.js';
import { APP } from '../core/app.js';
import { DISCLAIMER } from '../core/safety.js';
import { verseOfTheDay } from '../core/verses.js';
import { STARTERS, MORE_STARTERS } from '../starters.js';
import { renderVerseOfDay } from './verse-card.js';

export function greeting(date = new Date()) {
  const hr = date.getHours();
  if (hr >= 5 && hr < 11) return 'Suprabhat';
  if (hr >= 11 && hr < 17) return 'Namaste';
  if (hr >= 17 && hr < 22) return 'Shubh sandhya';
  return 'Still awake, friend?';
}

let moreOpen = false;

function chip(s, onPick) {
  return h('button', { type: 'button', class: 's-starter', lang: s.lang || null, onclick: () => onPick(s) },
    h('span', { class: 's-starter__label', text: s.label }),
    s.hint && h('span', { class: 's-starter__hint', text: s.hint }));
}

/**
 * opts: { settings, configured, recent:[{id,title,updatedAt,provider}], onStarter(s), onReflect(verse),
 *         onCopy(text), onSetup(), onOpenConv(id) }
 */
export function renderHero(opts) {
  const { settings, configured, recent = [] } = opts;
  const verse = verseOfTheDay(new Date());
  const showHindi = settings.showHindi || settings.language === 'hi' || settings.language === 'hinglish';

  const more = h('div', { class: 's-starters s-starters--more', id: 's-more-starters', hidden: !moreOpen },
    MORE_STARTERS.map((s) => chip(s, opts.onStarter)));
  const moreBtn = h('button', {
    type: 'button', class: 's-linkbtn s-more', 'aria-expanded': String(moreOpen), 'aria-controls': 's-more-starters',
    text: moreOpen ? 'Fewer topics' : 'More topics',
    onclick: () => {
      moreOpen = !moreOpen;
      more.hidden = !moreOpen;
      moreBtn.setAttribute('aria-expanded', String(moreOpen));
      moreBtn.textContent = moreOpen ? 'Fewer topics' : 'More topics';
    },
  });

  return h('section', { class: 's-hero', 'aria-labelledby': 's-hero-title' },
    h('div', { class: 's-hero__glow', 'aria-hidden': 'true' }),
    h('p', { class: 's-hero__greet' }, h('span', { class: 's-dot' }), greeting()),
    h('h1', { class: 's-hero__title', id: 's-hero-title', text: 'What weighs on your heart today?' }),
    h('p', { class: 's-hero__sub', text: `Talk it through with ${APP.persona} — a friend who knows the Bhagavad Gita.` }),

    renderVerseOfDay(verse, { showHindi, onReflect: opts.onReflect, onCopy: opts.onCopy }),

    h('div', { class: 's-hero__section' },
      h('div', { class: 's-micro', text: 'Start with what you feel' }),
      h('div', { class: 's-starters' }, STARTERS.map((s) => chip(s, opts.onStarter))),
      moreBtn,
      more,
    ),

    !configured && h('div', { class: 's-nudge' },
      h('span', { class: 's-nudge__dot', 'aria-hidden': 'true' }),
      h('span', { text: 'Connect a model to begin' }),
      h('button', { type: 'button', class: 's-linkbtn', dataset: { focusKey: 'hero-setup' }, onclick: opts.onSetup }, 'Set up ', icon('arrowRight'))),

    recent.length > 0 && h('div', { class: 's-hero__section' },
      h('div', { class: 's-micro', text: 'Pick up where you left off' }),
      h('ul', { class: 's-recent' }, recent.slice(0, 3).map((c) => h('li', null,
        h('a', { href: `#/c/${encodeURIComponent(c.id)}`, class: 's-recent__item' },
          h('span', { class: 's-pdot', dataset: { provider: c.provider || '' } }),
          h('span', { class: 's-recent__title', text: c.title }),
          icon('arrowRight')))))),

    h('p', { class: 's-disclaimer', text: DISCLAIMER }),
  );
}
