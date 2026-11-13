/**
 * Markdown Format Handler – Rendering über markdown-engine, Korrekturen über markdown-formatter
 */
const { registerFormat } = require('../format-registry');
const { renderMarkdown, renderMarkdownToHtml, extractHeadings } = require('../markdown-engine');
const { formatMarkdown } = require('./markdown-formatter');

registerFormat({
  id: 'markdown',
  kind: 'markdown',
  label: 'Markdown',
  extensions: ['.md', '.markdown', '.mdown', '.mkd', '.mdx'],
  language: 'markdown',
  detect: (_filePath, content) => /^#{1,6}\s|^\s*[-*+]\s+\S|^>\s|^```|^\s*\d+\.\s+\S|\[.+\]\(.+\)/m.test(content),
  render: (source) => renderMarkdown(source),
  renderHtml: (source) => renderMarkdownToHtml(source),
  extractHeadings: (source) => extractHeadings(source),
  format: (source) => formatMarkdown(source)
});
