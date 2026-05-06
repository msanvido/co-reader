import { describe, it, expect } from 'vitest'
import { truncateToTokens, countWords, hashString, escapeHtml } from './text-utils'

describe('truncateToTokens', () => {
  it('returns the same text if it is shorter than the max tokens', () => {
    const text = 'Hello'
    // maxChars = 2 * 4 = 8. 'Hello' length is 5.
    expect(truncateToTokens(text, 2)).toBe(text)
  })

  it('returns the same text if it is exactly the max length', () => {
    const text = '1234'
    // maxChars = 1 * 4 = 4. '1234' length is 4.
    expect(truncateToTokens(text, 1)).toBe(text)
  })

  it('truncates and adds an ellipsis if the text is longer than the max tokens', () => {
    const text = '12345'
    // maxChars = 1 * 4 = 4. '12345' length is 5.
    expect(truncateToTokens(text, 1)).toBe('1234…')
  })

  it('handles empty string', () => {
    expect(truncateToTokens('', 10)).toBe('')
  })

  it('handles zero maxTokens', () => {
    expect(truncateToTokens('Hello', 0)).toBe('…')
  })

  it('handles very large maxTokens', () => {
    const text = 'Hello'
    expect(truncateToTokens(text, 1000000)).toBe(text)
  })

  it('handles fractional maxTokens by scaling to chars', () => {
    const text = 'Hello'
    // maxTokens = 0.5 => maxChars = 2. 'Hello' -> 'He…'
    expect(truncateToTokens(text, 0.5)).toBe('He…')
  })

  it('handles negative maxTokens (slices from end)', () => {
    const text = 'Hello World'
    // maxTokens = -1 => maxChars = -4. text.slice(0, -4) -> 'Hello W'
    expect(truncateToTokens(text, -1)).toBe('Hello W…')
  })

  it('handles NaN maxTokens', () => {
    const text = 'Hello'
    // NaN * 4 = NaN. length <= NaN is false. slice(0, NaN) is slice(0, 0)
    expect(truncateToTokens(text, NaN)).toBe('…')
  })

  it('handles Infinity maxTokens', () => {
    const text = 'Hello'
    // Infinity * 4 = Infinity. length <= Infinity is true
    expect(truncateToTokens(text, Infinity)).toBe(text)
  })

  it('handles multi-byte characters correctly (surrogate pairs)', () => {
    // Each emoji here is 2 UTF-16 code units. Total length = 8.
    const text = '😀😃😄😁'
    // maxTokens = 1 => maxChars = 4.
    // Should return the first two emojis.
    expect(truncateToTokens(text, 1)).toBe('😀😃…')
  })
})

describe('countWords', () => {
  it('counts simple words', () => {
    expect(countWords('Hello world')).toBe(2)
  })

  it('handles multiple spaces and newlines', () => {
    expect(countWords('  Hello \n  world  ')).toBe(2)
  })

  it('returns 0 for empty or whitespace-only strings', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
  })
})

describe('hashString', () => {
  it('returns a consistent hash for the same string', () => {
    const s = 'test-string'
    expect(hashString(s)).toBe(hashString(s))
  })

  it('returns different hashes for different strings', () => {
    expect(hashString('string1')).not.toBe(hashString('string2'))
  })

  it('returns a string', () => {
    expect(typeof hashString('test')).toBe('string')
  })
})

describe('escapeHtml', () => {
  it('escapes &, <, >, ", and \'', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml('\'')).toBe('&#039;')
  })

  it('escapes a complex string', () => {
    const input = '<script>alert("XSS & \'attack\'")</script>'
    const expected = '&lt;script&gt;alert(&quot;XSS &amp; &#039;attack&#039;&quot;)&lt;/script&gt;'
    expect(escapeHtml(input)).toBe(expected)
  })
})
