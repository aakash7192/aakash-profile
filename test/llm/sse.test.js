import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSSEParser, iterateSSE } from '../../src/llm/sse.js';

const FIX = new URL('../fixtures/', import.meta.url);
const fixture = (n) => readFileSync(new URL(n, FIX));

function parseAll(chunks) {
  const out = [];
  const p = createSSEParser((e) => out.push(e));
  for (const c of chunks) p.push(c);
  p.end();
  return out;
}

function streamOf(chunks) {
  return new ReadableStream({
    start(c) { for (const x of chunks) c.enqueue(x); c.close(); },
  });
}

async function collect(body, signal) {
  const out = [];
  for await (const e of iterateSSE(body, signal)) out.push(e);
  return out;
}

test('parses basic events with event and data fields', () => {
  const evs = parseAll(['event: a\ndata: 1\n\ndata: 2\n\n']);
  assert.deepEqual(evs, [{ event: 'a', data: '1' }, { event: 'message', data: '2' }]);
});

test('handles CRLF, CR and LF line endings', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const evs = parseAll([`event: x${nl}data: hi${nl}${nl}data: there${nl}${nl}`]);
    assert.deepEqual(evs.map((e) => [e.event, e.data]), [['x', 'hi'], ['message', 'there']], JSON.stringify(nl));
  }
});

test('CRLF split across chunks does not create a phantom blank line', () => {
  const evs = parseAll(['data: a\r', '\ndata: b\r\n\r\n']);
  assert.deepEqual(evs, [{ event: 'message', data: 'a\nb' }]);
});

test('ignores comments and unknown fields; supports multi-line data and no-space values', () => {
  const evs = parseAll([': keep-alive\nretry: 100\nfoo: bar\ndata:line1\ndata: line2\n\n']);
  assert.deepEqual(evs, [{ event: 'message', data: 'line1\nline2' }]);
});

test('records id field and only strips one leading space', () => {
  const evs = parseAll(['id: 7\ndata:  two spaces\n\n']);
  assert.deepEqual(evs, [{ event: 'message', data: ' two spaces', id: '7' }]);
});

test('events with no data are not dispatched; event type resets after dispatch', () => {
  const evs = parseAll(['event: lonely\n\ndata: x\n\n']);
  assert.deepEqual(evs, [{ event: 'message', data: 'x' }]);
});

test('flushes a trailing event without a final blank line at end()', () => {
  assert.deepEqual(parseAll(['data: tail']), [{ event: 'message', data: 'tail' }]);
  assert.deepEqual(parseAll(['data: tail\r']), [{ event: 'message', data: 'tail' }]);
});

test('iterateSSE decodes UTF-8 split inside multi-byte characters', async () => {
  const bytes = new TextEncoder().encode('data: नमस्ते 🙏\n\n');
  const chunks = [...bytes].map((b) => new Uint8Array([b]));
  const evs = await collect(streamOf(chunks));
  assert.deepEqual(evs, [{ event: 'message', data: 'नमस्ते 🙏' }]);
});

const FIXTURES = ['anthropic-ok.sse', 'anthropic-error.sse', 'openai-ok.sse', 'openai-error.sse', 'gemini-ok.sse', 'gemini-error.sse'];

for (const name of FIXTURES) {
  test(`fuzz: ${name} split at every byte offset yields identical events`, async () => {
    const bytes = new Uint8Array(fixture(name));
    const expected = await collect(streamOf([bytes]));
    assert.ok(expected.length > 0);
    for (let i = 1; i < bytes.length; i++) {
      const got = await collect(streamOf([bytes.slice(0, i), bytes.slice(i)]));
      assert.deepEqual(got, expected, `split at ${i}`);
    }
    // a few random multi-way splits too
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 25; n++) {
      const cuts = [...new Set(Array.from({ length: 6 }, () => 1 + Math.floor(rnd() * (bytes.length - 1))))].sort((a, b) => a - b);
      const parts = [];
      let prev = 0;
      for (const c of cuts) { parts.push(bytes.slice(prev, c)); prev = c; }
      parts.push(bytes.slice(prev));
      assert.deepEqual(await collect(streamOf(parts)), expected);
    }
  });
}

test('iterateSSE throws AbortError when aborted and cancels the reader', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('data: 1\n\n')); },
    pull() { return new Promise(() => {}); },
    cancel() { cancelled = true; },
  });
  const ac = new AbortController();
  const it = iterateSSE(body, ac.signal);
  const first = await it.next();
  assert.equal(first.value.data, '1');
  setTimeout(() => ac.abort(), 5);
  await assert.rejects(it.next(), (e) => e.name === 'AbortError');
  assert.equal(cancelled, true);
});

test('iterateSSE throws immediately for an already-aborted signal', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(collect(streamOf([new TextEncoder().encode('data: x\n\n')]), ac.signal), (e) => e.name === 'AbortError');
});
