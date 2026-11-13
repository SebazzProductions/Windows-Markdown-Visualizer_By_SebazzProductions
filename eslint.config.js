const js = require('@eslint/js');
const globals = require('globals');

const RENDERER_MODULES = ['Toast', 'TOCManager', 'ScrollSpy', 'PDFExport', 'EditorManager', 'PreviewEngine', 'FindBar', 'FixSyntaxManager'];

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'playwright-report/**', 'test-results/**', 'build/**', 'e2e/fixtures/**']
  },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    }
  },
  {
    files: ['e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        DOMPurify: 'readonly',
        Highlight: 'readonly',
        ...Object.fromEntries(RENDERER_MODULES.map(name => [name, 'readonly']))
      }
    },
    rules: {
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-unused-vars': ['error', {
        varsIgnorePattern: `^(${RENDERER_MODULES.join('|')})$`,
        argsIgnorePattern: '^_',
        caughtErrors: 'none'
      }]
    }
  }
];
