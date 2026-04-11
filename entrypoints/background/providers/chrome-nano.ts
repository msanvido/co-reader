import type { LLMProvider } from './types'

/**
 * Chrome's built-in Gemini Nano via the Prompt API.
 * No API key needed. Runs entirely on-device.
 *
 * New API (Chrome 138+): `LanguageModel` is a global constructor.
 * Old API (Chrome 131–137): `self.ai.languageModel`.
 *
 * @see https://github.com/GoogleChromeLabs/web-ai-demos/tree/main/prompt-api
 */
export function createChromeNanoProvider(): LLMProvider {
  return {
    name: 'Chrome Nano',

    async call(system, userPrompt, _maxTokens) {
      const api = getLanguageModelAPI()
      if (!api) throw new Error(UNAVAILABLE_MSG)

      const session = await api.create({
        initialPrompts: [
          { role: 'system', content: system },
        ],
      })

      try {
        const result = await session.prompt(userPrompt)
        return result
      } finally {
        session.destroy()
      }
    },

    async test() {
      try {
        const api = getLanguageModelAPI()
        if (!api) return { ok: false, error: UNAVAILABLE_MSG }

        // New API: LanguageModel.availability()  Old API: ai.languageModel.capabilities()
        const status = typeof api.availability === 'function'
          ? await api.availability()
          : (await api.capabilities?.())?.available

        if (status === 'no' || status === 'unavailable') {
          return { ok: false, error: 'Gemini Nano model not available. Visit chrome://flags/#prompt-api-for-gemini-nano' }
        }
        if (status === 'after-download' || status === 'downloadable') {
          return { ok: false, error: 'Gemini Nano is downloading. Try again in a few minutes.' }
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
  }
}

const UNAVAILABLE_MSG = 'Chrome AI not available. Enable at chrome://flags/#prompt-api-for-gemini-nano'

/**
 * Returns the LanguageModel API handle, preferring the new global constructor
 * (Chrome 138+) and falling back to the legacy self.ai.languageModel namespace.
 */
function getLanguageModelAPI(): any {
  // New API: LanguageModel is a global constructor
  if (typeof self !== 'undefined' && (self as any).LanguageModel) {
    return (self as any).LanguageModel
  }
  // Legacy API: self.ai.languageModel
  if (typeof self !== 'undefined' && (self as any).ai?.languageModel) {
    return (self as any).ai.languageModel
  }
  return null
}
