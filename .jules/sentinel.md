## 2024-04-22 - DOM XSS in tooltip
**Vulnerability:** Cross-Site Scripting (XSS) via unescaped string injection in tooltip innerHTML.
**Learning:** Assigning template strings containing dynamic, user-controlled inputs (like text summary or API data) directly to element `innerHTML` exposes the app to XSS risks.
**Prevention:** Always use safe DOM manipulation APIs like `document.createElement()`, `textContent`, and `appendChild()` to build UI with dynamic data, or use modern front-end frameworks (like Preact) that automatically handle escaping.

## 2026-05-06 - DOM XSS risk via innerHTML in status indicator
**Vulnerability:** Use of `innerHTML` to construct the UI of the page status indicator, which could be an XSS vector even if `escapeHtml` is used.
**Learning:** Sentinel guidance requires the complete avoidance of `innerHTML` for dynamic content injection in favor of safe DOM APIs. Additionally, using template literals inside style assignments using JS DOM APIs must be properly formed (e.g. `` `0 0 6px ${color}` ``) and not escaped with backslashes.
**Prevention:** Always use safe DOM manipulation APIs like `document.createElement()`, `textContent`, `style` property assignments, and `appendChild()` instead of `innerHTML`.
