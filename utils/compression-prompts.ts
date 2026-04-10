/**
 * Compression technique registry.
 * Each technique defines its own system prompt and user prompt builder.
 * All techniques return the same JSON schema — only the summary style differs.
 */
import type { CompressionTechnique, FullPageAnalysisRequest } from './types'
import { FULL_PAGE_SYSTEM, buildFullPagePrompt } from './prompts'

export interface CompressionConfig {
  id: CompressionTechnique
  label: string
  description: string
  costMultiplier: number
  passes: number
  systemPrompt: string
  buildUserPrompt: (req: FullPageAnalysisRequest) => string
  /** Pass-2 prompts for multi-pass techniques */
  pass2SystemPrompt?: string
  buildPass2Prompt?: (prevResults: string, req: FullPageAnalysisRequest) => string
}

// ─── Shared JSON schema fragment ──────────────────────────────────────────────

const JSON_SCHEMA = `{
  "sections": [
    {
      "title": "section name from §",
      "sectionSummary": "1-2 sentences, max 30 words",
      "paragraphs": [
        {
          "id": "cr-para-xxxx",
          "summary": "...",
          "highlights": [{"text": "exact 3-10 word substring", "category": "KEY_CLAIM|EVIDENCE|DEFINITION|CAVEAT|EXAMPLE", "explanation": "3 words"}],
          "crossReferences": [{"targetParagraphId": "cr-para-yyyy", "relationship": "SUPPORTS|CONTRADICTS|DEFINES|ELABORATES|PREREQUISITES", "description": "5 words"}]
        }
      ]
    }
  ],
  "thesis": "one sentence",
  "keyTerms": ["term1"]
}`

function buildStandardUserPrompt(req: FullPageAnalysisRequest, summaryInstruction: string): string {
  const parasStr = req.paragraphs
    .map(p => `[${p.id}] §"${p.section}":\n${p.text}`)
    .join('\n\n---\n\n')

  return `Document title: "${req.title}"
Document type: ${req.documentType}
Total paragraphs: ${req.paragraphs.length}

Full document text with paragraph IDs:

${parasStr}

Return this JSON. ${summaryInstruction}
${JSON_SCHEMA}`
}

// ─── Technique configs ────────────────────────────────────────────────────────

