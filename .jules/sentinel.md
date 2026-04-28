## 2024-04-22 - DOM XSS in tooltip
**Vulnerability:** Cross-Site Scripting (XSS) via unescaped string injection in tooltip innerHTML.
**Learning:** Assigning template strings containing dynamic, user-controlled inputs (like text summary or API data) directly to element `innerHTML` exposes the app to XSS risks.
**Prevention:** Always use safe DOM manipulation APIs like `document.createElement()`, `textContent`, and `appendChild()` to build UI with dynamic data, or use modern front-end frameworks (like Preact) that automatically handle escaping.

## 2026-04-28 - DOM XSS in Status Indicator
**Vulnerability:** DOM XSS risk from using `innerHTML` in `showPageStatus`.
**Learning:** Even when using a sanitizer like `escapeHtml`, relying on `innerHTML` is an anti-pattern. Directly setting style properties and using `textContent` provides an inherent defense-in-depth.
**Prevention:** Avoid `innerHTML` entirely for dynamic content injection. Always use native safe DOM APIs like `document.createElement` and programmatic styling.
