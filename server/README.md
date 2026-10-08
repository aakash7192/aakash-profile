# Sakhaon proxy (optional)

A tiny, zero-dependency Node 22 server (`node:http`) that lets the Sakhaon UI talk to
Anthropic, OpenAI or Google Gemini **without shipping API keys to the browser**.
GitHub Pages is static, so the UI defaults to *Direct (BYOK)* mode; run this proxy when you
want visitors to use your keys, or when a provider blocks browser (CORS) calls.

```
browser ──POST /v1/chat {provider, model, messages, …}──► proxy ──(key from env)──► provider
        ◄──────────── upstream SSE bytes, unchanged ─────────────┘
```

The proxy reuses the same provider adapters as the browser (`src/llm/`), so adding a provider
to `src/llm/registry.js` makes it available here too.

## Run locally

```bash
cp server/.env.example server/.env   # add at least one key
npm run proxy                        # http://localhost:8787
curl localhost:8787/healthz          # {"ok":true}
```

`server/index.js` loads `server/.env` automatically (via `process.loadEnvFile`, Node ≥ 21.7);
real environment variables take precedence. `server/.env` is git-ignored.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/chat` | Body `{provider, model, messages, system?, temperature?, maxTokens?, length?, language?}`. Streams the provider's SSE bytes back unchanged. Upstream errors are forwarded as-is (status + body). |
| `GET` | `/v1/providers` | `[{id, models: string[]}]` for providers that have a key (filtered by `ALLOWED_MODELS`). |
| `GET` | `/healthz` | `{ok: true}` |

The proxy's own errors look like `{"error":{"type":"sakhaon_proxy","code":"…","message":"…"}}`
with status 400 / 401 / 403 / 413 / 429 (`retry-after` on 429) or 502.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | – | Provider keys. Only providers with a key are served. (`GOOGLE_API_KEY` also works.) |
| `PORT` | `8787` | Listen port (`HOST` defaults to `0.0.0.0`). |
| `ALLOWED_ORIGINS` | `https://aakash7192.github.io,http://localhost:5173,http://localhost:4173` | Browser origins allowed (CORS). Requests with any other `Origin` get 403. `*` allows all. |
| `RATE_LIMIT_RPM` | `20` | `POST /v1/chat` requests per minute per client IP (`0` disables). |
| `TRUST_PROXY` | `0` | Number of trusted reverse-proxy hops in front of the server (`1`/`true` = one). The client IP is the address the outermost trusted proxy appended, i.e. the N-th entry from the **right** of `X-Forwarded-For` — never the client-supplied leftmost entry. Leave `0` when clients connect directly, or they can spoof the header to dodge the rate limit. |
| `MAX_TOKENS_CAP` | `4096` | Upper bound for the **total** upstream output budget per request, including the thinking allowance adapters add on top of the reply length (Anthropic adaptive thinking, Gemini thinking headroom). |
| `PIN_SYSTEM_PROMPT` | `1` | Ignore the client's `system` and always use Sakha's persona, built from the optional `length` / `language` fields. |
| `ALLOWED_MODELS` | empty (any) | Comma-separated `model` or `provider:model` allowlist; others get 403. |
| `PROXY_TOKEN` | empty | If set, requests must send `x-sakhaon-token`. |
| `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` / `GOOGLE_BASE_URL` | provider default | Optional upstream overrides. |

## Deploy

Any Node 22 host works (Render, Fly.io, Railway, a VM): start command `node server/index.js`,
set the env vars above in the host's dashboard, and make sure the host does not buffer
`text/event-stream` responses. No `npm install` is needed (no dependencies).
A Cloudflare Workers port is straightforward: `handler.js` only uses `fetch` and web streams
apart from the `node:http` / `node:stream` request-response plumbing.

## Point the UI at the proxy

- At runtime: **Settings → Connection → Proxy**, enter the proxy URL (and token if you set one),
  then **Test connection**.
- At build time: set `VITE_SAKHAON_PROXY_URL=https://your-proxy.example` when running
  `npm run build`; first-time visitors then default to proxy mode. The URL is not a secret.

## Abuse model

The proxy URL and any `PROXY_TOKEN` are visible to anyone who loads the static site, so the token
is a speed bump, not authentication. The real controls are:

- **Pinned persona** (`PIN_SYSTEM_PROMPT=1`): the proxy can only be used as Sakha, not as a
  general-purpose free LLM endpoint.
- **Origin allowlist**: stops other websites from using it from their visitors' browsers
  (non-browser clients can spoof `Origin`, hence the next controls).
- **Per-IP rate limit**, **`MAX_TOKENS_CAP`**, the **64 KB body cap**, at most 50 messages of
  24000 characters (clients merge adjacent same-role turns), the rate limiter's bounded key table, and an optional **`ALLOWED_MODELS`** list to keep you on cheaper models.
- **Provider-side spending limits**: always set a monthly budget on each key.

Keys never leave the server: they are injected into upstream requests only, never logged, and
never echoed back. Logs contain one line per request (method, path, provider, model, status, ms),
never bodies.
