/**
 * PDF Export - Dialog management and HTML generation for PDF export
 */
const PDFExport = (() => {
  let currentMarkdownSource = '';
  let currentHeadings = [];
  let currentFileName = 'dokument';

  /**
   * Set the current document data for export
   */
  function setDocumentData(source, headings, fileName) {
    currentMarkdownSource = source;
    currentHeadings = headings;
    currentFileName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'dokument';
  }

  /**
   * Show the export modal
   */
  function showModal() {
    const modal = document.getElementById('pdf-modal');
    modal.classList.remove('hidden');
    // Focus the export button
    document.getElementById('btn-pdf-export').focus();
  }

  /**
   * Hide the export modal
   */
  function hideModal() {
    const modal = document.getElementById('pdf-modal');
    modal.classList.add('hidden');
  }

  /**
   * Generate the full PDF HTML document
   */
  async function generatePdfHtml(includeToc) {
    const renderedHtml = await window.api.renderMarkdownToHtml(currentMarkdownSource);
    const tocHtml = includeToc ? TOCManager.generatePdfTocHtml(currentHeadings) : '';

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    /* PDF Base Styles */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
      color: #1a1c2e;
      line-height: 1.7;
      font-size: 11pt;
      padding: 0;
    }

    /* TOC Styles */
    .pdf-toc {
      padding: 1em 0;
    }
    .pdf-toc a {
      color: #4f6ef7;
      text-decoration: none;
    }
    .pdf-toc a:hover {
      text-decoration: underline;
    }

    /* Headings */
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.6em;
      font-weight: 600;
      line-height: 1.3;
      color: #1a1c2e;
    }
    h1 {
      font-size: 1.8em;
      font-weight: 700;
      padding-bottom: 0.35em;
      border-bottom: 2px solid #e2e5ef;
    }
    h2 {
      font-size: 1.4em;
      padding-bottom: 0.25em;
      border-bottom: 1px solid #e2e5ef;
    }
    h3 { font-size: 1.2em; }
    h4 { font-size: 1.05em; }
    h5 { font-size: 0.95em; }
    h6 { font-size: 0.85em; color: #5a5d7a; }
    h1:first-child { margin-top: 0; }

    /* Paragraphs */
    p { margin-bottom: 0.8em; }

    /* Links */
    a { color: #4f6ef7; text-decoration: none; }

    /* Lists */
    ul, ol { margin-bottom: 0.8em; padding-left: 1.5em; }
    li { margin-bottom: 0.25em; }

    /* Blockquote */
    blockquote {
      margin: 1em 0;
      padding: 0.6em 1em;
      border-left: 4px solid #4f6ef7;
      background: #f5f7ff;
      color: #5a5d7a;
      border-radius: 0 4px 4px 0;
    }
    blockquote > :last-child { margin-bottom: 0; }

    /* Code */
    code {
      font-family: 'Cascadia Code', 'Consolas', monospace;
      font-size: 0.88em;
      padding: 0.1em 0.35em;
      background: #f4f5f9;
      border: 1px solid #e2e5ef;
      border-radius: 3px;
      color: #d63384;
    }
    pre {
      margin: 1em 0;
      border-radius: 6px;
      overflow: hidden;
      background: #282c34;
    }
    pre code {
      display: block;
      padding: 1em 1.2em;
      background: #282c34;
      color: #abb2bf;
      border: none;
      border-radius: 0;
      font-size: 0.82em;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    /* Tables */
    table {
      width: 100%;
      margin: 1em 0;
      border-collapse: collapse;
    }
    th {
      font-weight: 600;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #5a5d7a;
      padding: 0.6em 0.8em;
      text-align: left;
      border-bottom: 2px solid #e2e5ef;
      background: #f5f6fa;
    }
    td {
      padding: 0.5em 0.8em;
      border-bottom: 1px solid #e2e5ef;
    }
    tbody tr:nth-child(even) { background: #fafbfd; }

    /* HR */
    hr {
      border: none;
      height: 2px;
      background: #e2e5ef;
      margin: 1.5em 0;
    }

    /* Images */
    img {
      max-width: 100%;
      height: auto;
    }

    /* Highlight.js inline overrides for PDF */
    .hljs { background: #282c34 !important; }
    .hljs-comment, .hljs-quote { color: #5c6370; font-style: italic; }
    .hljs-keyword { color: #c678dd; }
    .hljs-string { color: #98c379; }
    .hljs-number { color: #d19a66; }
    .hljs-built_in { color: #e6c07b; }
    .hljs-function, .hljs-title { color: #61afef; }
    .hljs-variable, .hljs-attr { color: #d19a66; }
    .hljs-tag, .hljs-name { color: #e06c75; }
    .hljs-attribute { color: #d19a66; }

    /* Page breaks */
    h1 { page-break-before: auto; }
    h1, h2, h3 { page-break-after: avoid; }
    pre, table, blockquote { page-break-inside: avoid; }
  </style>
</head>
<body>
  ${tocHtml}
  <div class="pdf-content">
    ${renderedHtml}
  </div>
</body>
</html>`;
  }

  /**
   * Execute the PDF export
   */
  async function exportPdf() {
    const includeToc = document.getElementById('pdf-include-toc').checked;
    const pageSize = document.getElementById('pdf-page-size').value;
    const targetPath = typeof window.__mvE2ePdfTargetPath === 'string'
      ? window.__mvE2ePdfTargetPath
      : null;

    const htmlContent = await generatePdfHtml(includeToc);

    hideModal();

    const result = await window.api.exportPDF(htmlContent, {
      defaultFileName: `${currentFileName}.pdf`,
      pageSize: pageSize,
      targetPath: targetPath
    });

    if (result.success) {
      // Could show a success notification
      console.log('PDF exported:', result.filePath);
    } else if (result.error) {
      console.error('PDF export failed:', result.error);
    }
  }

  /**
   * Initialize modal event listeners
   */
  function initModal() {
    document.getElementById('btn-modal-close').addEventListener('click', hideModal);
    document.getElementById('btn-pdf-cancel').addEventListener('click', hideModal);
    document.getElementById('btn-pdf-export').addEventListener('click', exportPdf);

    // Close on backdrop click
    document.getElementById('pdf-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        hideModal();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('pdf-modal').classList.contains('hidden')) {
        hideModal();
      }
    });
  }

  return { setDocumentData, showModal, hideModal, initModal };
})();
