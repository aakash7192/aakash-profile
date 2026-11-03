import './fx.css';

/* ──────────────────────────────────────────────────────────────────────────
   FX layer: custom cursor, agent-network hero backdrop, magnetic buttons,
   spotlight/tilt cards, letter animation, scroll progress and scroll-spy.
   Everything degrades: touch devices keep the native cursor, reduced-motion
   users get a static backdrop and no transforms.
   ────────────────────────────────────────────────────────────────────────── */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const motion = !reduced;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const lerp = (a, b, t) => a + (b - a) * t;

/* ── Decorate existing markup with fx hooks (keeps index.html lean) ─────── */

function decorate() {
  $$('nav a[href^="#"]:not([href="#top"])').forEach((a) => a.classList.add('fx-navlink'));
  $$('.btn-primary, .btn-ghost, .icon-btn, .sakha-fab, nav .navlink').forEach((el) => el.classList.add('fx-mag'));

  const term = $('#term-log')?.closest('figure');
  if (term) term.classList.add('fx-spot', 'fx-term', 'fx-tilt');
  $$('#skills .two > div').forEach((el) => el.classList.add('fx-spot', 'fx-tilt'));
  $$('#skills ul').forEach((el) => el.classList.add('fx-list'));
  $$('[id^="stat-"]').forEach((el) => el.parentElement.classList.add('fx-stat'));
  $$('#about .three > div, #projects .three > article').forEach((el) => el.classList.add('fx-lift'));
  $$('#work .role').forEach((el) => el.classList.add('fx-role'));
  $$('h2 span[style*="--accent"]').forEach((el) => el.classList.add('fx-shine'));

  const marquee = $('[style*="animation:marquee"]');
  if (marquee) marquee.parentElement.classList.add('fx-marquee', 'fx-above');
  $$('#about, #projects, #work, #skills, #contact, footer').forEach((el) => el.classList.add('fx-above'));

  const avatar = $('#top img');
  if (avatar && !avatar.parentElement.classList.contains('fx-avatar')) {
    const ring = document.createElement('span');
    ring.className = 'fx-avatar';
    avatar.replaceWith(ring);
    ring.appendChild(avatar);
  }

  const bar = document.createElement('div');
  bar.className = 'fx-progress';
  const grain = document.createElement('div');
  grain.className = 'fx-grain';
  document.body.append(bar, grain);
}

/* ── Hero name: split into letters ──────────────────────────────────────── */

function splitName() {
  const h1 = $('#top h1');
  if (!h1) return;
  const text = h1.textContent;
  h1.removeAttribute('data-reveal');
  h1.setAttribute('aria-label', text);
  const wrap = document.createElement('span');
  wrap.className = 'fx-split';
  wrap.setAttribute('aria-hidden', 'true');
  /* letters are grouped per word so the name still wraps on narrow screens */
  let i = 0;
  text.split(' ').forEach((word, w) => {
    if (w) wrap.appendChild(document.createTextNode(' '));
    const wordEl = document.createElement('span');
    wordEl.className = 'fx-word';
    [...word].forEach((ch) => addLetter(wordEl, ch, i++));
    wrap.appendChild(wordEl);
  });
  function addLetter(parent, ch, i) {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.setProperty('--i', i);
    if (motion) {
      s.addEventListener('animationend', () => {
        s.classList.add('fx-in');
        s.classList.remove('fx-hop');
      });
      s.addEventListener('mouseenter', () => {
        if (!s.classList.contains('fx-in')) return;
        s.classList.remove('fx-hop');
        void s.offsetWidth;
        s.classList.add('fx-hop');
      });
    } else {
      s.classList.add('fx-in');
    }
    parent.appendChild(s);
  }
  h1.textContent = '';
  h1.appendChild(wrap);
}

/* ── Custom cursor ──────────────────────────────────────────────────────── */

function cursor() {
  if (!finePointer || !motion) return;
  const root = document.documentElement;
  const dot = document.createElement('div');
  dot.className = 'fx-cur-dot';
  const ring = document.createElement('div');
  ring.className = 'fx-cur-ring';
  const lens = document.createElement('i');
  const label = document.createElement('b');
  lens.appendChild(label);
  ring.appendChild(lens);
  document.body.append(ring, dot);
  root.classList.add('fx-cursor');

  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
  let stuck = null;

  const labelFor = (el) => {
    if (el.dataset.cursor) return el.dataset.cursor;
    const href = el.getAttribute('href') || '';
    if (href.startsWith('mailto:')) return 'mail';
    if (href.startsWith('tel:')) return 'call';
    if (href.startsWith('#')) return 'jump';
    if (el.target === '_blank') return 'open ↗';
    return 'go';
  };

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    root.classList.add('fx-cursor-on');
  }, { passive: true });
  document.addEventListener('pointerleave', () => root.classList.remove('fx-cursor-on'));
  addEventListener('blur', () => root.classList.remove('fx-cursor-on'));

  document.addEventListener('pointerover', (e) => {
    const t = e.target;
    const text = t.closest('input, textarea, #term-log');
    const link = !text && t.closest('a, button, [data-cursor]');
    ring.classList.toggle('is-text', !!text);
    dot.classList.toggle('is-text', !!text);
    ring.classList.toggle('is-link', !!link);
    dot.classList.toggle('is-link', !!link);
    if (link) label.textContent = labelFor(link);
    stuck = link && link.classList.contains('icon-btn') ? link : null;
  });

  addEventListener('pointerdown', (e) => {
    ring.classList.add('is-down');
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('span');
      s.className = 'fx-spark';
      s.style.left = e.clientX + 'px';
      s.style.top = e.clientY + 'px';
      s.style.setProperty('--a', (i * 45 + Math.random() * 12) + 'deg');
      document.body.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    }
  });
  addEventListener('pointerup', () => ring.classList.remove('is-down'));

  let last = performance.now();
  const tick = (now) => {
    const k = 1 - Math.pow(1 - 0.2, Math.min(4, (now - last) / 16.7));
    last = now;
    let tx = x, ty = y;
    if (stuck) {
      const r = stuck.getBoundingClientRect();
      tx = r.left + r.width / 2; ty = r.top + r.height / 2;
    }
    rx = lerp(rx, tx, k);
    ry = lerp(ry, ty, k);
    dot.style.transform = `translate3d(${x}px,${y}px,0)`;
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── Magnetic elements ──────────────────────────────────────────────────── */

function magnetic() {
  if (!finePointer || !motion) return;
  $$('.fx-mag').forEach((el) => {
    const strength = el.classList.contains('btn-primary') || el.classList.contains('btn-ghost') ? 0.35 : 0.25;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * strength}px,${dy * strength}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

/* ── Spotlight + tilt ───────────────────────────────────────────────────── */

function spotlight() {
  if (!finePointer) return;
  $$('.fx-spot, .contact-card').forEach((el) => {
    const tilt = motion && el.classList.contains('fx-tilt');
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${px * 100}%`);
      el.style.setProperty('--my', `${py * 100}%`);
      if (tilt && el.dataset.shown) {
        el.style.transition = 'transform .2s ease-out';
        el.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * 3}deg) rotateY(${(px - 0.5) * 4}deg)`;
      }
    });
    el.addEventListener('pointerleave', () => {
      if (tilt && el.dataset.shown) {
        el.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = 'none';
      }
    });
  });
}

