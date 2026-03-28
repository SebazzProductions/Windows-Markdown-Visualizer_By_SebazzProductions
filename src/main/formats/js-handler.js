/**
 * JavaScript Format Handler
 */
const { registerFormat } = require('../format-registry');
const { js_beautify } = require('js-beautify');

registerFormat({
  id: 'javascript',
  extensions: ['.js', '.mjs', '.cjs'],
  label: 'JavaScript',
  detect: (filePath, content) => {
    return /\b(function|const|let|var|=>|import|export|require)\b/.test(content);
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
  }
});
