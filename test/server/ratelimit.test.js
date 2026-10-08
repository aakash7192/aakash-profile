import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../../server/ratelimit.js';

test('allows rpm requests per window then blocks with retryAfterMs', () => {
  let t = 1_000_000;
  const rl = createRateLimiter({ rpm: 3, now: () => t });
  assert.equal(rl.check('a').ok, true);
  t += 10_000;
  assert.equal(rl.check('a').ok, true);
  assert.equal(rl.check('a').ok, true);
  const blocked = rl.check('a');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterMs, 50_000);
  assert.equal(rl.check('b').ok, true, 'keys are independent');
  t += 50_000;
  assert.equal(rl.check('a').ok, true, 'oldest hit slid out of the window');
});

test('rpm 0 disables limiting', () => {
  const rl = createRateLimiter({ rpm: 0 });
  for (let i = 0; i < 100; i++) assert.equal(rl.check('x').ok, true);
});

test('prunes idle keys when the map grows past maxKeys', () => {
  let t = 0;
  const rl = createRateLimiter({ rpm: 5, now: () => t, maxKeys: 10 });
  for (let i = 0; i < 11; i++) rl.check(`k${i}`);
  t += 61_000;
  rl.check('fresh');
  assert.equal(rl.size, 1);
});

test('hard cap: live keys never exceed maxKeys (oldest evicted)', () => {
  const t = 0;
  const rl = createRateLimiter({ rpm: 5, now: () => t, maxKeys: 10 });
  for (let i = 0; i < 100; i++) rl.check(`ip${i}`);
  assert.ok(rl.size <= 10, `size ${rl.size}`);
});
