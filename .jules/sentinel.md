## 2024-04-22 - DOM XSS in tooltip
**Vulnerability:** Cross-Site Scripting (XSS) via unescaped string injection in tooltip innerHTML.
**Learning:** Assigning template strings containing dynamic, user-controlled inputs (like text summary or API data) directly to element `innerHTML` exposes the app to XSS risks.
**Prevention:** Always use safe DOM manipulation APIs like `document.createElement()`, `textContent`, and `appendChild()` to build UI with dynamic data, or use modern front-end frameworks (like Preact) that automatically handle escaping.
## 2026-06-18 - Prevent DOM XSS via innerHTML in status indicator
**Vulnerability:** XSS risk due to dynamic values interpolated in `innerHTML`.
**Learning:** Even with `escapeHtml`, using `innerHTML` to render dynamic styles or text is prone to DOM XSS. `replaceChildren` combined with direct DOM element creation is more robust.
**Prevention:** Use `document.createElement` and CSSOM for dynamic styles.
