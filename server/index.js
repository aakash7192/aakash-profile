#!/usr/bin/env node
// Sakhaon proxy entry point: `npm run proxy` (Node >= 22, zero dependencies).
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHandler, loadConfig, DEFAULTS } from './handler.js';

const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const cfg = loadConfig(process.env);
const port = Number(process.env.PORT || DEFAULTS.PORT);
const host = process.env.HOST || '0.0.0.0';

const server = createServer(createHandler({ env: process.env }));
server.requestTimeout = 0; // streams can be long-lived
server.headersTimeout = 30_000;
server.listen(port, host, () => {
  const configured = Object.keys(cfg.keys);
  console.log(`Sakhaon proxy listening on http://${host}:${port}`);
  console.log(`  providers: ${configured.length ? configured.join(', ') : '(none — set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY)'}`);
  console.log(`  origins: ${cfg.allowedOrigins.join(', ')}`);
  console.log(`  pinned persona: ${cfg.pinSystemPrompt ? 'on' : 'off'} · rate limit: ${cfg.rpm}/min/IP · max tokens: ${cfg.maxTokensCap}${cfg.proxyToken ? ' · token required' : ''}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
