module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(@nestjs/bullmq|@nestjs/bull-shared|bullmq|@nestjs/event-emitter|pg-boss|@pg-boss)/)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@infra/(.*)$': '<rootDir>/src/infra/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/tests/**',
    '!src/db/migrations/**',
    '!src/db/seeds/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};


