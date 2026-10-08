# Sakhaon — Bhagavad Gita companion chatbot · Implementation spec (v1)

Repo: `/home/user/aakash-profile` (Vite 6, vanilla JS ESM, `"type":"module"`, Node 22, GitHub Pages at base `/aakash-profile/`).
Branch: `claude/sakhaon-chatbot-ui-ewmjqj`. **Builders must not commit or push.** Gate: `npm test && npm run build` both pass.

---

## 0. Verdict on the three proposals (what we keep, what we cut, why)

| # | Topic | Conflict / weakness | Decision |
|---|---|---|---|
| 1 | Name / slug | P1 wants `/sakha/`; the task and P2 use `sakhaon/`; P1 and P3 read "Sakhaon home screen" as "Sakha on home screen". | **Both readings get built.** The product, wordmark and URL slug are **Sakhaon**, at `/aakash-profile/sakhaon/`. The persona in conversation is **Sakha** (the friend). Both names live in one `APP` constant. We also add a **launcher on the portfolio home screen** (a nav pill and a floating button), so the "on home screen" reading is covered too. Renaming is a one-line change. |
| 2 | Verse grounding | P1 wants a `[[BG c.v]]` marker and 60–80 Devanagari verses. P3 has the model write IAST inline, with a curated set of 20 verses in IAST, EN and HI. Hand-typing 60–80 Devanagari shlokas without review risks shipping wrong scripture, and that is worse than the model doing it. | **Hybrid.** The model writes only the marker `[[BG c.v]]` and never Sanskrit text. The client renders a **VerseCard** from P3's curated **20-verse library** (IAST, EN, HI), which is already reviewed. The prompt lists which refs are in the library and tells the model to prefer them. A valid ref outside the library gives an "unverified" card (ref, chapter name and an external link). An out-of-range ref gives an "invalid" inline warning. The library also drives the verse of the day. No Devanagari Sanskrit in v1; Hindi meanings are Devanagari. |
| 3 | Reply length | P1 says 120–220 words, P3 says 60–150. | Default is **60–150 words** (P3). The "Response length" setting (Brief / Balanced / Deep) changes both the word guidance in the system prompt and `maxTokens`. |
| 4 | Helplines | P1 lists KIRAN as primary. P3 notes that KIRAN was reported folded into Tele-MANAS. | **Drop KIRAN** so we don't ship a stale number. Ship Tele-MANAS 14416 / 1-800-891-4416, 112, 988 (US/CA), Samaritans 116 123 (UK/IE) and findahelpline.com. `HELPLINES_LAST_VERIFIED` is kept in data. |
| 5 | Crisis handling | P1 is ambiguous about sending. P3 says always send. | Use **defense in depth**. The client runs `detectCrisis()` and pins a dismissible support card, and **still sends** the message (never block). The system prompt has a crisis protocol at the top. The footer disclaimer is always visible, and a "Need help now?" button sits in the top bar. |
| 6 | Verse-of-day rotation | P3's 3.35 includes a "death" clause; 18.66 and 4.7 are devotional and first-person ("Me"). | **Exclude 3.35 from the daily rotation** but keep it in the library. Keep the others. Leave 2.3, 4.13, 9.32, 18.41–44 and chapter 13 out of the library. |
| 7 | OpenAI API | P1 mentions "chat/responses". | Use **Chat Completions** only (P2). It is the interoperable protocol, so OpenRouter, Groq, Ollama and others become registry rows later. |
| 8 | Gemini thinking budget | P2 notes that thinking tokens eat `maxOutputTokens`. | Put `thinkingBudget` in caps: flash and flash-lite get `0`, pro gets `512`. The adapter sends `maxOutputTokens = maxTokens + thinkingBudget`. |
| 9 | Retry-without-temperature magic (P2) | Hidden stateful heuristics are hard to debug. | **Cut.** The caps heuristic plus the custom model id field is enough. |
| 10 | Recorded fixtures "from real APIs" (P2) | The workspace has no keys or network. | **Hand-author** SSE fixtures that follow each provider's documented stream format. Real captures can replace them later. |
| 11 | Proxy token | P2 already calls it a speed bump, since it ships in a static bundle. | Keep it optional. The real controls are `PIN_SYSTEM_PROMPT` (**default ON**), the origin allowlist, the token cap, the model allowlist and the per-IP rate limit. |
| 12 | UI scope creep (P1) | Read-aloud, edit-and-resend, word meanings, storage meter, swipe gestures, rotating placeholder, a "New to the Gita" popover, per-conversation .md export, full-text search and a Hindi UI are all proposed. | **v1 cuts:** read-aloud, edit-and-resend, word meanings, storage meter, swipe gestures, rotating placeholders and the Hindi UI. **v1 keeps:** title search (title and first message), "Export all (JSON)", per-item rename/delete with undo, and regenerate/copy/stop/continue. |
| 13 | Partial markers while streaming | P1 raises the issue; nobody owns it. | A pure function, `parseReply(text, {streaming:true})`, holds back a trailing incomplete `[[…` and unclosed markdown. It is owned and unit-tested in the headless core. |
| 14 | XSS and key theft | All three proposals flag it. | All model text goes through the core's `markdownToSafeHtml`, which escapes first and then applies an allowlisted subset. The UI never assigns raw model text to `innerHTML`; it assigns only core-produced HTML. A CSP meta tag is on the page. Keys can be session-only, and export never includes keys. |
| 15 | Where the persona lives | P1 has `sakha/persona.js`, P2 `src/sakhaon/persona.js`, P3 `prompt.js`. The server must import it too. | Use `src/sakhaon/core/persona.js`. It is pure (no DOM, no `node:*`) and lives in the **provider/core** file set, so the server can pin it. |

Visual identity follows **P1**: the portfolio's square, hairline-grid, DM Sans/DM Mono language, re-tinted to a warm "lamp in the dark" palette (saffron + peacock).

---

## 1. Architecture overview

```
sakhaon/index.html ──► src/sakhaon/main.js (UI, DOM)          ← UI set
                         │ imports only the public contract:
                         ├─ src/llm/index.js                 ← provider set (isomorphic, no DOM, no node:*)
                         └─ src/sakhaon/core/*.js            ← provider set (pure content + safety + rendering)
server/index.js (node:http, zero deps) ─► same src/llm + core/persona.js
test/**  (node:test, no network)        ─► src/llm, src/sakhaon/core, server
```

Transport modes:
- **Direct (BYOK)**: the browser calls the provider with the user's key. The key is stored in localStorage, or in sessionStorage when "remember on this device" is off.
- **Proxy**: the browser POSTs a normalized request to `server/`. The server holds the keys in env vars, pins the persona and streams the upstream SSE bytes back unchanged. The client therefore parses both modes the same way.

If the build-time env var `VITE_SAKHAON_PROXY_URL` is set (it is not a secret), first-run defaults to proxy mode with that URL. Otherwise first-run defaults to direct mode.

