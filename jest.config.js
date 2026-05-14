module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  moduleNameMapper: {
    'wx-server-sdk': '<rootDir>/tests/__mocks__/wx-server-sdk.js'
  }
}
