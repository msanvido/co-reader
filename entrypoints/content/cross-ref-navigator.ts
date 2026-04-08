import { RELATIONSHIP_COLORS } from '@/utils/constants'
import type { CrossReferenceGraph, CrossRefRelationship } from '@/utils/types'
import { getElementById } from './paragraph-detector'
import { pulseElement } from './highlight-injector'

// ─── State ────────────────────────────────────────────────────────────────────

let graph: CrossReferenceGraph | null = null
let activeParagraphId: string | null = null
let activeVisualizations: HTMLElement[] = []
let crossRefIndex = 0

// ─── Graph management ─────────────────────────────────────────────────────────

export function setCrossRefGraph(g: CrossReferenceGraph): void {
  graph = g
}

export function getCrossRefGraph(): CrossReferenceGraph | null {
  return graph
}

// ─── Get cross references for a paragraph ────────────────────────────────────

export function getCrossRefsForParagraph(
  paragraphId: string
): Array<{ targetId: string; relationship: CrossRefRelationship; description: string }> {
  if (!graph) return []
  return graph.edges
    .filter(e => e.sourceId === paragraphId)
    .map(e => ({ targetId: e.targetId, relationship: e.relationship, description: e.description }))
}

// ─── Visual cross-reference indicators ───────────────────────────────────────

/**
 * Highlight all paragraphs cross-referenced from the given paragraph
 * by adding a colored left border to them.
 */
export function showCrossRefVisuals(paragraphId: string): void {
  clearCrossRefVisuals()
  activeParagraphId = paragraphId
  crossRefIndex = 0

  const refs = getCrossRefsForParagraph(paragraphId)
  for (const ref of refs) {
    const el = getElementById(ref.targetId)
    if (!el) continue

    const color = RELATIONSHIP_COLORS[ref.relationship] ?? '#9E9E9E'
    const indicator = document.createElement('div')
    indicator.className = 'cr-xref-indicator'
    indicator.style.borderLeftColor = color
    indicator.title = `${ref.relationship}: ${ref.description}`;

    (el as HTMLElement).style.position = 'relative'
    el.insertBefore(indicator, el.firstChild)
    activeVisualizations.push(indicator)
  }
}

export function clearCrossRefVisuals(): void {
  for (const el of activeVisualizations) {
    el.remove()
  }
  activeVisualizations = []
  activeParagraphId = null
}

// ─── Keyboard navigation through cross-references ────────────────────────────

export function navigateToNextCrossRef(): void {
  if (!activeParagraphId) return
  const refs = getCrossRefsForParagraph(activeParagraphId)
  if (refs.length === 0) return

  crossRefIndex = crossRefIndex % refs.length
  const ref = refs[crossRefIndex]
  crossRefIndex++

  const el = getElementById(ref.targetId)
  if (!el) return

  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  pulseElement(el)
}
