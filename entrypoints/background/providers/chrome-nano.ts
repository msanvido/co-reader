import type { LLMProvider } from './types'

/**
 * Chrome's built-in Gemini Nano via the Prompt API.
 * No API key needed. Runs entirely on-device.
 * Requires Chrome 131+ with chrome://flags/#prompt-api-for-gemini-nano enabled.
 */
export function createChromeNanoProvider(): LLMProvider {
  return {
    name: 'Chrome Nano',

    async call(system, userPrompt, _maxTokens) {
      const ai = getAI()
      if (!ai) throw new Error('Chrome AI not available. Enable at chrome://flags/#prompt-api-for-gemini-nano')

      const session = await ai.languageModel.create({
        systemPrompt: system,
      })

      const result = await session.prompt(userPrompt)
      session.destroy()
      return result
    },

    async test() {
      try {
        const ai = getAI()
        if (!ai) return { ok: false, error: 'Chrome AI not available. Enable at chrome://flags/#prompt-api-for-gemini-nano' }

        const caps = await ai.languageModel.capabilities()
        if (caps.available === 'no') {
          return { ok: false, error: 'Gemini Nano model not downloaded. Visit chrome://flags/#prompt-api-for-gemini-nano' }
        }
        if (caps.available === 'after-download') {
          return { ok: false, error: 'Gemini Nano is downloading. Try again in a few minutes.' }
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
  }
}

// Chrome's AI API can be on `self.ai` or `globalThis.ai`
function getAI(): any {
  if (typeof self !== 'undefined' && (self as any).ai?.languageModel) return (self as any).ai
  return null
}
