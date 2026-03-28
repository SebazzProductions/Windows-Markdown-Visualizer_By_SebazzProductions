/**
 * CSS Format Handler
 */
const { registerFormat } = require('../format-registry');
const { css_beautify } = require('js-beautify');

registerFormat({
  id: 'css',
  extensions: ['.css'],
  label: 'CSS',
  detect: (filePath, content) => {
    return /[{}\s]*[a-zA-Z-]+\s*:\s*[^;]+;/.test(content);
  },
  format: (source) => {
    const formatted = css_beautify(source, {
      indent_size: 2,
      indent_char: ' ',
      end_with_newline: true,
      newline_between_rules: true
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
