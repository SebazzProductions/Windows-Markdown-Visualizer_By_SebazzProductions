/**
 * Text Format Handler – Fallback für reine Textdateien
 */
const { registerFormat } = require('../format-registry');
const { collectGenericIssues } = require('./code-formatter');

registerFormat({
  id: 'text',
  kind: 'text',
  label: 'Text',
  extensions: ['.txt', '.log', '.cfg', '.ini', '.env', '.csv', '.tsv', '.gitignore', '.editorconfig', '.lock', '.license'],
  language: 'plaintext',
  detect: () => true,
  format: (source) => {
    const issues = [];
    let formatted = String(source ?? '').replace(/\r\n?/g, '\n');
    collectGenericIssues(formatted, issues);
    formatted = formatted.replace(/[ \t]+$/gm, '');
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    if (formatted.length > 0 && !formatted.endsWith('\n')) formatted += '\n';
    return { formatted, issues };
  }
});
