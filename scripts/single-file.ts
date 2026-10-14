import type { Plugin } from 'vite'

/** This project has one entry and no external assets. Refuse an incomplete offline build. */
export function singleFile(): Plugin {
  return {
    name: '346-single-file', enforce: 'post', apply: 'build',
    config: () => ({ build: { cssCodeSplit: false, modulePreload: false, assetsDir: '', rollupOptions: { output: { inlineDynamicImports: true } } } }),
    generateBundle(_options, bundle) {
      const html = bundle['index.html']
      if (!html || html.type !== 'asset') this.error('Missing index.html')
      let output = String(html.source)
      const consumed = new Set<string>()
      output = output.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_tag, path: string) => {
        const name = path.replace(/^\.\//, ''), chunk = bundle[name]
        if (!chunk || chunk.type !== 'chunk' || chunk.imports.length || chunk.dynamicImports.length) this.error(`Non-inline script: ${path}`)
        consumed.add(name)
        return `<script type="module">${scriptForHtml(chunk.code)}</script>`
      })
      output = output.replace(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/g, (tag, path: string) => {
        if (!/rel="stylesheet"/.test(tag)) this.error(`Unexpected external link: ${path}`)
        const name = path.replace(/^\.\//, ''), asset = bundle[name]
        if (!asset || asset.type !== 'asset' || !name.endsWith('.css')) this.error(`Non-inline stylesheet: ${path}`)
        consumed.add(name)
        return `<style>${String(asset.source).replace(/<(?=\/style\b)/gi, '\\3c ')}</style>`
      })
      for (const name of consumed) delete bundle[name]
      if (Object.keys(bundle).some(name => name !== 'index.html')) this.error('Unexpected separate output: offline bundle would be incomplete')
      html.source = output
    },
  }
}

export function scriptForHtml(code: string): string {
  return code.replace(/<(?=\/script\b|!--)/gi, '\\x3c')
}
