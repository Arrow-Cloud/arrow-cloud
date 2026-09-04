import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/submit-api.ts', 'src/submission-notifier.ts', 'src/score-processor.ts', 'src/read-api.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outdir: 'dist',
  format: 'esm',
  sourcemap: true,
  external: ['@aws-sdk/*'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  outExtension: { '.js': '.mjs' },
});

console.log('Build complete');
