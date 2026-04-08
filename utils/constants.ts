import type { HighlightCategory, ParagraphRole, CrossRefRelationship } from './types'

// ─── Timing ─────────────────────────────────────────────────────────────────

export const HOVER_DEBOUNCE_MS = 500
export const PREFETCH_TRIGGER_PX = 100
export const TOOLTIP_FADE_MS = 120
export const PULSE_DURATION_MS = 2000
export const DOC_ANALYSIS_DELAY_MS = 2000

// ─── Cache TTLs (ms) ─────────────────────────────────────────────────────────

export const CACHE_TTL_MICRO = 7 * 24 * 60 * 60 * 1000       // 7 days
export const CACHE_TTL_DEEP_DIVE = 3 * 24 * 60 * 60 * 1000   // 3 days
export const CACHE_TTL_DOC_ANALYSIS = 24 * 60 * 60 * 1000    // 24 hours
export const IN_MEMORY_CACHE_MAX = 200

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const MIN_WORD_COUNT = 30
export const CONTEXT_PARAGRAPHS_BEFORE = 2
export const CONTEXT_PARAGRAPHS_AFTER = 1

// ─── Models ──────────────────────────────────────────────────────────────────

export const MODEL_FAST = 'claude-haiku-4-5-20251001'    // hover tooltips
export const MODEL_DEEP = 'claude-sonnet-4-6'            // deep-dive + doc analysis

// ─── Highlight Colors ────────────────────────────────────────────────────────

export const HIGHLIGHT_COLORS: Record<HighlightCategory, { light: string; dark: string }> = {
  KEY_CLAIM:  { light: '#FFF3B0', dark: '#4A3F00' },
  EVIDENCE:   { light: '#C8F0D8', dark: '#0D3D20' },
  DEFINITION: { light: '#D4E8FF', dark: '#0A2A4A' },
  CAVEAT:     { light: '#FFE4CC', dark: '#4A2000' },
  EXAMPLE:    { light: '#EEE0FF', dark: '#2A1A4A' },
}

export const HIGHLIGHT_DOT_COLORS: Record<HighlightCategory, string> = {
  KEY_CLAIM:  '#D4A800',
  EVIDENCE:   '#28A660',
  DEFINITION: '#2B7DD4',
  CAVEAT:     '#E07020',
  EXAMPLE:    '#8050C8',
}

// ─── Paragraph Role Colors & Labels ──────────────────────────────────────────

export const ROLE_COLORS: Record<ParagraphRole, string> = {
  THESIS:     '#FF6B6B',
  EVIDENCE:   '#4CAF50',
  BACKGROUND: '#9E9E9E',
  CAVEAT:     '#FF9800',
  EXAMPLE:    '#9C27B0',
  TRANSITION: '#607D8B',
  CONCLUSION: '#F44336',
  DATA:       '#2196F3',
  UNKNOWN:    '#757575',
}

export const ROLE_LABELS: Record<ParagraphRole, string> = {
  THESIS:     'Thesis',
  EVIDENCE:   'Evidence',
  BACKGROUND: 'Background',
  CAVEAT:     'Caveat',
  EXAMPLE:    'Example',
  TRANSITION: 'Transition',
  CONCLUSION: 'Conclusion',
  DATA:       'Data',
  UNKNOWN:    'Unknown',
}

// ─── Cross-Reference Relationship Labels & Colors ────────────────────────────

export const RELATIONSHIP_COLORS: Record<CrossRefRelationship, string> = {
  SUPPORTS:      '#4CAF50',
  CONTRADICTS:   '#F44336',
  DEFINES:       '#2196F3',
  ELABORATES:    '#FF9800',
  PREREQUISITES: '#9C27B0',
}

export const RELATIONSHIP_LABELS: Record<CrossRefRelationship, string> = {
  SUPPORTS:      'Supports',
  CONTRADICTS:   'Contradicts',
  DEFINES:       'Defines',
  ELABORATES:    'Elaborates',
  PREREQUISITES: 'Prerequisite',
}

export const RELATIONSHIP_ARROWS: Record<CrossRefRelationship, string> = {
  SUPPORTS:      '↑',
  CONTRADICTS:   '↕',
  DEFINES:       '▸',
  ELABORATES:    '↓',
  PREREQUISITES: '←',
}

// ─── CSS Class Prefixes ───────────────────────────────────────────────────────

export const CR_PREFIX = 'cr'
export const TOOLTIP_CLASS = `${CR_PREFIX}-tooltip`
export const HIGHLIGHT_CLASS = `${CR_PREFIX}-highlight`
export const MARGIN_DOT_CLASS = `${CR_PREFIX}-margin-dot`
export const PARA_ATTR = `data-${CR_PREFIX}-id`
export const PULSE_CLASS = `${CR_PREFIX}-pulse`

// ─── IndexedDB ────────────────────────────────────────────────────────────────

export const IDB_NAME = 'co-reader-cache'
export const IDB_VERSION = 1
export const IDB_STORE_MICRO = 'micro_summaries'
export const IDB_STORE_DEEP = 'deep_dives'
export const IDB_STORE_DOC = 'document_analyses'

// ─── Default Blocked Domains ──────────────────────────────────────────────────

export const DEFAULT_BLOCKED_PATTERNS = [
  /mail\.google\.com/,
  /outlook\.(live|office)\.com/,
  /app\.slack\.com/,
  /web\.whatsapp\.com/,
  /messenger\.com/,
  /^.*\.bank$/,
]
