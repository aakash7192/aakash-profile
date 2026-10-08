// Server-Sent Events parser (WHATWG-style). Isomorphic: no DOM, no node:*.
// Handles CRLF / CR / LF line endings (also split across chunks), comments,
// multi-line data, `event:` / `id:` fields, and flushes a trailing event at end().

/**
 * @typedef {{ event: string, data: string, id?: string }} SSEEvent
 */

/**
 * @param {(ev: SSEEvent) => void} onEvent
 */
export function createSSEParser(onEvent) {
  let buf = '';
  let data = [];
  let hasData = false;
  let event = '';
  let lastId;

  function dispatch() {
    if (hasData) {
      /** @type {SSEEvent} */
      const ev = { event: event || 'message', data: data.join('\n') };
      if (lastId !== undefined) ev.id = lastId;
      onEvent(ev);
    }
    data = [];
    hasData = false;
    event = '';
  }

  function line(l) {
    if (l === '') { dispatch(); return; }
    if (l[0] === ':') return; // comment
    const i = l.indexOf(':');
    let field = l;
    let value = '';
    if (i !== -1) {
      field = l.slice(0, i);
      value = l.slice(i + 1);
      if (value[0] === ' ') value = value.slice(1);
    }
    switch (field) {
      case 'data': data.push(value); hasData = true; break;
      case 'event': event = value; break;
      case 'id': if (!value.includes('\0')) lastId = value; break;
      default: break; // 'retry' and unknown fields ignored
    }
  }

  function drain(final) {
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      const c = buf.charCodeAt(i);
      if (c === 10 /* \n */) {
        line(buf.slice(start, i));
        start = i + 1;
      } else if (c === 13 /* \r */) {
        if (i + 1 >= buf.length && !final) break; // might be CRLF split across chunks
        line(buf.slice(start, i));
        if (buf.charCodeAt(i + 1) === 10) i++;
        start = i + 1;
      }
    }
    buf = buf.slice(start);
  }

  return {
    /** @param {string} chunk */
    push(chunk) {
      if (!chunk) return;
      buf += chunk;
      drain(false);
    },
    end() {
      drain(true);
      if (buf.length) { line(buf); buf = ''; }
      dispatch();
    },
  };
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

/**
 * Iterate SSE events from a byte stream (Response.body).
 * @param {ReadableStream<Uint8Array>} body
 * @param {AbortSignal} [signal]
 * @returns {AsyncGenerator<SSEEvent>}
 */
export async function* iterateSSE(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  /** @type {SSEEvent[]} */
  const queue = [];
  const parser = createSSEParser((ev) => queue.push(ev));
  const onAbort = () => { reader.cancel().catch(() => {}); };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) throw abortError();
    for (;;) {
      const { value, done } = await reader.read();
      if (signal?.aborted) throw abortError();
      if (done) {
        parser.push(decoder.decode());
        parser.end();
        while (queue.length) yield /** @type {SSEEvent} */ (queue.shift());
        return;
      }
      parser.push(typeof value === 'string' ? value : decoder.decode(value, { stream: true }));
      while (queue.length) {
        yield /** @type {SSEEvent} */ (queue.shift());
        if (signal?.aborted) throw abortError();
      }
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    try { await reader.cancel(); } catch { /* already closed */ }
  }
}
