import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('electron/main.ts'), output: { entryFileNames: 'index.js' } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('electron/preload.ts'), output: { entryFileNames: 'index.js' } } },
  },
  renderer: {
    root: '.',
    base: './',
    plugins: [{ name: 'development-csp', apply: 'serve', transformIndexHtml: (html: string) => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';") }, react()],
    build: { minify: true, rollupOptions: { input: resolve('index.html') } },
  },
});
