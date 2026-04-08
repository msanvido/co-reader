import { HOVER_DEBOUNCE_MS, CONTEXT_PARAGRAPHS_BEFORE, CONTEXT_PARAGRAPHS_AFTER } from '@/utils/constants'
import { sendGetMicroSummary, sendGetDeepDive, sendOpenSidePanel } from '@/utils/message-bus'
import { extractText } from '@/utils/text-utils'
import { containsSensitiveContent } from '@/utils/sensitive-detector'
import type { MicroSummaryResponse, DeepDiveRequest, DeepDiveResponse } from '@/utils/types'
import {
  resolveHoverTarget,
  getParagraphId,
  getSurroundingText,
  getSectionParagraphs,
  getSectionMap,
  paragraphRegistry,
} from './paragraph-detector'
import {
  showTooltipLoading,
  showTooltipResult,
  showTooltipError,
  hideTooltip,
  setDeepDiveHandler,
} from './tooltip'
import {
  getCrossRefsForParagraph,
  showCrossRefVisuals,
  clearCrossRefVisuals,
  navigateToNextCrossRef,
} from './cross-ref-navigator'
import { clearAllHighlights, injectHighlights } from './highlight-injector'
import { getCachedSummary, getCachedDeepDive } from './document-analyzer'

// ─── State ────────────────────────────────────────────────────────────────────

let hoverTimer: ReturnType<typeof setTimeout> | null = null
let currentTarget: Element | null = null
let enabled = true

// ─── Initialization ───────────────────────────────────────────────────────────

export function initHoverManager(): void {
  setDeepDiveHandler(handleDeepDive)

  document.addEventListener('mouseover', onMouseOver, { passive: true })
  document.addEventListener('mouseout', onMouseOut, { passive: true })
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('scroll', () => {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
  }, { passive: true })
}

export function setEnabled(val: boolean): void {
  enabled = val
  if (!val) {
    hideTooltip()
    clearCrossRefVisuals()
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
  }
}

// ─── Mouse events ─────────────────────────────────────────────────────────────

function onMouseOver(e: MouseEvent): void {
  if (!enabled) return

  const target = e.target as Element
  const para = resolveHoverTarget(target)
  if (!para || para === currentTarget) return

  currentTarget = para

  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => triggerSummary(para), HOVER_DEBOUNCE_MS)
}

function onMouseOut(e: MouseEvent): void {
  const related = e.relatedTarget as Element | null
  if (related && currentTarget?.contains(related)) return

  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }

  // Don't hide tooltip immediately — user may move cursor to tooltip
  const tooltip = document.querySelector('.cr-tooltip')
  if (tooltip && tooltip.contains(related)) return

  currentTarget = null
}

function onKeyDown(e: KeyboardEvent): void {
  // Use e.code (physical key) instead of e.key so Mac Option+key works.
  // On Mac, e.key for Option+D is '∂', Option+N is 'ñ', Option+H is '˙' — unreliable.
  if (e.key === 'Escape') { hideTooltip(); return }

  if (e.altKey && e.code === 'KeyN') {
    e.preventDefault()
    navigateToNextCrossRef()
  }

  if (e.altKey && e.code === 'KeyD') {
    e.preventDefault()
    if (currentTarget) {
      const id = getParagraphId(currentTarget)
      if (id) handleDeepDive(id)
    }
  }

  if (e.altKey && e.code === 'KeyH') {
    e.preventDefault()
    clearAllHighlights()
  }
}

// ─── Summary trigger ──────────────────────────────────────────────────────────

async function triggerSummary(element: Element): Promise<void> {
  const paragraphId = getParagraphId(element)
  if (!paragraphId) return

  const text = extractText(element)
  if (containsSensitiveContent(text)) {
    showTooltipError(element, 'Sensitive content detected — analysis skipped.')
    return
  }

  // Check for pre-computed summary first (instant, no API call)
  const cached = getCachedSummary(paragraphId)
  if (cached) {
    const crossRefs = getCrossRefsForParagraph(paragraphId).map(r => ({
      targetParagraphId: r.targetId,
      relationship: r.relationship,
      description: r.description,
    }))
    showTooltipResult(element, paragraphId, cached, crossRefs)
    showCrossRefVisuals(paragraphId)
    return
  }

  // Not yet processed — call API on demand
  const meta = paragraphRegistry.get(paragraphId)
  const { preceding, following } = getSurroundingText(
    element,
    CONTEXT_PARAGRAPHS_BEFORE,
    CONTEXT_PARAGRAPHS_AFTER
  )

  showTooltipLoading(element)

  try {
    const raw = await sendGetMicroSummary({
      paragraphText: text,
      paragraphId,
      precedingText: preceding,
      followingText: following,
      documentTitle: document.title,
      sectionTitle: meta?.sectionTitle ?? '',
      documentType: 'article',
    })

    const result = raw as { ok?: boolean; data?: MicroSummaryResponse; error?: string } | undefined

    if (!result) {
      showTooltipError(element, 'No response from service worker. Try reloading the page.')
      return
    }

    if (!result.ok || !result.data) {
      showTooltipError(element, result.error ?? 'Analysis failed.')
      return
    }

    const crossRefs = getCrossRefsForParagraph(paragraphId).map(r => ({
      targetParagraphId: r.targetId,
      relationship: r.relationship,
      description: r.description,
    }))

    showTooltipResult(element, paragraphId, result.data, crossRefs)
    showCrossRefVisuals(paragraphId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Extension context invalidated')) {
      showTooltipError(element, 'Extension was reloaded. Please refresh this page.')
      return
    }
    showTooltipError(element, msg || 'Could not connect to analysis service.')
    console.error('[co-reader] Summary error:', err)
  }
}

// ─── Deep dive ────────────────────────────────────────────────────────────────

async function handleDeepDive(paragraphId: string): Promise<void> {
  const element = document.querySelector(`[data-cr-id="${paragraphId}"]`)
  if (!element) return

  // Check for pre-computed deep dive first
  const cachedDD = getCachedDeepDive(paragraphId)
  if (cachedDD) {
    await sendOpenSidePanel({
      ...cachedDD,
      paragraphId,
      paragraphText: extractText(element),
    })
    return
  }

  const text = extractText(element)
  const sectionParagraphs = getSectionParagraphs(element)
  const sectionMap = getSectionMap()
  const meta = paragraphRegistry.get(paragraphId)

  const req: DeepDiveRequest = {
    paragraphText: text,
    paragraphId,
    sectionParagraphs,
    sectionTitle: meta?.sectionTitle ?? '',
    documentTitle: document.title,
    sectionMap,
  }

  try {
    const result = await sendGetDeepDive(req) as { ok?: boolean; data?: DeepDiveResponse; error?: string } | undefined
    if (!result?.ok || !result.data) return

    const deepDive = result.data

    // Apply highlights to the paragraph
    injectHighlights(element, deepDive.highlights)

    // Open side panel with full analysis
    await sendOpenSidePanel({
      ...deepDive,
      paragraphId,
      paragraphText: text,
    })
  } catch (err) {
    console.debug('[co-reader] Deep dive error:', err)
  }
}
