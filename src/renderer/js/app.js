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

  FixSyntaxManager.init(async (fixedSource) => {
    currentSource = fixedSource;
    setDirty(true);
    EditorManager.setContent(fixedSource);
    FixSyntaxManager.setSource(fixedSource, currentFilePath);
    // Refresh visualizer
    await refreshVisualizer();
    // Re-analyze with new source
    FixSyntaxManager.analyze(fixedSource, currentFilePath);
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
    if (visible) {
      tocSidebar.classList.remove('collapsed');
      btnExpandToc.classList.add('hidden');
    } else {
      tocSidebar.classList.add('collapsed');
      btnExpandToc.classList.remove('hidden');
    }
  }

  function toggleToc() {
    setTocVisible(!tocVisible);
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
      // For markdown: ensure TOC sidebar is visible
      if (currentFormat === 'markdown') {
        setTocVisible(true);
      }
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
        await loadFile(filePath);
      }
    } catch (err) {
      console.error('openFileDialog error:', err);
    }
  }

  function confirmDiscard() {
    return confirm('Es gibt ungespeicherte Änderungen. Verwerfen?');
  }

  async function loadFile(filePath) {
    try {
      const result = await window.api.readFile(filePath);
      currentFilePath = result.filePath;
      currentSource = result.content;
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
      if (currentFormat === 'markdown') {
        setTocVisible(true);
      } else {
        setTocVisible(false);
      }

      // Show/hide run button based on format
      const execFormats = ['javascript', 'typescript'];
      PreviewEngine.showRunButton(execFormats.includes(currentFormat));
      PreviewEngine.setExecutionMode(false);

      // Render in visualizer
      await refreshVisualizer();

      // Set editor content
      EditorManager.setContent(result.content);
      EditorManager.setFormatLabel(fmt.label);

      // Show app layout, hide welcome
      welcomeScreen.classList.add('hidden');
      appLayout.classList.remove('hidden');

      // Switch to visualizer mode
      switchMode('visualizer');

      // Watch file for external changes
      window.api.watchFile(result.filePath);

    } catch (err) {
      console.error('Failed to load file:', err);
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
        updateTitle();
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

  // ---- Run Code ----
  btnRunCode.addEventListener('click', () => {
    const isExec = PreviewEngine.toggleExecution();
    btnRunCode.classList.toggle('active', isExec);
    btnRunCode.title = isExec ? 'Code anzeigen' : 'Code ausführen (Ctrl+R)';
    refreshVisualizer();
  });

  // ---- Drag & Drop ----
  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dropOverlay.classList.remove('hidden');
    }
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dropOverlay.classList.add('hidden');
    }
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.add('hidden');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      loadFile(file.path);
    }
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
      if (initialFile) await loadFile(initialFile);
    } catch (e) { console.error('Initial file load failed:', e); }
  })();

  // ---- IPC Events from Main ----
  window.api.onFileOpened((filePath) => {
    loadFile(filePath);
  });

  window.api.onFileChanged(async (filePath) => {
    if (filePath === currentFilePath && !isDirty) {
      const scrollPos = contentArea.scrollTop;
      await loadFile(filePath);
      requestAnimationFrame(() => {
        contentArea.scrollTop = scrollPos;
      });
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
    // Ctrl+O - Open file (always available)
    if (e.ctrlKey && !e.shiftKey && e.key === 'o') {
      e.preventDefault();
      openFileDialog();
      return;
    }
    // Escape - close dialogs (always available)
    if (e.key === 'Escape') {
      if (!gotoDialog.classList.contains('hidden')) {
        hideGotoDialog();
      } else if (!helpModal.classList.contains('hidden')) {
        hideHelp();
      }
      return;
    }
    // All remaining shortcuts require a loaded file
    if (!currentFilePath) return;

    // Ctrl+S - Save
    if (e.ctrlKey && !e.shiftKey && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
    // Ctrl+Shift+S - Save As
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      saveFileAs();
    }
    // Ctrl+E - Toggle Editor
    if (e.ctrlKey && !e.shiftKey && e.key === 'e') {
      e.preventDefault();
      switchMode(currentMode === 'editor' ? 'visualizer' : 'editor');
    }
    // Ctrl+Shift+F - Fix Syntax
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      switchMode(currentMode === 'fix-syntax' ? 'visualizer' : 'fix-syntax');
    }
    // Ctrl+G - Goto Line
    if (e.ctrlKey && !e.shiftKey && e.key === 'g') {
      e.preventDefault();
      showGotoDialog();
    }
    // Ctrl+R - Run Code
    if (e.ctrlKey && !e.shiftKey && e.key === 'r') {
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
    }
  }
  window.addEventListener('resize', checkResponsive);
  checkResponsive();
})();