---

## 2. File ownership (DISJOINT)

### 2.1 Provider / core builder owns
```
src/llm/index.js            public API barrel
src/llm/types.js            JSDoc typedefs only
src/llm/core.js             chat(), collectText(), testConnection()
src/llm/sse.js              createSSEParser(), iterateSSE()
src/llm/errors.js           LLMError, ERROR_CODES, fromHttp(), fromFetchError()
src/llm/messages.js         normalizeMessages()
src/llm/registry.js         PROVIDERS, listProviders, getProvider, resolveModel, defaultModel, inferCaps
src/llm/adapters/anthropic.js
src/llm/adapters/openai.js
src/llm/adapters/gemini.js
src/llm/transports/direct.js
src/llm/transports/proxy.js
src/llm/transports/index.js  createTransport(settings-ish)
src/sakhaon/core/app.js      APP constant
src/sakhaon/core/persona.js  system prompt + buildSystemPrompt()
src/sakhaon/core/safety.js   HELPLINES, detectCrisis()
src/sakhaon/core/verses.js   20-verse library, CHAPTERS, getVerse, verseOfTheDay
src/sakhaon/core/reply.js    escapeHtml, markdownToSafeHtml, parseReply
server/index.js
server/handler.js
server/ratelimit.js
server/.env.example
server/README.md
test/fixtures/*.sse
test/llm/*.test.js
test/core/*.test.js
test/server/*.test.js
.github/workflows/deploy.yml   (add an `npm test` step before Build)
.gitignore                     (append `server/.env`)
```

### 2.2 UI builder owns
```
sakhaon/index.html
src/sakhaon/main.js           bootstrap, router, wiring
src/sakhaon/sakhaon.css       tokens + all component styles
src/sakhaon/store.js          settings / keys / conversations / drafts persistence
src/sakhaon/session.js        send / stop / retry / regenerate / continue orchestration using chat()
src/sakhaon/starters.js       starter chips data
src/sakhaon/ui/dom.js         h() element helper, focus trap, etc.
src/sakhaon/ui/icons.js       inline SVG strings (feather logo, icons) — static, author-controlled
src/sakhaon/ui/topbar.js
src/sakhaon/ui/hero.js        welcome / home screen
src/sakhaon/ui/thread.js      message list, scroll behaviour
src/sakhaon/ui/message.js     user + Sakha message rendering, actions
src/sakhaon/ui/verse-card.js
src/sakhaon/ui/composer.js
src/sakhaon/ui/history.js
src/sakhaon/ui/settings.js
src/sakhaon/ui/keysetup.js    inline first-run key card
src/sakhaon/ui/crisis.js      support card + "Need help now?" sheet
src/sakhaon/ui/toast.js
src/sakhaon/ui/errors.js      LLMError.code → user copy
vite.config.js                multi-page input
package.json                  scripts (exact values in §8)
index.html                    portfolio launcher (nav pill + floating button) ONLY — no other changes
```
Neither builder edits the other's files. If the UI needs a core change, it uses the contract as written and reports the gap. It does not patch core files.

---

## 3. INTERFACE CONTRACT (the only coupling between the two sets)

All modules are ESM. Paths are relative to the repo root. The UI imports **only** from `src/llm/index.js` and `src/sakhaon/core/*.js`.

### 3.1 `src/llm/index.js`
```js
export { chat, collectText, testConnection } from './core.js';
export { LLMError, ERROR_CODES } from './errors.js';
export { PROVIDERS, listProviders, getProvider, resolveModel, defaultModel } from './registry.js';
export { createDirectTransport } from './transports/direct.js';
export { createProxyTransport } from './transports/proxy.js';
export { createTransport } from './transports/index.js';
```

**Types**
```ts
type ChatMessage = { role: 'user' | 'assistant', content: string };
type ChatRequest = {
  provider: string;            // registry id: 'anthropic' | 'openai' | 'google' | future
  model: string;               // any string; free-text ids allowed
  messages: ChatMessage[];     // full history; core normalizes/truncates
  system?: string;
  temperature?: number;        // clamped to caps; dropped if caps.temperature === false
  maxTokens?: number;          // default caps.defaultMaxTokens
};
type ChatEvent =
  | { type: 'text', text: string }                     // delta, never empty
  | { type: 'done', stopReason: 'end'|'max_tokens'|'safety'|'stop_sequence'|'other',
      usage?: { inputTokens?: number, outputTokens?: number }, model?: string };
type ModelCaps = { temperature: boolean, maxTemperature: number, defaultMaxTokens: number,
                   thinkingBudget?: number, legacyMaxTokens?: boolean };
type ModelInfo = { id: string, label: string, note?: string, default?: boolean };
type ProviderInfo = {            // UI-safe view (no adapter object)
  id: string, label: string, keyHint: string, keyUrl: string, docsUrl?: string,
  browserOk: boolean, models: ModelInfo[], defaultModel: string };
```

**Functions**
```ts
chat(req: ChatRequest, opts: { transport: Transport, signal?: AbortSignal, retries?: number /*2*/ })
  : AsyncGenerator<ChatEvent>
// Yields ≥0 'text' events then exactly one 'done'. Errors are THROWN as LLMError.
// Abort → throws LLMError{code:'aborted'} (UI keeps partial text quietly).
// Retries (≤ retries, backoff honouring retry-after) only before the first 'text' event and only if err.retryable.

collectText(iter: AsyncIterable<ChatEvent>): Promise<string>

testConnection({ provider, model, transport, signal? }): Promise<{ ok: true, ms: number, model: string }>
// Sends messages [{role:'user',content:'Reply with the single word: ok'}], maxTokens 16 (Gemini: + thinkingBudget),
// no system prompt. Throws LLMError on failure.

listProviders(): ProviderInfo[]                 // ordered: anthropic, openai, google
getProvider(id): ProviderInfo                   // throws LLMError('config') if unknown
defaultModel(providerId): string
resolveModel(providerId, modelId?): { id: string, label: string, caps: ModelCaps, known: boolean }
// modelId empty → default model. Unknown id allowed (known:false), caps inferred.
PROVIDERS                                       // raw registry (includes adapters) — UI should prefer listProviders()

createDirectTransport({ getKey: (providerId) => string|null|undefined, baseUrls?: Record<string,string> }): Transport
createProxyTransport({ baseUrl: string, token?: string }): Transport
// proxy Transport additionally has: listProviders(): Promise<{id:string, models:string[]}[]> (GET {baseUrl}/v1/providers)
createTransport(cfg: { mode: 'direct'|'proxy', getKey?: fn, proxyUrl?: string, proxyToken?: string }): Transport
// throws LLMError('config', 'Set a proxy URL in Settings') if mode==='proxy' && !proxyUrl

type Transport = { kind: 'direct'|'proxy', open(req, adapter, { signal, caps }): Promise<Response>,
                   listProviders?(): Promise<...> };
```

