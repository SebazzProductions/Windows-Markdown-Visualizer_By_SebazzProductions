/**
 * HTML Format Handler
 */
const { registerFormat } = require('../format-registry');
const { formatCode } = require('./code-formatter');

registerFormat({
  id: 'html',
  kind: 'html',
  label: 'HTML',
  extensions: ['.html', '.htm', '.xhtml'],
  language: 'xml',
  detect: (_filePath, content) => /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(content),
  format: (source, filePath) => formatCode(source, filePath || '.html', { parser: 'html', fallback: 'html' })
});
