/**
 * Export-Dialog – PDF und HTML. Optionen werden in den Einstellungen gespeichert.
 */
const PDFExport = (() => {
  let modal, includeToc, lineNumbers, lineNumbersRow, includeTocRow, tocHint;
  let pageSize, orientation, pageNumbers, outline;
  let btnExport, btnHtml, btnCancel, btnClose;

  let getDocument = () => null;   // → { title, fileName, filePath, headings, isCodeView, theme }
  let exporting = false;

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
    btnCancel = document.getElementById('btn-pdf-cancel');
    btnClose = document.getElementById('btn-modal-close');

    btnClose.addEventListener('click', hideModal);
    btnCancel.addEventListener('click', hideModal);
    btnExport.addEventListener('click', exportPdf);
    btnHtml.addEventListener('click', exportHtml);
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
    includeTocRow.classList.toggle('hidden', isCode);
    tocHint.classList.toggle('hidden', isCode);
    lineNumbersRow.classList.toggle('hidden', !isCode);
    outline.closest('.checkbox-label').classList.toggle('hidden', isCode);
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

  function buildPayload(doc, options) {
    const bodyHtml = PreviewEngine.getExportHtml({ lineNumbers: options.lineNumbers });
    if (bodyHtml === null) return null;
    const baseName = (doc.fileName || 'dokument').replace(/\.[^.]+$/, '') || 'dokument';
    return {
      bodyHtml,
      title: doc.title || baseName,
      headings: doc.headings || [],
      baseDir: doc.filePath ? doc.filePath.replace(/[\\/][^\\/]*$/, '') : null,
      codeView: Boolean(doc.isCodeView),
      theme: doc.theme || 'light',
      options,
      baseName
    };
  }

  async function exportPdf() {
    if (exporting) return;
    const doc = getDocument();
    if (!doc) return;
    const options = collectOptions();
    const payload = buildPayload(doc, options);
    if (!payload) {
      Toast.warning('Diese Ansicht kann nicht als PDF exportiert werden. Wechseln Sie in die Code-Ansicht.');
      return;
    }
    const targetPath = typeof window.__mvE2ePdfTargetPath === 'string' ? window.__mvE2ePdfTargetPath : null;

    hideModal();
    exporting = true;
    const pending = Toast.info('PDF wird erstellt …', { duration: 0 });
    try {
      const result = await window.api.exportPDF({
        ...payload,
        defaultFileName: `${payload.baseName}.pdf`,
        targetPath
      });
      Toast.dismiss(pending);
      if (result.success) {
        Toast.success(`PDF gespeichert: ${result.filePath.split(/[\\/]/).pop()}`, {
          action: { label: 'Öffnen', onClick: () => window.api.openPath(result.filePath) },
          duration: 7000
        });
      } else if (!result.canceled) {
        Toast.error(`PDF-Export fehlgeschlagen: ${result.error || 'Unbekannter Fehler'}`);
      }
    } catch (err) {
      Toast.dismiss(pending);
      Toast.error(`PDF-Export fehlgeschlagen: ${err.message}`);
    } finally {
      exporting = false;
    }
  }

  async function exportHtml() {
    if (exporting) return;
    const doc = getDocument();
    if (!doc) return;
    const options = { ...collectOptions(), embedImages: true };
    const payload = buildPayload(doc, options);
    if (!payload) {
      Toast.warning('Diese Ansicht kann nicht als HTML exportiert werden.');
      return;
    }
    hideModal();
    exporting = true;
    try {
      const result = await window.api.exportHTML({
        ...payload,
        defaultFileName: `${payload.baseName}.html`,
        targetPath: typeof window.__mvE2eHtmlTargetPath === 'string' ? window.__mvE2eHtmlTargetPath : null
      });
      if (result.success) {
        Toast.success(`HTML gespeichert: ${result.filePath.split(/[\\/]/).pop()}`, {
          action: { label: 'Öffnen', onClick: () => window.api.openPath(result.filePath) },
          duration: 7000
        });
      } else if (!result.canceled) {
        Toast.error(`HTML-Export fehlgeschlagen: ${result.error || 'Unbekannter Fehler'}`);
      }
    } catch (err) {
      Toast.error(`HTML-Export fehlgeschlagen: ${err.message}`);
    } finally {
      exporting = false;
    }
  }

  return { init, applySettings, showModal, hideModal, isOpen, exportPdf, exportHtml };
})();
