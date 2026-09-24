import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWllamaProvider, WLLAMA_MODELS } from './wllama'

describe('wllama provider', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      offscreen: {
        hasDocument: vi.fn().mockResolvedValue(true),
        createDocument: vi.fn().mockResolvedValue(undefined),
        Reason: { WORKERS: 'WORKERS' },
      },
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
        sendMessage: vi.fn(),
      },
    })
  })

  it('initializes provider with correct name and methods', () => {
    const provider = createWllamaProvider('qwen2.5-0.5b')
    expect(provider.name).toBe('In-Browser (Wllama / llama.cpp)')
    expect(typeof provider.call).toBe('function')
    expect(typeof provider.test).toBe('function')
    expect(typeof provider.listModels).toBe('function')
  })

  it('lists available models with expected defaults and metadata', async () => {
    const provider = createWllamaProvider('qwen2.5-0.5b')
    const models = await provider.listModels!()
    expect(models).toEqual(WLLAMA_MODELS)
    expect(models.length).toBeGreaterThanOrEqual(3)
    const qwen = models.find(m => m.id === 'qwen2.5-0.5b')
    expect(qwen).toBeDefined()
    expect(qwen?.isFree).toBe(true)
    expect(qwen?.contextLength).toBe(4096)
  })

  it('calls offscreen document for wllama-generate and returns text', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      ok: true,
      text: 'Summary of paragraph',
    })
    vi.stubGlobal('chrome', {
      offscreen: {
        hasDocument: vi.fn().mockResolvedValue(true),
      },
      runtime: {
        sendMessage: mockSendMessage,
        getURL: vi.fn(),
      },
    })

    const provider = createWllamaProvider('qwen2.5-0.5b')
    const result = await provider.call('You are a helpful assistant', 'Please summarize this', 256)
    expect(result).toBe('Summary of paragraph')
    expect(mockSendMessage).toHaveBeenCalledWith({
      target: 'offscreen',
      action: 'wllama-generate',
      model: 'qwen2.5-0.5b',
      system: 'You are a helpful assistant',
      userPrompt: 'Please summarize this',
      maxTokens: 256,
    })
  })

  it('throws descriptive error when generation fails', async () => {
    vi.stubGlobal('chrome', {
      offscreen: {
        hasDocument: vi.fn().mockResolvedValue(true),
      },
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({
          ok: false,
          error: 'Model download failed',
        }),
        getURL: vi.fn(),
      },
    })

    const provider = createWllamaProvider('qwen2.5-0.5b')
    await expect(provider.call('system', 'prompt', 100)).rejects.toThrow('Model download failed')
  })

  it('tests connection via wllama-test action in offscreen document', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('chrome', {
      offscreen: {
        hasDocument: vi.fn().mockResolvedValue(true),
      },
      runtime: {
        sendMessage: mockSendMessage,
        getURL: vi.fn(),
      },
    })

    const provider = createWllamaProvider('qwen2.5-0.5b')
    const testResult = await provider.test()
    expect(testResult).toEqual({ ok: true })
    expect(mockSendMessage).toHaveBeenCalledWith({
      target: 'offscreen',
      action: 'wllama-test',
    })
  })
})
