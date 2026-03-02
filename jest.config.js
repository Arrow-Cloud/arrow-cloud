module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  modulePathIgnorePatterns: ['<rootDir>/cdk/cdk.out/'],
  transformIgnorePatterns: ["/node_modules/(?!(p-limit|yocto-queue))"],

};