/* ── Scroll progress + nav scroll-spy ───────────────────────────────────── */

function scrollFx() {
  const bar = $('.fx-progress');
  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    ticking = false;
  };
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();

  const links = new Map($$('.fx-navlink').map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a, id) => a.classList.toggle('is-active', id === en.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
}

/* ── Hero backdrop: drifting agent network with message pulses ─────────── */

function heroNetwork() {
  const header = $('#top');
  if (!header) return;
  const bg = document.createElement('div');
  bg.className = 'fx-hero-bg';
  bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = '<span class="fx-blob a"></span><span class="fx-blob b"></span><span class="fx-blob c"></span><canvas></canvas>';
  header.parentElement.insertBefore(bg, header.parentElement.firstChild.nextSibling);

  const canvas = $('canvas', bg);
  const ctx = canvas.getContext('2d');
  const BLUE = '120,170,245';
  const AMBER = '240,180,90';
  let w = 0, h = 0, dpr = 1, nodes = [], pulses = [], visible = true;
  const mouse = { x: -9999, y: -9999 };
  const LINK = 150;
  /* fade the network out toward the bottom (cheaper than a CSS mask) */
  const fade = (y) => (y < h * 0.5 ? 1 : Math.max(0, 1 - (y - h * 0.5) / (h * 0.45)));

  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = bg.clientWidth; h = bg.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(90, Math.round((w * h) / 15000));
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.6 + 0.6,
      hub: Math.random() < 0.08,
    }));
    pulses = [];
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const n of nodes) {
      if (motion) {
        const dx = mouse.x - n.x, dy = mouse.y - n.y;
        const d = Math.hypot(dx, dy);
        if (d < 200 && d > 1) { n.vx += (dx / d) * 0.012; n.vy += (dy / d) * 0.012; }
        n.vx *= 0.99; n.vy *= 0.99;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp < 0.08) { n.vx += (Math.random() - 0.5) * 0.04; n.vy += (Math.random() - 0.5) * 0.04; }
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) {
          ctx.strokeStyle = `rgba(${BLUE},${(1 - d / LINK) * 0.22 * fade((a.y + b.y) / 2)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if (motion && Math.random() < 0.0009 && pulses.length < 14) pulses.push({ a, b, t: 0 });
        }
      }
      const md = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (md < 190) {
        ctx.strokeStyle = `rgba(${BLUE},${(1 - md / 190) * 0.5 * fade(a.y)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
      }
    }
    for (const n of nodes) {
      ctx.globalAlpha = fade(n.y);
      ctx.fillStyle = n.hub ? `rgba(${AMBER},.85)` : `rgba(${BLUE},.75)`;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.hub ? n.r + 1.2 : n.r, 0, Math.PI * 2); ctx.fill();
      if (n.hub) {
        ctx.strokeStyle = `rgba(${AMBER},.25)`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    pulses = pulses.filter((p) => {
      p.t += 0.018;
      if (p.t >= 1) return false;
      const px = lerp(p.a.x, p.b.x, p.t), py = lerp(p.a.y, p.b.y, p.t);
      ctx.globalAlpha = fade(py);
      const g = ctx.createRadialGradient(px, py, 0, px, py, 8);
      g.addColorStop(0, 'rgba(200,225,255,.95)');
      g.addColorStop(1, 'rgba(120,170,245,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
      return true;
    });
    ctx.globalAlpha = 1;
  };

  const loop = () => {
    if (visible && !document.hidden) draw();
    requestAnimationFrame(loop);
  };

  resize();
  addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(() => { resize(); if (!motion) draw(); }, 150); });
  if (!motion) { draw(); return; }

  addEventListener('pointermove', (e) => {
    const r = bg.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  }, { passive: true });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(bg);
  requestAnimationFrame(loop);
}

/* ── Start ──────────────────────────────────────────────────────────────── */

decorate();
splitName();
heroNetwork();
cursor();
magnetic();
spotlight();
scrollFx();
