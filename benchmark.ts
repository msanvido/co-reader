import { JSDOM } from 'jsdom';

const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <main>
        <div>
          <p>Paragraph 1</p>
          <script>console.log("test")</script>
        </div>
        <aside>
          <p>Paragraph 2</p>
        </aside>
        <footer>
          <p>Footer stuff</p>
        </footer>
        <nav>
          <ul><li>Link</li></ul>
        </nav>
        <header>
          <h1>Title</h1>
        </header>
        <div role="navigation">Nav role</div>
      </main>
    </body>
  </html>
`);

const document = dom.window.document;
const container = document.querySelector('main');

const globalExclusions = [
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  'script', 'style', 'noscript',
];

const startUnoptimized = performance.now();
for (let i = 0; i < 1000; i++) {
  const excluded = new Set<Element>();
  for (const sel of globalExclusions) {
    document.querySelectorAll(sel).forEach(el => {
      el.querySelectorAll('*').forEach(d => excluded.add(d))
      excluded.add(el)
    })
  }
}
const endUnoptimized = performance.now();
console.log(`Unoptimized: ${endUnoptimized - startUnoptimized}ms`);

const startOptimized = performance.now();
for (let i = 0; i < 1000; i++) {
  const excluded = new Set<Element>();
  const combinedGlobalSel = globalExclusions.join(', ');
  document.querySelectorAll(combinedGlobalSel).forEach(el => {
    el.querySelectorAll('*').forEach(d => excluded.add(d))
    excluded.add(el)
  })
}
const endOptimized = performance.now();
console.log(`Optimized: ${endOptimized - startOptimized}ms`);
