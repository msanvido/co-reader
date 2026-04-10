import type { LLMProvider } from './types'

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_RETRIES = 3

export function createOpenRouterProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'OpenRouter',

    async call(system, userPrompt, maxTokens) {
      if (!apiKey) throw new Error('No OpenRouter API key. Go to Settings and add one (free at openrouter.ai/keys).')
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://co-reader.extension',
            'X-Title': 'co-reader',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userPrompt },
            ],
          }),
        })

        if (isRetryable(response.status) && attempt < MAX_RETRIES) {
          const ms = (2 ** attempt) * 3000
          console.log(`[co-reader] OpenRouter ${response.status} — retry in ${ms}ms`)
          await new Promise(r => setTimeout(r, ms))
          continue
        }

        if (!response.ok) {
          const body = await response.text()
          let msg = `OpenRouter ${response.status}`
          try { msg = JSON.parse(body)?.error?.message ?? msg } catch {}
          throw new Error(msg)
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content ?? ''
        if (!content) {
          console.error('[co-reader] OpenRouter empty response:', JSON.stringify(data).slice(0, 500))
          throw new Error('OpenRouter returned empty response. Model may not support this request.')
        }
        return content
      }
      throw new Error('Max retries exceeded')
    },

    async test() {
      try {
        // Validate key without making an LLM call — just check auth
        const resp = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        })
        if (resp.ok) return { ok: true }
        const body = await resp.text()
        try { return { ok: false, error: JSON.parse(body)?.error?.message ?? `Invalid key (${resp.status})` } }
        catch { return { ok: false, error: `Invalid key (${resp.status})` } }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
  }
}

function isRetryable(status: number) { return status >= 500 && status !== 529 }
