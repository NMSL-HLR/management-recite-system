/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { singleFile } from './scripts/single-file'

export default defineConfig({
  plugins: [react(), singleFile(), {
    name: 'offline-content-policy', apply: 'build',
    transformIndexHtml: { order: 'post', handler: () => [{ tag: 'meta', attrs: {
      'http-equiv': 'Content-Security-Policy',
      content: "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'",
    }, injectTo: 'head-prepend' }] },
  }],
  base: './',
  build: {
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 5000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
