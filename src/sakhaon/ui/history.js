import { h, clear, relativeDay } from './dom.js';
import { icon } from './icons.js';

const GROUPS = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

/**
 * deps: { store, onOpen(id), onNew(), onDelete(id), onRename(id,title), onExport(), onClearAll(), onClose() }
 */
export function createHistory(deps) {
  let query = '';
  let activeId = null;
  let menuFor = null;
  let renaming = null;

  const search = h('input', {
    type: 'search', class: 's-input s-hist__search', placeholder: 'Search conversations', 'aria-label': 'Search conversations',
    oninput: () => { query = search.value; renderList(); },
  });
  const list = h('nav', { class: 's-hist__list', 'aria-label': 'Conversations' });
  const el = h('aside', { class: 's-rail', id: 's-rail', 'aria-label': 'Conversation history', tabindex: '-1' },
    h('div', { class: 's-hist__head' },
      h('div', { class: 's-hist__top' },
        h('span', { class: 's-micro', text: 'Conversations' }),
        h('button', { type: 'button', class: 's-iconbtn s-hist__close', 'aria-label': 'Close history', onclick: () => deps.onClose() }, icon('close'))),
      h('div', { class: 's-hist__searchrow' },
        h('span', { class: 's-hist__searchico' }, icon('search')),
        search),
      h('button', { type: 'button', class: 's-btn s-btn--block', onclick: () => deps.onNew() }, icon('plus'), 'New conversation'),
    ),
    list,
    h('div', { class: 's-hist__foot' },
      h('button', { type: 'button', class: 's-linkbtn', onclick: () => deps.onExport() }, icon('download'), 'Export all'),
      h('button', { type: 'button', class: 's-linkbtn is-danger', onclick: () => deps.onClearAll() }, icon('trash'), 'Clear all'),
    ),
  );

  document.addEventListener('click', (e) => {
    if (menuFor && !e.target.closest('.s-hist__menu, .s-hist__more')) { menuFor = null; renderList(); }
  });

  /** renderList() rebuilds rows; put focus back on a stable equivalent, but only if it fell to <body>. */
  function refocus(selector) {
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      const t = (selector && list.querySelector(selector)) || search;
      if (t && t.getClientRects().length) t.focus();
    });
  }
  const moreSel = (id) => `.s-hist__more[data-id="${CSS.escape(id)}"]`;
  const itemSel = (id) => `.s-hist__item[data-id="${CSS.escape(id)}"]`;

  function matches(c) {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (c.title || '').toLowerCase().includes(q) || (c.preview || '').toLowerCase().includes(q);
  }

  function itemRow(c) {
    const isActive = c.id === activeId;
    if (renaming === c.id) {
      const input = h('input', { class: 's-input s-hist__rename', value: c.title, 'aria-label': 'Rename conversation', maxlength: '80' });
      const commit = (save) => {
        if (renaming !== c.id) return;
        renaming = null;
        if (save && input.value.trim()) deps.onRename(c.id, input.value.trim());
        renderList();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(true); refocus(moreSel(c.id)); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit(false); refocus(moreSel(c.id)); }
      });
      input.addEventListener('blur', () => commit(true));
      requestAnimationFrame(() => { input.focus(); input.select(); });
      return h('li', { class: 's-hist__row is-renaming' }, input);
    }
    const moreBtn = h('button', {
      type: 'button', class: 's-iconbtn s-iconbtn--sm s-hist__more', 'aria-label': `More actions for ${c.title}`,
      // A disclosure (not an ARIA menu): aria-expanded + aria-controls, no aria-haspopup.
      'aria-expanded': String(menuFor === c.id), 'aria-controls': menuFor === c.id ? `s-hist-menu-${c.id}` : null,
      dataset: { id: c.id },
      onclick: (e) => { e.stopPropagation(); menuFor = menuFor === c.id ? null : c.id; renderList(); if (menuFor) requestAnimationFrame(() => list.querySelector('.s-hist__menu button')?.focus()); else refocus(moreSel(c.id)); },
    }, icon('more'));
    return h('li', { class: 's-hist__row' + (isActive ? ' is-active' : '') },
      h('a', { class: 's-hist__item', dataset: { id: c.id }, href: `#/c/${encodeURIComponent(c.id)}`, 'aria-current': isActive ? 'page' : null,
        onclick: (e) => { e.preventDefault(); deps.onOpen(c.id); } },
        h('span', { class: 's-pdot', dataset: { provider: c.provider || '' } }),
        h('span', { class: 's-hist__title', text: c.title || 'Untitled' })),
      moreBtn,
      menuFor === c.id && h('div', { class: 's-hist__menu', id: `s-hist-menu-${c.id}`, role: 'group', 'aria-label': 'Conversation actions',
        onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); menuFor = null; renderList(); refocus(moreSel(c.id)); } } },
        h('button', { type: 'button', onclick: () => { menuFor = null; renaming = c.id; renderList(); } }, icon('edit'), 'Rename'),
        h('button', { type: 'button', class: 'is-danger', onclick: () => {
          menuFor = null;
          // Neighbour to land on once this row is gone: next row, else previous.
          const ids = [...list.querySelectorAll('.s-hist__item')].map((a) => a.dataset.id);
          const i = ids.indexOf(c.id);
          const neighbour = ids[i + 1] || ids[i - 1];
          deps.onDelete(c.id);
          renderList();
          refocus(list.querySelector(itemSel(c.id)) ? moreSel(c.id) : neighbour ? itemSel(neighbour) : null);
        } }, icon('trash'), 'Delete')),
    );
  }

  function renderList() {
    clear(list);
    const all = deps.store.listConversations();
    const items = all.filter(matches);
    if (!all.length) {
      list.append(h('p', { class: 's-hist__empty', text: 'Your conversations will rest here.' }));
      return;
    }
    if (!items.length) {
      list.append(h('p', { class: 's-hist__empty', text: 'No conversations match.' }));
      return;
    }
    const grouped = new Map(GROUPS.map((g) => [g, []]));
    for (const c of items) grouped.get(relativeDay(c.updatedAt)).push(c);
    for (const [label, rows] of grouped) {
      if (!rows.length) continue;
      const gid = `s-hist-g-${label.replace(/\W+/g, '')}`;
      list.append(h('div', { class: 's-hist__group' },
        h('h3', { class: 's-micro s-hist__glabel', id: gid, text: label }),
        h('ul', { 'aria-labelledby': gid }, rows.map(itemRow))));
    }
  }

  function render(id = activeId) {
    activeId = id;
    renderList();
  }

  return { el, render, focusSearch: () => search.focus() };
}
