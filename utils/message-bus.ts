import type {
  Message,
  MessageType,
  GetMicroSummaryMessage,
  GetDeepDiveMessage,
  GetDocumentAnalysisMessage,
  GetFullPageAnalysisMessage,
  GetSettingsMessage,
  UpdateSettingsMessage,
  CheckDomainBlockedMessage,
  OpenSidePanelMessage,
  MicroSummaryRequest,
  DeepDiveRequest,
  DocumentAnalysisRequest,
  FullPageAnalysisRequest,
  Settings,
  ProviderID,
  DeepDiveResponse,
} from './types'
import type { ModelInfo } from '@/entrypoints/background/providers/types'

// ─── Typed message senders ───────────────────────────────────────────────────

export function sendGetMicroSummary(payload: MicroSummaryRequest): Promise<unknown> {
  const msg: GetMicroSummaryMessage = { type: 'GET_MICRO_SUMMARY', payload }
  return chrome.runtime.sendMessage(msg)
}

export function sendGetDeepDive(payload: DeepDiveRequest): Promise<unknown> {
  const msg: GetDeepDiveMessage = { type: 'GET_DEEP_DIVE', payload }
  return chrome.runtime.sendMessage(msg)
}

export function sendGetDocumentAnalysis(payload: DocumentAnalysisRequest): Promise<unknown> {
  const msg: GetDocumentAnalysisMessage = { type: 'GET_DOCUMENT_ANALYSIS', payload }
  return chrome.runtime.sendMessage(msg)
}

export function sendGetFullPageAnalysis(payload: FullPageAnalysisRequest): Promise<unknown> {
  const msg: GetFullPageAnalysisMessage = { type: 'GET_FULL_PAGE_ANALYSIS', payload }
  return chrome.runtime.sendMessage(msg)
}

export function sendGetSettings(): Promise<Settings> {
  const msg: GetSettingsMessage = { type: 'GET_SETTINGS' }
  return chrome.runtime.sendMessage(msg)
}

export function sendUpdateSettings(payload: Partial<Settings>): Promise<void> {
  const msg: UpdateSettingsMessage = { type: 'UPDATE_SETTINGS', payload }
  return chrome.runtime.sendMessage(msg)
}

export function sendCheckDomainBlocked(hostname: string): Promise<boolean> {
  const msg: CheckDomainBlockedMessage = { type: 'CHECK_DOMAIN_BLOCKED', payload: { hostname } }
  return chrome.runtime.sendMessage(msg)
}

export function sendOpenSidePanel(
  data: DeepDiveResponse & { paragraphId: string; paragraphText: string }
): Promise<void> {
  const msg: OpenSidePanelMessage = { type: 'OPEN_SIDE_PANEL', payload: data }
  return chrome.runtime.sendMessage(msg)
}

export function sendListModels(
  providerId: ProviderID,
  apiKey: string,
): Promise<{ ok: boolean; models?: ModelInfo[]; error?: string }> {
  return chrome.runtime.sendMessage({ type: 'LIST_MODELS', payload: { providerId, apiKey } })
}

// ─── Message type guard ───────────────────────────────────────────────────────

export function isMessageType<T extends MessageType>(
  msg: Message,
  type: T
): msg is Extract<Message, { type: T }> {
  return msg.type === type
}
