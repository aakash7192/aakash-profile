import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMessages } from '../../src/llm/messages.js';

const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });

test('trims and drops empty messages and unknown roles', () => {
  assert.deepEqual(normalizeMessages([u('  hi  '), a('   '), { role: 'system', content: 'x' }, u('')]), [u('hi')]);
});

test('merges consecutive same-role messages', () => {
  assert.deepEqual(normalizeMessages([u('a'), u('b'), a('c'), a('d'), u('e')]), [u('a\n\nb'), a('c\n\nd'), u('e')]);
});

test('drops leading assistant turns', () => {
  assert.deepEqual(normalizeMessages([a('welcome'), u('hi')]), [u('hi')]);
});

test('keeps newest turns within maxTurns', () => {
  const msgs = [u('1'), a('2'), u('3'), a('4'), u('5')];
  assert.deepEqual(normalizeMessages(msgs, { maxTurns: 3 }), [u('3'), a('4'), u('5')]);
  // window must start with a user turn
  assert.deepEqual(normalizeMessages(msgs, { maxTurns: 2 }), [u('5')]);
});

test('keeps newest turns within maxChars', () => {
  const msgs = [u('aaaaaaaaaa'), a('bbbbbbbbbb'), u('cc')];
  assert.deepEqual(normalizeMessages(msgs, { maxChars: 12 }), [u('cc')]);
  assert.deepEqual(normalizeMessages(msgs, { maxChars: 22 }), [u('aaaaaaaaaa'), a('bbbbbbbbbb'), u('cc')]);
});

test('always keeps the last user turn even when over budget', () => {
  const big = 'x'.repeat(50);
  assert.deepEqual(normalizeMessages([u('a'), a('b'), u(big)], { maxChars: 10 }), [u(big)]);
});

test('throws invalid_request when empty or the last turn is not from the user', () => {
  assert.throws(() => normalizeMessages([]), (e) => e.code === 'invalid_request');
  assert.throws(() => normalizeMessages([a('only')]), (e) => e.code === 'invalid_request');
  assert.throws(() => normalizeMessages([u('q'), a('answer')]), (e) => e.code === 'invalid_request');
  assert.throws(() => normalizeMessages('nope'), (e) => e.code === 'invalid_request');
});
