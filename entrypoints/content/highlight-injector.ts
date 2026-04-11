import { HIGHLIGHT_CLASS, MARGIN_DOT_CLASS, PARA_ATTR } from '@/utils/constants'
import type { HighlightSpan, HighlightCategory } from '@/utils/types'

// ─── Track which elements have highlights ───────────────────────────────────

const highlightedElements = new Set<Element>()

// ─── Inject highlights into a paragraph element ──────────────────────────────

export function injectHighlights(element: Element, highlights: HighlightSpan[]): void {
  // Remove existing highlights on this element first
  clearHighlights(element)

  let injected = 0
  for (const highlight of highlights) {
    if (!highlight.text || highlight.text.trim().length === 0) continue
    if (injectSingleHighlight(element, highlight.text, highlight.category, highlight.explanation)) injected++
  }

  if (injected > 0) {
    highlightedElements.add(element)
    addMarginDot(element, highlights[0]?.category ?? 'KEY_CLAIM')
  }
}

/**
 * Inject a single highlight span using TreeWalker to locate the exact text node.
 * This avoids innerHTML manipulation and preserves all existing event listeners.
 */
function injectSingleHighlight(
  element: Element,
  text: string,
  category: HighlightCategory,
  explanation: string
): boolean {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)

  let node = walker.nextNode() as Text | null
  while (node) {
    const content = node.textContent ?? ''
    const idx = content.indexOf(text)
    if (idx !== -1) {
      const beforeText = content.slice(0, idx)
      const afterText = content.slice(idx + text.length)

      const mark = document.createElement('mark')
      mark.className = `${HIGHLIGHT_CLASS} ${HIGHLIGHT_CLASS}-${category.toLowerCase().replace('_', '-')}`
      mark.dataset.crCategory = category
      mark.dataset.crExplanation = explanation
      mark.textContent = text

      const parent = node.parentNode!
      parent.insertBefore(document.createTextNode(beforeText), node)
      parent.insertBefore(mark, node)
      parent.insertBefore(document.createTextNode(afterText), node)
      parent.removeChild(node)

      return true
    }
    node = walker.nextNode() as Text | null
  }
  return false
}

// ─── Clear highlights ─────────────────────────────────────────────────────────

export function clearHighlights(element: Element): void {
  if (!highlightedElements.has(element)) return

  // Unwrap every <mark> back to plain text
  const marks = element.querySelectorAll(`.${HIGHLIGHT_CLASS}`)
  for (const mark of marks) {
    const text = document.createTextNode(mark.textContent ?? '')
    mark.parentNode?.replaceChild(text, mark)
  }

  // Merge adjacent text nodes back together (restores original DOM)
  element.normalize()

  highlightedElements.delete(element)

  // Remove margin dot
  const dot = document.querySelector(
    `.${MARGIN_DOT_CLASS}[data-para-id="${element.getAttribute(PARA_ATTR)}"]`
  )
  dot?.remove()
}

export function clearAllHighlights(): void {
  for (const element of [...highlightedElements]) {
    clearHighlights(element)
  }
}

// ─── Margin dot ───────────────────────────────────────────────────────────────

function addMarginDot(element: Element, category: HighlightCategory): void {
  const paraId = element.getAttribute(PARA_ATTR)
  if (!paraId) return

  // Ensure the element is positioned so we can place the dot
  const style = window.getComputedStyle(element)
  if (style.position === 'static') {
    (element as HTMLElement).style.position = 'relative'
  }

  const dot = document.createElement('span')
  dot.className = MARGIN_DOT_CLASS
  dot.dataset.paraId = paraId
  dot.dataset.category = category
  dot.setAttribute('aria-hidden', 'true')

  element.insertBefore(dot, element.firstChild)
}

// ─── Pulse animation for cross-reference navigation ──────────────────────────

export function pulseElement(element: Element): void {
  element.classList.add('cr-pulse')
  setTimeout(() => element.classList.remove('cr-pulse'), 2000)
}
