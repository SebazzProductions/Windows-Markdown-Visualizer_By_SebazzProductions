/**
 * JavaScript Format Handler
 */
const { registerFormat } = require('../format-registry');
const { formatCode } = require('./code-formatter');

registerFormat({
  id: 'javascript',
  kind: 'script',
  label: 'JavaScript',
  extensions: ['.js', '.mjs', '.cjs', '.jsx'],
  language: 'javascript',
  detect: (_filePath, content) => /\b(function\s*\w*\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|=>|module\.exports|require\(|import\s+.+\s+from\s+['"])/.test(content),
  format: (source, filePath) => formatCode(source, filePath || '.js', { fallback: 'script' })
});
