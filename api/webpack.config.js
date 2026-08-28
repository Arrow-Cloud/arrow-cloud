const path = require('path');
const webpack = require('webpack');
const { PrismaPlugin } = require('@prisma/nextjs-monorepo-workaround-plugin')
const CopyPlugin = require('copy-webpack-plugin');


module.exports = {
  entry: {
    index: './src/app.ts',
    'pack-processor': './src/pack-processor.ts',
    'discord-bot': './src/discord-bot.ts',
    'pack-popularity': './src/pack-popularity.ts',
    'user-stats': './src/user-stats.ts',
    'pack-leaderboard': './src/pack-leaderboard.ts',
    'websocket-connect': './src/websocket-connect.ts',
    'websocket-disconnect': './src/websocket-disconnect.ts',
    'websocket-sendmessage': './src/websocket-sendmessage.ts',
  },
  target: 'node',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        // @resvg/resvg-js ships prebuilt native .node binaries (one per platform) and requires
        // whichever one matches at runtime - node-loader copies the binary into the output dir
        // and rewrites the require() to point at it, instead of webpack trying to parse it as JS.
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.node'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs2',
  },
  plugins: [
    new PrismaPlugin({
      // This plugin is used to handle Prisma client generation in a monorepo setup
      // It ensures that the Prisma client is generated correctly for the Lambda environment
      // and avoids bundling issues with Prisma.
    }),
    new CopyPlugin({
      patterns: [
        { from: 'assets', to: 'assets' },
        // satori's text-shaping dependency (harfbuzzjs) loads this wasm binary at runtime,
        // relative to __dirname of whichever file requires it - since everything is bundled into
        // a single dist/index.js, that means dist/hb.wasm (not node_modules/harfbuzzjs/hb.wasm).
        { from: '../node_modules/harfbuzzjs/hb.wasm', to: 'hb.wasm' },
      ],
    }),
    // satori imports 'parse-css-color' (sometimes via a deep dist/*.js specifier, depending on
    // which of satori's ESM/CJS builds gets resolved) as a real default import. Webpack ends up
    // double-wrapping that package's ES module namespace under interop, so satori's internal
    // `colorParser.default(...)` call fails with "not a function" at render time. Regardless of
    // which exact specifier satori requests, redirect it to a plain CommonJS shim (see
    // src/utils/vendor-shims/parse-css-color-shim.js) that only needs a single interop wrap.
    new webpack.NormalModuleReplacementPlugin(/parse-css-color/, (resource) => {
      // Don't redirect the shim's own internal require() of the real package back to itself.
      if (resource.context && resource.context.includes('vendor-shims')) return;
      resource.request = path.resolve(__dirname, 'src/utils/vendor-shims/parse-css-color-shim.js');
    }),
  ],
  externals: {
    // Keep AWS SDK external as it's provided by Lambda runtime
    'aws-sdk': 'aws-sdk',
    '@aws-sdk/client-s3': '@aws-sdk/client-s3',
    '@aws-sdk/client-secrets-manager': '@aws-sdk/client-secrets-manager',
    '@aws-sdk/client-sns': '@aws-sdk/client-sns',
    '@aws-sdk/client-sqs': '@aws-sdk/client-sqs',
    '@aws-sdk/client-dynamodb': '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb': '@aws-sdk/lib-dynamodb',
    '@aws-sdk/client-apigatewaymanagementapi': '@aws-sdk/client-apigatewaymanagementapi',
    // Keep Prisma external to avoid bundling issues
    '@prisma/client': '@prisma/client',
    // Keep sharp external - provided by Lambda layer
    'sharp': 'commonjs sharp',
  },
  optimization: {
    minimize: true,
  },
  stats: {
    warningsFilter: [
      // Suppress common warnings that don't affect functionality
      /Critical dependency: the request of a dependency is an expression/,
      /Module not found: Error: Can't resolve 'encoding'/,
      // @resvg/resvg-js probes every platform's optional binary package at require-time; only the
      // ones actually installed (see api/package.json's optionalDependencies) are needed.
      /Module not found: Error: Can't resolve '@resvg\/resvg-js-/,
      /Module not found: Error: Can't resolve '\.\/resvgjs\./,
    ],
  },
};
