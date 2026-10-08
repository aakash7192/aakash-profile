// Sliding-window, in-memory, per-key rate limiter (zero dependencies).

/**
 * @param {{ rpm?: number, windowMs?: number, now?: () => number, maxKeys?: number }} [opts]
 */
export function createRateLimiter({ rpm = 20, windowMs = 60_000, now = Date.now, maxKeys = 10_000 } = {}) {
  /** @type {Map<string, number[]>} */
  const hits = new Map();

  function prune(t) {
    for (const [k, arr] of hits) {
      while (arr.length && arr[0] <= t - windowMs) arr.shift();
      if (!arr.length) hits.delete(k);
    }
  }

  return {
    /** @returns {{ ok: true, remaining: number } | { ok: false, retryAfterMs: number }} */
    check(key) {
      if (!(rpm > 0)) return { ok: true, remaining: Infinity };
      const t = now();
      if (hits.size >= maxKeys) {
        prune(t);
        // Hard cap: if live keys still fill the table (e.g. a flood of distinct IPs), evict the oldest
        // inserted keys so memory stays bounded.
        if (hits.size >= maxKeys) {
          let excess = hits.size - maxKeys + 1;
          for (const k of hits.keys()) { if (excess-- <= 0) break; hits.delete(k); }
        }
      }
      const k = String(key || 'unknown');
      let arr = hits.get(k);
      if (!arr) { arr = []; hits.set(k, arr); }
      while (arr.length && arr[0] <= t - windowMs) arr.shift();
      if (arr.length >= rpm) {
        return { ok: false, retryAfterMs: Math.max(1, arr[0] + windowMs - t) };
      }
      arr.push(t);
      return { ok: true, remaining: rpm - arr.length };
    },
    get size() { return hits.size; },
    reset() { hits.clear(); },
  };
}
