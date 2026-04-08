// ─── Paragraph & Document Structure ────────────────────────────────────────

export type ParagraphRole =
  | 'THESIS'
  | 'EVIDENCE'
  | 'BACKGROUND'
  | 'CAVEAT'
  | 'EXAMPLE'
  | 'TRANSITION'
  | 'CONCLUSION'
  | 'DATA'
  | 'UNKNOWN'

export type HighlightCategory =
  | 'KEY_CLAIM'
  | 'EVIDENCE'
  | 'DEFINITION'
  | 'CAVEAT'
  | 'EXAMPLE'

export type CrossRefRelationship =
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'DEFINES'
  | 'ELABORATES'
  | 'PREREQUISITES'

export type DocumentType =
  | 'article'
  | 'academic'
  | 'wikipedia'
  | 'pdf'
  | 'unknown'

export interface ParagraphMeta {
  id: string
  sectionTitle: string
  sectionIndex: number
  paragraphIndex: number
  wordCount: number
  role?: ParagraphRole
}

export interface HighlightSpan {
  text: string
  category: HighlightCategory
  explanation: string
}

export interface CrossReference {
  targetParagraphId: string
  relationship: CrossRefRelationship
  description: string
}

// ─── API Responses ──────────────────────────────────────────────────────────

export interface MicroSummaryResponse {
  role: ParagraphRole
  summary: string
  confidence: number
}

export interface DeepDiveResponse {
  role: ParagraphRole
  summary: string
  highlights: HighlightSpan[]
  crossReferences: CrossReference[]
  argumentativeRole: string
}

export interface SectionInfo {
  title: string
  role: string
  summary: string
}

export interface ParagraphRoleEntry {
  id: string
  role: ParagraphRole
  crossReferences: string[]
}

export interface DocumentAnalysisResponse {
  documentType: string
  thesis: string
  sections: SectionInfo[]
  paragraphRoles: ParagraphRoleEntry[]
  keyTerms: string[]
}

// ─── Full Page Analysis (single LLM call) ────────────────────────────────────

export interface FullPageParagraphAnalysis {
  id: string
  role: ParagraphRole
  summary: string
  highlights: HighlightSpan[]
  crossReferences: CrossReference[]
}

export interface FullPageAnalysisResponse {
  documentType: string
  thesis: string
  sections: SectionInfo[]
  paragraphs: FullPageParagraphAnalysis[]
  keyTerms: string[]
}

export interface FullPageAnalysisRequest {
  title: string
  documentType: DocumentType
  paragraphs: Array<{ id: string; section: string; text: string }>
}

// ─── Cache ──────────────────────────────────────────────────────────────────

export interface CachedMicroSummary {
  response: MicroSummaryResponse
  cachedAt: number
}

export interface CachedDeepDive {
  response: DeepDiveResponse
  cachedAt: number
}

export interface CachedDocumentAnalysis {
  response: DocumentAnalysisResponse
  cachedAt: number
}

// ─── Settings ───────────────────────────────────────────────────────────────

export type ProviderID = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'chrome-nano'

export interface Settings {
  provider: ProviderID
  model: string
  apiKey: string
  enabled: boolean
  blockedDomains: string[]
  highlightCategories: Record<HighlightCategory, boolean>
  hoverDelayMs: number
  minWordCount: number
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  apiKey: '',
  enabled: true,
  blockedDomains: [
    'mail.google.com',
    'outlook.live.com',
    'outlook.office.com',
    'app.slack.com',
  ],
  highlightCategories: {
    KEY_CLAIM: true,
    EVIDENCE: true,
    DEFINITION: true,
    CAVEAT: true,
    EXAMPLE: true,
  },
  hoverDelayMs: 500,
  minWordCount: 30,
}

// ─── Messages (Content Script ↔ Service Worker) ─────────────────────────────

export type MessageType =
  | 'GET_MICRO_SUMMARY'
  | 'GET_DEEP_DIVE'
  | 'GET_DOCUMENT_ANALYSIS'
  | 'GET_FULL_PAGE_ANALYSIS'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'CHECK_DOMAIN_BLOCKED'
  | 'OPEN_SIDE_PANEL'
  | 'SIDE_PANEL_UPDATE'

export interface BaseMessage {
  type: MessageType
}

export interface GetMicroSummaryMessage extends BaseMessage {
  type: 'GET_MICRO_SUMMARY'
  payload: MicroSummaryRequest
}

export interface GetDeepDiveMessage extends BaseMessage {
  type: 'GET_DEEP_DIVE'
  payload: DeepDiveRequest
}

export interface GetDocumentAnalysisMessage extends BaseMessage {
  type: 'GET_DOCUMENT_ANALYSIS'
  payload: DocumentAnalysisRequest
}

export interface GetSettingsMessage extends BaseMessage {
  type: 'GET_SETTINGS'
}

export interface UpdateSettingsMessage extends BaseMessage {
  type: 'UPDATE_SETTINGS'
  payload: Partial<Settings>
}

export interface CheckDomainBlockedMessage extends BaseMessage {
  type: 'CHECK_DOMAIN_BLOCKED'
  payload: { hostname: string }
}

export interface OpenSidePanelMessage extends BaseMessage {
  type: 'OPEN_SIDE_PANEL'
  payload: DeepDiveResponse & { paragraphId: string; paragraphText: string }
}

export interface GetFullPageAnalysisMessage extends BaseMessage {
  type: 'GET_FULL_PAGE_ANALYSIS'
  payload: FullPageAnalysisRequest
}

export interface SidePanelUpdateMessage extends BaseMessage {
  type: 'SIDE_PANEL_UPDATE'
  payload: DeepDiveResponse & { paragraphId: string; paragraphText: string }
}

export type Message =
  | GetMicroSummaryMessage
  | GetDeepDiveMessage
  | GetDocumentAnalysisMessage
  | GetFullPageAnalysisMessage
  | GetSettingsMessage
  | UpdateSettingsMessage
  | CheckDomainBlockedMessage
  | OpenSidePanelMessage
  | SidePanelUpdateMessage

// ─── Request Payloads ────────────────────────────────────────────────────────

export interface MicroSummaryRequest {
  paragraphText: string
  paragraphId: string
  precedingText: string
  followingText: string
  documentTitle: string
  sectionTitle: string
  documentType: DocumentType
}

export interface DeepDiveRequest {
  paragraphText: string
  paragraphId: string
  sectionParagraphs: Array<{ id: string; text: string }>
  sectionTitle: string
  documentTitle: string
  sectionMap: Array<{ title: string; paragraphCount: number }>
}

export interface DocumentAnalysisRequest {
  title: string
  documentType: DocumentType
  paragraphs: Array<{ id: string; section: string; text: string }>
}

// ─── Cross-Reference Graph ───────────────────────────────────────────────────

export interface CrossReferenceGraph {
  url: string
  thesis: string
  paragraphRoles: Map<string, ParagraphRole>
  edges: CrossReferenceEdge[]
  keyTerms: string[]
  sections: SectionInfo[]
}

export interface CrossReferenceEdge {
  sourceId: string
  targetId: string
  relationship: CrossRefRelationship
  description: string
}
