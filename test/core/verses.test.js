import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, VERSES, VERSE_REFS, getVerse, isValidRef, verseOfTheDay, externalVerseUrl } from '../../src/sakhaon/core/verses.js';

const EXPECTED = ['2.14', '2.20', '2.47', '2.48', '2.50', '2.56', '2.62', '3.19', '3.21', '3.35', '4.7', '4.38', '6.5', '6.6', '6.17', '6.26', '6.35', '12.13', '17.15', '18.66'];

test('18 chapters whose verse counts sum to 700', () => {
  assert.equal(CHAPTERS.length, 18);
  assert.equal(CHAPTERS.reduce((s, c) => s + c.verses, 0), 700);
  assert.deepEqual(CHAPTERS.map((c) => c.n), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.equal(CHAPTERS[1].name, 'Sāṅkhya Yoga');
});

test('library is exactly the 20 curated refs, all valid and complete', () => {
  assert.deepEqual(VERSE_REFS, EXPECTED);
  assert.equal(VERSES.length, 20);
  for (const v of VERSES) {
    assert.ok(isValidRef(v.chapter, v.verse), v.id);
    assert.equal(v.id, `${v.chapter}.${v.verse}`);
    assert.equal(v.chapterName, CHAPTERS[v.chapter - 1].name);
    for (const k of ['theme', 'iast', 'en', 'hi']) assert.ok(typeof v[k] === 'string' && v[k].length > 5, `${v.id}.${k}`);
    assert.ok(v.iast.includes(' / '), `${v.id} iast has two lines`);
    assert.ok(/[ऀ-ॿ]/.test(v.hi), `${v.id} hi is Devanagari`);
    assert.equal(/[ऀ-ॿ]/.test(v.iast), false, `${v.id} iast has no Devanagari`);
    assert.equal(v.daily, v.id !== '3.35');
  }
});

test('getVerse accepts common ref formats', () => {
  assert.equal(getVerse('2.47').id, '2.47');
  assert.equal(getVerse('BG 2.47').id, '2.47');
  assert.equal(getVerse('2:47').id, '2.47');
  assert.equal(getVerse('9.22'), null);
  assert.equal(getVerse('nonsense'), null);
  assert.equal(getVerse(undefined), null);
});

test('isValidRef uses chapter counts', () => {
  assert.equal(isValidRef(2, 72), true);
  assert.equal(isValidRef(2, 73), false);
  assert.equal(isValidRef(18, 78), true);
  assert.equal(isValidRef(0, 1), false);
  assert.equal(isValidRef(19, 1), false);
  assert.equal(isValidRef(1, 0), false);
  assert.equal(isValidRef(1.5, 2), false);
});

test('verseOfTheDay is deterministic per local day and never 3.35', () => {
  const a = verseOfTheDay(new Date(2026, 9, 8, 6, 0));
  const b = verseOfTheDay(new Date(2026, 9, 8, 23, 59));
  assert.equal(a.id, b.id);
  const seen = new Set();
  for (let d = 0; d < 800; d++) {
    const v = verseOfTheDay(new Date(2026, 0, 1 + d));
    assert.notEqual(v.id, '3.35');
    assert.equal(v.daily, true);
    seen.add(v.id);
  }
  assert.equal(seen.size, 19);
  assert.ok(verseOfTheDay());
});

test('externalVerseUrl', () => {
  assert.equal(externalVerseUrl(9, 22), 'https://vedabase.io/en/library/bg/9/22/');
});

test('externalVerseUrl: chapter 13 maps Gita Press numbering onto vedabase (+1); 13.35 is not a valid ref', () => {
  assert.equal(externalVerseUrl(13, 1), 'https://vedabase.io/en/library/bg/13/2/');
  assert.equal(externalVerseUrl(13, 34), 'https://vedabase.io/en/library/bg/13/35/');
  assert.equal(externalVerseUrl(12, 20), 'https://vedabase.io/en/library/bg/12/20/');
  assert.equal(CHAPTERS[12].verses, 34);
  assert.equal(isValidRef(13, 35), false);
});
