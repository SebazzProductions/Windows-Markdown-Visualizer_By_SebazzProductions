/**
 * Text Format Handler - plain text fallback
 */
const { registerFormat } = require('../format-registry');

registerFormat({
  id: 'text',
  extensions: ['.txt', '.log', '.cfg', '.ini', '.env'],
  label: 'Text',
  detect: () => true, // Fallback
  format: (source) => {
    let formatted = source;
    // Normalize line endings
    formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Remove trailing whitespace
    formatted = formatted.replace(/[ \t]+$/gm, '');
    // Collapse 3+ blank lines to 2
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    // Ensure trailing newline
    if (formatted.length > 0 && !formatted.endsWith('\n')) {
      formatted += '\n';
    }
    return { formatted, issues: [] };
  }
});
