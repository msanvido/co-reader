import { HIGHLIGHT_CLASS, MARGIN_DOT_CLASS, PARA_ATTR } from '@/utils/constants'
import type { HighlightSpan, HighlightCategory } from '@/utils/types'

// ─── Track injected nodes for rollback ───────────────────────────────────────

interface InjectedMark {
  mark: HTMLElement
  originalText: string
  before: Text
  after: Text
  parent: Node
}

const injectedMarks = new Map<Element, InjectedMark[]>()

// ─── Inject highlights into a paragraph element ──────────────────────────────

export function injectHighlights(element: Element, highlights: HighlightSpan[]): void {
  // Remove existing highlights on this element first
  clearHighlights(element)

  const marks: InjectedMark[] = []

  for (const highlight of highlights) {
    if (!highlight.text || highlight.text.trim().length === 0) continue
    const mark = injectSingleHighlight(element, highlight.text, highlight.category, highlight.explanation)
    if (mark) marks.push(mark)
  }

  if (marks.length > 0) {
    injectedMarks.set(element, marks)
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
): InjectedMark | null {
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

      const beforeNode = document.createTextNode(beforeText)
      const afterNode = document.createTextNode(afterText)

      const parent = node.parentNode!
      parent.insertBefore(beforeNode, node)
      parent.insertBefore(mark, node)
      parent.insertBefore(afterNode, node)
      parent.removeChild(node)

      return { mark, originalText: text, before: beforeNode, after: afterNode, parent }
    }
    node = walker.nextNode() as Text | null
  }
  return null
}

// ─── Clear highlights ─────────────────────────────────────────────────────────

export function clearHighlights(element: Element): void {
  const marks = injectedMarks.get(element)
  if (!marks) return

  // Merge split text nodes back and remove mark elements
  for (const { mark, before, after, parent } of marks) {
    const merged = document.createTextNode(
      (before.textContent ?? '') + (mark.textContent ?? '') + (after.textContent ?? '')
    )
    parent.insertBefore(merged, before)
    if (parent.contains(before)) parent.removeChild(before)
    if (parent.contains(mark)) parent.removeChild(mark)
    if (parent.contains(after)) parent.removeChild(after)
  }

  injectedMarks.delete(element)

  // Remove margin dot
  const dot = document.querySelector(
    `.${MARGIN_DOT_CLASS}[data-para-id="${element.getAttribute(PARA_ATTR)}"]`
  )
  dot?.remove()
}

export function clearAllHighlights(): void {
  for (const element of injectedMarks.keys()) {
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
