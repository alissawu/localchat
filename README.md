# localchat

Local encrypted chat client with web search tools. All data stored locally with encryption.

## Features

- Multiple API providers (OpenAI, Anthropic, DeepSeek, Kimi K3, OpenRouter, Ollama, custom)
- Encrypted local storage (uses OS keychain when available)
- **Strict mode** with grounding system prompt + web tools
- Web search tool (DuckDuckGo, no API key needed)
- Web fetch tool (read any URL)
- Context management with token counting
- Selective message deletion
- Summarization (compress old messages to save context)
- Archive originals when summarizing
- Panic wipe button (secure deletion)

## Setup

```bash
npm install
npm start
```

## Build

```bash
npm run build:mac   # macOS
npm run build:win   # Windows
npm run build:linux # Linux
```

## Usage

1. Open Settings and add an API provider
2. Select the provider from the dropdown
3. Start chatting

### Recommended providers for privacy

- **Kimi K3** (Moonshot AI): Top Chinese model, Chinese jurisdiction
- **DeepSeek**: Chinese jurisdiction, very cheap
- **OpenRouter**: Can use either, one account

### Strict Mode (Grounding)

When enabled (default), the app:
- Adds a system prompt telling the model to cite sources and not hallucinate
- Enables web_search and web_fetch tools
- Model can search the web and read pages to verify facts

Disable strict mode for casual chat without tool overhead.

### Context Management

- Click messages in the sidebar to jump to them
- Select multiple messages with checkboxes
- "Summarize Selected" replaces selected messages with a summary
- "Summarize All" summarizes the entire conversation
- Edit summaries before applying
- Toggle "Keep originals when summarizing" in settings

### Wipe

The "Wipe All" button securely deletes all data by:
1. Overwriting files with random data
2. Deleting the files

## Security Notes

- All data encrypted at rest using OS keychain (macOS Keychain, Windows Credential Manager)
- Fallback encryption with AES-256-GCM if keychain unavailable
- No data sent anywhere except your chosen API provider
- No telemetry, no analytics, no network calls except API requests and tool searches
- Web searches go through DuckDuckGo HTML (no tracking)

## Tool Architecture

Tools run in the main process (Node.js), not the renderer. This means:
- Full network access for searches
- No CORS issues
- Results passed back through IPC

The model decides when to call tools based on the system prompt guidance.
