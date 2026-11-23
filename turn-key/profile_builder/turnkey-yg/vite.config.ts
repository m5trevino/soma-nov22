import { defineConfig, loadEnv } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig(({ mode }) => {
  // Engine key for inference routes. Read from .env.local (gitignored) so
  // `npm run dev` works with no shell setup, and so the key is never
  // compiled into a bundle or sent to the browser.
  const env = loadEnv(mode, process.cwd(), '');
  const engineKey = env.ENGINE_KEY || process.env.ENGINE_KEY || '';

  return {
  plugins: [
    solidPlugin(),
    {
      // Dev keeps `/v1` so the Vite proxy is used. Built files need an
      // absolute engine URL because they may be served from anywhere.
      name: 'inject-production-engine-base',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(
          '</body>',
          `  <script>\n    window.__engineBaseUrl = 'https://engine.save-aichats.com/v1';\n  </script>\n</body>`,
        );
      },
    },
  ],
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/v1': {
        target: 'https://engine.save-aichats.com',
        changeOrigin: true,
        secure: true,
        // Attached here, on the dev server. The browser never holds the key.
        headers: engineKey ? { 'X-Peacock-Key': engineKey } : {},
      },
    },
  },
  };
});