**LLMError**
```ts
class LLMError extends Error {
  code: 'auth'|'permission'|'not_found'|'rate_limit'|'quota'|'overloaded'|'invalid_request'|
        'context_length'|'safety'|'server'|'network'|'aborted'|'config'|'stream'|'proxy';
  provider?: string; status?: number; retryable: boolean; retryAfterMs?: number; raw?: string;
  message: string;   // developer-ish detail; UI shows its own copy from ui/errors.js and may show message as "details"
}
export const ERROR_CODES: readonly string[];
```
Retryable codes: `rate_limit` (not `quota`), `overloaded`, `server`, `network`. `quota` covers OpenAI `insufficient_quota` and billing errors, and is not retryable. `proxy` covers the proxy's own errors that do not map to another code.

### 3.2 `src/sakhaon/core/app.js`
```js
export const APP = Object.freeze({
  product: 'Sakhaon',            // wordmark, <title>, export filenames
  persona: 'Sakha',              // how the bot refers to itself in chat
  slug: 'sakhaon',
  tagline: 'A friend for the battlefield within.',
  storagePrefix: 'sakhaon.v1',
  version: '1.0.0',
});
```

### 3.3 `src/sakhaon/core/persona.js`
```ts
export const PROMPT_VERSION = 'sakha-v1';
export const LENGTHS = { brief: { words: '40–90', maxTokens: 400 },
                         balanced: { words: '60–150', maxTokens: 800 },
                         deep: { words: '150–300', maxTokens: 1400 } };
export const LANGUAGES = ['auto','en','hi','hinglish'];
export function buildSystemPrompt(opts?: { length?: 'brief'|'balanced'|'deep', language?: 'auto'|'en'|'hi'|'hinglish' }): string;
export const SAKHA_SYSTEM_PROMPT: string;   // = buildSystemPrompt() (balanced, auto)
```
The prompt text comes from §5. `{{BOT_NAME}}` is replaced with `APP.persona`, `{{HELPLINES}}` with `formatHelplinesText()`, and `{{LIBRARY_REFS}}` with a comma-joined `VERSE_REFS`.

### 3.4 `src/sakhaon/core/safety.js`
```ts
export const HELPLINES_LAST_VERIFIED = '2026-10';
export const HELPLINES: { region: string, name: string, phone?: string, alt?: string, url?: string, primary?: boolean, note?: string }[];
export function detectCrisis(text: string): boolean;    // EN + Hindi (Devanagari) + Hinglish patterns, §6
export function formatHelplinesText(): string;           // plain bullet lines used in the prompt
export const SUPPORT_COPY: { title: string, body: string, dismiss: string };
export const DISCLAIMER: string;                         // footer/hero disclaimer (EN)
```

### 3.5 `src/sakhaon/core/verses.js`
```ts
type Verse = { id: string /*'2.47'*/, chapter: number, verse: number, chapterName: string,
               theme: string, iast: string /* lines joined ' / ' */, en: string, hi: string, daily: boolean };
export const CHAPTERS: { n: number, name: string /*IAST, e.g. 'Sāṅkhya Yoga'*/, verses: number }[]; // 18 entries
export const VERSES: Verse[];         // 20 curated, §7
export const VERSE_REFS: string[];    // VERSES.map(v => v.id)
export function getVerse(ref: string): Verse | null;
export function isValidRef(chapter: number, verse: number): boolean;  // by CHAPTERS counts
export function verseOfTheDay(date?: Date): Verse;   // daily-eligible list, index = dayOfYear(local) % len
export function externalVerseUrl(ch: number, v: number): string;  // `https://vedabase.io/en/library/bg/${ch}/${v}/` (chapter 13: v+1, see below)
```
Chapter verse counts (standard Gita Press numbering, 700 total): `[47,72,43,42,29,47,30,28,34,42,55,20,34,27,20,24,28,78]`.

**Verse numbering decision.** Validation, curated verses and `[[BG x.y]]` refs all use the 700-verse Gita Press numbering, so chapter 13 has 34 verses. vedabase.io (BBT edition) numbers chapter 13 with 35 verses because its 13.1 is Arjuna's question; `externalVerseUrl` therefore links Gita Press 13.n to vedabase 13.(n+1). Every other chapter matches 1:1.
Chapter names (IAST): 1 Arjuna-viṣāda Yoga, 2 Sāṅkhya Yoga, 3 Karma Yoga, 4 Jñāna-karma-sannyāsa Yoga, 5 Karma-sannyāsa Yoga, 6 Dhyāna Yoga, 7 Jñāna-vijñāna Yoga, 8 Akṣara-brahma Yoga, 9 Rāja-vidyā-rāja-guhya Yoga, 10 Vibhūti Yoga, 11 Viśvarūpa-darśana Yoga, 12 Bhakti Yoga, 13 Kṣetra-kṣetrajña-vibhāga Yoga, 14 Guṇa-traya-vibhāga Yoga, 15 Puruṣottama Yoga, 16 Daivāsura-sampad-vibhāga Yoga, 17 Śraddhā-traya-vibhāga Yoga, 18 Mokṣa-sannyāsa Yoga.

### 3.6 `src/sakhaon/core/reply.js`
```ts
export function escapeHtml(s: string): string;      // & < > " '
export function markdownToSafeHtml(md: string): string;
type Segment =
  | { type: 'html', html: string }   // safe HTML produced by markdownToSafeHtml
  | { type: 'verse', ref: string, chapter: number, verse: number,
      status: 'resolved'|'unverified'|'invalid', data: Verse|null };
