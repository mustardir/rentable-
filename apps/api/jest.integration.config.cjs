module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: 'test/.*\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(.{1,2}/.*)\\.js$': '$1',
  },
};
