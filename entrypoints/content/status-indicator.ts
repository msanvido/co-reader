/**
 * Small status indicator injected into the page.
 * Shows a colored dot + text in the bottom-left corner.
 */

const ID = 'cr-page-status'

export function showPageStatus(color: string, text: string): void {
  let el = document.getElementById(ID)
  if (!el) {
    el = document.createElement('div')
    el.id = ID
    document.body.appendChild(el)
  } else {
    // Clear existing content
    el.textContent = ''
  }

  const dot = document.createElement('span')
  dot.style.display = 'inline-block'
  dot.style.width = '10px'
  dot.style.height = '10px'
  dot.style.borderRadius = '50%'
  dot.style.background = color
  dot.style.boxShadow = `0 0 6px ${color}`
  dot.style.flexShrink = '0'

  const textSpan = document.createElement('span')
  textSpan.style.color = '#ccc'
  textSpan.style.fontSize = '12px'
  textSpan.textContent = text

  el.appendChild(dot)
  el.appendChild(textSpan)

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
