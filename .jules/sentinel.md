## 2024-04-22 - DOM XSS in tooltip
**Vulnerability:** Cross-Site Scripting (XSS) via unescaped string injection in tooltip innerHTML.
**Learning:** Assigning template strings containing dynamic, user-controlled inputs (like text summary or API data) directly to element `innerHTML` exposes the app to XSS risks.
**Prevention:** Always use safe DOM manipulation APIs like `document.createElement()`, `textContent`, and `appendChild()` to build UI with dynamic data, or use modern front-end frameworks (like Preact) that automatically handle escaping.
## 2024-05-29 - Cross-Site Scripting (XSS) via unescaped string injection in tooltip innerHTML
**Vulnerability:** XSS vulnerability where `color` and `text` properties passed to `showPageStatus` were rendered into inline styling strings using `innerHTML`, even with HTML escaping applied.
**Learning:** Using `escapeHtml` does not protect against XSS if the string is inserted directly into inline CSS attributes (e.g. `style="background: ${color}"`). A malicious input like `red"; } body { display: none !important; } .a { color: "red` could inject arbitrary CSS and potentially JavaScript if escaping is incomplete.
**Prevention:** Always use safe native DOM APIs, such as `document.createElement`, `.textContent`, `el.replaceChildren()`, and typed CSS assignment via `.style.cssProperty = value` to eliminate any possibility of injection inside style declarations or HTML tags.
