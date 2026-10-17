module.exports = {
  preset: 'ts-jest',
  // The golf backend has no test runner of its own, and CI only runs the api's (`npm run test -w api`),
  // so its tests are collected here. Without this line they would silently stop running in CI.
  roots: ['<rootDir>/test', '<rootDir>/../events/golf/backend/test'],
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: ["/node_modules/(?!(p-limit|yocto-queue))"],
};
