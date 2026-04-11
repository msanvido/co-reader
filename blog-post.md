# Context Compaction for Humans: What LLM Techniques Can Teach Us About Reading

There's more to read than ever. AI-assisted writing has made content production faster and cheaper, and the volume of articles, reports, and analyses keeps growing. Summarization tools help, but they've always felt incomplete to me: I'd read a summary and know *what* an article was about, but not *what it actually said*. The key claims, the caveats, the connections between ideas: all the entropy of the original text: would evaporate into a bland paragraph.

This felt oddly familiar. It's the same problem LLMs face when they run out of context window: you need to compress information without losing the signal. The field has developed several "context compaction" techniques to deal with this: abstractive summarization, extractive selection, hierarchical map-reduce, chain-of-density iteration. Each makes different trade-offs between brevity and fidelity.

I thought: what if we applied these same techniques not to fit text into a model's context, but to fit it into *mine*?

## co-reader: A Reading Companion, Not a Summarizer

[co-reader](https://github.com/msanvido/co-reader) is a Chrome extension that analyzes articles paragraph by paragraph and produces a synchronized reading guide in the side panel. It's not trying to replace reading: it's trying to make reading more efficient. For every paragraph, you get:

- **A short summary**: so you can scan the structure before diving in
- **Key phrase highlights**: claims, evidence, definitions, caveats, and examples marked directly in the text
- **Cross-references**: links between paragraphs that support, contradict, define, or elaborate on each other

Click a summary in the panel and you scroll to that paragraph. Click a paragraph in the article and the panel syncs. It's a bidirectional reading guide that preserves the structure of the argument, not just the topic.

## Five Compaction Techniques to Experiment With

The core experiment is this: different compression strategies produce different reading experiences. co-reader implements five techniques, and you can switch between them to see which fits your reading style.

### 1. Abstractive (default)
Short prose summaries, max 12 words per paragraph. Fast, cheap, one pass. Good for getting the gist. This is what most summarizers do, but applied at the paragraph level rather than the whole document.

### 2. Extractive
Picks the single most important sentence verbatim from each paragraph. No rewriting. This is useful when you want the author's actual words: when precision matters more than brevity.

### 3. Bullet Points
Returns 2-3 bullet points per paragraph. Good for scanning technical content where multiple distinct points coexist in one paragraph.

### 4. Hierarchical (2-pass)
First pass: summarize each chunk independently. Second pass: refine the thesis and cross-references across the full document. The second pass sees the forest after the first pass mapped the trees. Costs 2x but produces more coherent cross-references.

### 5. Chain of Density (3-pass)
Inspired by the [chain-of-density prompting paper](https://arxiv.org/abs/2309.04269). Each iteration makes summaries denser: packing more information into the same word budget. Three rounds per chunk. Highest quality, 3x cost, but the summaries are remarkably information-dense.

Each technique trades off speed, cost, and information density differently. I find chain-of-density produces the best reading guides for complex articles, while abstractive is fine for news. Your mileage will vary: that's the point of having options.

## Fun and Optional: It Runs Entirely in Your Browser (If You Want)

The extension can fully run in your browser using local models (2 supported approaches).

**Chrome's built-in Gemini Nano** uses Chrome's native Prompt API. No download, no API key, no data leaves your machine. It's limited (4K context, lower quality) but it works. It is bit of a pain to enable in chrome, and is very slow but fun to play with.


**In-Browser Gemma via transformers.js** downloads an ONNX-quantized Gemma 4 model (~500 MB) from HuggingFace on first use and runs it locally via WebGPU. It's slow: inference is serial and each chunk takes 10-30 seconds depending on your GPU. But it's fully private and genuinely interesting to watch a 2B-parameter model run in a browser tab.

Both local options are more proof-of-concept than production-ready. Cloud models are dramatically faster and higher quality. But for privacy-sensitive content or just for the novelty of running an LLM in a browser extension, they work.

## Performance with BYOK: Parallelism and Dynamic Chunk Sizing but BYOK

Making this fast enough to be usable required some engineering. The naive approach: send paragraphs to the LLM one chunk at a time: was painfully slow. A 200-paragraph article would take minutes.

Two optimizations made the biggest difference:

**Dynamic chunk sizing.** Instead of a fixed 6 paragraphs per LLM call, co-reader calculates the optimal chunk size from the model's context and output token limits. Claude with 200K context and 16K output can handle ~50 paragraphs per call. Gemini with 1M context and 65K output can handle even more. A typical 30-paragraph article goes from 5 API calls down to 1.

**Parallel chunk processing.** For cloud providers, multiple chunks are sent concurrently (up to 6 in flight). A 217-paragraph article on Gemini went from ~42 seconds to ~20 seconds. Local models stay serial since the GPU can only run one inference at a time.

Only negative is that you will need to BYOK (bring your own key) for the cloud providers.

## Try It

I'm waiting for Google to approve co-reader on the Chrome Web Store. In the meantime, you can install it manually:

```bash
git clone https://github.com/msanvido/co-reader.git
cd co-reader
npm install
npm run build
```

Then go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", and select the `output/chrome-mv3` folder.

Pick a provider, paste an API key (or choose a local/free option), open any article, and click Start.

## What's Next

I'd love to see more compaction techniques. If you have an idea: maybe something based on [recursive summarization](https://arxiv.org/abs/2109.10862), or a technique that preserves narrative structure, or one optimized for academic papers: open a PR. The extension is designed to make adding new techniques straightforward: define a system prompt, a user prompt builder, and optionally a second pass.

The code is at [github.com/msanvido/co-reader](https://github.com/msanvido/co-reader).

Contributions alwasy welcome.
