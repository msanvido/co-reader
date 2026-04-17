## 2023-10-27 - InnerHTML XSS Vulnerability in Extension Content Script
**Vulnerability:** XSS via innerHTML in entrypoints/content/status-indicator.ts.
**Learning:** Even small utility functions for injecting HTML (like an indicator dot) can be a vector for XSS if they accept un-sanitized string parameters like 'text' and write directly to innerHTML in a content script running on untrusted web pages.
**Prevention:** Avoid innerHTML entirely in favor of document.createElement() and .textContent for dynamically injecting content elements, especially in browser extensions that inject elements into a user's page where the content script has high privileges or handles user data.
