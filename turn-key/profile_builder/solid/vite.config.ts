import { defineConfig, loadEnv } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { join } from 'path';
import { readFile, readdir } from 'fs/promises';

const CONFIG_DIR = '/home/flintx/soma-nov/freshner-configs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const engineKey = env.ENGINE_KEY || process.env.ENGINE_KEY || '';

  return {
  plugins: [
    solidPlugin(),
    {
      name: 'serve-freshner-configs',
      configureServer(server) {
        server.middlewares.use('/freshner-configs', async (req, res) => {
          // Strip the /freshner-configs prefix from the URL
          const relativePath = req.url.replace(/^\/freshner-configs/, '');
          const filePath = join(CONFIG_DIR, relativePath || '');
          if (!filePath.startsWith(CONFIG_DIR)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }
          try {
            // If empty path, list directory contents as JSON
            if (!relativePath || relativePath === '/') {
              const files = await readdir(CONFIG_DIR);
              const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(jsonFiles));
              return;
            }
            // Otherwise serve the file
            const content = await readFile(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(content);
          } catch {
            res.statusCode = 404;
            res.end('Not found');
          }
        });
      },
    },
    {
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
        headers: engineKey ? { 'X-Peacock-Key': engineKey } : {},
      },
    },
  },
  };
});