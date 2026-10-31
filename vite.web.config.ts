import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [{ name: 'development-csp', apply: 'serve', transformIndexHtml: (html: string) => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';") }, react()], server: { port: 5173, strictPort: true } });
