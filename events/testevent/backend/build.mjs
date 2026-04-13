import * as esbuild from 'esbuild';

const entryPoints = ['src/score-processor.ts', 'src/scheduled-processor.ts', 'src/read-api.ts'];

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: 'node',
  target: 'node22',
  outdir: 'dist',
  format: 'esm',
  sourcemap: true,
  external: ['@aws-sdk/*'],
  banner: {
    // Required for ESM compatibility with some Node APIs
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  outExtension: { '.js': '.mjs' },
});

console.log('Build complete');
