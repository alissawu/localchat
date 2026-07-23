# localchat

A local, encrypted chat client for careful conversations with LLMs. Built as an Electron + React + TypeScript app. Everything is stored on your machine, encrypted with your OS keychain (or AES-256-GCM as a fallback), and nothing leaves the machine except the API calls you consent to.

## Why

Cloud chat products keep your logs. Those logs are discoverable, hackable, and increasingly subpoenaed. This is a small, auditable client you can point at whichever model provider you trust the least (or self-host with Ollama).

## Features

- **Streaming responses** across OpenAI, Anthropic, DeepSeek, Kimi (Moonshot), OpenRouter, Ollama, and any OpenAI-compatible endpoint
- **Tool calling** with two built-in tools (`web_search` via DuckDuckGo HTML, `web_fetch`) that run in the Node main process, not the renderer
- **Strict / grounding mode** that injects a system prompt telling the model to cite sources and not fabricate, and exposes the search tools
- **Virtualized message list** (`@tanstack/react-virtual`) that stays smooth at thousands of messages
- **Context manager** with per-message token counts, a running context bar, and user-driven summarization (review the summary before applying)
- **Panic wipe** that overwrites storage with random bytes before deleting
- **Reasoning effort** dropdown for Kimi/DeepSeek/o-series (`low` / `high` / `max`)

## Run it

```bash
npm install
npm run dev      # Vite dev server + Electron with HMR
# or
npm start        # build the renderer once and launch
```

## Structure

```
main.js           Electron main process: encrypted storage, IPC, web tools
preload.js        Bridges window.api to the renderer
src/              React renderer (Vite + TS + Tailwind 4)
  App.tsx
  components/     Chat, Sidebar, Message, Modals, SubagentCard
  hooks/          useAppState, useChat
  lib/            providers, stream (SSE + NDJSON), summarize
  types.ts
```

## Security notes

- API keys and conversations are encrypted at rest via `safeStorage`.
- No telemetry. No analytics.
- Tools run in the main process; the renderer never has direct network access to arbitrary hosts beyond model endpoints.
- The wipe button overwrites files with random bytes before unlinking. This is best-effort on SSDs.
