import { makeParagraphId, getElementKey, extractText, countWords } from '@/utils/text-utils'
import { PARA_ATTR } from '@/utils/constants'
import type { ParagraphMeta } from '@/utils/types'
import { getAdapterForHostname } from './site-adapters'

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Map from paragraph ID → metadata */
export const paragraphRegistry = new Map<string, ParagraphMeta>()

/** Map from element → paragraph ID (weak, so GC can collect detached elements) */
const elementToId = new WeakMap<Element, string>()

/** Map from element → its index in paragraphOrder */
let elementToIndex = new WeakMap<Element, number>()

/** Map from paragraph ID → cached text */
const paragraphTextCache = new Map<string, string>()

/** Ordered list of paragraph elements (in document order) */
export let paragraphOrder: Element[] = []

// ─── Build Registry ──────────────────────────────────────────────────────────

export function buildParagraphRegistry(): void {
  paragraphRegistry.clear()
  paragraphTextCache.clear()
  elementToIndex = new WeakMap<Element, number>()
  paragraphOrder = []

  const adapter = getAdapterForHostname(window.location.hostname)

  // Find content container
  const container = document.querySelector(adapter.containerSelector)
    ?? document.querySelector('article, main, [role="main"]')
    ?? document.body

  // Collect exclusion elements
  const excluded = new Set<Element>()
  if (adapter.exclusionSelectors.length > 0) {
    const combinedExclusions = adapter.exclusionSelectors.join(', ')
    container.querySelectorAll(combinedExclusions).forEach(el => {
      // Mark this element and all descendants as excluded
      el.querySelectorAll('*').forEach(d => excluded.add(d))
      excluded.add(el)
    })
  }

  // Also exclude structural navigation elements globally
  const globalExclusions = [
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
    'script', 'style', 'noscript',
  ]
  if (globalExclusions.length > 0) {
    const combinedGlobalExclusions = globalExclusions.join(', ')
    document.querySelectorAll(combinedGlobalExclusions).forEach(el => {
      el.querySelectorAll('*').forEach(d => excluded.add(d))
      excluded.add(el)
    })
  }

  // Collect candidate paragraph elements
  const candidates = container.querySelectorAll(adapter.paragraphSelector)
  let sectionIndex = 0
  let paragraphIndex = 0
  let currentSectionTitle = document.title

  for (const el of Array.from(candidates)) {
    if (excluded.has(el)) continue

    // Update section context when we encounter headings
    const tag = el.tagName.toLowerCase()
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      currentSectionTitle = el.textContent?.trim() ?? currentSectionTitle
      sectionIndex++
      paragraphIndex = 0
      continue
    }

    const text = extractText(el)
    const wordCount = countWords(text)

    if (wordCount < adapter.minWordCount) continue

    // Check element is visible
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue

    // Generate stable ID
    const key = getElementKey(el)
    const id = makeParagraphId(key, text)

    // Skip duplicates (same text in multiple DOM locations)
    if (paragraphRegistry.has(id)) continue

    const meta: ParagraphMeta = {
      id,
      sectionTitle: currentSectionTitle,
      sectionIndex,
      paragraphIndex,
      wordCount,
    }

    paragraphRegistry.set(id, meta)
    paragraphTextCache.set(id, text)
    elementToId.set(el, id)
    el.setAttribute(PARA_ATTR, id)

    elementToIndex.set(el, paragraphOrder.length)
    paragraphOrder.push(el)
    paragraphIndex++
  }
}

// ─── Hover Target Resolution ─────────────────────────────────────────────────

/**
 * Given an element (the mouseover event target), walk up the DOM until we
 * find a registered paragraph element.
 */
export function resolveHoverTarget(element: Element): Element | null {
  let current: Element | null = element

  while (current && current !== document.body) {
    if (elementToId.has(current)) return current

    // If we reach a landmark, stop climbing
    const tag = current.tagName.toLowerCase()
    const role = current.getAttribute('role')
    if (
      tag === 'article' || tag === 'main' || tag === 'section' ||
      role === 'main' || role === 'article' || role === 'document'
    ) {
      // Still try this element itself
      if (elementToId.has(current)) return current
      return null
    }

    current = current.parentElement
  }
  return null
}

/**
 * Get the paragraph ID for an element.
 */
export function getParagraphId(element: Element): string | undefined {
  return elementToId.get(element) ?? element.getAttribute(PARA_ATTR) ?? undefined
}

/**
 * Get the cached text for a paragraph element.
 */
export function getParagraphText(element: Element): string {
  const id = getParagraphId(element)
  if (id) {
    const cached = paragraphTextCache.get(id)
    if (cached !== undefined) return cached
  }
  return extractText(element)
}

/**
 * Get surrounding paragraph text for context window.
 */
export function getSurroundingText(
  element: Element,
  before: number,
  after: number
): { preceding: string; following: string } {
  const idx = elementToIndex.get(element) ?? paragraphOrder.indexOf(element)
  if (idx === -1) return { preceding: '', following: '' }

  const preceding = paragraphOrder
    .slice(Math.max(0, idx - before), idx)
    .map(el => getParagraphText(el))
    .join('\n\n')

  const following = paragraphOrder
    .slice(idx + 1, idx + 1 + after)
    .map(el => getParagraphText(el))
    .join('\n\n')

  return { preceding, following }
}

/**
 * Get all paragraphs in the same section as the given element.
 */
export function getSectionParagraphs(element: Element): Array<{ id: string; text: string }> {
  const id = getParagraphId(element)
  if (!id) return []
  const meta = paragraphRegistry.get(id)
  if (!meta) return []

  return paragraphOrder
    .filter(el => {
      const elId = getParagraphId(el)
      if (!elId) return false
      const elMeta = paragraphRegistry.get(elId)
      return elMeta?.sectionIndex === meta.sectionIndex
    })
    .map(el => ({
      id: getParagraphId(el)!,
      text: getParagraphText(el),
    }))
}

/**
 * Get the document section map (list of unique sections in order).
 */
export function getSectionMap(): Array<{ title: string; paragraphCount: number }> {
  const sections = new Map<string, number>()
  for (const meta of paragraphRegistry.values()) {
    const key = `${meta.sectionIndex}:${meta.sectionTitle}`
    sections.set(key, (sections.get(key) ?? 0) + 1)
  }
  return Array.from(sections.entries()).map(([key, count]) => ({
    title: key.split(':').slice(1).join(':'),
    paragraphCount: count,
  }))
}

/**
 * Get all paragraphs as a flat list for document analysis.
 */
export function getAllParagraphsForAnalysis(): Array<{ id: string; section: string; text: string }> {
  return paragraphOrder.map(el => {
    const id = getParagraphId(el) ?? ''
    const meta = paragraphRegistry.get(id)
    return {
      id,
      section: meta?.sectionTitle ?? '',
      text: getParagraphText(el),
    }
  })
}

/**
 * Find an element by its paragraph ID.
 */
export function getElementById(paragraphId: string): Element | null {
  return document.querySelector(`[${PARA_ATTR}="${paragraphId}"]`)
}
