import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Content Security Policy for the production build: scripts only from this site, no inline
 * scripts. Inline styles stay allowed (KaTeX, React Flow and the charts position elements with them);
 * data:/blob: images are needed for the PNG/PDF export. Dev mode is left alone (Vite injects inline scripts).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const csp = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// GitHub Pages serves the site from /<repo>/ — the deploy workflow passes it in VITE_BASE.
const base = process.env.VITE_BASE ? `${process.env.VITE_BASE.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  base,
  plugins: [react(), csp()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    // jsPDF (loaded only for the PDF export) is the largest chunk
    chunkSizeWarningLimit: 600,
  },
});
