const path = require('path');
const { PrismaPlugin } = require('@prisma/nextjs-monorepo-workaround-plugin')


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
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
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
    ],
  },
};
