## 2025-04-18 - XSS in Status Indicator
**Vulnerability:** Found `innerHTML` assignment in `showPageStatus` without sanitizing input (`text` parameter).
**Learning:** Even internal-looking functions like status messages can be a vector for XSS if they accept user-provided content.
**Prevention:** Always use `textContent` when inserting plain text or sanitize input properly before using `innerHTML`.
