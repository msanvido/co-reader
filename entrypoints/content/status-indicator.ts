/**
 * Small status indicator injected into the page.
 * Shows a colored dot + text in the bottom-left corner.
 */

import { escapeHtml } from '@/utils/text-utils'

const ID = 'cr-page-status'

export function showPageStatus(color: string, text: string): void {
  let el = document.getElementById(ID)
  if (!el) {
    el = document.createElement('div')
    el.id = ID
    document.body.appendChild(el)
  }

  el.innerHTML = `
    <span style="
      display:inline-block;width:10px;height:10px;border-radius:50%;
      background:${escapeHtml(color)};box-shadow:0 0 6px ${escapeHtml(color)};flex-shrink:0;
    "></span>
    <span style="color:#ccc;font-size:12px">${escapeHtml(text)}</span>
  `
  el.setAttribute('style', `
    position:fixed;bottom:16px;left:16px;z-index:2147483646;
    display:flex;align-items:center;gap:8px;
    background:rgba(28,28,30,0.92);backdrop-filter:blur(8px);
    padding:6px 12px;border-radius:20px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    box-shadow:0 2px 12px rgba(0,0,0,0.4);
    border:1px solid rgba(255,255,255,0.08);
    transition:opacity 0.3s;
  `)
}

export function hidePageStatus(): void {
  document.getElementById(ID)?.remove()
}

export function fadePageStatus(delay = 5000): void {
  setTimeout(() => {
    const el = document.getElementById(ID)
    if (el) {
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 300)
    }
  }, delay)
}
