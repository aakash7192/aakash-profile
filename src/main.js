import './style.css';

/* ──────────────────────────────────────────────────────────────────────────
   Vanilla port of the design's DCLogic component.
   Three behaviours: typing terminal, stat counters, scroll reveal.
   ────────────────────────────────────────────────────────────────────────── */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Terminal ───────────────────────────────────────────────────────────── */

const script = [
  'this site: designed, coded, deployed by agents — repo public',
  'figma mcp · claude design → claude code · pixel-perfect ui',
  'skypowers: my claude code plugin · published on github',
  'radiant world: invoicing 90% faster · document-extraction pipeline',
  'mahindra manulife: flutter rewrite from scratch · led team of 3',
  'docsmart: healthcare android · 10k+ users · team lead · no missed deadlines',
  'exit 0 · 15+ apps shipped over 12 years',
];

const log = document.getElementById('term-log');
const lineStack = document.getElementById('term-lines');
const typedEl = document.getElementById('term-typed');
const input = document.getElementById('term-input');

const MAX_LINES = 40;

function stickScroll() {
  if (log.scrollHeight - log.scrollTop - log.clientHeight < 90) log.scrollTop = log.scrollHeight;
}

function pushLine(text) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;color:var(--bandBody)';
  const glyph = document.createElement('span');
  glyph.style.color = 'var(--accentOnBand)';
  glyph.textContent = '›';
  const body = document.createElement('span');
  body.textContent = text;
  row.append(glyph, body);
  lineStack.appendChild(row);
  while (lineStack.childElementCount > MAX_LINES) lineStack.removeChild(lineStack.firstElementChild);
  stickScroll();
}

let lineIndex = 0;
let charIndex = 0;
let pauseUntil = 0;
let pendingPush = null;
let userMode = false;

function step() {
  if (userMode) return;
  if (pauseUntil && Date.now() < pauseUntil) return;
  if (pendingPush) {
    pushLine(pendingPush);
    pendingPush = null;
    typedEl.textContent = '';
    pauseUntil = Date.now() + 700;
    return;
  }
  const line = script[lineIndex % script.length];
  if (charIndex <= line.length) {
    typedEl.textContent = line.slice(0, charIndex);
    charIndex += 1;
    stickScroll();
    return;
  }
  charIndex = 0;
  lineIndex += 1;
  pendingPush = line;
  pauseUntil = Date.now() + 2000;
}

log.addEventListener('click', () => input.focus());
input.addEventListener('focus', () => { userMode = true; });
input.addEventListener('blur', () => { userMode = false; });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && input.value.trim()) {
    pushLine(input.value.trim());
    input.value = '';
  } else if (e.key === 'Escape') {
    input.blur();
  }
});

/* ── Counters ───────────────────────────────────────────────────────────── */

/* Final values live in the HTML so the strip reads correctly without JS;
   the count-up only ever animates from 0 once JS is actually running. */
const stats = {
  yrs: document.getElementById('stat-yrs'),
  mobile: document.getElementById('stat-mobile'),
  apps: document.getElementById('stat-apps'),
  cut: document.getElementById('stat-cut'),
};

const targets = [
  ['yrs', 12, ''],
  ['mobile', 8, ''],
  ['apps', 15, '+'],
  ['cut', 90, '%'],
];

let counted = false;

function setStat(key, value, suffix) {
  stats[key].textContent = value.toLocaleString('en-US') + suffix;
}

function count() {
  if (counted) return;
  counted = true;
  const start = performance.now();
  const run = (now) => {
    const p = Math.min(1, (now - start) / 1100);
    const eased = 1 - Math.pow(1 - p, 3);
    targets.forEach(([key, to, suffix]) => setStat(key, Math.round(to * eased), suffix));
    if (p < 1) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
}

/* ── Reveal on scroll ───────────────────────────────────────────────────── */

function observe() {
  const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
  nodes.forEach((n) => {
    n.style.opacity = '0';
    n.style.transform = 'translateY(16px)';
    n.style.transition = 'opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)';
  });
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry, k) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      }, k * 70);
      obs.unobserve(el);
      if (el.textContent.includes('years in production')) count();
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  nodes.forEach((n) => obs.observe(n));
  setTimeout(count, 400);
}

/* ── Start ──────────────────────────────────────────────────────────────── */

if (reduced) {
  script.forEach(pushLine);
  typedEl.textContent = 'idle';
  counted = true;
  targets.forEach(([key, to, suffix]) => setStat(key, to, suffix));
} else {
  setInterval(step, 55);
  observe();
}
