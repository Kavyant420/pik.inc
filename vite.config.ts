import { defineConfig } from 'vite';

/**
 * The site is entirely static: no backend, no API keys, no runtime CDN.
 * The base is relative so the build can be served from any path.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
});
