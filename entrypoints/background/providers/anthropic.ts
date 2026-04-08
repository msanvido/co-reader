import type { LLMProvider } from './types'

const API_URL = 'https://api.anthropic.com/v1/messages'
const MAX_RETRIES = 3

export function createAnthropicProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'Anthropic',

    async call(system, userPrompt, maxTokens) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        })

        if (isRetryable(response.status) && attempt < MAX_RETRIES) {
          await backoff(response, attempt)
          continue
        }

        if (!response.ok) throw await apiError(response)

        const data = await response.json()
        return data.content?.[0]?.text ?? ''
      }
      throw new Error('Max retries exceeded')
    },

    async test() {
      try {
        const resp = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        })
        if (resp.ok) return { ok: true }
        return { ok: false, error: await cleanError(resp) }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
  }
}

function isRetryable(status: number) { return status === 429 || status === 529 || status >= 500 }

async function backoff(resp: Response, attempt: number) {
  const retryAfter = resp.headers.get('retry-after')
  const ms = retryAfter ? parseInt(retryAfter, 10) * 1000 : (2 ** attempt) * 3000
  console.log(`[co-reader] ${resp.status} — retry in ${ms}ms`)
  await new Promise(r => setTimeout(r, ms))
}

async function apiError(resp: Response): Promise<Error> {
  const body = await resp.text()
  try { return new Error(JSON.parse(body)?.error?.message ?? `API ${resp.status}`) }
  catch { return new Error(`API ${resp.status}: ${body.slice(0, 200)}`) }
}

async function cleanError(resp: Response): Promise<string> {
  const body = await resp.text()
  try { return JSON.parse(body)?.error?.message ?? `API ${resp.status}` }
  catch { return `API ${resp.status}` }
}
