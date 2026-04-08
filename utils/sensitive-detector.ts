/**
 * Local heuristic detector for sensitive content.
 * Runs entirely in the content script — no network calls.
 * Returns true if the text likely contains sensitive information.
 */

const SENSITIVE_PATTERNS = [
  // SSN
  /\b\d{3}-\d{2}-\d{4}\b/,
  // Credit card numbers (rough)
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/,
  // Passwords (common labels)
  /\bpassword\s*[:=]\s*\S+/i,
  /\bpasswd\s*[:=]\s*\S+/i,
  // API keys (generic pattern: long alphanumeric strings after key labels)
  /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*[A-Za-z0-9_\-\.]{20,}/i,
  // Medical record numbers
  /\bMRN\s*[:=]?\s*\d{6,}/i,
]

export function containsSensitiveContent(text: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Sensitive domains where the extension should not activate.
 */
const SENSITIVE_HOSTNAME_PATTERNS = [
  /mail\.google\.com/,
  /outlook\.(live|office)\.com/,
  /app\.slack\.com/,
  /web\.whatsapp\.com/,
  /messenger\.com/,
  /\.bank$/,
  /^banking\./,
  /^secure\./,
  /healthcare/,
  /patient/,
]

export function isSensitiveDomain(hostname: string): boolean {
  return SENSITIVE_HOSTNAME_PATTERNS.some(p => p.test(hostname))
}
