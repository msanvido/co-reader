import type { CrossReference } from '@/utils/types'

export interface ParagraphData {
  id: string; role: string; summary: string; originalText: string
  highlights: Array<{ text: string; category: string; explanation: string }>
  crossReferences: CrossReference[]
}

export interface SectionData {
  title: string
  summary: string
  paragraphs: ParagraphData[]
}

export interface AnalysisData {
  thesis: string; keyTerms: string[]
  sections: SectionData[]
  allParagraphs: ParagraphData[]
}

export type AnalysisState = 'idle' | 'running' | 'done' | 'error'

export interface Status {
  state: AnalysisState; message: string
  paragraphsFound: number; paragraphsAnalyzed: number
}
