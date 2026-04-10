import type { LLMProvider } from './types'

const API_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_RETRIES = 3

export function createOpenAIProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'OpenAI',

    async call(system, userPrompt, maxTokens) {
      if (!apiKey) throw new Error('No API key configured. Go to Settings to add one.')
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
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
          console.log(`[co-reader] OpenAI ${response.status} — retry in ${ms}ms`)
          await new Promise(r => setTimeout(r, ms))
          continue
        }

        if (!response.ok) {
          const body = await response.text()
          try { throw new Error(JSON.parse(body)?.error?.message ?? `API ${response.status}`) }
          catch (e) { if (e instanceof Error) throw e; throw new Error(`API ${response.status}: ${body.slice(0, 200)}`) }
        }

        const data = await response.json()
        return data.choices?.[0]?.message?.content ?? ''
      }
      throw new Error('Max retries exceeded')
    },

    async test() {
      try {
        const resp = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
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
