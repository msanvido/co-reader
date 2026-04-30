## 2024-04-22 - DOM XSS in tooltip
**Vulnerability:** Cross-Site Scripting (XSS) via unescaped string injection in tooltip innerHTML.
**Learning:** Assigning template strings containing dynamic, user-controlled inputs (like text summary or API data) directly to element `innerHTML` exposes the app to XSS risks.
**Prevention:** Always use safe DOM manipulation APIs like `document.createElement()`, `textContent`, and `appendChild()` to build UI with dynamic data, or use modern front-end frameworks (like Preact) that automatically handle escaping.

## 2024-05-30 - Prevent DOM XSS in Status Indicator
**Vulnerability:** Cross-Site Scripting (XSS) via string template injection in `innerHTML` of the `status-indicator`.
**Learning:** Using `innerHTML` with template literals (even when combined with `escapeHtml`) increases the surface for potential security oversights and violates the strict avoidance of `innerHTML` for dynamic content.
**Prevention:** Strictly enforce the usage of native DOM APIs such as `document.createElement()`, `textContent`, and programmatic styling for dynamic content injection, ensuring the browser handles escaping correctly.
