# co-reader

A Chrome extension that analyzes articles paragraph by paragraph. Click "Start" and get a synchronized reading guide in the side panel — short summaries, key phrase highlights, and cross-references between related paragraphs.

Optionally with no backend. Your API key stays in your browser. For performance reasons, it supports Anthropic, OpenAI, Gemini, OpenRouter, and Chrome's built-in Nano model.

## Install

### From a release (easiest)

1. Download the latest `.zip` from [Releases](https://github.com/msanvido/co-reader/releases)
2. Unzip the file
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder

### From source

```bash
git clone https://github.com/msanvido/co-reader.git
cd co-reader
npm install
npm run build
```

Then load the `output/chrome-mv3/` folder as an unpacked extension (same steps 3-5 above).

## How it works

1. Open any article and click the co-reader icon to open the side panel
2. Click **Start** — the extension sends the article to your chosen LLM in small chunks
3. Summaries appear in the side panel as they're processed
4. Click a summary to scroll to that paragraph and highlight its key phrases
5. Click a paragraph in the article to sync the panel the other way
6. Cross-reference links let you jump between related paragraphs

## Dev mode (auto-reload)

```bash
npm run dev
```

This builds, watches for changes, and launches Chrome with the extension pre-loaded. Changes to source files auto-reload the extension.

## Configure

Click the co-reader icon in the toolbar to open the side panel, then click **⚙** to open settings:

- **Provider** — Anthropic, OpenAI, Google Gemini, OpenRouter, In-Browser Chrome Native, or In-Browser Gemma (all free, on-device)
- **Model** — pick from the provider's available models
- **API Key** — paste your key (stored locally in `chrome.storage.local`, never sent to any server except the LLM provider you chose)

### Get an API key

| Provider | Where to get a key |
|---|---|
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) |
| In-Browser Chrome Native | No key needed — see [Gemini Nano setup](#run-entirely-in-your-browser-with-gemini-nano) |
| In-Browser (Gemma) | No key needed — see [Gemma setup](#run-gemma-4-locally-with-transformersjs) |

### Run entirely in your browser

co-reader can run **100% locally**

#### Chrome Gemini Nano

co-reader can use Chrome's built-in Gemini Nano model — no API key, no cloud calls, no data leaves your machine. Select "In-Browser Chrome Native" as the provider and you're set.

**Setup** (one-time):

1. Use Chrome 131 or newer (Chrome 138+ recommended for the latest Prompt API)
2. Open `chrome://flags/#optimization-guide-on-device-model` and set to **Enabled BypassPerfRequirement**
3. Open `chrome://flags/#prompt-api-for-gemini-nano` and set to **Enabled**
4. Relaunch Chrome
5. Open `chrome://components`, find **Optimization Guide On Device Model**, click "Check for update" — this downloads ~1.7 GB
6. Wait for the download to finish, then restart Chrome

See the [Chrome Built-in AI docs](https://developer.chrome.com/docs/ai/built-in) for more details.

**Caveats:**
- Output quality is lower than cloud models — summaries may be vague or miss key points
- Small context window (4K tokens) limits analysis to ~5 paragraphs per chunk
- Some articles may be too complex for Nano to produce valid JSON

### Run Gemma 4 locally with transformers.js

co-reader can also run **Gemma 4** entirely in your browser using [transformers.js](https://huggingface.co/docs/transformers.js) and WebGPU. The model is downloaded once from HuggingFace (~500 MB for E2B, ~1.5 GB for E4B) and cached by the browser. No API key needed.

**Requirements:**
- Chrome 113+ (or Edge 113+) with WebGPU enabled
- A GPU that supports f16 shaders

Select "In-Browser (Gemma)" as the provider and pick a model:
- **gemma-4-e2b** — ~500 MB download, good balance of size and quality
- **gemma-4-e4b** — ~1.5 GB download, better quality

**Caveats:**
- First load downloads the model — this can take a few minutes on slower connections, subsequent runs use the cached model.
- Context window is limited (8K tokens) compared to cloud models
- Inference is slower than cloud APIs — expect 10-30 seconds per chunk depending on GPU
- WebGPU must be available and your GPU must support f16 shaders

## Supported sites

co-reader works on any site that uses standard HTML paragraph elements (`<p>` tags), which covers the vast majority of blogs, news sites, and documentation. This includes Anthropic, OpenAI, Google, GitHub, Substack, HackerNoon, Ars Technica, and most WordPress/Ghost sites.

Custom adapters provide optimized paragraph detection for:

| Site | Notes |
|---|---|
| Medium | Article container, excludes pullquotes |
| Wikipedia | Content text area, excludes references and infoboxes |
| arXiv | LaTeX-rendered paragraphs |
| NY Times | Article body, excludes ads |
| Substack | Post content |
| The Guardian | Article body |
| X / Twitter articles | Draft.js DOM (no `<p>` tags) |

**Known limitations:**
- Sites that put all text in a single element with `<br>` line breaks (e.g., paulgraham.com) are not currently supported
- Paywalled content that isn't in the DOM won't be detected
- SPAs that lazy-load article text may need a moment before paragraphs appear (the extension re-scans on DOM changes)

To add support for a new site, create an adapter in `entrypoints/content/site-adapters.ts` — PRs welcome.

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

## Packaging for the Chrome Web Store

1. Bump the version in `package.json`
2. Run `npm run zip` — this builds the extension and creates a `.zip` in `output/`
3. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Find the co-reader listing, click **Package** > **Upload new package**
5. Upload the `.zip` and submit for review

## Tech stack

- [WXT](https://wxt.dev/) — extension framework (Manifest V3)
- [Preact](https://preactjs.com/) — UI for side panel and popup
- TypeScript
- Direct `fetch()` to LLM APIs — no SDK dependencies

## License

[MIT](LICENSE)
