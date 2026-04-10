import type { LLMProvider } from './types'

const MAX_RETRIES = 3

function apiUrl(model: string, apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
}

export function createGeminiProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'Gemini',

    async call(system, userPrompt, maxTokens) {
      if (!apiKey) throw new Error('No API key configured. Go to Settings to add one.')
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(apiUrl(model, apiKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json',
              // Gemini 2.5 models use "thinking" tokens from the output budget.
              // Set a thinking budget so it doesn't consume all output tokens.
              thinkingConfig: {
                thinkingBudget: Math.min(2048, Math.floor(maxTokens * 0.1)),
              },
            },
          }),
        })

        if (isRetryable(response.status) && attempt < MAX_RETRIES) {
          const ms = (2 ** attempt) * 3000
          console.log(`[co-reader] Gemini ${response.status} — retry in ${ms}ms`)
          await new Promise(r => setTimeout(r, ms))
          continue
        }

        if (!response.ok) {
          const body = await response.text()
          try { throw new Error(JSON.parse(body)?.error?.message ?? `API ${response.status}`) }
          catch (e) { if (e instanceof Error) throw e; throw new Error(`Gemini ${response.status}: ${body.slice(0, 200)}`) }
        }

        const data = await response.json()

        // Check for MAX_TOKENS / empty response
        const candidate = data.candidates?.[0]
        const finishReason = candidate?.finishReason
        const text = candidate?.content?.parts?.[0]?.text ?? ''

        if (!text && finishReason === 'MAX_TOKENS') {
          // Thinking consumed all tokens — retry with thinking disabled
          if (attempt < MAX_RETRIES) {
            console.warn('[co-reader] Gemini thinking consumed all tokens, retrying with thinking disabled')
            const retryResp = await fetch(apiUrl(model, apiKey), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: system }] },
                contents: [{ parts: [{ text: userPrompt }] }],
                generationConfig: {
                  maxOutputTokens: maxTokens,
                  responseMimeType: 'application/json',
                  thinkingConfig: { thinkingBudget: 0 },
                },
              }),
            })
            if (retryResp.ok) {
              const retryData = await retryResp.json()
              const retryText = retryData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
              if (retryText) return retryText
            }
          }
          throw new Error('Gemini returned empty response (thinking consumed all output tokens)')
        }

        if (!text) {
          console.error('[co-reader] Gemini empty response:', JSON.stringify(data).slice(0, 300))
          throw new Error(`Gemini empty response (finishReason: ${finishReason ?? 'unknown'})`)
        }

        return text
      }
      throw new Error('Max retries exceeded')
    },

    async test() {
      try {
        // Use countTokens endpoint — free, no generation, just validates the key
        const countUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:countTokens?key=${apiKey}`
        const resp = await fetch(countUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'test' }] }] }),
        })
        if (resp.ok) return { ok: true }
        const body = await resp.text()
        try { return { ok: false, error: JSON.parse(body)?.error?.message ?? `API ${resp.status}` } }
        catch { return { ok: false, error: `API ${resp.status}` } }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
  }
}

function isRetryable(status: number) { return status >= 500 && status !== 529 }
