import { TOOLTIP_CLASS, ROLE_COLORS, ROLE_LABELS, RELATIONSHIP_ARROWS, RELATIONSHIP_LABELS } from '@/utils/constants'
import type { MicroSummaryResponse, CrossReference } from '@/utils/types'
import { getElementById } from './paragraph-detector'
import { pulseElement } from './highlight-injector'

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
  tooltip.innerHTML = `<div class="cr-tooltip-skeleton"></div>`
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

  const roleColor = ROLE_COLORS[result.role] ?? '#757575'
  const roleLabel = ROLE_LABELS[result.role] ?? result.role

  const crossRefHtml = crossRefs.slice(0, 3).map(ref => {
    const arrow = RELATIONSHIP_ARROWS[ref.relationship] ?? '→'
    const label = RELATIONSHIP_LABELS[ref.relationship] ?? ref.relationship
    return `<button class="cr-xref-chip" data-target-id="${ref.targetParagraphId}" title="${ref.description}">
      <span class="cr-xref-arrow">${arrow}</span>
      <span class="cr-xref-label">${label}</span>
    </button>`
  }).join('')

  tooltip.innerHTML = `
    <div class="cr-tooltip-header">
      <span class="cr-role-badge" style="background:${roleColor}20;color:${roleColor};border-color:${roleColor}40">${roleLabel}</span>
    </div>
    <div class="cr-tooltip-divider"></div>
    <p class="cr-tooltip-summary">${escapeHtml(result.summary)}</p>
    ${crossRefHtml || crossRefs.length === 0 ? '' : '<div class="cr-tooltip-divider"></div>'}
    ${crossRefHtml ? `<div class="cr-xref-chips">${crossRefHtml}</div>` : ''}
    <div class="cr-tooltip-divider"></div>
    <button class="cr-deep-dive-btn" data-para-id="${paragraphId}">Deep dive →</button>
  `

  // Wire up cross-reference chip clicks
  tooltip.querySelectorAll<HTMLButtonElement>('.cr-xref-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const targetId = btn.dataset.targetId
      if (!targetId) return
      const targetEl = getElementById(targetId)
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        pulseElement(targetEl)
        hideTooltip()
      }
    })
  })

  // Wire up deep dive button
  const deepDiveBtn = tooltip.querySelector<HTMLButtonElement>('.cr-deep-dive-btn')
  deepDiveBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    const id = deepDiveBtn.dataset.paraId
    if (id) onDeepDiveRequest?.(id)
    hideTooltip()
  })

  tooltip.classList.add('cr-tooltip--visible')
  positionTooltip(tooltip, anchorEl)
}

export function showTooltipError(anchorEl: Element, message: string): void {
  const tooltip = ensureTooltip()
  tooltip.innerHTML = `<p class="cr-tooltip-error">${escapeHtml(message)}</p>`
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

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
