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

  // Truncated — repair and retry
  const repaired = repairJson(cleaned)
  try {
    const result = JSON.parse(repaired) as T
    console.warn('[co-reader] JSON was truncated, repaired successfully')
    return result
  } catch {}

  // Progressive truncation: cut from the end, repair, try again
  // Step back to the last complete-looking element (end of string or number)
  for (let i = cleaned.length - 1; i > cleaned.length * 0.3; i--) {
    const ch = cleaned[i]
    // Look for natural break points: end of a string value, number, or boolean
    if (ch === '"' || ch === '}' || ch === ']' || (ch >= '0' && ch <= '9') || ch === 'e' || ch === 'l') {
      const slice = cleaned.slice(0, i + 1)
      const repaired2 = repairJson(slice)
      try {
        const result = JSON.parse(repaired2) as T
        console.warn(`[co-reader] JSON truncated, recovered at position ${i}/${cleaned.length}`)
        return result
      } catch { /* keep trying */ }
    }
  }

  return null
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