export const COMPRESSION_CONFIGS: Record<CompressionTechnique, CompressionConfig> = {

  // ── Abstractive (default, current behavior) ──────────────────────────────
  'abstractive': {
    id: 'abstractive',
    label: 'Abstractive',
    description: 'Short prose summaries (≤12 words per paragraph). Fast, low cost.',
    costMultiplier: 1,
    passes: 1,
    systemPrompt: FULL_PAGE_SYSTEM,
    buildUserPrompt: buildFullPagePrompt,
  },

  // ── Extractive ───────────────────────────────────────────────────────────
  'extractive': {
    id: 'extractive',
    label: 'Extractive',
    description: 'Selects the most important sentence verbatim from each paragraph. No rewriting.',
    costMultiplier: 1,
    passes: 1,
    systemPrompt: `You analyze documents by EXTRACTING key sentences.

STRICT RULES:
- Each SECTION gets a "sectionSummary" of 1-2 sentences, max 30 words (you may rephrase these).
- Each PARAGRAPH's "summary" MUST be a single sentence copied VERBATIM from that paragraph. Do NOT rewrite, paraphrase, or shorten it. Select the most important sentence exactly as written.
- "highlights" max 2 per paragraph. Each "text" must be an EXACT substring, 3-10 words.
- "crossReferences" max 1 per paragraph.
- "explanation" max 3 words. "description" max 5 words.

Return valid JSON only.`,
    buildUserPrompt: (req) => buildStandardUserPrompt(req,
      'Each paragraph "summary" must be a VERBATIM sentence from the original paragraph:'),
  },

  // ── Hierarchical (2-pass map-reduce) ─────────────────────────────────────
  'hierarchical': {
    id: 'hierarchical',
    label: 'Hierarchical',
    description: 'Two-pass analysis. Pass 1: summarize chunks. Pass 2: refine thesis and cross-references across the full document.',
    costMultiplier: 2,
    passes: 2,
    systemPrompt: `You analyze documents. Return section summaries and paragraph summaries.

STRICT RULES:
- Each SECTION gets a "sectionSummary" of 1-2 sentences, max 30 words.
- Each PARAGRAPH gets a "summary" of under 15 words. Be detailed enough for a second-pass refinement.
- "highlights" max 2 per paragraph. "text" must be EXACT substring, 3-10 words.
- "crossReferences": list ANY paragraph IDs from the input that relate to each paragraph.
- "explanation" max 3 words. "description" max 5 words.

Return valid JSON only.`,
    buildUserPrompt: (req) => buildStandardUserPrompt(req,
      'Summaries should be under 15 words but detailed enough for refinement:'),

    pass2SystemPrompt: `You are refining a document analysis. You receive section summaries and paragraph summaries from a first pass.

Your job:
1. Write a better THESIS for the entire document (1-2 sentences).
2. Improve each SECTION summary to reflect how sections relate to each other.
3. Add CROSS-REFERENCES between paragraphs across different sections that were analyzed in separate chunks.
4. Keep paragraph summaries unchanged — only improve thesis, section summaries, and cross-references.

Return valid JSON only.`,

    buildPass2Prompt: (prevResults, _req) => `Here are the first-pass analysis results:

${prevResults}

Refine this analysis. Return the same JSON structure with:
- An improved "thesis" that captures the full document's argument
- Improved "sectionSummary" for each section showing how sections connect
- Additional "crossReferences" between paragraphs in DIFFERENT sections
- Keep all paragraph "summary" and "highlights" unchanged
${JSON_SCHEMA}`,
  },

  // ── Chain of Density ─────────────────────────────────────────────────────
  'chain-of-density': {
    id: 'chain-of-density',
    label: 'Chain of Density',
    description: 'Three iterations per chunk — each makes summaries denser. Highest quality but 3x cost.',
    costMultiplier: 3,
    passes: 3,
    systemPrompt: `You analyze documents. Return section summaries and paragraph summaries.

This is ITERATION 1 (sparse). Write clear, simple summaries.

STRICT RULES:
- Each SECTION gets a "sectionSummary" of 1-2 sentences, max 30 words.
- Each PARAGRAPH gets a "summary" of under 12 words. Keep it simple — later iterations will add density.
- "highlights" max 2 per paragraph. "text" must be EXACT substring, 3-10 words.
- "crossReferences" max 1 per paragraph.
- "explanation" max 3 words. "description" max 5 words.

Return valid JSON only.`,
    buildUserPrompt: (req) => buildStandardUserPrompt(req,
      'ITERATION 1 — write simple, clear summaries under 12 words:'),

    pass2SystemPrompt: `You are DENSIFYING document summaries. You receive previous summaries and the original text.

RULES:
- For each paragraph, identify 1-2 important entities/facts MISSING from the previous summary.
- Rewrite the summary to include them WITHOUT increasing length (still under 12 words).
- The summary should become more information-dense, not longer.
- Keep "highlights" and "crossReferences" from the previous iteration unchanged.
- Improve "sectionSummary" to be more precise.

Return valid JSON only.`,

    buildPass2Prompt: (prevResults, req) => {
      const parasStr = req.paragraphs
        .map(p => `[${p.id}] §"${p.section}":\n${p.text}`)
        .join('\n\n---\n\n')

      return `Previous analysis (to densify):
${prevResults}

Original paragraphs:
${parasStr}

Make each paragraph "summary" DENSER — incorporate missing key entities without increasing length. Return same JSON structure:
${JSON_SCHEMA}`
    },
  },

  // ── Bullet Points ────────────────────────────────────────────────────────
  'bullet-points': {
    id: 'bullet-points',
    label: 'Bullet Points',
    description: 'Returns 2-3 bullet points per paragraph instead of prose. Good for scanning.',
    costMultiplier: 1,
    passes: 1,
    systemPrompt: `You analyze documents. Return bullet-point summaries for each paragraph.

STRICT RULES:
- Each SECTION gets a "sectionSummary" of 1-2 sentences, max 30 words.
- Each PARAGRAPH gets a "summary" as 2-3 bullet points. Format exactly as: "- Point one\\n- Point two\\n- Point three". Each bullet under 10 words.
- "highlights" max 2 per paragraph. "text" must be EXACT substring, 3-10 words.
- "crossReferences" max 1 per paragraph.
- "explanation" max 3 words. "description" max 5 words.

Return valid JSON only.`,
    buildUserPrompt: (req) => buildStandardUserPrompt(req,
      'Each paragraph "summary" must be 2-3 bullet points formatted as "- Point\\n- Point":'),
  },
}
