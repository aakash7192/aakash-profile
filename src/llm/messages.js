import { LLMError } from './errors.js';

/**
 * Normalize chat history for any provider.
 * 1. trim + drop empty  2. merge consecutive same-role  3. drop leading assistant turns
 * 4. keep newest turns within maxTurns / maxChars (always keep the last user turn)
 * 5. throw invalid_request if empty or the last turn is not from the user.
 * @param {{role:string, content:string}[]} msgs
 * @param {{maxChars?:number, maxTurns?:number}} [opts]
 * @returns {{role:'user'|'assistant', content:string}[]}
 */
export function normalizeMessages(msgs, { maxChars = 24000, maxTurns = 24 } = {}) {
  if (!Array.isArray(msgs)) throw new LLMError('invalid_request', 'messages must be an array');

  /** @type {{role:'user'|'assistant', content:string}[]} */
  const merged = [];
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!content) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) prev.content += '\n\n' + content;
    else merged.push({ role: m.role, content });
  }
  while (merged.length && merged[0].role === 'assistant') merged.shift();

  if (!merged.length) throw new LLMError('invalid_request', 'No user message to send');
  if (merged[merged.length - 1].role !== 'user') {
    throw new LLMError('invalid_request', 'The last message must be from the user');
  }

  const out = [merged[merged.length - 1]];
  let chars = out[0].content.length;
  for (let i = merged.length - 2; i >= 0; i--) {
    const m = merged[i];
    if (out.length >= maxTurns || chars + m.content.length > maxChars) break;
    out.unshift(m);
    chars += m.content.length;
  }
  // After truncation the window must still start with a user turn.
  while (out.length > 1 && out[0].role === 'assistant') out.shift();
  return out;
}
