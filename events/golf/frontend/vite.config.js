import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// In production the site is served by CloudFront, which routes `/api/*` to golf's read-api Lambda
// (see cdk/lib/event-site-stack.ts). That makes the API same-origin, so application code can just
// fetch `/api/activity` with no base URL to configure anywhere.
//
// The dev server has no such routing, so it proxies the same prefix to the deployed read API. The
// point is that the fetch path is identical in both environments - the alternative, branching on an
// env var at call sites, is what leaves dev and prod able to drift apart.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const readApiUrl = env.VITE_GOLF_READ_API_URL;

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../../../frontend/src'),
      },
    },
    server: readApiUrl
      ? {
          proxy: {
            '/api': {
              target: readApiUrl.replace(/\/+$/, ''),
              changeOrigin: true, // a Lambda Function URL rejects a Host header that isn't its own
              rewrite: (p) => p.replace(/^\/api/, ''),
            },
          },
        }
      : undefined,
  };
});
