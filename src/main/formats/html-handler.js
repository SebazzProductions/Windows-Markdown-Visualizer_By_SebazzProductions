/**
 * HTML Format Handler
 */
const { registerFormat } = require('../format-registry');
const { html_beautify } = require('js-beautify');

registerFormat({
  id: 'html',
  extensions: ['.html', '.htm'],
  label: 'HTML',
  detect: (filePath, content) => {
    return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(content);
  },
  format: (source) => {
    const formatted = html_beautify(source, {
      indent_size: 2,
      indent_char: ' ',
      wrap_line_length: 120,
      preserve_newlines: true,
      max_preserve_newlines: 2,
      end_with_newline: true,
      indent_inner_html: true
    });

    const issues = [];
    // Detect common HTML issues
    const lines = source.split('\n');
    lines.forEach((line, i) => {
      if (/<img\b[^>]*(?!\/\s*>)[^>]*>/.test(line) && !line.includes('/>')) {
        // Not an error in HTML5, just informational
      }
      if (/\t/.test(line)) {
        issues.push({ line: i + 1, message: 'Tab-Einrückung (Spaces empfohlen)', severity: 'info' });
      }
    });

    return { formatted, issues };
  }
});
