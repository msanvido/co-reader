/**
 * Site-specific adapters for paragraph detection.
 * Each adapter tells the paragraph detector where to look and what to skip.
 */

export interface SiteAdapter {
  /** Regex matching the site's hostname */
  domain: RegExp
  /** CSS selector for the main content container */
  containerSelector: string
  /** CSS selector for paragraph elements (relative to container) */
  paragraphSelector: string
  /** CSS selectors to exclude */
  exclusionSelectors: string[]
  /** Minimum word count for a paragraph to be registered */
  minWordCount: number
}

export const SITE_ADAPTERS: SiteAdapter[] = [
  {
    domain: /^(x|twitter)\.com$/,
    containerSelector: '[role="main"]',
    paragraphSelector: 'div.longform-unstyled, h2.longform-header-two, h3.longform-header-three, li.longform-unordered-list-item, li.longform-ordered-list-item, blockquote.longform-blockquote',
    exclusionSelectors: ['[data-testid="tweetButtonInline"]', 'nav', 'aside', '[role="navigation"]'],
    minWordCount: 20,
  },
  {
    domain: /medium\.com/,
    containerSelector: 'article',
    paragraphSelector: 'p, h2, h3, blockquote',
    exclusionSelectors: ['figure', 'figcaption', '.graf--pullquote'],
    minWordCount: 20,
  },
  {
    domain: /wikipedia\.org/,
    containerSelector: '#mw-content-text',
    paragraphSelector: 'p',
    exclusionSelectors: ['.reflist', '.navbox', '.infobox', '.sidebar', 'table'],
    minWordCount: 40,
  },
  {
    domain: /arxiv\.org/,
    containerSelector: '.ltx_document, article, #abs',
    paragraphSelector: 'p, .ltx_para',
    exclusionSelectors: ['.ltx_bibliography', '.ltx_appendix figure', 'table'],
    minWordCount: 30,
  },
  {
    domain: /nytimes\.com/,
    containerSelector: 'article, [data-testid="article-body"]',
    paragraphSelector: 'p',
    exclusionSelectors: ['[data-testid="ad-slot"]', 'aside', 'nav', '.css-gg4vpm'],
    minWordCount: 25,
  },
  {
    domain: /substack\.com/,
    containerSelector: '.body.markup, .post-content',
    paragraphSelector: 'p, h2, h3, blockquote',
    exclusionSelectors: ['footer', 'nav'],
    minWordCount: 25,
  },
  {
    domain: /theguardian\.com/,
    containerSelector: 'article .article-body-commercial-selector, [data-gu-name="body"]',
    paragraphSelector: 'p',
    exclusionSelectors: ['.rich-link', 'aside', 'figure'],
    minWordCount: 25,
  },
]

/** Default adapter for unknown sites */
export const DEFAULT_ADAPTER: SiteAdapter = {
  domain: /.*/,
  containerSelector: 'article, main, [role="main"], .post-content, .article-content, .entry-content, #content',
  paragraphSelector: 'p, h2, h3, blockquote',
  exclusionSelectors: [
    'nav', 'header', 'footer', 'aside', 'figure', 'figcaption',
    '.ad', '[class*="advert"]', '[class*="sidebar"]',
    '[class*="comment"]', '[class*="subscribe"]', '[class*="share"]',
    '[class*="related"]', '[class*="footer"]', '[class*="nav"]',
    '[class*="menu"]', '[class*="widget"]', '[class*="promo"]',
    'form', '[role="form"]', '[role="search"]',
  ],
  minWordCount: 40,
}

export function getAdapterForHostname(hostname: string): SiteAdapter {
  return SITE_ADAPTERS.find(a => a.domain.test(hostname)) ?? DEFAULT_ADAPTER
}
