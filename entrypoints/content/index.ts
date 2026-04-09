import { sendCheckDomainBlocked, sendGetSettings } from '@/utils/message-bus'
import { extractText } from '@/utils/text-utils'
import { isSensitiveDomain } from '@/utils/sensitive-detector'
import { buildParagraphRegistry, paragraphRegistry, paragraphOrder, getParagraphId, getElementById } from './paragraph-detector'
import {
  startAnalysis, stopAnalysis, getAnalysisStatus,
  isPipelineComplete, paragraphSummaries, paragraphDeepDives, sectionSummaryMap,
} from './document-analyzer'
import { getCrossRefGraph } from './cross-ref-navigator'
import { pulseElement, injectHighlights, clearAllHighlights } from './highlight-injector'
import '@/assets/styles/highlights.css'

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',

  main() {
    console.log('[co-reader] Content script on', window.location.hostname)

    if (isSensitiveDomain(window.location.hostname)) return

    // Register paragraphs immediately so side panel can see them
    buildParagraphRegistry()
    console.log('[co-reader] Found', paragraphRegistry.size, 'paragraphs')

    // Re-build on DOM changes
    const observer = new MutationObserver(debounce(() => buildParagraphRegistry(), 1000))
    observer.observe(document.body, { childList: true, subtree: true })

    // Click a paragraph on the page → tell the side panel to select it
    document.addEventListener('click', (e) => {
      let el: Element | null = e.target as Element
      while (el && el !== document.body) {
        const id = getParagraphId(el)
        if (id) {
          chrome.runtime.sendMessage({ type: 'PARA_CLICKED', paragraphId: id }).catch(() => {})
          return
        }
        el = el.parentElement
      }
    })

    // ── Messages from side panel ──────────────────────────────────────────

    chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {

      if (msg?.type === 'GET_STATUS') {
        const status = getAnalysisStatus()
        status.paragraphsFound = paragraphRegistry.size
        sendResponse(status)
        return true
      }

      if (msg?.type === 'START_ANALYSIS') {
        startAnalysis().then(() => {
          chrome.runtime.sendMessage({ type: 'ANALYSIS_DONE' }).catch(() => {})
        })
        sendResponse({ ok: true })
        return true
      }

      if (msg?.type === 'STOP_ANALYSIS') {
        stopAnalysis()
        sendResponse({ ok: true })
        return true
      }

      if (msg?.type === 'GET_ANALYSIS') {
        if (!isPipelineComplete() && paragraphSummaries.size === 0) {
          sendResponse({ data: null })
          return true
        }

        // Build section-grouped structure
        const sectionMap = new Map<number, {
          title: string
          summary: string
          paragraphs: any[]
        }>()

        for (const el of paragraphOrder) {
          const id = getParagraphId(el) ?? ''
          const summary = paragraphSummaries.get(id)
          if (!summary?.summary) continue

          const meta = paragraphRegistry.get(id)
          const deepDive = paragraphDeepDives.get(id)
          const sectionIdx = meta?.sectionIndex ?? 0
          const sectionTitle = meta?.sectionTitle ?? ''

          if (!sectionMap.has(sectionIdx)) {
            sectionMap.set(sectionIdx, { title: sectionTitle, summary: '', paragraphs: [] })
          }

          sectionMap.get(sectionIdx)!.paragraphs.push({
            id,
            role: summary.role ?? meta?.role ?? 'UNKNOWN',
            summary: summary.summary,
            originalText: extractText(el),
            highlights: deepDive?.highlights ?? [],
            crossReferences: deepDive?.crossReferences ?? [],
          })
        }

        const graph = getCrossRefGraph()

        // Attach section summaries from the LLM analysis
        const sections = Array.from(sectionMap.values()).map((sec) => ({
          ...sec,
          summary: sectionSummaryMap.get(sec.title) ?? sec.summary,
        }))

        // Flat list for backward compat (cross-ref lookups)
        const allParagraphs = sections.flatMap(s => s.paragraphs)

        sendResponse({
          data: {
            thesis: graph?.thesis ?? '',
            keyTerms: graph?.keyTerms ?? [],
            sections,
            allParagraphs,
          }
        })
        return true
      }

      if (msg?.type === 'SCROLL_TO' && msg.paragraphId) {
        const el = getElementById(msg.paragraphId)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          pulseElement(el)
        }
        sendResponse({ ok: true })
        return true
      }

      // Click paragraph in panel → scroll + highlight key phrases in article
      if (msg?.type === 'SELECT_PARA' && msg.paragraphId) {
        clearAllHighlights()
        const el = getElementById(msg.paragraphId)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          pulseElement(el)
          if (Array.isArray(msg.highlights) && msg.highlights.length > 0) {
            injectHighlights(el, msg.highlights)
          }
        }
        sendResponse({ ok: true })
        return true
      }

      // Which paragraph is currently most visible in the viewport?
      if (msg?.type === 'GET_VISIBLE_PARA') {
        let bestId = ''
        let bestVisibility = 0
        for (const el of paragraphOrder) {
          const rect = el.getBoundingClientRect()
          const vh = window.innerHeight
          const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0))
          const ratio = visible / Math.max(1, rect.height)
          if (ratio > bestVisibility) { bestVisibility = ratio; bestId = getParagraphId(el) ?? '' }
        }
        sendResponse({ id: bestId })
        return true
      }

      return false
    })

    function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
      let timer: ReturnType<typeof setTimeout>
      return ((...args: any[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }) as T
    }
  },
})
