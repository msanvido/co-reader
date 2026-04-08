# co-reader

A Chrome extension that analyzes articles paragraph by paragraph. Click "Start" and get a synchronized reading guide in the side panel — short summaries, key phrase highlights, and cross-references between related paragraphs.

No backend. Your API key stays in your browser. Supports Anthropic, OpenAI, Gemini, OpenRouter, and Chrome's built-in Nano model.

## How it works

1. Open any article and click the co-reader icon to open the side panel
2. Click **Start** — the extension sends the article to your chosen LLM in small chunks
3. Summaries appear in the side panel as they're processed
4. Click a summary to scroll to that paragraph and highlight its key phrases
5. Click a paragraph in the article to sync the panel the other way
6. Cross-reference links let you jump between related paragraphs

## Build

```bash
git clone https://github.com/msanvido/co-reader.git
cd co-reader
npm install
npm run build
```

The built extension is in `output/chrome-mv3/`.

## Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `output/chrome-mv3` folder

## Dev mode (auto-reload)

```bash
npm run dev
```

This builds, watches for changes, and launches Chrome with the extension pre-loaded. Changes to source files auto-reload the extension.

## Configure

Click the co-reader icon in the toolbar to open the side panel, then click **⚙** to open settings:

- **Provider** — Anthropic, OpenAI, Google Gemini, OpenRouter, or Chrome Nano (free, on-device)
- **Model** — pick from the provider's available models
- **API Key** — paste your key (stored locally in `chrome.storage.local`, never sent to any server except the LLM provider you chose)

### Get an API key

| Provider | Where to get a key |
|---|---|
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Chrome Nano | No key needed — see setup below |

### Chrome Built-in AI / Gemini Nano (BETA)

Chrome ships an on-device LLM (Gemini Nano) that runs entirely locally — no API key, no data sent anywhere. It requires Chrome 131+ and manual setup:

1. Open `chrome://flags/#optimization-guide-on-device-model` and set to **Enabled BypassPerfRequirement**
2. Open `chrome://flags/#prompt-api-for-gemini-nano` and set to **Enabled**
3. Relaunch Chrome
4. Open `chrome://components`, find **Optimization Guide On Device Model**, click "Check for update" — this downloads ~1.7GB
5. Wait for the download to finish, then restart Chrome

In co-reader settings, select "Chrome Nano [BETA]" as the provider. No API key field will appear.

**Caveats:**
- Output quality is significantly lower than cloud models — summaries may be vague or miss key points
- Small context window (4K tokens) limits analysis to ~5 paragraphs per chunk
- Some articles may be too complex for Nano to produce valid JSON
- This is experimental and may not work on all systems

## Project structure

```
co-reader/
├── wxt.config.ts                  # WXT + Vite config, manifest
├── entrypoints/
│   ├── background/                # Service worker: message routing, LLM calls
│   │   ├── index.ts
│   │   ├── llm.ts
│   │   ├── settings.ts
│   │   └── providers/             # LLM provider implementations
│   │       ├── anthropic.ts
│   │       ├── openai.ts
│   │       ├── gemini.ts
│   │       ├── openrouter.ts
│   │       └── chrome-nano.ts
│   ├── content/                   # Content script: paragraph detection, highlights
│   │   ├── index.ts
│   │   ├── paragraph-detector.ts
│   │   ├── document-analyzer.ts
│   │   ├── highlight-injector.ts
│   │   ├── cross-ref-navigator.ts
│   │   └── site-adapters.ts
│   ├── sidepanel/                 # Side panel UI (Preact)
│   │   └── App.tsx
│   └── popup/                     # Settings popup (Preact)
│       └── App.tsx
├── utils/                         # Shared types, prompts, constants
│   ├── types.ts
│   ├── prompts.ts
│   ├── constants.ts
│   └── text-utils.ts
└── assets/styles/                 # CSS for highlights, tooltips
```

## Tech stack

- [WXT](https://wxt.dev/) — extension framework (Manifest V3)
- [Preact](https://preactjs.com/) — UI for side panel and popup
- TypeScript
- Direct `fetch()` to LLM APIs — no SDK dependencies

## License

MIT
