// ─── Hashing ─────────────────────────────────────────────────────────────────

export function hashString(str: string): string {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 16777619) >>> 0
  }
  return hash.toString(36)
}

export function makeParagraphId(xpathKey: string, textPrefix: string): string {
  return `cr-para-${hashString(xpathKey + '|' + textPrefix.slice(0, 50))}`
}

// ─── Text ─────────────────────────────────────────────────────────────────────

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '…'
}

export function extractText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function getElementKey(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== document.body) {
    const tag = current.tagName
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(c => c.tagName === tag)
      : [current]
    const idx = siblings.indexOf(current)
    parts.unshift(idx > 0 ? `${tag}[${idx}]` : tag)
    current = current.parentElement
  }
  return parts.join('>')
}

// ─── JSON Parsing ─────────────────────────────────────────────────────────────

export function parseJsonResponse<T>(raw: string): T | null {
  if (!raw || raw.trim().length === 0) return null

  // Strip markdown code fences
  let cleaned = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim()

  // Find the first {
  const start = cleaned.indexOf('{')
  if (start === -1) return null
  cleaned = cleaned.slice(start)

  // Try direct parse
  try { return JSON.parse(cleaned) as T } catch {}

  // Fix unescaped quotes inside JSON string values, then retry
  const sanitized = fixUnescapedQuotes(cleaned)
  try { return JSON.parse(sanitized) as T } catch {}

  // Truncated — repair and retry
  const repaired = repairJson(sanitized)
  try {
    const result = JSON.parse(repaired) as T
    console.warn('[co-reader] JSON repaired successfully')
    return result
  } catch {}

  // Progressive truncation: cut back to find a parseable prefix
  for (let i = sanitized.length - 1; i > sanitized.length * 0.3; i--) {
    const ch = sanitized[i]
    if (ch === '"' || ch === '}' || ch === ']' || (ch >= '0' && ch <= '9') || ch === 'e' || ch === 'l') {
      const repaired2 = repairJson(sanitized.slice(0, i + 1))
      try {
        const result = JSON.parse(repaired2) as T
        console.warn(`[co-reader] JSON recovered at position ${i}/${sanitized.length}`)
        return result
      } catch { /* keep trying */ }
    }
  }

  return null
}

/**
 * Fix unescaped quotes inside JSON string values.
 * LLMs sometimes produce: "summary": "the "rabbit hole" concept"
 * which should be:          "summary": "the \"rabbit hole\" concept"
 *
 * Strategy: walk char by char, track whether we're inside a JSON string value.
 * If we hit a quote that's clearly mid-value (not followed by a JSON structural
 * char like : , } ]), escape it.
 */
function fixUnescapedQuotes(json: string): string {
  const out: string[] = []
  let i = 0
  const len = json.length

  while (i < len) {
    const ch = json[i]

    if (ch === '"') {
      // Start of a string — find the proper end
      out.push('"')
      i++
      while (i < len) {
        const c = json[i]
        if (c === '\\') {
          // Escaped character — keep as-is
          out.push(c)
          i++
          if (i < len) { out.push(json[i]); i++ }
          continue
        }
        if (c === '"') {
          // Is this the real end of the string?
          // Look ahead: skip whitespace, then check for JSON structural char
          let peek = i + 1
          while (peek < len && (json[peek] === ' ' || json[peek] === '\n' || json[peek] === '\r' || json[peek] === '\t')) peek++
          const next = json[peek]
          if (next === ':' || next === ',' || next === '}' || next === ']' || next === undefined) {
            // This is the real closing quote
            out.push('"')
            i++
            break
          } else {
            // Unescaped quote mid-string — escape it
            out.push('\\"')
            i++
            continue
          }
        }
        out.push(c)
        i++
      }
    } else {
      out.push(ch)
      i++
    }
  }

  return out.join('')
}

/**
 * Close unclosed strings, arrays, and objects in truncated JSON.
 */
function repairJson(json: string): string {
  // Remove trailing partial key-value pairs
  // e.g., `,"key": "incom` or `,"key": ` or `,"key"`
  let s = json
    .replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, '')  // ,"key": "incomplete string
    .replace(/,\s*"[^"]*"\s*:\s*$/, '')          // ,"key":
    .replace(/,\s*"[^"]*$/, '')                   // ,"incomplete key
    .replace(/,\s*$/, '')                          // trailing comma

  // Walk the string tracking open structures
  let inString = false
  let escaped = false
  const stack: string[] = []

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\' && inString) { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue

    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if ((ch === '}' || ch === ']') && stack.length > 0 && stack[stack.length - 1] === ch) {
      stack.pop()
    }
  }

  // Close unclosed string
  if (inString) s += '"'

  // Close all unclosed brackets/braces
  while (stack.length > 0) s += stack.pop()

  return s
}

// ─── Security ─────────────────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
