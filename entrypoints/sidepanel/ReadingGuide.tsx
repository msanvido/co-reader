import type { MutableRef } from 'preact/hooks'
import {
  RELATIONSHIP_COLORS,
  RELATIONSHIP_LABELS,
  ROLE_COLORS,
} from '@/utils/constants'
import type { AnalysisData } from './types'

interface ReadingGuideProps {
  data: AnalysisData
  activeParaId: string | null
  selectParagraph: (paraId: string) => void
  paraRefs: MutableRef<Record<string, HTMLDivElement | null>>
}

export function ReadingGuide({ data, activeParaId, selectParagraph, paraRefs }: ReadingGuideProps) {
  return (
    <div class="reading-guide">
      {data.thesis && (
        <div class="guide-thesis">{data.thesis}</div>
      )}

      {data.sections.map((section, si) => {
        const hasTitle = section.title && section.title !== document.title

        return (
          <div key={si} class="guide-section">
            {/* Section header */}
            {hasTitle && (
              <div class="section-header">
                <div class="section-title-row">
                  <div class="section-title">{section.title}</div>
                  <span class="section-count">{section.paragraphs.length}</span>
                </div>
                {section.summary && (
                  <div class="section-summary">{section.summary}</div>
                )}
                <div class="section-divider" />
              </div>
            )}

            {/* Paragraphs in this section */}
            {section.paragraphs.map((para, pi) => {
              const roleColor = ROLE_COLORS[para.role as keyof typeof ROLE_COLORS] ?? '#757575'
              let paraCounter = 0
              for (let k = 0; k < si; k++) paraCounter += data.sections[k].paragraphs.length
              const globalIdx = paraCounter + pi + 1
              return (
                <div
                  key={para.id}
                  ref={(el) => { paraRefs.current[para.id] = el }}
                  class={`guide-card${activeParaId === para.id ? ' guide-card--active' : ''}`}
                >
                  <div class="guide-row" onClick={() => selectParagraph(para.id)} style={`--bar-color:${roleColor}`}>
                    <div class="guide-color-bar" title={para.role} />
                    <span class="guide-num">{globalIdx}</span>
                    <span class="guide-summary">
                      {typeof para.summary === 'string' && (para.summary.includes('\n- ') || para.summary.startsWith('- '))
                        ? <ul class="bullet-summary">{para.summary.split('\n').filter(l => l.trim()).map((line, li) =>
                            <li key={li}>{line.replace(/^-\s*/, '')}</li>
                          )}</ul>
                        : String(para.summary ?? '')
                      }
                    </span>
                  </div>

                  {para.crossReferences.length > 0 && activeParaId === para.id && (
                    <div class="guide-tags">
                      {para.crossReferences.map((ref, j) => {
                        const idx = data.allParagraphs.findIndex(p => p.id === ref.targetParagraphId) + 1
                        const color = RELATIONSHIP_COLORS[ref.relationship] ?? '#9E9E9E'
                        return (
                          <button
                            key={`x${j}`}
                            class="tag tag--xref"
                            style={`background:${color}1F;color:${color};border-color:${color}4D`}
                            title={ref.description}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (idx > 0) selectParagraph(ref.targetParagraphId)
                            }}
                          >
                            <span>{RELATIONSHIP_LABELS[ref.relationship]}</span>
                            <span style="opacity:0.8">¶{idx > 0 ? idx : '?'}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
