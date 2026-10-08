import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, markdownToSafeHtml, parseReply, plainText } from '../../src/sakhaon/core/reply.js';

// Minimal well-formedness check: every opened allowlisted tag closes in order; no other tags.
const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'code', 'blockquote', 'ul', 'ol', 'li', 'a']);
function assertWellFormed(html) {
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/gi)) {
    const [, close, name] = m;
    assert.ok(ALLOWED.has(name), `unexpected tag <${name}> in ${html}`);
    if (name === 'br') continue;
    if (close) assert.equal(stack.pop(), name, `bad nesting in ${html}`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], `unclosed tags in ${html}`);
  // Any '<' left must be part of a tag we matched
  assert.equal(html.replace(/<\/?[a-z0-9]+[^>]*>/gi, '').includes('<'), false);
}

test('escapeHtml escapes & < > " \'', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('XSS: raw HTML is escaped, never emitted', () => {
  const h = markdownToSafeHtml('<img src=x onerror=alert(1)> <script>alert(1)</script>');
  assert.equal(h.includes('<img'), false);
  assert.equal(h.includes('<script'), false);
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assertWellFormed(h);
});

test('XSS: javascript:, data: and http links are rendered as plain text', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'http://example.com', 'JaVaScRiPt:alert(1)']) {
    const h = markdownToSafeHtml(`[click](${url})`);
    assert.equal(h.includes('<a'), false, url);
    assertWellFormed(h);
  }
});

test('XSS: quotes inside a link cannot break out of the href attribute', () => {
  const h = markdownToSafeHtml('[x](https://a.test/"onmouseover="alert(1))');
  assertWellFormed(h);
  assert.equal(/<a [^>]*onmouseover/i.test(h), false);
  const h2 = markdownToSafeHtml('[x](https://a.test/?q="a"&b=1)');
  assert.ok(h2.includes('href="https://a.test/?q=&quot;a&quot;&amp;b=1"'));
  assertWellFormed(h2);
});

test('https links get safe attributes', () => {
  assert.equal(markdownToSafeHtml('see [Gita](https://example.org/bg)'),
    '<p>see <a href="https://example.org/bg" target="_blank" rel="noopener noreferrer nofollow">Gita</a></p>');
});

test('markdown subset', () => {
  assert.equal(markdownToSafeHtml('a\nb\n\nc'), '<p>a<br>b</p><p>c</p>');
  assert.equal(markdownToSafeHtml('**bold** and *em* and _em2_ and `code`'), '<p><strong>bold</strong> and <em>em</em> and <em>em2</em> and <code>code</code></p>');
  assert.equal(markdownToSafeHtml('> quote\n> more'), '<blockquote><p>quote<br>more</p></blockquote>');
  assert.equal(markdownToSafeHtml('- one\n* two'), '<ul><li>one</li><li>two</li></ul>');
  assert.equal(markdownToSafeHtml('1. one\n2. two'), '<ol><li>one</li><li>two</li></ol>');
  assert.equal(markdownToSafeHtml('## Title'), '<p><strong>Title</strong></p>');
  assert.equal(markdownToSafeHtml('**a *b* c**'), '<p><strong>a <em>b</em> c</strong></p>');
  assert.equal(markdownToSafeHtml('snake_case_word stays'), '<p>snake_case_word stays</p>');
  assert.equal(markdownToSafeHtml('*karma yoga* means'), '<p><em>karma yoga</em> means</p>');
});

test('unclosed / crossing markdown stays literal and well-formed', () => {
  for (const s of ['**unclosed', '*unclosed', '`code', '[link](', '[link](https://x', '**a *b** c*', '*a **b* c**', '_a *b_ c*', '`a **b` c**', '**`x`**', '[**x**](https://a.b)']) {
    assertWellFormed(markdownToSafeHtml(s));
  }
  assert.equal(markdownToSafeHtml('**unclosed'), '<p>**unclosed</p>');
});

test('markers resolve as resolved / unverified / invalid', () => {
  const segs = parseReply('Intro text.\n\n[[BG 2.47]]\n\nMiddle [[ bg 9.22 ]] and [[BG 2.99]] end.');
  assert.deepEqual(segs.map((s) => s.type), ['html', 'verse', 'html', 'verse', 'html', 'verse', 'html']);
  const verses = segs.filter((s) => s.type === 'verse');
  assert.deepEqual(verses.map((v) => [v.ref, v.status]), [['2.47', 'resolved'], ['9.22', 'unverified'], ['2.99', 'invalid']]);
  assert.equal(verses[0].data.id, '2.47');
  assert.equal(verses[1].data, null);
  assert.equal(verses[2].data, null);
  assert.equal(segs[0].html, '<p>Intro text.</p>');
  for (const s of segs) if (s.type === 'html') assertWellFormed(s.html);
});

test('marker numbers are normalised and chapter 0 / 19 are invalid', () => {
  const [v] = parseReply('[[BG 02.047]]');
  assert.equal(v.ref, '2.47');
  assert.equal(v.status, 'resolved');
  assert.equal(parseReply('[[BG 19.1]]')[0].status, 'invalid');
  assert.equal(parseReply('[[BG 0.1]]')[0].status, 'invalid');
});

test('streaming holds back a trailing partial marker', () => {
  for (const partial of ['[', '[[', '[[B', '[[BG 2', '[[BG 2.4', '[[BG 2.47', '[[BG 2.47]']) {
    const segs = parseReply(`Hello friend.\n\n${partial}`, { streaming: true });
    assert.deepEqual(segs, [{ type: 'html', html: '<p>Hello friend.</p>' }], partial);
  }
  const full = parseReply('Hello friend.\n\n[[BG 2.47]]', { streaming: true });
  assert.equal(full[1].type, 'verse');
  // non-streaming does not hold back
  assert.equal(parseReply('Hi [[BG 2', { streaming: false })[0].html, '<p>Hi [[BG 2</p>');
});

test('streaming with unclosed markdown is well-formed', () => {
  for (const s of ['Some **bold', 'Some *it', 'a `co', 'see [the link](https://exa']) {
    for (const seg of parseReply(s, { streaming: true })) if (seg.type === 'html') assertWellFormed(seg.html);
  }
});

test('empty input gives no segments', () => {
  assert.deepEqual(parseReply(''), []);
  assert.deepEqual(parseReply('   \n\n  '), []);
});

test('plainText strips markdown and rewrites markers', () => {
  assert.equal(plainText('**Hold** on, *friend*.\n\n[[BG 2.47]]\n\nSee [this](https://x.y) and `code`.'),
    'Hold on, friend.\n\nBG 2.47\n\nSee this (https://x.y) and code.');
  assert.equal(plainText('## Head\n> quote\n* item'), 'Head\nquote\n- item');
});
