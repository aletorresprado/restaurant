import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'node:url';
import { webHeaders, webPolicy } from './security-policy';

// Server-side only: lets isolated browser tests use their own API process.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  optimizeDeps: { include: ['date-fns-tz'] },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss(), {
    name: 'production-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy',
        content: webPolicy(false, false) }, injectTo: 'head-prepend' }],
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'security-headers.json',
        source: JSON.stringify(webHeaders(), null, 2) + '\n' });
    },
  }],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@repo/config': fileURLToPath(new URL('../../packages/config/src/index.ts', import.meta.url)),
      '@repo/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
      '@repo/validation': fileURLToPath(
        new URL('../../packages/validation/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { headers: webHeaders(true),
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**'] },
    proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
  preview: { headers: webHeaders(),
    proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
});
