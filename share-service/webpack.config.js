const path = require('path');
const { PrismaPlugin } = require('@prisma/nextjs-monorepo-workaround-plugin');

module.exports = {
  entry: {
    index: './src/lambda.ts',
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
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@api': path.resolve(__dirname, '../api/src'),
    },
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs2',
  },
  plugins: [
    new PrismaPlugin(),
  ],
  externals: {
    '@aws-sdk/client-s3': '@aws-sdk/client-s3',
    '@prisma/client': '@prisma/client',
    '@sparticuz/chromium': '@sparticuz/chromium',
    'puppeteer-core': 'puppeteer-core'
  },
  optimization: {
    minimize: false, // Disable for easier debugging
  },
  stats: {
    warningsFilter: [
      /Critical dependency: the request of a dependency is an expression/,
      /Module not found: Error: Can't resolve 'encoding'/,
      /Module not found: Error: Can't resolve 'bufferutil'/,
      /Module not found: Error: Can't resolve 'utf-8-validate'/,
      /Module not found: Error: Can't resolve 'puppeteer\/lib\/cjs\/puppeteer\/common/,
      /Module parse failed/,
    ],
  },
};
