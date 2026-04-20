## 2026-04-20 - DOM XSS in Tooltip and Status Indicator
**Vulnerability:** DOM Cross-Site Scripting (XSS) via unsanitized properties injected into `innerHTML`.
**Learning:** The `escapeHtml` utility existed but was only used for one field (`result.summary`) inside the tooltip and wasn't reused across files, leaving properties like colors and relationship descriptions vulnerable if manipulated.
**Prevention:** Always use a central `escapeHtml` utility (now in `utils/text-utils.ts`) for *all* dynamic properties injected into `innerHTML`.
