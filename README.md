# localchat

Local encrypted chat client. All data stored locally with encryption.

## Features

- Multiple API providers (OpenAI, Anthropic, DeepSeek, OpenRouter, Ollama, custom)
- Encrypted local storage (uses OS keychain when available)
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

### Context Management

- Click messages in the sidebar to jump to them
- Select multiple messages with checkboxes
- "Summarize Selected" replaces selected messages with a summary
- "Summarize All" summarizes the entire conversation
- Toggle "Keep originals when summarizing" in settings

### Wipe

The "Wipe All" button securely deletes all data by:
1. Overwriting files with random data
2. Deleting the files

## Security Notes

- All data encrypted at rest using OS keychain (macOS Keychain, Windows Credential Manager)
- Fallback encryption with AES-256-GCM if keychain unavailable
- No data sent anywhere except your chosen API provider
- No telemetry, no analytics, no network calls except API requests
