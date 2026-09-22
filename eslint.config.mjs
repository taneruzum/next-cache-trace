import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', '**/*.d.ts', 'node_modules/**', '.npm-cache/**'] },
  {
    files: ['src/**/*.ts', 'bin/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.js', 'packages/eslint-plugin/*.js'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-duplicate-case': 'error',
      'no-unsafe-finally': 'error',
      'eqeqeq': ['error', 'always'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }]
    },
    plugins: { '@typescript-eslint': tseslint.plugin }
  }
];
