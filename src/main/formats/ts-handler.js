/**
 * TypeScript Format Handler – Formatierung via Prettier, Transpilation via Sucrase
 */
const { registerFormat } = require('../format-registry');
const { formatCode } = require('./code-formatter');
const { transform } = require('sucrase');

registerFormat({
  id: 'typescript',
  kind: 'script',
  label: 'TypeScript',
  extensions: ['.ts', '.tsx', '.mts', '.cts'],
  language: 'typescript',
  detect: (_filePath, content) => /\b(interface\s+\w+|type\s+\w+\s*=|enum\s+\w+|:\s*(string|number|boolean|any|void|unknown)\b)/.test(content),
  format: (source, filePath) => formatCode(source, filePath || '.ts', { fallback: 'script' }),
  transpile: (source) => {
    try {
      const result = transform(source, {
        transforms: ['typescript', 'jsx'],
        jsxRuntime: 'classic',
        disableESTransforms: true
      });
      return { code: result.code, error: null };
    } catch (err) {
      return { code: null, error: err.message };
    }
  }
});
