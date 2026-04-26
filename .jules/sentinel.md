## 2024-04-22 - DOM XSS in tooltip
**Vulnerability:** Cross-Site Scripting (XSS) via unescaped string injection in tooltip innerHTML.
**Learning:** Assigning template strings containing dynamic, user-controlled inputs (like text summary or API data) directly to element `innerHTML` exposes the app to XSS risks.
**Prevention:** Always use safe DOM manipulation APIs like `document.createElement()`, `textContent`, and `appendChild()` to build UI with dynamic data, or use modern front-end frameworks (like Preact) that automatically handle escaping.

## 2025-02-26 - DOM XSS in status indicator
**Vulnerability:** DOM XSS via `innerHTML` assignment in `status-indicator.ts`.
**Learning:** Even small utility functions or indicators can introduce DOM XSS if they use `innerHTML` with unsanitized dynamic data (like colors or text).
**Prevention:** Strictly enforce the use of `document.createElement`, `textContent`, and safe `style` assignments over `innerHTML` and inline styles containing variables.
