import type { MicroSummaryRequest, DeepDiveRequest, DocumentAnalysisRequest, FullPageAnalysisRequest } from './types'

// ─── System Prompts ──────────────────────────────────────────────────────────

export const MICRO_SUMMARY_SYSTEM = `You are a reading assistant analyzing a single paragraph in context.
Your job is to describe what this paragraph DOES in the argument — not just what it says.
Use the vocabulary of rhetoric and logic: "provides evidence for", "introduces a caveat to",
"defines the key term", "transitions from X to Y", "makes the central claim that", "illustrates with an example".

Be concise. One to two sentences maximum. Do not repeat content — analyze function.
Return valid JSON only. No markdown, no explanation outside the JSON.`

export const DEEP_DIVE_SYSTEM = `You are a highly literate reading assistant.
Analyze the target paragraph deeply. Identify specific spans of text that serve distinct rhetorical functions.
Identify which other parts of this document this paragraph connects to.

For highlights: quote exact substrings from the paragraph — these will be used for string matching.
Keep quoted spans short (5-20 words ideally). Do not overlap spans.

For cross-references: only reference paragraph IDs that exist in the provided section paragraph list.

Return valid JSON only. No markdown, no explanation outside the JSON.`

export const DOCUMENT_ANALYSIS_SYSTEM = `You are analyzing the full structure of an article or document.
Build a structural map: what role does each section play, and which paragraphs connect to which others.

Be concise in descriptions to minimize tokens. Return valid JSON only. No markdown outside JSON.`

// ─── User Prompt Builders ────────────────────────────────────────────────────

export function buildMicroSummaryPrompt(req: MicroSummaryRequest): string {
  return `Document: "${req.documentTitle}"
Section: "${req.sectionTitle}"
Document type: ${req.documentType}

Preceding context:
"""
${req.precedingText || '(start of document)'}
"""

Target paragraph:
"""
${req.paragraphText}
"""

Following context:
"""
${req.followingText || '(end of document)'}
"""

Return this JSON structure:
{
  "role": "THESIS|EVIDENCE|BACKGROUND|CAVEAT|EXAMPLE|TRANSITION|CONCLUSION|DATA",
  "summary": "1-2 sentence functional description of what this paragraph does in the argument",
  "confidence": 0.0
}`
}

export function buildDeepDivePrompt(req: DeepDiveRequest): string {
  const sectionMapStr = req.sectionMap
    .map((s, i) => `  §${i + 1} "${s.title}" (${s.paragraphCount} paragraphs)`)
    .join('\n')

  const sectionParasStr = req.sectionParagraphs
    .map(p => `[${p.id}]: ${p.text.slice(0, 200)}${p.text.length > 200 ? '...' : ''}`)
    .join('\n\n')

  return `Document: "${req.documentTitle}"

Document structure:
${sectionMapStr}

Current section: "${req.sectionTitle}"

Paragraphs in current section:
${sectionParasStr}

Target paragraph ID: ${req.paragraphId}
Target paragraph (full text):
"""
${req.paragraphText}
"""

Return this JSON structure:
{
  "role": "THESIS|EVIDENCE|BACKGROUND|CAVEAT|EXAMPLE|TRANSITION|CONCLUSION|DATA",
  "summary": "3-5 sentence functional analysis of what this paragraph does in the argument",
  "highlights": [
    {
      "text": "exact substring from the target paragraph",
      "category": "KEY_CLAIM|EVIDENCE|DEFINITION|CAVEAT|EXAMPLE",
      "explanation": "why this span is highlighted (10 words max)"
    }
  ],
  "crossReferences": [
    {
      "targetParagraphId": "cr-para-xxxx",
      "relationship": "SUPPORTS|CONTRADICTS|DEFINES|ELABORATES|PREREQUISITES",
      "description": "short description of the connection (15 words max)"
    }
  ],
  "argumentativeRole": "one sentence about how this paragraph fits the overall argument"
}`
}

export function buildDocumentAnalysisPrompt(req: DocumentAnalysisRequest): string {
  const parasStr = req.paragraphs
    .map(p => `[${p.id}] §"${p.section}": ${p.text.slice(0, 300)}${p.text.length > 300 ? '...' : ''}`)
    .join('\n\n')

  return `Document title: "${req.title}"
Document type: ${req.documentType}

Paragraphs (with IDs):
${parasStr}

Return this JSON structure:
{
  "documentType": "argumentative|explanatory|narrative|reference|research",
  "thesis": "one sentence capturing the central claim or purpose",
  "sections": [
    {
      "title": "section title",
      "role": "INTRODUCTION|BACKGROUND|METHODS|EVIDENCE|COUNTERARGUMENT|CONCLUSION",
      "summary": "one sentence"
    }
  ],
  "paragraphRoles": [
    {
      "id": "cr-para-xxxx",
      "role": "THESIS|EVIDENCE|BACKGROUND|CAVEAT|EXAMPLE|TRANSITION|CONCLUSION|DATA",
      "crossReferences": ["cr-para-yyyy"]
    }
  ],
  "keyTerms": ["term1", "term2"]
}`
}

// ─── Full Page Analysis (single call) ────────────────────────────────────────

export const FULL_PAGE_SYSTEM = `You analyze documents. Return section summaries and paragraph summaries.

STRICT RULES:
- Each SECTION gets a "sectionSummary" of 1-2 sentences, max 30 words.
- Each PARAGRAPH gets a "summary" of under 12 words. Just the core point.
- "highlights" max 2 per paragraph. Each "text" must be an EXACT substring from the paragraph, 3-10 words.
- "crossReferences" max 1 per paragraph. Only if strongly related.
- "explanation" max 3 words.
- "description" max 5 words.
- Paragraphs are grouped by section (marked with § in the input).

Return valid JSON only.`

export function buildFullPagePrompt(req: FullPageAnalysisRequest): string {
  const parasStr = req.paragraphs
    .map(p => `[${p.id}] §"${p.section}":\n${p.text}`)
    .join('\n\n---\n\n')

  return `Document title: "${req.title}"
Document type: ${req.documentType}
Total paragraphs: ${req.paragraphs.length}

Full document text with paragraph IDs:

${parasStr}

Return this JSON. Group paragraphs by their section (§):
{
  "sections": [
    {
      "title": "section name from §",
      "sectionSummary": "1-2 sentences, max 30 words",
      "paragraphs": [
        {
          "id": "cr-para-xxxx",
          "summary": "under 12 words",
          "highlights": [{"text": "exact 3-10 word substring", "category": "KEY_CLAIM|EVIDENCE|DEFINITION|CAVEAT|EXAMPLE", "explanation": "3 words"}],
          "crossReferences": [{"targetParagraphId": "cr-para-yyyy", "relationship": "SUPPORTS|CONTRADICTS|DEFINES|ELABORATES|PREREQUISITES", "description": "5 words"}]
        }
      ]
    }
  ],
  "thesis": "one sentence",
  "keyTerms": ["term1"]
}`
}
