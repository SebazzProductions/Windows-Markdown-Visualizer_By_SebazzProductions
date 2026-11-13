/**
 * Export-Dialog – PDF, HTML und (für Diagramme) SVG. Optionen werden in den Einstellungen gespeichert.
 */
const PDFExport = (() => {
  let modal, includeToc, lineNumbers, lineNumbersRow, includeTocRow, tocHint;
  let pageSize, orientation, pageNumbers, outline;
  let btnExport, btnHtml, btnSvg, btnCancel, btnClose;

  let getDocument = () => null;   // → { title, fileName, filePath, headings, isCodeView, isDiagramView, theme }
  let exporting = false;
  const t = (key, params) => I18n.t(key, params);

  function init(options = {}) {
    getDocument = options.getDocument || getDocument;

    modal = document.getElementById('pdf-modal');
    includeToc = document.getElementById('pdf-include-toc');
    includeTocRow = document.getElementById('pdf-include-toc-row');
    tocHint = document.getElementById('pdf-toc-hint');
    lineNumbers = document.getElementById('pdf-line-numbers');
    lineNumbersRow = document.getElementById('pdf-line-numbers-row');
    pageSize = document.getElementById('pdf-page-size');
    orientation = document.getElementById('pdf-orientation');
    pageNumbers = document.getElementById('pdf-page-numbers');
    outline = document.getElementById('pdf-outline');
    btnExport = document.getElementById('btn-pdf-export');
    btnHtml = document.getElementById('btn-html-export');
    btnSvg = document.getElementById('btn-svg-export');
    btnCancel = document.getElementById('btn-pdf-cancel');
    btnClose = document.getElementById('btn-modal-close');

    btnClose.addEventListener('click', hideModal);
    btnCancel.addEventListener('click', hideModal);
    btnExport.addEventListener('click', exportPdf);
    btnHtml.addEventListener('click', exportHtml);
    btnSvg.addEventListener('click', exportSvg);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal();
    });
  }

  function applySettings(pdf) {
    if (!pdf) return;
    includeToc.checked = pdf.includeToc !== false;
    pageSize.value = pdf.pageSize || 'A4';
    orientation.value = pdf.landscape ? 'landscape' : 'portrait';
    pageNumbers.checked = pdf.pageNumbers !== false;
    lineNumbers.checked = Boolean(pdf.lineNumbers);
    outline.checked = pdf.outline !== false;
  }

  function showModal() {
    const doc = getDocument();
    if (!doc) return;
    const isCode = Boolean(doc.isCodeView);
    const isDiagram = Boolean(doc.isDiagramView);
    includeTocRow.classList.toggle('hidden', isCode || isDiagram);
    tocHint.classList.toggle('hidden', isCode || isDiagram);
    lineNumbersRow.classList.toggle('hidden', !isCode);
    outline.closest('.checkbox-label').classList.toggle('hidden', isCode || isDiagram);
    btnSvg.classList.toggle('hidden', !isDiagram);
    modal.classList.remove('hidden');
    btnExport.focus();
  }

  function hideModal() {
    modal.classList.add('hidden');
  }

  function isOpen() {
    return modal && !modal.classList.contains('hidden');
  }

  function collectOptions() {
    return {
      includeToc: includeToc.checked,
      pageSize: pageSize.value,
      landscape: orientation.value === 'landscape',
      pageNumbers: pageNumbers.checked,
      lineNumbers: lineNumbers.checked,
      outline: outline.checked
    };
  }

  async function buildPayload(doc, options, theme) {
    const bodyHtml = await PreviewEngine.getExportHtml({ lineNumbers: options.lineNumbers, theme });
    if (bodyHtml === null) return null;
    const baseName = (doc.fileName || 'dokument').replace(/\.[^.]+$/, '') || 'dokument';
    return {
      bodyHtml,
      title: doc.title || baseName,
      headings: doc.headings || [],
      baseDir: doc.filePath ? doc.filePath.replace(/[\\/][^\\/]*$/, '') : null,
      codeView: Boolean(doc.isCodeView) || Boolean(doc.isDiagramView),
      theme,
      options,
      baseName
    };
  }

  function fileNameOf(p) {
    return String(p || '').split(/[\\/]/).pop();
  }

  async function exportPdf() {
    if (exporting) return;
    const doc = getDocument();
    if (!doc) return;
    const options = collectOptions();
    hideModal();
    exporting = true;
    const pending = Toast.info(t('export.pdfCreating'), { duration: 0 });
    try {
      const payload = await buildPayload(doc, options, 'light');
      if (!payload) {
        Toast.dismiss(pending);
        Toast.warning(t('export.notPdf'));
        return;
      }
      const result = await window.api.exportPDF({
        ...payload,
        defaultFileName: `${payload.baseName}.pdf`,
        targetPath: typeof window.__mvE2ePdfTargetPath === 'string' ? window.__mvE2ePdfTargetPath : null
      });
      Toast.dismiss(pending);
      if (result.success) {
        Toast.success(t('export.pdfSaved', { name: fileNameOf(result.filePath) }), {
          action: { label: t('common.open'), onClick: () => window.api.openPath(result.filePath) },
          duration: 7000
        });
      } else if (!result.canceled) {
        Toast.error(t('export.pdfFailed', { error: result.error || t('export.unknownError') }));
      }
    } catch (err) {
      Toast.dismiss(pending);
      Toast.error(t('export.pdfFailed', { error: err.message }));
    } finally {
      exporting = false;
    }
  }

  async function exportHtml() {
    if (exporting) return;
    const doc = getDocument();
    if (!doc) return;
    const options = { ...collectOptions(), embedImages: true };
    hideModal();
    exporting = true;
    try {
      const payload = await buildPayload(doc, options, doc.theme || 'light');
      if (!payload) {
        Toast.warning(t('export.notHtml'));
        return;
      }
      const result = await window.api.exportHTML({
        ...payload,
        defaultFileName: `${payload.baseName}.html`,
        targetPath: typeof window.__mvE2eHtmlTargetPath === 'string' ? window.__mvE2eHtmlTargetPath : null
      });
      if (result.success) {
        Toast.success(t('export.htmlSaved', { name: fileNameOf(result.filePath) }), {
          action: { label: t('common.open'), onClick: () => window.api.openPath(result.filePath) },
          duration: 7000
        });
      } else if (!result.canceled) {
        Toast.error(t('export.htmlFailed', { error: result.error || t('export.unknownError') }));
      }
    } catch (err) {
      Toast.error(t('export.htmlFailed', { error: err.message }));
    } finally {
      exporting = false;
    }
  }

  async function exportSvg() {
    if (exporting) return;
    const doc = getDocument();
    if (!doc) return;
    hideModal();
    const svg = PreviewEngine.getDiagramSvg();
    if (!svg) {
      Toast.warning(t('export.notSvg'));
      return;
    }
    exporting = true;
    try {
      const baseName = (doc.fileName || 'diagramm').replace(/\.[^.]+$/, '') || 'diagramm';
      const result = await window.api.exportSVG({
        svg,
        defaultFileName: `${baseName}.svg`,
        targetPath: typeof window.__mvE2eSvgTargetPath === 'string' ? window.__mvE2eSvgTargetPath : null
      });
      if (result.success) {
        Toast.success(t('export.svgSaved', { name: fileNameOf(result.filePath) }), {
          action: { label: t('common.open'), onClick: () => window.api.openPath(result.filePath) },
          duration: 7000
        });
      } else if (!result.canceled) {
        Toast.error(t('export.svgFailed', { error: result.error || t('export.unknownError') }));
      }
    } catch (err) {
      Toast.error(t('export.svgFailed', { error: err.message }));
    } finally {
      exporting = false;
    }
  }

  return { init, applySettings, showModal, hideModal, isOpen, exportPdf, exportHtml, exportSvg };
})();
