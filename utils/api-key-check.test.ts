import { describe, it, expect } from 'vitest'
import { isMissingApiKey, apiKeyErrorMessage } from './api-key-check'

describe('isMissingApiKey', () => {
  it('returns true for anthropic with no key', () => {
    expect(isMissingApiKey('anthropic', '')).toBe(true)
  })

  it('returns true for openai with no key', () => {
    expect(isMissingApiKey('openai', '')).toBe(true)
  })

  it('returns true for gemini with no key', () => {
    expect(isMissingApiKey('gemini', '')).toBe(true)
  })

  it('returns true for openrouter with no key', () => {
    expect(isMissingApiKey('openrouter', '')).toBe(true)
  })

  it('returns false for anthropic with a key', () => {
    expect(isMissingApiKey('anthropic', 'sk-ant-api03-abc')).toBe(false)
  })

  it('returns false for chrome-nano regardless of key', () => {
    expect(isMissingApiKey('chrome-nano', '')).toBe(false)
  })

  it('returns false for in-browser regardless of key', () => {
    expect(isMissingApiKey('in-browser', '')).toBe(false)
  })

  it('treats whitespace-only key as missing', () => {
    expect(isMissingApiKey('anthropic', '   ')).toBe(true)
  })
})

describe('apiKeyErrorMessage', () => {
  it('returns a message mentioning the provider name', () => {
    const msg = apiKeyErrorMessage('anthropic')
    expect(msg).toContain('Anthropic')
    expect(msg).toContain('API key')
  })

  it('returns a message for openai', () => {
    const msg = apiKeyErrorMessage('openai')
    expect(msg).toContain('OpenAI')
  })

  it('returns empty string for keyless providers', () => {
    expect(apiKeyErrorMessage('chrome-nano')).toBe('')
    expect(apiKeyErrorMessage('in-browser')).toBe('')
  })
})
