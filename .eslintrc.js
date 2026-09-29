module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [
    '.eslintrc.js',
    'dist',
    'node_modules',
    'coverage',
    'src/db/migrations',
    'src/tests/**',
    '**/*.js',
  ],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@modules/*/**', '!@modules/*/index', '!@modules/*'],
            message: 'Import another module only through its index.ts public API (e.g. @modules/<module>). Direct internal imports are forbidden.',
          },
          {
            group: ['../*/models/**', '../*/services/**', '../*/controllers/**', '../*/repositories/**'],
            message: 'Cross-module relative imports are forbidden. Use @modules/<name> public API instead.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['src/shared/**/*.ts', 'src/infra/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@modules/**', 'src/modules/**'],
                message: '@shared and @infra layers must not import from @modules.',
              },
            ],
          },
        ],
      },
    },
  ],
};