export function parseReply(text: string, opts?: { streaming?: boolean }): Segment[];
export function plainText(text: string): string;    // markers → "BG 2.47", markdown stripped; for copy/export
```
Rules:
- **Marker regex.** `/\[\[\s*BG\s+(\d{1,2})\.(\d{1,3})\s*\]\]/gi`. Text between markers is rendered with `markdownToSafeHtml`. Within a block, a marker splits the surrounding paragraph into separate segments.
- **Marker status.** `resolved` when `getVerse` finds the ref. `unverified` when the ref passes `isValidRef` but is not in the library. `invalid` otherwise.
- **Streaming.** When `streaming:true`, a trailing partial marker (a suffix matching `/\[\[?[^\]]*$/` that starts with `[`) is cut off. Unclosed `**`, `*`, `` ` `` and `[link](` at the end are left as literal text. They must never produce broken tags, and every emitted HTML string must be well-formed.
- **Markdown subset.** Paragraphs (blank-line separated; single newlines become `<br>`), `**bold**`, `*em*` and `_em_`, `` `code` ``, `> blockquote`, `- `/`* ` unordered lists and `1. ` ordered lists. `#`–`###` headings become `<p><strong>…</strong></p>`.
- **Links.** `[t](https://…)` only. Output is `<a href="…" target="_blank" rel="noopener noreferrer nofollow">`. Any non-https link is rendered as plain escaped text.
- **No other HTML.** All input is escaped before any markdown transform.

---

## 4. Provider layer (provider builder)

Follow P2's design (§§3–9 of P2's detail) with the amendments below.

### 4.1 Registry: the **only** place model ids appear
```js
anthropic: { label:'Anthropic', baseUrl:'https://api.anthropic.com', browserOk:true, keyHint:'sk-ant-…',
  keyUrl:'https://console.anthropic.com/settings/keys',
  models:[ {id:'claude-sonnet-5-5', label:'Claude Sonnet 5.5', note:'balanced', default:true},
           {id:'claude-opus-5-5',   label:'Claude Opus 5.5',   note:'deepest'},
           {id:'claude-haiku-5-5',  label:'Claude Haiku 5.5',  note:'fastest'} ] },
openai: { label:'OpenAI', baseUrl:'https://api.openai.com/v1', browserOk:true, keyHint:'sk-…',
  keyUrl:'https://platform.openai.com/api-keys',
  models:[ {id:'gpt-5-mini', label:'GPT-5 mini', note:'balanced', default:true},
           {id:'gpt-5', label:'GPT-5', note:'deepest'},
           {id:'gpt-4.1', label:'GPT-4.1', note:'classic'} ] },
google: { label:'Google Gemini', baseUrl:'https://generativelanguage.googleapis.com', browserOk:true, keyHint:'AIza…',
  keyUrl:'https://aistudio.google.com/apikey',
  models:[ {id:'gemini-2.5-flash', label:'Gemini 2.5 Flash', note:'balanced', default:true},
           {id:'gemini-2.5-pro', label:'Gemini 2.5 Pro', note:'deepest'},
           {id:'gemini-2.5-flash-lite', label:'Gemini 2.5 Flash-Lite', note:'fastest'} ] },
```
The OpenAI and Google ids are sensible defaults that the user can edit through the custom-model field. Leave a `// verify against provider model list` comment next to them. A future provider (OpenRouter, Groq, Ollama) is one row that reuses `openaiAdapter` with a different `baseUrl`; include an example row as a **comment** only.

`inferCaps(providerId, id)`. Base caps are `{temperature:true, maxTemperature:1, defaultMaxTokens:800}`.
- **anthropic:** `maxTemperature` 1.
- **openai:** `maxTemperature` 2. Only ids matching `/(^|[:/])(gpt-4|gpt-3\.5|chatgpt-4o)/i` keep `temperature:true`; every other id (o-series, gpt-5+, codex, unknown) gets `temperature:false`.
- **google:** `maxTemperature` 2. Ids matching `/pro/i` get `thinkingBudget` 512. Ids matching `/flash/i` get `thinkingBudget` 0. Any other id gets `thinkingBudget` undefined, and the adapter then omits `thinkingConfig` and adds 1024 headroom.

### 4.2 Adapters (pure functions, no I/O)
Each adapter is `{ id, buildRequest(req, {apiKey, baseUrl, direct, caps}) → {url, headers, body:string}, createState(), parseEvent(sseEvent, state) → ChatEvent[], finish(state) → ChatEvent[], parseErrorBody(status, text) → {code, message} }`.
`finish` emits `done` if one was not already emitted. If there was no terminal signal **and** no text, it throws `stream`. If text arrived but there was no terminal signal (some proxies cut the tail), it emits `done{stopReason:'other'}`.

**anthropic**
- **Request.** `POST {base}/v1/messages`.
  - Headers: `content-type: application/json`, `x-api-key`, `anthropic-version: 2023-06-01`. Add `anthropic-dangerous-direct-browser-access: true` **only when `direct`**.
  - Body: `{model, max_tokens, messages, stream:true, system?, temperature?}`.
- **Events.** `content_block_delta` + `text_delta` becomes text. `message_start` carries input usage. `message_delta` carries stop_reason and output usage. `message_stop` produces done. `error` throws. `ping` is ignored.
- **stop_reason mapping.** `end_turn`→`end`, `max_tokens`→`max_tokens`, `stop_sequence`→`stop_sequence`, `refusal`→`safety`, anything else→`other`.
- **error.type mapping.**
  - `authentication_error`→`auth`
  - `permission_error`→`permission`
  - `not_found_error`→`not_found`
  - `rate_limit_error`→`rate_limit`
  - `overloaded_error`→`overloaded`
  - `invalid_request_error`→`invalid_request`, or `context_length` if the message matches `/prompt is too long|too many tokens/i`
  - `api_error`→`server`
  - Also mapped from status: 529 and 503→`overloaded`, 402 or a billing message→`quota`.

**openai** (Chat Completions)
- **Request.** `POST {base}/chat/completions`.
  - Headers: `authorization: Bearer …`.
  - Body: `{model, messages:[{role:'system',content:system}?, ...], stream:true, stream_options:{include_usage:true}, max_completion_tokens (or max_tokens if caps.legacyMaxTokens), temperature?}`.
- **Stream.**
  - `[DONE]` sets terminal.
  - `{error}` throws.
  - `choices[0].delta.content` becomes text.
  - `finish_reason`: `stop`→`end`, `length`→`max_tokens`, `content_filter`→`safety`.
  - A chunk with `usage` and empty `choices` records usage.
  - Emit `done` on `[DONE]`. `finish()` handles the rest.
- **Errors.**
  - `invalid_api_key` or 401 → `auth`
  - 403 → `permission`
  - `model_not_found` or 404 → `not_found`
  - `context_length_exceeded` → `context_length`
  - `insufficient_quota` → `quota`
  - Other 429 → `rate_limit`
  - 5xx → `server`

**gemini**
- **Request.** `POST {base}/v1beta/models/{encodeURIComponent(model)}:streamGenerateContent?alt=sse`.
  - Headers: `x-goog-api-key`. **Never** put the key in a `?key=` query parameter.
  - Body: `{contents:[{role:'user'|'model', parts:[{text}]}], systemInstruction?:{parts:[{text}]}, generationConfig:{temperature?, maxOutputTokens, thinkingConfig?:{thinkingBudget}}}`.
  - `maxOutputTokens` is `maxTokens + (thinkingBudget ?? 1024)`.
- **Stream.** Each data chunk is JSON.
  - `promptFeedback.blockReason` throws `safety`.
  - Parts with `!thought` and non-empty text become text.
  - `finishReason`: `STOP`→`end`, `MAX_TOKENS`→`max_tokens`. `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT` and `SPII`→`safety`. Anything else→`other`.
  - `usageMetadata` is cumulative, so overwrite it on each chunk.
  - There is no sentinel, so `finish()` emits `done` once a `finishReason` has been seen.
- **Errors.** `{error:{code,message,status}}`.
  - `UNAUTHENTICATED`→`auth`
  - `PERMISSION_DENIED`→`permission`, or `auth` if the message matches `/api key/i`
  - `INVALID_ARGUMENT`→`auth` if the message matches `/api key/i`, otherwise `invalid_request`
  - `RESOURCE_EXHAUSTED`→`rate_limit`, or `quota` if the message matches `/quota|billing/i`
  - `NOT_FOUND`→`not_found`
  - `UNAVAILABLE`→`overloaded`
  - `INTERNAL`→`server`

### 4.3 SSE, errors, messages, core
- **`sse.js`.** Implement as in P2 §5: CRLF/CR/LF, comments, multi-line data, `event:` and `id:` fields, and a trailing event flushed at `end()`. `iterateSSE(body, signal)` uses `TextDecoder` with `{stream:true}` and always calls `reader.cancel()` in `finally`. If aborted, it throws a `DOMException('Aborted','AbortError')`.
- **`errors.js`.**
  - **`fromHttp(adapter, providerId, res)`.** Reads the text. Proxy-shaped bodies `{error:{type:'sakhaon_proxy', code, message}}` are checked first; their `code` maps 1:1 when it is a known code and becomes `proxy` otherwise. The function then calls `adapter.parseErrorBody`. `retry-after` is parsed as seconds or as an HTTP date into `retryAfterMs`. A status-only fallback mapping applies when the body is unparseable.
  - **`fromFetchError(e)`.** AbortError maps to `aborted`. A TypeError or other error maps to `network`, with the message `"Could not reach the provider (network, CORS, or offline). Proxy mode may help."`.
- **`messages.js`.** `normalizeMessages(msgs, {maxChars=24000, maxTurns=24})`:
  1. Trim each message and drop empty ones.
  2. Merge consecutive messages with the same role.
  3. Drop leading assistant turns.
  4. Keep the newest turns that fit within `maxTurns` and `maxChars`, always keeping the last user turn even if it is over budget.
  5. Throw `LLMError('invalid_request')` if the result is empty or the last message is not from the user.
- **`core.js`.** Implement as in P2 §4.
  - `getProvider` uses `PROVIDERS`.
  - Temperature is clamped to `[0, caps.maxTemperature]` and set to `undefined` when `!caps.temperature`.
  - `sleep` is injectable for tests.
  - Every thrown non-`LLMError` is wrapped.

### 4.4 Transports
- **direct.** `open()` calls `getKey(provider)`. If no key is returned it throws `LLMError('config', 'Add your <Label> API key in Settings')` before any fetch. Otherwise it calls `adapter.buildRequest(req, {apiKey, baseUrl: baseUrls[p] ?? registry.baseUrl, direct:true, caps})` and then `fetch(url, {method:'POST', headers, body, signal})`.
- **proxy.** `open()` POSTs `{baseUrl without trailing /}/v1/chat` with the JSON body `{provider, model, messages, system, temperature, maxTokens}`. It sets the header `x-sakhaon-token` when a token is configured. `listProviders()` sends `GET /v1/providers`.
- **`createTransport(cfg)`.** Selects one of the two transports as described in the contract (§3.1).

### 4.5 Proxy server (`server/`, zero dependencies, `node:http`)
Implement as in P2 §9. Defaults:
- `PORT=8787`
- `ALLOWED_ORIGINS=https://aakash7192.github.io,http://localhost:5173,http://localhost:4173`
- `RATE_LIMIT_RPM=20`
- `MAX_TOKENS_CAP=4096` (bounds the final upstream budget, thinking allowance included; adapters take it as `maxOutputTokens`)
- `TRUST_PROXY=0` (hop count; the client IP is the N-th `X-Forwarded-For` entry from the right)
- `PIN_SYSTEM_PROMPT=1` (the default is ON; the server replaces `system` with `buildSystemPrompt({length, language})`, where `length` and `language` come from optional request fields validated against `LENGTHS`/`LANGUAGES`)
- `ALLOWED_MODELS` empty means any
- `PROXY_TOKEN` optional
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`

The `/v1/chat` request body may also carry `length` and `language`. The proxy transport forwards them when the UI passes them in `req.meta`. **Contract addition:** `ChatRequest` may include `meta?: {length?, language?}`. `chat()` ignores it except to forward it through the proxy transport.

**Validation:**
- 64 KB body cap, otherwise 413.
- The provider must be known and configured, otherwise 400.
- The model is a string of at most 100 characters and must pass the allowlist, otherwise 403.
- At most 50 messages, each with role user or assistant and content of at most 24000 characters (the client merges adjacent same-role turns, so a merged turn can exceed the composer's 8000).

**Behaviour:**
- **Streaming.** Uses SSE passthrough with the headers `text/event-stream`, `cache-control: no-cache, no-transform` and `x-accel-buffering: no`. The body is passed through with `Readable.fromWeb(up.body).pipe(res)`.
- **Errors.** Upstream non-2xx responses are forwarded as-is. The proxy's own errors use `{error:{type:'sakhaon_proxy', code, message}}`.
- **Client disconnect.** A `res.on('close')` handler aborts the upstream request.
- **Logging.** One line per request: method, path, provider, model, status and ms. Never log keys or bodies.
- **Env file.** `server/index.js` calls `process.loadEnvFile('server/.env')` if that file exists (Node ≥ 21.7).
- **Export.** `createHandler({env, fetch, now})` is exported from `handler.js` so tests can call it.

`server/README.md` covers:
- Running locally with `npm run proxy`.
- Env vars.
- Deploying on any Node 22 host (Render, Fly, Railway), with a note that a Cloudflare Worker port is straightforward.
- Pointing the UI at the proxy, either in Settings → Proxy or with `VITE_SAKHAON_PROXY_URL` at build time.
- The abuse model.

### 4.6 Tests (`node:test` + `node:assert/strict`, no network, no new deps)
- **SSE parser.** Cover every feature in §4.3. Fuzz by splitting each fixture at every byte offset, including fixtures with Devanagari text and emoji.
- **Adapters.**
  - Check the exact `buildRequest` output: URL; the browser header present only when `direct`; system placement; role mapping; temperature omitted when caps say so; the Gemini key in the header, not the URL; `thinkingConfig`; `max_completion_tokens`.
  - Replay the fixtures `{anthropic,openai,gemini}-{ok,error}.sse` and assert the text, stopReason and usage.
  - Check that the OpenAI usage chunk is handled and Gemini thought parts are skipped.
- **Error mapping.** Use a table: status and body against code and retryable, per provider. Also check `retry-after` in both formats and that the proxy error shape is detected first.
- **`normalizeMessages`.** Cover every rule in §4.3.
- **Registry.** Every provider has exactly one default model, unknown ids resolve with `known:false`, an unknown provider throws `config`, and `listProviders()` objects carry no adapter.
- **`chat()`.** Use a fake transport that returns a `new Response(ReadableStream)` and check:
  - the happy path;
  - a retry on 529 before the first token;
  - no retry after a token has been yielded;
  - an abort mid-stream throws `aborted` and the reader is cancelled;
  - a missing terminal signal with no text throws `stream`;
  - the direct transport with no key throws `config` and fetch is never called.
- **Core content.**
  - **reply.js.** XSS vectors are escaped: `<img onerror>`, `javascript:` links, `"` inside attributes. Markers resolve as resolved, unverified or invalid. The streaming holdback works.
  - **safety.js.** True positives in EN, HI and Hinglish. Known benign phrases stay negative ("this exam is killing me" is allowed to be either, so don't assert it).
  - **verses.js.** All 20 refs are valid, `verseOfTheDay` is deterministic and never returns 3.35, and the chapter counts sum to 700.
  - **persona.js.** The prompt has no unreplaced `{{`, contains every library ref and the helplines, and mentions no provider or model name.
- **Server.** Use `createHandler` on `listen(0)` with a stub fetch and check:
  - preflight and CORS;
  - a bad origin returns 403;
  - an unconfigured provider returns 400;
  - an oversized body returns 413;
  - the rate limit returns 429 with `retry-after`;
  - `maxTokens` is clamped;
  - the pinned system prompt replaces the client's;
  - the key is injected upstream and never echoed back;
  - bytes pass through unchanged;
  - an upstream 401 body is forwarded;
  - `GET /v1/providers` lists only configured providers;
  - `GET /healthz` works.

`src/llm/**` and `src/sakhaon/core/**` must not import `node:*`, touch the DOM, or read `localStorage`.

---

## 5. System prompt (`core/persona.js`)

Use **P3's prompt v1 verbatim in structure** (§0 SAFETY FIRST, §1 HOW YOU COUNSEL, §2 FIDELITY, §3 NON-SECTARIAN, §4 LANGUAGE, §5 FORMATTING, §6 FIRST MESSAGE), with these amendments:

1. **§2, citations.** Replace the citation rule with the following text:
   > To cite a verse, write the marker `[[BG chapter.verse]]` on its own line (e.g. `[[BG 2.47]]`). The app displays the verse text, so **never write Sanskrit or quote the verse text yourself**. Paraphrase its meaning in your own words instead. Use at most one marker per reply (two only if the user asks to compare). Prefer these verses, which the app can display in full: {{LIBRARY_REFS}}. Cite another verse only when you are confident of the number and its content. If you are unsure, describe the teaching and name the chapter or theme without a marker.
2. **§5, formatting.** Remove the "blockquote for a quoted verse" line. Add: "Never output HTML."
3. **§1, length.** Replace "about 60–150 words" with "about {{WORDS}} words". `{{WORDS}}` comes from `LENGTHS[length].words`.
4. **§4, language.** When `language !== 'auto'`, append: "The user prefers replies in {English | simple Hindi in Devanagari | Hinglish in Roman script} unless they write otherwise."
5. **§0 helplines.** `{{HELPLINES}}` comes from the `HELPLINES` data. KIRAN is removed (see §0).

The prompt must not name any provider or model. It names Sakha via `{{BOT_NAME}}`.

---

## 6. Safety data (`core/safety.js`)

- **`HELPLINES`.**
  - Tele-MANAS: 14416, alt 1-800-891-4416, primary.
  - India Emergency: 112, primary.
  - Women Helpline: 181.
  - Childline: 1098.
  - US/CA: 988, call or text.
  - UK/IE: Samaritans 116 123.
  - INTL: https://findahelpline.com.
- **`detectCrisis`.** Use P3's starter patterns for EN, Hinglish and Hindi, all case-insensitive. Normalise curly apostrophes before matching.
- **`SUPPORT_COPY`.**
  - Title: "You matter."
  - Body: "If you're thinking about hurting yourself, please reach out to someone right now. You deserve support from a real person."
  - Dismiss: "I'm safe — continue".
- **`DISCLAIMER`.** "Sakha is an AI companion for reflection inspired by the Bhagavad Gita — not a therapist or a substitute for professional help, and it can make mistakes, including about verses. In crisis? Call Tele-MANAS 14416 or 112."

## 7. Verse library (`core/verses.js`)

The 20 verses from P3 §4 are 2.14, 2.20, 2.47, 2.48, 2.50, 2.56, 2.62, 3.19, 3.21, 3.35, 4.7, 4.38, 6.5, 6.6, 6.17, 6.26, 6.35, 12.13, 17.15 and 18.66. Use the exact IAST, EN, HI and theme text given there.
- **`daily`.** `true` for every verse except 3.35, which is `false`.
- **`chapterName`.** Taken from `CHAPTERS`.

The builder must copy the text faithfully. Do not add new Sanskrit.

---

## 8. Build wiring (UI builder)

`vite.config.js`:
```js
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
export default {
  base: '/aakash-profile/',
  build: { rollupOptions: { input: { main: resolve(root, 'index.html'), sakhaon: resolve(root, 'sakhaon/index.html') } } },
};
```
`package.json` scripts. Keep the existing scripts and add:
```json
"test": "node --test \"test/**/*.test.js\"",
"proxy": "node server/index.js"
```
Do not add any dependencies.

`.github/workflows/deploy.yml` belongs to the provider builder. It adds `- name: Test\n  run: npm test` between Install and Build.

Links:
- The portfolio links to `./sakhaon/`, relative from `index.html`.
- The Sakhaon page links back with `import.meta.env.BASE_URL`, or with `../`.
- Inside `sakhaon/index.html`, reference the script as `<script type="module" src="/src/sakhaon/main.js">`. Vite rewrites it with the base.

---

## 9. UI spec (UI builder)

### 9.1 Page shell: `sakhaon/index.html`
- `lang="en"`, `color-scheme: dark`, viewport with `viewport-fit=cover`, and `<title>Sakhaon — a Gita companion</title>`.
- The favicon is an inline SVG feather in saffron.
- Fonts come from Google Fonts: DM Sans (400/500/700), DM Mono (400/500) and **Noto Sans Devanagari** (400/500), used for Hindi text.
- CSP meta:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:*; base-uri 'none'; form-action 'none'; object-src 'none'`
- The body contains `<div id="app">` with a static skeleton, a `<noscript>` message, and the module script.
- The page imports `../src/style.css`? **No.** `sakhaon.css` defines its own tokens. It may copy the portfolio's `@keyframes blink/dot` and reduced-motion rule.

### 9.2 Tokens (`sakhaon.css` `:root`)
`--s-paper #0F0E0C; --s-paper2 #16140F; --s-surface #1C1914; --s-ink #F2EDE4; --s-ink2 #CFC6B8; --s-muted #958C7E (≥4.5:1); --s-line #2A2620; --s-line2 #353027; --s-saffron oklch(0.76 0.15 60); --s-peacock oklch(0.62 0.11 210); --s-peacock-deep oklch(0.42 0.09 260); --s-danger oklch(0.66 0.17 25); --s-ok oklch(0.72 0.14 150)`
- **Shape.** 0 border-radius everywhere except the 999px pills: starter chips, the send button and the model badge.
- **Lines.** 1px hairlines.
- **Labels.** DM Mono uppercase micro-labels at letter-spacing .08em.
- **Body text.** DM Sans 16/1.65.
- **Hero.** A diya glow `radial-gradient(60% 40% at 50% 0%, oklch(0.76 0.15 60 / .14), transparent)` sits behind the hero.
- **Focus.** `:focus-visible` uses a 2px saffron outline with a 3px offset.
- **Reduced motion.** `prefers-reduced-motion` kills all animation.

### 9.3 Layout
- **Mobile first, 360–899px.**
  - A sticky 56px top bar sits above the main column (welcome or thread), with the composer docked at the bottom.
  - Use `height: 100dvh` with a `100vh` fallback, `env(safe-area-inset-*)` padding, and `visualViewport` resize handling so the composer stays visible on iOS.
  - History is a left drawer at 85vw. Settings is a bottom sheet at 90dvh.
  - No horizontal scroll.
- **900px and up.** History becomes a persistent 280px left rail. The chat column is at most 760px wide and centred. Settings becomes a 420px right sheet.

### 9.4 Components and states
- **TopBar.**
  - [☰ history] (hidden at ≥900px).
  - Feather logo and the `SAKHAON` wordmark in DM Mono.
  - A **ModelBadge** reading `Anthropic · claude-sonnet-5-5`, mono with a peacock border. Clicking it opens settings. On mobile it collapses to a provider dot plus a short id.
  - [Need help now?] opens the crisis sheet. [＋ New chat]. [⚙ Settings].
- **WelcomeHero (home screen).** Shown at `#/`, or when the active conversation is empty.
  1. A time-of-day greeting in DM Mono: Suprabhat 5–11, Namaste 11–17, Shubh sandhya 17–22, "Still awake, friend?" 22–5.
  2. H1 "What weighs on your heart today?".
  3. Subtitle "Talk it through with Sakha — a friend who knows the Bhagavad Gita."
  4. A **Verse of the day** card built from `verseOfTheDay()`. It shows the IAST in italics on two lines, the EN text, a HI toggle, and the mono ref `BHAGAVAD GITA · 2.47 · Sāṅkhya Yoga`. Actions are "Reflect on this →", which sends `Help me reflect on BG 2.47 in my life.`, and Copy.
  5. Six **starter chips** in two columns on mobile and three on desktop, from `starters.js`: Grief, Duty vs desire, Anxiety about results, Anger, Purpose, Burnout, each with a full prompt (P1 §4.2). A "More topics" toggle reveals Overthinking, Failure, Loneliness, Letting go, and the two Hindi/Hinglish starters from P3 §3.4.
  6. A **setup nudge strip** when the app is not configured: "Connect a model to begin · Set up".
  7. Up to 3 **recent conversations**.
  8. The disclaimer.
- **Thread.**
  - The container is `role="log"`.
  - **User message.** Right-aligned `--s-paper2` block with a max-width of 80%. Hover/focus shows copy.
  - **Sakha message.** No bubble, with a feather avatar and a `SAKHA` mono label.
    - The body is the result of `parseReply(text, {streaming})`. Each `html` segment's HTML is placed in a container element, and each verse segment becomes a VerseCard.
    - Footer: copy (uses `plainText`), regenerate (last message only), and a meta line of model id plus seconds.
  - **Streaming.** Before the first token, show three pulsing peacock dots with "Sakha is reflecting…". After that, show a saffron blinking caret.
    - Re-render the streaming message at most once per animation frame.
    - Screen readers hear "Sakha is replying" once at the start, and the final text once on completion. Use a separate visually-hidden `aria-live="polite"` region and keep `aria-live` off the log during streaming.
  - **Scroll.** Stick to the bottom only when the user is within 90px of it. Otherwise show a "↓ New message" pill.
  - Show a **day divider** when more than an hour passes between messages.
- **VerseCard.**
  - `resolved`: the header `BHAGAVAD GITA · c.v · chapterName`, the IAST (italic, `lang="sa-Latn"`), the EN text, the HI text (`lang="hi"`, collapsed by default unless the language is hi or hinglish), and a 2px saffron left rule. Actions: copy, and "Ask about this verse", which prefills the composer.
  - `unverified`: the header, then "Sakha referenced this verse; its text isn't in the local library", then "Read it ↗" linking to `externalVerseUrl`.
  - `invalid`: inline mono text `BG c.v` with ⚠ and the title "This reference may be inaccurate".
- **Composer.** A `form[aria-label="Message Sakha"]` with a textarea that grows from 1 to 8 rows.
  - Enter sends and Shift+Enter inserts a newline. On coarse pointers Enter inserts a newline.
  - The send button is a saffron circle. It is disabled when the input is empty and becomes ■ Stop while streaming.
  - A character hint appears above 2000 characters, with a hard cap of 8000 to match the proxy.
  - Drafts are saved per conversation.
  - When offline (`navigator.onLine === false`), show a banner and disable send, keeping the draft.
- **Inline KeySetup card.**
  - Shown when the user sends while unconfigured: no key for the current provider in direct mode, or no URL in proxy mode.
  - Contains a provider segmented control, a key input with a "Get a key ↗" link, a remember checkbox (default on), and Save & send.
  - The pending message is kept and sent automatically after saving.
- **Settings sheet.** `role="dialog"` with `aria-modal`, a focus trap, Esc to close and focus restored on close. Changes autosave with a "Saved" toast.
  1. **Provider.** A segmented control built from `listProviders()`, each with a status dot (filled when configured).
  2. **Model.**
     - A select filled from `provider.models` (label plus note).
     - A **Custom model id** input; when filled it overrides the select.
     - A mono hint `Will send: <id>`.
     - In proxy mode with a successful `transport.listProviders()`, providers or models the proxy doesn't serve are marked "not on proxy". They stay selectable.
  3. **Connection.** A radio between Direct (your key) and Proxy.
     - Direct: a password input with show/hide, the placeholder `keyHint`, a remember toggle, Remove key, and the note "Stored only in this browser. Use a key with a spending limit."
     - Proxy: URL and optional token inputs.
     - **Test connection** calls `testConnection` and shows idle → testing → ✓ `Connected · 412 ms`, or ✗ with copy from `ui/errors.js`.
  4. **Conversation.**
     - Response length (Brief / Balanced / Deep).
     - Temperature slider from 0 to 1 in steps of 0.1, default 0.7. It is shown as disabled with the note "not supported by this model" when `resolveModel().caps.temperature` is false.
     - Language (Auto / English / हिन्दी / Hinglish).
     - "Show Hindi meaning on verse cards".
  5. **Privacy & data.** Export all (JSON), Clear history (confirm), Clear keys (confirm).
  6. **About.** `APP.version`, `PROMPT_VERSION`, the disclaimer, a verse-text note ("Translations are faithful renderings, not copied from a copyrighted edition"), and a back link to the portfolio.
- **History.**
  - Header with a search field (title and first message) and ＋New.
  - Grouped as Today, Yesterday, Previous 7 days and Older.
  - Each item shows the title, a provider dot and a saffron left rule when active. Its ⋯ menu offers Rename (inline) and Delete (undo toast for 6s).
  - Footer: Export all, Clear all.
  - Empty state: "Your conversations will rest here."
- **Crisis.**
  - When `detectCrisis(userText)` is true, a **support card** is pinned in the thread above the pending reply, built from `SUPPORT_COPY` and `HELPLINES` (`tel:` links). Its dismiss is stored per message.
  - The "Need help now?" sheet shows the same content at any time.
  - The message is still sent.
- **Toasts.** A `role="status"` region at the bottom centre, above the composer.
- **Keyboard.** `/` focuses the composer. Ctrl/Cmd+K starts a new chat. Ctrl/Cmd+, opens settings. Esc stops streaming or closes the top overlay.
- **Touch and zoom.** Touch targets are at least 44px. Text zoom to 200% works without horizontal scroll.

### 9.5 Error copy (`ui/errors.js`, keyed by `LLMError.code`)
Errors are shown inline under the failed Sakha message with a Retry button, plus a secondary action.

| code | copy | action |
|---|---|---|
| auth | "That key didn't work. Check it in Settings." | Open settings |
| permission | "This key can't use that model." | Settings |
| not_found | "Model id not recognised. Pick another." | Settings |
| rate_limit | "Too many requests. Retrying in Ns…" | Live countdown, then auto-retry once |
| quota | "Your provider account is out of credit or quota." | Settings |
| overloaded / server | "The provider is busy. Try again." | Retry |
| context_length | "This chat has grown long. Start a new one?" | New chat |
| safety | "The provider declined to answer this. Try rephrasing." | — |
| network | "Couldn't reach {Provider} from the browser (network or CORS). Check your connection or try Proxy mode." | Settings |
| config | err.message | Settings |
| stream / proxy / invalid_request | "Something interrupted us. Your words are safe. Try again?" plus a details disclosure | Retry |
| aborted | (no error) The partial reply is kept, marked "(stopped)", with Continue | Continue sends "Please continue." |

`stopReason:'max_tokens'` gets a subtle note "(cut short)" and the Continue action. `stopReason:'safety'` with no text uses the `safety` copy.

### 9.6 Session logic (`session.js`)
`send(text)` does the following:
1. Append the user message, optimistically.
2. Run `detectCrisis`.
3. Build the request:
   ```
   req = { provider, model: settings.customModel[p] || settings.model[p] || defaultModel(p),
           messages: history (role/content only, excluding errored/empty assistant turns),
           system: buildSystemPrompt({length, language}), temperature,
           maxTokens: LENGTHS[length].maxTokens, meta: {length, language} }
   ```
4. Create the transport with `createTransport({mode, getKey: store.getKey, proxyUrl, proxyToken})`.
5. Iterate `chat(req, {transport, signal})`, accumulating text.
6. Persist the conversation after `done` or an error, and every 1s while streaming, so a reload keeps the partial text.

Only one stream runs at a time. Starting a new chat while streaming aborts the current one. Regenerate removes the last assistant message and resends. The title is the first user message truncated to 48 characters.

### 9.7 Persistence (`store.js`)
Every read and write of `localStorage` or `sessionStorage` is wrapped in try/catch. If storage is unavailable, fall back to memory and show the banner "History won't be saved in this window". A `QuotaExceededError` shows a toast: "Storage full — export or delete old chats."

Keys (prefix `APP.storagePrefix` = `sakhaon.v1`):
- `sakhaon.v1.settings`:
  ```
  { provider:'anthropic', mode:'direct'|'proxy', model:{anthropic,openai,google}, customModel:{…},
    proxyUrl, proxyToken, length:'balanced', temperature:0.7, language:'auto', showHindi:false, remember:true }
  ```
  Defaults come from the registry and `import.meta.env.VITE_SAKHAON_PROXY_URL`.
- `sakhaon.v1.keys` holds `{anthropic?, openai?, google?}`. It is stored in localStorage if `remember`, otherwise in sessionStorage. Keys are never exported.
- `sakhaon.v1.conversations` is the index `[{id, title, createdAt, updatedAt, provider, model, topic?}]`.
- `sakhaon.v1.conv.<id>` holds `{id, title, createdAt, updatedAt, provider, model, topic?, messages:[{id, role, content, createdAt, meta?:{model, ms, stopReason?, stopped?, error?:{code,message}, crisis?:boolean, crisisDismissed?:boolean}}]}`.
- `sakhaon.v1.draft.<id>` holds the draft text.

IDs come from `crypto.randomUUID()`, with a fallback.

**Routing:** `#/` is home and `#/c/<id>` is a conversation. `?settings=1` opens settings on load.

### 9.8 Portfolio launcher (`index.html`, the only allowed edits)
- **Nav pill.** Insert a nav link `<a href="./sakhaon/" class="navlink">✦ sakhaon</a>` after the `contact` link, styled in mono to match.
- **Floating button.** Add a fixed button at bottom-right, "Talk to Sakha", with a saffron outline and a feather icon. It links to `./sakhaon/`, carries `aria-label`, and has `bottom: max(20px, env(safe-area-inset-bottom))`.
- **Styling.** Use inline styles or a small `<style>` block in index.html. Do not edit `src/style.css` or `src/main.js`.

---

## 10. Acceptance checklist
- [ ] `npm test` passes, with no network access.
- [ ] `npm run build` emits `dist/index.html` and `dist/sakhaon/index.html`, and their assets resolve under `/aakash-profile/`.
- [ ] No model id string appears outside `src/llm/registry.js`. Check with `grep -rn "claude-\|gpt-\|gemini-" src sakhaon server --include=*.js --include=*.html`, which should match only registry.js (and tests).
- [ ] There is no `innerHTML` with raw model text. The only HTML insertions are `reply.js` outputs and static `icons.js` strings.
- [ ] Each provider can be switched in Settings, and the model badge updates. The custom model id is the one sent.
- [ ] Direct mode with no key shows the inline key card, then auto-sends the pending message.
- [ ] Stop keeps the partial text. Regenerate and Continue work. A reload keeps history.
- [ ] A crisis phrase shows the support card and the message is still sent.
- [ ] At 360px wide there is no horizontal scroll and the composer stays visible.
