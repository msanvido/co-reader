import { TOOLTIP_CLASS, ROLE_COLORS, ROLE_LABELS, RELATIONSHIP_ARROWS, RELATIONSHIP_LABELS } from '@/utils/constants'
import type { MicroSummaryResponse, CrossReference } from '@/utils/types'
import { getElementById } from './paragraph-detector'
import { pulseElement } from './highlight-injector'
import { escapeHtml } from '@/utils/text-utils'

// ─── Tooltip element ──────────────────────────────────────────────────────────

let tooltipEl: HTMLElement | null = null
let onDeepDiveRequest: ((paragraphId: string) => void) | null = null

export function setDeepDiveHandler(handler: (paragraphId: string) => void): void {
  onDeepDiveRequest = handler
}

function ensureTooltip(): HTMLElement {
  if (tooltipEl) return tooltipEl

  tooltipEl = document.createElement('div')
  tooltipEl.className = TOOLTIP_CLASS
  tooltipEl.setAttribute('role', 'tooltip')
  tooltipEl.setAttribute('aria-live', 'polite')
  document.body.appendChild(tooltipEl)

  // Hide on click outside
  document.addEventListener('click', (e) => {
    if (tooltipEl && !tooltipEl.contains(e.target as Node)) {
      hideTooltip()
    }
  })

  return tooltipEl
}

// ─── Show / Hide ──────────────────────────────────────────────────────────────

export function showTooltipLoading(anchorEl: Element): void {
  const tooltip = ensureTooltip()
  tooltip.textContent = ''

  const skeleton = document.createElement('div')
  skeleton.className = 'cr-tooltip-skeleton'
  tooltip.appendChild(skeleton)

  tooltip.classList.add('cr-tooltip--visible')
  positionTooltip(tooltip, anchorEl)
}

export function showTooltipResult(
  anchorEl: Element,
  paragraphId: string,
  result: MicroSummaryResponse,
  crossRefs: CrossReference[] = []
): void {
  const tooltip = ensureTooltip()
  tooltip.textContent = '' // Clear existing content

  const roleColor = ROLE_COLORS[result.role] ?? '#757575'
  const roleLabel = ROLE_LABELS[result.role] ?? result.role

  // 1. Header with Role Badge
  const header = document.createElement('div')
  header.className = 'cr-tooltip-header'
  const badge = document.createElement('span')
  badge.className = 'cr-role-badge'
  badge.style.background = `${roleColor}20`
  badge.style.color = roleColor
  badge.style.borderColor = `${roleColor}40`
  badge.textContent = roleLabel
  header.appendChild(badge)
  tooltip.appendChild(header)

  // 2. Divider
  const div1 = document.createElement('div')
  div1.className = 'cr-tooltip-divider'
  tooltip.appendChild(div1)

  // 3. Summary
  const summaryPara = document.createElement('p')
  summaryPara.className = 'cr-tooltip-summary'
  // Using textContent completely mitigates XSS risk for the summary.
  summaryPara.textContent = result.summary
  tooltip.appendChild(summaryPara)

  // 4. Cross-References
  const xrefsToRender = crossRefs.slice(0, 3)
  if (xrefsToRender.length > 0) {
    const div2 = document.createElement('div')
    div2.className = 'cr-tooltip-divider'
    tooltip.appendChild(div2)

    const chipsContainer = document.createElement('div')
    chipsContainer.className = 'cr-xref-chips'

    for (const ref of xrefsToRender) {
      const arrow = RELATIONSHIP_ARROWS[ref.relationship] ?? '→'
      const label = RELATIONSHIP_LABELS[ref.relationship] ?? ref.relationship

      const btn = document.createElement('button')
      btn.className = 'cr-xref-chip'
      btn.dataset.targetId = ref.targetParagraphId
      btn.title = ref.description

      const arrowSpan = document.createElement('span')
      arrowSpan.className = 'cr-xref-arrow'
      arrowSpan.textContent = arrow

      const labelSpan = document.createElement('span')
      labelSpan.className = 'cr-xref-label'
      labelSpan.textContent = label

      btn.appendChild(arrowSpan)
      btn.appendChild(labelSpan)

      // Direct event listener attachment
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const targetId = ref.targetParagraphId
        if (!targetId) return
        const targetEl = getElementById(targetId)
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
          pulseElement(targetEl)
          hideTooltip()
        }
      })

      chipsContainer.appendChild(btn)
    }
    tooltip.appendChild(chipsContainer)
  }

  // 5. Deep Dive Button
  const div3 = document.createElement('div')
  div3.className = 'cr-tooltip-divider'
  tooltip.appendChild(div3)

  const deepDiveBtn = document.createElement('button')
  deepDiveBtn.className = 'cr-deep-dive-btn'
  deepDiveBtn.dataset.paraId = paragraphId
  deepDiveBtn.textContent = 'Deep dive →'
  deepDiveBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (paragraphId) onDeepDiveRequest?.(paragraphId)
    hideTooltip()
  })
  tooltip.appendChild(deepDiveBtn)

  tooltip.classList.add('cr-tooltip--visible')
  positionTooltip(tooltip, anchorEl)
}

export function showTooltipError(anchorEl: Element, message: string): void {
  const tooltip = ensureTooltip()
  tooltip.textContent = ''

  const errorPara = document.createElement('p')
  errorPara.className = 'cr-tooltip-error'
  errorPara.textContent = message
  tooltip.appendChild(errorPara)

  tooltip.classList.add('cr-tooltip--visible')
  positionTooltip(tooltip, anchorEl)
}

export function hideTooltip(): void {
  if (!tooltipEl) return
  tooltipEl.classList.remove('cr-tooltip--visible')
}

// ─── Positioning ──────────────────────────────────────────────────────────────

function positionTooltip(tooltip: HTMLElement, anchor: Element): void {
  const rect = anchor.getBoundingClientRect()
  const scrollY = window.scrollY
  const scrollX = window.scrollX

  let top = rect.bottom + scrollY + 8
  let left = rect.left + scrollX

  // Ensure tooltip stays within viewport horizontally
  const tooltipWidth = Math.min(420, window.innerWidth - 32)
  tooltip.style.maxWidth = `${tooltipWidth}px`
  if (left + tooltipWidth > window.innerWidth + scrollX - 16) {
    left = window.innerWidth + scrollX - tooltipWidth - 16
  }

  tooltip.style.top = `${top}px`
  tooltip.style.left = `${left}px`
}

