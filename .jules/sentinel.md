## 2024-04-22 - DOM XSS in tooltip
**Vulnerability:** Cross-Site Scripting (XSS) via unescaped string injection in tooltip innerHTML.
**Learning:** Assigning template strings containing dynamic, user-controlled inputs (like text summary or API data) directly to element `innerHTML` exposes the app to XSS risks.
**Prevention:** Always use safe DOM manipulation APIs like `document.createElement()`, `textContent`, and `appendChild()` to build UI with dynamic data, or use modern front-end frameworks (like Preact) that automatically handle escaping.

## 2024-04-23 - DOM XSS via innerHTML with CSS Injection
**Vulnerability:** DOM XSS and CSS injection risks via `innerHTML` and inline style string interpolation.
**Learning:** Relying on manual string escaping (like `escapeHtml`) within template literals for `innerHTML` and inline styles is error-prone and can still allow CSS injection if entities are misinterpreted by the browser.
**Prevention:** Completely eliminate `innerHTML` usage for dynamic content. Always use `document.createElement()`, `textContent`, and directly modify the CSS Object Model (`element.style.propertyName`) to ensure the browser strictly parses input as data and styling rules.
