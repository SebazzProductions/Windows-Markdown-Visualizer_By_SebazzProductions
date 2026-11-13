/**
 * CSS / SCSS / LESS Format Handler
 */
const { registerFormat } = require('../format-registry');
const { formatCode } = require('./code-formatter');

registerFormat({
  id: 'css',
  kind: 'css',
  label: 'Stylesheets',
  extensions: ['.css', '.scss', '.less'],
  language: 'css',
  detect: (_filePath, content) => /^[^{}]*\{[^{}]*[a-z-]+\s*:\s*[^;]+;[^{}]*\}/im.test(content),
  format: (source, filePath) => formatCode(source, filePath || '.css', { fallback: 'css' })
});
