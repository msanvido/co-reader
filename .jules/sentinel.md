## 2025-02-23 - Widespread DOM XSS via unescaped string interpolation

**Vulnerability:** Found unescaped user-controlled or dynamic string interpolation directly assigned to `innerHTML` within content script components (`status-indicator.ts` and `tooltip.ts`).
**Learning:** Although `escapeHtml` existed as a localized function within one module, it wasn't exposed to other UI components, resulting in inconsistent defense-in-depth where multiple DOM elements were prone to XSS via variables like colors, text, tooltips, and labels.
**Prevention:** Centralize utility functions for sanitization (like `escapeHtml` in `text-utils.ts`) so they are accessible globally, and enforce a rule that all interpolated values mapped to `innerHTML` must be escaped by default.
