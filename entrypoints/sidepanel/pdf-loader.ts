const MIN_PARA_WORDS = 20

export interface ParsedPdf {
  title: string
  paragraphs: Array<{ section: string; text: string }>
  pageCount: number
}

export async function fetchAndParsePdf(
  url: string,
  onProgress?: (msg: string) => void,
): Promise<ParsedPdf> {
  // Lazy-load pdf.js (~2MB) only when a PDF is actually opened
  const [pdfjsLib, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url').then(m => m.default),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  onProgress?.('Downloading PDF…')
  const task = pdfjsLib.getDocument({ url, withCredentials: false })
  const pdf = await task.promise

  const meta = await pdf.getMetadata().catch(() => null)
  const metaTitle = (meta?.info as any)?.Title as string | undefined
  const title = (metaTitle && metaTitle.trim()) || deriveTitleFromUrl(url)

  const all: Array<{ section: string; text: string }> = []
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress?.(`Parsing page ${p}/${pdf.numPages}…`)
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const paras = extractParagraphsFromPage(tc.items as any[])
    for (const text of paras) {
      if (text.split(/\s+/).length >= MIN_PARA_WORDS) {
        all.push({ section: `Page ${p}`, text })
      }
    }
  }

  return { title, paragraphs: all, pageCount: pdf.numPages }
}

/**
 * Group a page's text items into paragraphs by:
 *  1. Bucketing items into lines via y-position
 *  2. Splitting lines into paragraphs whenever the vertical gap between
 *     consecutive lines exceeds 1.5× the previous line height
 */
function extractParagraphsFromPage(items: any[]): string[] {
  type Line = { y: number; text: string; height: number }
  const lines: Line[] = []
  let cur: { y: number; texts: string[]; height: number } | null = null

  for (const item of items) {
    if (typeof item?.str !== 'string') continue
    const y = item.transform?.[5] ?? 0
    const h = item.height ?? Math.abs(item.transform?.[3] ?? 10)
    if (!cur || Math.abs(cur.y - y) > 2) {
      if (cur) lines.push({ y: cur.y, text: cur.texts.join(' ').replace(/\s+/g, ' ').trim(), height: cur.height })
      cur = { y, texts: [item.str], height: h }
    } else {
      cur.texts.push(item.str)
    }
  }
  if (cur) lines.push({ y: cur.y, text: cur.texts.join(' ').replace(/\s+/g, ' ').trim(), height: cur.height })

  const paragraphs: string[] = []
  let buf: string[] = []
  let prevY: number | null = null
  let prevHeight = 12

  for (const line of lines) {
    if (!line.text) continue
    const gap = prevY !== null ? prevY - line.y : 0
    const isParaBreak = buf.length > 0 && gap > prevHeight * 1.5
    if (isParaBreak) {
      paragraphs.push(joinLines(buf))
      buf = [line.text]
    } else {
      buf.push(line.text)
    }
    prevY = line.y
    prevHeight = line.height || prevHeight
  }
  if (buf.length > 0) paragraphs.push(joinLines(buf))
  return paragraphs
}

/** Join lines, repairing words split by hyphenation across line breaks. */
function joinLines(lines: string[]): string {
  let out = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0) { out = line; continue }
    if (out.endsWith('-') && /^[a-z]/.test(line)) {
      out = out.slice(0, -1) + line
    } else {
      out += ' ' + line
    }
  }
  return out.trim()
}

function deriveTitleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() ?? ''
    return decodeURIComponent(last.replace(/\.pdf$/i, '')) || u.hostname
  } catch {
    return 'PDF document'
  }
}
