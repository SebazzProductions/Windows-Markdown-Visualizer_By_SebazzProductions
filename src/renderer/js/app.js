/**
 * App - Main renderer entry point, orchestrates all modules
 */
(function () {
  'use strict';

  // ---- State ----
  let currentFilePath = null;
  let currentSource = '';
  let currentHeadings = [];
  let currentZoom = 100;
  let tocVisible = true;
  let currentMode = 'visualizer'; // 'visualizer' | 'editor' | 'fix-syntax'
  let currentFormat = 'text';     // format id from registry
  let currentFormatLabel = '';
  let isDirty = false;

  // ---- DOM References ----
  const welcomeScreen = document.getElementById('welcome-screen');
  const appLayout = document.getElementById('app-layout');
  const tocSidebar = document.getElementById('toc-sidebar');
  const tocContent = document.getElementById('toc-content');
  const btnCollapseToc = document.getElementById('btn-collapse-toc');
  const btnExpandToc = document.getElementById('btn-expand-toc');
  const contentArea = document.getElementById('markdown-content');
  const fileNameEl = document.getElementById('file-name');
  const formatBadge = document.getElementById('format-badge');
  const dirtyIndicator = document.getElementById('dirty-indicator');
  const btnOpenFile = document.getElementById('btn-open-file');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const btnExportPdf = document.getElementById('btn-export-pdf');
  const btnRunCode = document.getElementById('btn-run-code');
  const btnHelp = document.getElementById('btn-help');
  const helpModal = document.getElementById('help-modal');
  const btnHelpClose = document.getElementById('btn-help-close');
  const dropOverlay = document.getElementById('drop-overlay');
  const dropMessageText = document.getElementById('drop-message-text');
  const dropMessageHint = document.getElementById('drop-message-hint');
  const dropDecisionModal = document.getElementById('drop-decision-modal');
  const dropDecisionTitle = document.getElementById('drop-decision-title');
  const dropDecisionFile = document.getElementById('drop-decision-file');
  const dropDecisionMessage = document.getElementById('drop-decision-message');
  const btnDropDecisionClose = document.getElementById('btn-drop-decision-close');
  const btnDropInsert = document.getElementById('btn-drop-insert');
  const btnDropOpen = document.getElementById('btn-drop-open');
  const btnDropCancel = document.getElementById('btn-drop-cancel');

  // Panels
  const visualizerPanel = document.getElementById('visualizer-panel');
  const editorPanel = document.getElementById('editor-panel');
  const fixSyntaxPanel = document.getElementById('fix-syntax-panel');

  // Tab buttons
  const tabButtons = document.querySelectorAll('.tab-btn');

  // Goto dialog
  const gotoDialog = document.getElementById('goto-dialog');
  const gotoInput = document.getElementById('goto-input');
  const btnGotoGo = document.getElementById('btn-goto-go');
  const btnGotoClose = document.getElementById('btn-goto-close');
  let dragCounter = 0;
  let dropDecisionResolver = null;
  let pendingDropSelection = null;

  // ---- Initialize Modules ----
  TOCManager.init(tocContent, navigateToHeading);
  ScrollSpy.init(contentArea, (headingId) => {
    TOCManager.setActive(headingId);
  });
  PDFExport.initModal();
  PreviewEngine.init();

  EditorManager.init(
    document.getElementById('editor-textarea'),
    document.getElementById('line-gutter'),
    (newContent) => {
      currentSource = newContent;
      setDirty(true);
    }
  );

  FixSyntaxManager.init({
    onApply: async (fixedSource) => {
      currentSource = fixedSource;
      setDirty(true);
      EditorManager.setContent(fixedSource);
      FixSyntaxManager.setSource(fixedSource, currentFilePath);
      // Refresh visualizer
      await refreshVisualizer();
      // Re-analyze with new source
      FixSyntaxManager.analyze(fixedSource, currentFilePath);
    },
    getSource: () => currentSource
  });

  // ---- Theme ----
  function initTheme() {
    const saved = localStorage.getItem('mv-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mv-theme', next);
  }

  initTheme();

  // ---- TOC Sidebar Toggle ----
  function setTocVisible(visible) {
    tocVisible = visible;
    syncTocVisibility();
  }

  function toggleToc() {
    if (currentFormat !== 'markdown') return;
    setTocVisible(!tocVisible);
  }

  function updateExecutionUi() {
    const executableFormats = ['javascript', 'typescript'];
    const canExecute = executableFormats.includes(currentFormat);
    PreviewEngine.showRunButton(canExecute);
    PreviewEngine.setExecutionMode(false);
    btnRunCode.classList.remove('active');
    btnRunCode.title = 'Code ausführen (Ctrl+R)';
  }

  function updateDropOverlayText() {
    if (!dropMessageText || !dropMessageHint) return;

    if (!currentFilePath || currentMode === 'visualizer') {
      dropMessageText.textContent = 'Datei zum Öffnen ablegen';
      dropMessageHint.textContent = 'Die Anwendung öffnet die abgelegte Datei zur Bearbeitung.';
      return;
    }

    if (currentMode === 'editor') {
      dropMessageText.textContent = 'Datei im Editor ablegen';
      dropMessageHint.textContent = 'Nach dem Ablegen können Sie den Inhalt an der aktuellen Cursorposition einfügen oder als neues Dokument öffnen.';
      return;
    }

    dropMessageText.textContent = 'Datei für Fix Syntax ablegen';
    dropMessageHint.textContent = 'Nach dem Ablegen können Sie den Inhalt in dieses Dokument einfügen oder die Datei separat in Fix Syntax bearbeiten.';
  }

  function hasDropPayload(dataTransfer) {
    if (!dataTransfer) return false;
    const types = Array.from(dataTransfer.types || []);
    return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain');
  }

  function parseDroppedPathFromText(text) {
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    if (/^file:/i.test(trimmed)) {
      return fileUriToPath(trimmed);
    }

    if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  function fileUriToPath(fileUri) {
    try {
      const parsed = new URL(fileUri);
      if (parsed.protocol !== 'file:') return null;

      let pathname = decodeURIComponent(parsed.pathname || '');
      if (/^\/[A-Za-z]:/.test(pathname)) {
        pathname = pathname.slice(1);
      }

      return pathname.replace(/\//g, '\\');
    } catch (_) {
      return null;
    }
  }

  async function extractDroppedFilePath(dataTransfer) {
    if (!dataTransfer) return null;

    const file = dataTransfer.files && dataTransfer.files[0];
    if (file) {
      const filePath = window.api.getDroppedFilePath(file);
      if (filePath) {
        return filePath;
      }
    }

    const uriList = dataTransfer.getData('text/uri-list');
    if (uriList) {
      const lines = uriList.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
      const fromUriList = parseDroppedPathFromText(lines[0]);
      if (fromUriList) {
        return fromUriList;
      }
    }

    return parseDroppedPathFromText(dataTransfer.getData('text/plain'));
  }

  function showDropDecision(filePath) {
    const fileName = filePath.split(/[\\/]/).pop();
    pendingDropSelection = EditorManager.getSelection();

    if (currentMode === 'fix-syntax') {
      dropDecisionTitle.textContent = 'Datei in Fix Syntax ablegen';
      dropDecisionMessage.textContent = `Möchten Sie den Inhalt von ${fileName} in dieses Dokument einfügen oder die Datei als neues Dokument in Fix Syntax bearbeiten?`;
      btnDropOpen.textContent = 'Als neues Dokument bearbeiten';
      btnDropInsert.textContent = 'In dieses Dokument einfügen';
    } else {
      dropDecisionTitle.textContent = 'Datei im Editor ablegen';
      dropDecisionMessage.textContent = `Möchten Sie den Inhalt von ${fileName} an der aktuellen Cursorposition einfügen oder die Datei als neues Dokument öffnen?`;
      btnDropOpen.textContent = 'Als neues Dokument öffnen';
      btnDropInsert.textContent = 'An Cursorposition einfügen';
    }

    dropDecisionFile.textContent = filePath;
    dropDecisionModal.classList.remove('hidden');
    btnDropInsert.focus();

    return new Promise(resolve => {
      dropDecisionResolver = resolve;
    });
  }

  function resolveDropDecision(decision) {
    dropDecisionModal.classList.add('hidden');
    if (dropDecisionResolver) {
      dropDecisionResolver(decision);
      dropDecisionResolver = null;
    }
    if (decision !== 'insert') {
      pendingDropSelection = null;
    }
  }

  async function openDocument(filePath, options = {}) {
    if (options.respectDirty !== false && isDirty && !confirmDiscard()) {
      return false;
    }

    return loadFile(filePath, options);
  }

  async function insertDroppedFile(filePath) {
    const result = await window.api.readFile(filePath);
    EditorManager.insertTextAtCursor(result.content, pendingDropSelection);
    pendingDropSelection = null;
    currentSource = EditorManager.getContent();
    setDirty(true);
    await refreshVisualizer();

    if (currentMode === 'fix-syntax') {
      FixSyntaxManager.setSource(currentSource, currentFilePath);
      await FixSyntaxManager.analyze(currentSource, currentFilePath);
    }
  }

  async function handleDroppedFile(filePath) {
    if (!filePath) return;

    try {
      if (!currentFilePath || currentMode === 'visualizer') {
        await openDocument(filePath, { targetMode: 'visualizer' });
        return;
      }

      const decision = await showDropDecision(filePath);
      if (decision === 'insert') {
        await insertDroppedFile(filePath);
      } else if (decision === 'open') {
        await openDocument(filePath, { targetMode: currentMode });
      }
    } catch (err) {
      console.error('Drop handling failed:', err);
    } finally {
      pendingDropSelection = null;
    }
  }

  function syncTocVisibility() {
    if (currentFormat !== 'markdown') {
      tocSidebar.classList.add('collapsed');
      btnExpandToc.classList.add('hidden');
      return;
    }

    tocSidebar.classList.toggle('collapsed', !tocVisible);
    btnExpandToc.classList.toggle('hidden', tocVisible);
  }

  // ---- Navigation ----
  function navigateToHeading(headingId) {
    const target = contentArea.querySelector(`#${CSS.escape(headingId)}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---- Mode / Tab Switching ----
  function switchMode(mode) {
    // Guard: no file loaded yet
    if (!currentFilePath && mode !== 'visualizer') return;

    currentMode = mode;

    // Update tab buttons
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Show/hide panels
    visualizerPanel.classList.toggle('hidden', mode !== 'visualizer');
    editorPanel.classList.toggle('hidden', mode !== 'editor');
    fixSyntaxPanel.classList.toggle('hidden', mode !== 'fix-syntax');

    // Panel-specific setup
    if (mode === 'editor') {
      EditorManager.setContent(currentSource);
      EditorManager.setFormatLabel(currentFormatLabel);
      EditorManager.focus();
    } else if (mode === 'fix-syntax') {
      if (currentSource && currentFilePath) {
        FixSyntaxManager.setSource(currentSource, currentFilePath);
        FixSyntaxManager.analyze(currentSource, currentFilePath);
      }
    } else if (mode === 'visualizer') {
      syncTocVisibility();
      refreshVisualizer();
    }
  }

  // Tab click handlers
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchMode(btn.dataset.mode);
    });
  });

  // ---- Dirty State ----
  function setDirty(dirty) {
    isDirty = dirty;
    dirtyIndicator.classList.toggle('hidden', !dirty);
    updateTitle();
  }

  function updateTitle() {
    if (!currentFilePath) return;
    const fileName = currentFilePath.split(/[/\\]/).pop();
    const prefix = isDirty ? '● ' : '';
    window.api.setTitle(`${prefix}${fileName} – Markdown Visualizer`);
  }

  // ---- File Loading ----
  async function openFileDialog() {
    if (isDirty && !confirmDiscard()) return;
    try {
      const filePath = await window.api.openFile();
      if (filePath) {
        await loadFile(filePath, { targetMode: 'visualizer' });
      }
    } catch (err) {
      console.error('openFileDialog error:', err);
    }
  }

  function confirmDiscard() {
    return confirm('Es gibt ungespeicherte Änderungen. Verwerfen?');
  }

  async function loadFile(filePath, options = {}) {
    const targetMode = options.preserveMode ? currentMode : (options.targetMode || 'visualizer');

    try {
      const result = await window.api.readFile(filePath);
      currentFilePath = result.filePath;
      currentSource = result.content;
      currentHeadings = [];
      setDirty(false);

      // Detect format
      const fmt = await window.api.detectFormat(result.filePath, result.content);
      currentFormat = fmt.id;
      currentFormatLabel = fmt.label;

      // Update UI
      fileNameEl.textContent = result.fileName;
      formatBadge.textContent = fmt.label;
      formatBadge.classList.remove('hidden');
      updateTitle();

      // Show/hide TOC based on format
      tocVisible = currentFormat === 'markdown';
      syncTocVisibility();

      updateExecutionUi();

      // Render in visualizer
      await refreshVisualizer();

      // Set editor content
      EditorManager.setContent(result.content);
      EditorManager.setFormatLabel(fmt.label);

      // Show app layout, hide welcome
      welcomeScreen.classList.add('hidden');
      appLayout.classList.remove('hidden');

      // Switch to the requested mode
      switchMode(targetMode);

      // Watch file for external changes
      window.api.watchFile(result.filePath);

      return true;

    } catch (err) {
      console.error('Failed to load file:', err);
      return false;
    }
  }

  async function refreshVisualizer() {
    if (!currentSource) return;

    if (currentFormat === 'markdown') {
      const headings = await PreviewEngine.renderMarkdown(currentSource);
      if (headings) {
        currentHeadings = headings;
        TOCManager.update(headings);
        PDFExport.setDocumentData(currentSource, currentHeadings, fileNameEl.textContent);

        // Process images and links
        await processImages(currentFilePath);
        processLinks();

        // Start scroll spy
        requestAnimationFrame(() => {
          ScrollSpy.observe();
        });
      }
    } else {
      currentHeadings = [];
      TOCManager.update([]);
      TOCManager.setActive(null);
      await PreviewEngine.render(currentSource, currentFormat, currentFilePath);
    }

    // Scroll to top
    contentArea.scrollTop = 0;
  }

  /**
   * Resolve relative image paths to absolute file:// URLs
   */
  async function processImages(basePath) {
    const images = contentArea.querySelectorAll('img');
    for (const img of images) {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
        try {
          const resolved = await window.api.resolvePath(basePath, src);
          if (resolved) {
            img.src = `file://${resolved}`;
          }
        } catch (_) { /* ignore resolution failures */ }
      }
    }
  }

  /**
   * Make external links open in default browser via click handler
   */
  function processLinks() {
    const links = contentArea.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          window.open(href, '_blank');
        });
      } else if (href && href.startsWith('#')) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const id = href.slice(1);
          navigateToHeading(id);
        });
      }
    });
  }

  // ---- Save ----
  async function saveFile() {
    if (!currentFilePath || !isDirty) return;
    try {
      await window.api.saveFile(currentFilePath, currentSource);
      setDirty(false);
    } catch (err) {
      console.error('Save failed:', err);
    }
  }

  async function saveFileAs() {
    const fileName = currentFilePath ? currentFilePath.split(/[/\\]/).pop() : 'untitled.txt';
    try {
      const result = await window.api.saveFileAs(currentSource, fileName);
      if (result.success) {
        currentFilePath = result.filePath;
        fileNameEl.textContent = result.fileName;
        setDirty(false);
        // Re-detect format
        const fmt = await window.api.detectFormat(result.filePath, currentSource);
        currentFormat = fmt.id;
        currentFormatLabel = fmt.label;
        formatBadge.textContent = fmt.label;
        EditorManager.setFormatLabel(fmt.label);
        tocVisible = currentFormat === 'markdown';
        syncTocVisibility();
        updateExecutionUi();
        updateTitle();
        window.api.watchFile(result.filePath);
        await refreshVisualizer();
        if (currentMode === 'fix-syntax') {
          FixSyntaxManager.setSource(currentSource, currentFilePath);
          FixSyntaxManager.analyze(currentSource, currentFilePath);
        }
      }
    } catch (err) {
      console.error('Save as failed:', err);
    }
  }

  // ---- Zoom ----
  function zoomIn() {
    currentZoom = Math.min(currentZoom + 10, 200);
    applyZoom();
  }
  function zoomOut() {
    currentZoom = Math.max(currentZoom - 10, 60);
    applyZoom();
  }
  function zoomReset() {
    currentZoom = 100;
    applyZoom();
  }
  function applyZoom() {
    contentArea.style.fontSize = `${currentZoom}%`;
  }

  // ---- Goto Line ----
  function showGotoDialog() {
    if (currentMode !== 'editor') {
      switchMode('editor');
    }
    gotoDialog.classList.remove('hidden');
    gotoInput.value = '';
    gotoInput.focus();
  }

  function hideGotoDialog() {
    gotoDialog.classList.add('hidden');
  }

  function executeGoto() {
    const line = parseInt(gotoInput.value, 10);
    if (line > 0) {
      EditorManager.goToLine(line);
      hideGotoDialog();
    }
  }

  btnGotoGo.addEventListener('click', executeGoto);
  btnGotoClose.addEventListener('click', hideGotoDialog);
  gotoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeGoto();
    if (e.key === 'Escape') hideGotoDialog();
  });

  // ---- Help Modal ----
  function showHelp() {
    helpModal.classList.remove('hidden');
  }
  function hideHelp() {
    helpModal.classList.add('hidden');
  }
  btnHelp.addEventListener('click', showHelp);
  btnHelpClose.addEventListener('click', hideHelp);
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) hideHelp();
  });
  btnDropDecisionClose.addEventListener('click', () => resolveDropDecision('cancel'));
  btnDropInsert.addEventListener('click', () => resolveDropDecision('insert'));
  btnDropOpen.addEventListener('click', () => resolveDropDecision('open'));
  btnDropCancel.addEventListener('click', () => resolveDropDecision('cancel'));
  dropDecisionModal.addEventListener('click', (e) => {
    if (e.target === dropDecisionModal) {
      resolveDropDecision('cancel');
    }
  });

  // ---- Run Code ----
  btnRunCode.addEventListener('click', () => {
    const isExec = PreviewEngine.toggleExecution();
    btnRunCode.classList.toggle('active', isExec);
    btnRunCode.title = isExec ? 'Code anzeigen' : 'Code ausführen (Ctrl+R)';
    refreshVisualizer();
  });

  // ---- Drag & Drop ----
  document.addEventListener('dragenter', (e) => {
    if (!hasDropPayload(e.dataTransfer)) return;
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      updateDropOverlayText();
      dropOverlay.classList.remove('hidden');
    }
  });

  document.addEventListener('dragleave', (e) => {
    if (!hasDropPayload(e.dataTransfer)) return;
    e.preventDefault();
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) {
      dropOverlay.classList.add('hidden');
    }
  });

  document.addEventListener('dragover', (e) => {
    if (!hasDropPayload(e.dataTransfer)) return;
    e.preventDefault();
  });

  document.addEventListener('drop', async (e) => {
    if (!hasDropPayload(e.dataTransfer)) return;
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.add('hidden');

    const filePath = await extractDroppedFilePath(e.dataTransfer);
    if (filePath) {
      await handleDroppedFile(filePath);
    }
  });

  document.addEventListener('dragend', () => {
    dragCounter = 0;
    dropOverlay.classList.add('hidden');
  });

  // ---- Event Listeners ----
  btnOpenFile.addEventListener('click', openFileDialog);
  btnThemeToggle.addEventListener('click', toggleTheme);
  btnExportPdf.addEventListener('click', () => {
    if (currentSource) PDFExport.showModal();
  });
  btnCollapseToc.addEventListener('click', () => setTocVisible(false));
  btnExpandToc.addEventListener('click', () => setTocVisible(true));

  // ---- Load initial file (from "Open with" / file association) ----
  (async () => {
    try {
      const initialFile = await window.api.getInitialFile();
      if (initialFile) await loadFile(initialFile, { targetMode: 'visualizer' });
    } catch (e) { console.error('Initial file load failed:', e); }
  })();

  // ---- IPC Events from Main ----
  window.api.onFileOpened((filePath) => {
    openDocument(filePath, { targetMode: 'visualizer' });
  });

  window.api.onFileChanged(async (filePath) => {
    if (filePath === currentFilePath && !isDirty) {
      const scrollPos = currentMode === 'visualizer' ? contentArea.scrollTop : 0;
      const modeBeforeReload = currentMode;
      await loadFile(filePath, { targetMode: modeBeforeReload });
      if (modeBeforeReload === 'visualizer') {
        requestAnimationFrame(() => {
          contentArea.scrollTop = scrollPos;
        });
      }
    }
  });

  // ---- Menu Events ----
  window.api.onMenuOpenFile(openFileDialog);
  window.api.onMenuSaveFile(saveFile);
  window.api.onMenuSaveFileAs(saveFileAs);
  window.api.onMenuExportPDF(() => {
    if (currentSource) PDFExport.showModal();
  });
  window.api.onMenuToggleTOC(toggleToc);
  window.api.onMenuToggleTheme(toggleTheme);
  window.api.onMenuZoomIn(zoomIn);
  window.api.onMenuZoomOut(zoomOut);
  window.api.onMenuZoomReset(zoomReset);
  window.api.onMenuSwitchVisualizer(() => switchMode('visualizer'));
  window.api.onMenuSwitchEditor(() => switchMode('editor'));
  window.api.onMenuSwitchFixSyntax(() => switchMode('fix-syntax'));
  window.api.onMenuGoToLine(showGotoDialog);
  window.api.onMenuRunCode(() => {
    if (['javascript', 'typescript'].includes(currentFormat)) {
      const isExec = PreviewEngine.toggleExecution();
      btnRunCode.classList.toggle('active', isExec);
      refreshVisualizer();
    }
  });

  // ---- Keyboard Shortcuts ----
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // Ctrl+O - Open file (always available)
    if (e.ctrlKey && !e.shiftKey && key === 'o') {
      e.preventDefault();
      openFileDialog();
      return;
    }
    // Escape - close dialogs (always available)
    if (e.key === 'Escape') {
      if (!gotoDialog.classList.contains('hidden')) {
        hideGotoDialog();
      } else if (!dropDecisionModal.classList.contains('hidden')) {
        resolveDropDecision('cancel');
      } else if (!helpModal.classList.contains('hidden')) {
        hideHelp();
      }
      return;
    }
    // All remaining shortcuts require a loaded file
    if (!currentFilePath) return;

    // Ctrl+S - Save
    if (e.ctrlKey && !e.shiftKey && key === 's') {
      e.preventDefault();
      saveFile();
    }
    // Ctrl+Shift+S - Save As
    if (e.ctrlKey && e.shiftKey && key === 's') {
      e.preventDefault();
      saveFileAs();
    }
    // Ctrl+E - Toggle Editor
    if (e.ctrlKey && !e.shiftKey && key === 'e') {
      e.preventDefault();
      switchMode(currentMode === 'editor' ? 'visualizer' : 'editor');
    }
    // Ctrl+Shift+F - Fix Syntax
    if (e.ctrlKey && e.shiftKey && key === 'f') {
      e.preventDefault();
      switchMode(currentMode === 'fix-syntax' ? 'visualizer' : 'fix-syntax');
    }
    // Ctrl+G - Goto Line
    if (e.ctrlKey && !e.shiftKey && key === 'g') {
      e.preventDefault();
      showGotoDialog();
    }
    // Ctrl+R - Run Code
    if (e.ctrlKey && !e.shiftKey && key === 'r') {
      e.preventDefault();
      if (['javascript', 'typescript'].includes(currentFormat)) {
        const isExec = PreviewEngine.toggleExecution();
        btnRunCode.classList.toggle('active', isExec);
        refreshVisualizer();
      }
    }
  });

  // ---- Responsive: auto-collapse sidebar on resize ----
  function checkResponsive() {
    if (window.innerWidth < 640 && tocVisible) {
      setTocVisible(false);
      return;
    }

    syncTocVisibility();
  }
  window.addEventListener('resize', checkResponsive);
  checkResponsive();
})();
