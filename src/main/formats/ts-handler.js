/**
 * TypeScript Format Handler - format via js-beautify, transpile via sucrase
 */
const { registerFormat } = require('../format-registry');
const { js_beautify } = require('js-beautify');
const { transform } = require('sucrase');

registerFormat({
  id: 'typescript',
  extensions: ['.ts', '.tsx'],
  label: 'TypeScript',
  detect: (filePath, content) => {
    return /\b(interface|type\s+\w+\s*=|enum\s+|:\s*(string|number|boolean|any|void))\b/.test(content);
  },
  format: (source) => {
    const formatted = js_beautify(source, {
      indent_size: 2,
      indent_char: ' ',
      end_with_newline: true,
      preserve_newlines: true,
      max_preserve_newlines: 2,
      brace_style: 'collapse',
      space_before_conditional: true
    });

    const issues = [];
    const lines = source.split('\n');
    lines.forEach((line, i) => {
      if (/\t/.test(line)) {
        issues.push({ line: i + 1, message: 'Tab-Einrückung (Spaces empfohlen)', severity: 'info' });
      }
    });

    return { formatted, issues };
  },
  transpile: (source) => {
    try {
      const result = transform(source, {
        transforms: ['typescript'],
        disableESTransforms: true
      });
      return { code: result.code, error: null };
    } catch (err) {
      return { code: null, error: err.message };
    }
  }
});
