import { defineConfig } from 'wxt'

export default defineConfig({
  outDir: 'output',
  manifest: {
    name: 'co-reader',
    description: 'Paragraph-level reading companion with summaries, highlights, and cross-references',
    permissions: ['storage', 'sidePanel', 'tabs', 'activeTab'],
    host_permissions: [
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://openrouter.ai/*',
    ],
    minimum_chrome_version: '116',
    icons: {
      16: 'icon16.png',
      48: 'icon48.png',
      128: 'icon128.png',
    },
  },
  vite: () => ({
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
    resolve: {
      alias: {
        'react': 'preact/compat',
        'react-dom': 'preact/compat',
      },
    },
  }),
})
