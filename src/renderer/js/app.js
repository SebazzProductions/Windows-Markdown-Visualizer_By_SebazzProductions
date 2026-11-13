/**
 * App – Einstiegspunkt des Renderers, orchestriert alle Module
 */
(function () {
  'use strict';

  // ---- Dokument-Zustand ----
  const doc = {
    filePath: null,
    fileName: '',
    source: '',
    format: { id: 'markdown', label: 'Markdown', kind: 'markdown', language: 'markdown', canFormat: true, canExecute: false },
    headings: [],
    eol: 'lf',
    bom: false,
    isDirty: false,
    isUntitled: false,
    loaded: false,
    version: 0,          // erhöht sich bei jeder Quelländerung
    renderedVersion: -1  // Version, die der Visualizer zuletzt gerendert hat
  };

  // ---- UI-Zustand ----
  let settings = null;
  let currentMode = 'visualizer'; // 'visualizer' | 'editor' | 'fix-syntax'
  let effectiveTheme = document.documentElement.getAttribute('data-theme') || 'light';
  let liveRenderTimer = null;
  let autosaveTimer = null;
  let syncLock = { source: null, until: 0 };
  let dragCounter = 0;
  let dropDecisionResolver = null;
  let pendingDropSelection = null;
  let closing = false;

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const welcomeScreen = $('welcome-screen');
  const appLayout = $('app-layout');
  const tocSidebar = $('toc-sidebar');
  const tocContent = $('toc-content');
  const tocFilter = $('toc-filter');
  const tocResizeHandle = $('toc-resize-handle');
  const btnCollapseToc = $('btn-collapse-toc');
  const btnExpandToc = $('btn-expand-toc');
  const contentArea = $('markdown-content');
  const article = $('markdown-article');
  const panels = $('panels');
  const visualizerPanel = $('visualizer-panel');
  const editorPanel = $('editor-panel');
  const fixSyntaxPanel = $('fix-syntax-panel');
  const splitDivider = $('split-divider');
  const fileNameEl = $('file-name');
  const formatBadge = $('format-badge');
  const dirtyIndicator = $('dirty-indicator');
  const zoomBadge = $('zoom-badge');
  const btnOpenFile = $('btn-open-file');
  const btnNewFile = $('btn-new-file');
  const btnThemeToggle = $('btn-theme-toggle');
  const btnExportPdf = $('btn-export-pdf');
  const btnRunCode = $('btn-run-code');
  const btnSplit = $('btn-split');
  const btnFind = $('btn-find');
  const btnHelp = $('btn-help');
  const btnAppMenu = $('btn-app-menu');
  const btnWelcomeMenu = $('btn-welcome-menu');
  const helpModal = $('help-modal');
  const btnHelpClose = $('btn-help-close');
  const dropOverlay = $('drop-overlay');
  const dropMessageText = $('drop-message-text');
  const dropMessageHint = $('drop-message-hint');
  const dropDecisionModal = $('drop-decision-modal');
  const dropDecisionTitle = $('drop-decision-title');
  const dropDecisionFile = $('drop-decision-file');
  const dropDecisionMessage = $('drop-decision-message');
  const btnDropDecisionClose = $('btn-drop-decision-close');
  const btnDropInsert = $('btn-drop-insert');
  const btnDropOpen = $('btn-drop-open');
  const btnDropCancel = $('btn-drop-cancel');
  const recentSection = $('recent-files');
  const recentList = $('recent-list');
  const btnClearRecent = $('btn-clear-recent');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const gotoDialog = $('goto-dialog');
  const gotoInput = $('goto-input');
  const btnGotoGo = $('btn-goto-go');
  const btnGotoClose = $('btn-goto-close');

  // ---- Module initialisieren ----
  Toast.init();
  TOCManager.init(tocContent, navigateToHeading);
  ScrollSpy.init(contentArea, (headingId) => TOCManager.setActive(headingId));
  PreviewEngine.init();
  PDFExport.init({
    getDocument: () => doc.loaded ? {
      title: doc.fileName ? doc.fileName.replace(/\.[^.]+$/, '') : 'Dokument',
      fileName: doc.fileName || 'dokument',
      filePath: doc.filePath,
      headings: doc.headings,
      isCodeView: PreviewEngine.isCodeView(),
      theme: effectiveTheme
    } : null
  });
  EditorManager.init($('editor-textarea'), $('line-gutter'), {
    onChange: (newContent) => {
      doc.source = newContent;
      doc.version++;
      setDirty(true);
      scheduleLiveRender();
      scheduleAutosave();
    },
    onScroll: () => syncPreviewFromEditor(),
    onEolToggle: () => {
      doc.eol = doc.eol === 'crlf' ? 'lf' : 'crlf';
      EditorManager.setEolLabel(doc.eol);
      setDirty(true);
      Toast.info(`Zeilenende: ${doc.eol.toUpperCase()} – wird beim Speichern übernommen`);
    }
  });
  FindBar.init({
    getMode: () => (currentMode === 'editor' ? 'editor' : 'visualizer'),
    getArticle: () => contentArea,
    onRequestEditor: () => switchMode('editor'),
    onReplaced: () => { /* Änderung kommt über das input-Event des Editors */ }
  });
  FixSyntaxManager.init({
    onApply: async (fixedSource) => {
      setSource(fixedSource);
      EditorManager.setContent(fixedSource, { preserveCursor: true });
      await refreshVisualizer({ force: true });
      FixSyntaxManager.setSource(fixedSource, analysisPath());
      FixSyntaxManager.analyze(fixedSource, analysisPath());
      Toast.success('Korrekturen übernommen');
    },
    getSource: () => doc.source,
    onGotoLine: (line) => {
      switchMode('editor');
      EditorManager.goToLine(line, { select: true });
    }
  });

  function analysisPath() {
    if (doc.filePath) return doc.filePath;
    const ext = doc.format && doc.format.id === 'markdown' ? '.md' : '.txt';
    return `${doc.fileName || 'unbenannt'}${doc.fileName && doc.fileName.includes('.') ? '' : ext}`;
  }

  // =====================================================================
  // Einstellungen / Theme
  // =====================================================================

  function applyTheme(theme) {
    effectiveTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    try { localStorage.setItem('mv-effective-theme', effectiveTheme); } catch { /* ignore */ }
  }

  function applyZoom(zoom) {
    const z = Math.min(200, Math.max(60, Number(zoom) || 100));
    document.documentElement.style.setProperty('--zoom', String(z / 100));
    zoomBadge.textContent = `${z} %`;
    zoomBadge.classList.toggle('hidden', z === 100);
    ScrollSpy.refresh();
  }

  function applySplit() {
    const split = Boolean(settings && settings.splitView) && currentMode === 'editor';
    panels.classList.toggle('is-split', split);
    panels.style.setProperty('--split-ratio', `${Math.round((settings ? settings.splitRatio : 0.5) * 100)}%`);
    splitDivider.classList.toggle('hidden', !split);
    visualizerPanel.classList.toggle('hidden', !(split || currentMode === 'visualizer'));
    btnSplit.classList.toggle('active', Boolean(settings && settings.splitView));
    btnSplit.classList.toggle('hidden', currentMode !== 'editor');
    if (split) {
      const pending = doc.renderedVersion !== doc.version ? refreshVisualizer({ preserveScroll: true }) : Promise.resolve();
      pending.then(() => syncPreviewFromEditor(true));
    }
  }

  function applySettings(s) {
    settings = s;
    applyTheme(s.effectiveTheme || effectiveTheme);
    applyZoom(s.zoom);
    contentArea.classList.toggle('reading-width', s.readingWidth !== false);
    tocSidebar.style.setProperty('--toc-width', `${Math.min(520, Math.max(160, Number(s.tocWidth) || 240))}px`);
    EditorManager.setSpellcheck(s.spellcheck !== false && isProseFormat());
    PDFExport.applySettings(s.pdf);
    syncTocVisibility();
    applySplit();
  }

  function isProseFormat() {
    return !doc.format || doc.format.kind === 'markdown' || doc.format.kind === 'text';
  }

  async function setSetting(key, value) {
    if (settings) settings[key] = value;
    try { await window.api.setSetting(key, value); } catch (err) { console.error('setSetting', err); }
  }

  window.api.on('settings-changed', (key, value) => {
    if (!settings) return;
    settings[key] = value;
    switch (key) {
      case 'zoom': applyZoom(value); break;
      case 'tocVisible': syncTocVisibility(); break;
      case 'readingWidth': contentArea.classList.toggle('reading-width', value !== false); ScrollSpy.refresh(); break;
      case 'splitView': applySplit(); break;
      case 'spellcheck': EditorManager.setSpellcheck(value !== false && isProseFormat()); break;
      case 'autosave': if (value) scheduleAutosave(); break;
      case 'pdf': PDFExport.applySettings(value); break;
      case 'recentFiles': renderRecentFiles(); break;
      default: break;
    }
  });

  window.api.on('theme-changed', (theme) => applyTheme(theme));

  function toggleTheme() {
    setSetting('theme', effectiveTheme === 'dark' ? 'light' : 'dark');
  }

  // =====================================================================
  // TOC
  // =====================================================================

  function tocAvailable() {
    return doc.loaded && doc.format.kind === 'markdown' && currentMode !== 'fix-syntax';
  }

  function syncTocVisibility() {
    const available = tocAvailable();
    const visible = available && Boolean(settings ? settings.tocVisible : true);
    tocSidebar.classList.toggle('collapsed', !visible);
    btnExpandToc.classList.toggle('hidden', !available || visible);
  }

  function setTocVisible(visible) {
    setSetting('tocVisible', Boolean(visible));
    syncTocVisibility();
  }

  btnCollapseToc.addEventListener('click', () => setTocVisible(false));
  btnExpandToc.addEventListener('click', () => setTocVisible(true));
  $('btn-toc-expand-all').addEventListener('click', () => TOCManager.setAllExpanded(true));
  $('btn-toc-collapse-all').addEventListener('click', () => TOCManager.setAllExpanded(false));
  tocFilter.addEventListener('input', () => TOCManager.applyFilter(tocFilter.value));
  tocFilter.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { tocFilter.value = ''; TOCManager.applyFilter(''); tocFilter.blur(); }
  });

  // Sidebar-Breite per Drag
  (function setupTocResize() {
    let startX = 0;
    let startWidth = 0;
    const onMove = (e) => {
      const width = Math.min(520, Math.max(160, startWidth + (e.clientX - startX)));
      tocSidebar.style.setProperty('--toc-width', `${width}px`);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      tocSidebar.classList.remove('is-resizing');
      document.body.classList.remove('is-resizing');
      const width = parseInt(getComputedStyle(tocSidebar).getPropertyValue('--toc-width'), 10) || 240;
      setSetting('tocWidth', width);
      ScrollSpy.refresh();
    };
    tocResizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = tocSidebar.getBoundingClientRect().width;
      tocSidebar.classList.add('is-resizing');
      document.body.classList.add('is-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    tocResizeHandle.addEventListener('dblclick', () => {
      tocSidebar.style.setProperty('--toc-width', '240px');
      setSetting('tocWidth', 240);
    });
  })();

  // Split-Divider per Drag
  (function setupSplitResize() {
    const onMove = (e) => {
      const rect = panels.getBoundingClientRect();
      const ratio = Math.min(0.8, Math.max(0.2, (e.clientX - rect.left) / rect.width));
      panels.style.setProperty('--split-ratio', `${Math.round(ratio * 100)}%`);
      panels.dataset.ratio = String(ratio);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      splitDivider.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing');
      const ratio = Number(panels.dataset.ratio);
      if (ratio) setSetting('splitRatio', ratio);
      ScrollSpy.refresh();
    };
    splitDivider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      splitDivider.classList.add('is-dragging');
      document.body.classList.add('is-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    splitDivider.addEventListener('dblclick', () => {
      panels.style.setProperty('--split-ratio', '50%');
      setSetting('splitRatio', 0.5);
    });
  })();

  function navigateToHeading(headingId) {
    const target = article.querySelector(`#${CSS.escape(headingId)}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      TOCManager.setActive(headingId);
    }
  }

  // =====================================================================
  // Modus / Tabs
  // =====================================================================

  function switchMode(mode) {
    if (!doc.loaded && mode !== 'visualizer') return;
    const previous = currentMode;
    currentMode = mode;

    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
      btn.setAttribute('aria-selected', String(btn.dataset.mode === mode));
    });

    editorPanel.classList.toggle('hidden', mode !== 'editor');
    fixSyntaxPanel.classList.toggle('hidden', mode !== 'fix-syntax');
    visualizerPanel.classList.toggle('hidden', mode !== 'visualizer');

    if (mode === 'editor') {
      if (EditorManager.getContent() !== doc.source) EditorManager.setContent(doc.source, { preserveCursor: previous === 'editor' });
      EditorManager.setFormatLabel(doc.format.label, doc.format.kind === 'markdown');
      EditorManager.setEolLabel(doc.eol);
      EditorManager.focus();
    } else if (mode === 'fix-syntax') {
      if (doc.loaded) {
        FixSyntaxManager.setSource(doc.source, analysisPath());
        FixSyntaxManager.analyze(doc.source, analysisPath());
      }
    } else if (mode === 'visualizer') {
      refreshVisualizer({ preserveScroll: previous === 'editor' && Boolean(settings && settings.splitView) });
    }

    applySplit();
    syncTocVisibility();
    FindBar.refresh();
  }

  tabButtons.forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));

  // =====================================================================
  // Dokument-Zustand
  // =====================================================================

  function setSource(source) {
    doc.source = source;
    doc.version++;
    setDirty(true);
  }

  function setDirty(dirty) {
    const changed = doc.isDirty !== dirty;
    doc.isDirty = dirty;
    dirtyIndicator.classList.toggle('hidden', !dirty);
    updateTitle();
    if (changed || dirty) {
      window.api.setDocumentState({ isDirty: dirty, filePath: doc.filePath });
    }
  }

  function updateTitle() {
    if (!doc.loaded) {
      window.api.setTitle('Markdown Visualizer');
      return;
    }
    const prefix = doc.isDirty ? '● ' : '';
    window.api.setTitle(`${prefix}${doc.fileName || 'Unbenannt'} – Markdown Visualizer`);
    fileNameEl.textContent = doc.fileName || 'Unbenannt';
    fileNameEl.title = doc.filePath || 'Noch nicht gespeichert';
    fileNameEl.classList.toggle('is-clickable', Boolean(doc.filePath));
  }

  function updateFormatUi() {
    formatBadge.textContent = doc.format.label;
    formatBadge.classList.remove('hidden');
    PreviewEngine.setExecutionMode(false);
    PreviewEngine.showRunButton(Boolean(doc.format.canExecute));
    btnRunCode.classList.remove('active');
    btnRunCode.title = 'Code ausführen (Strg+R)';
    EditorManager.setFormatLabel(doc.format.label, doc.format.kind === 'markdown');
    EditorManager.setEolLabel(doc.eol);
    EditorManager.setSpellcheck(Boolean(settings && settings.spellcheck !== false) && isProseFormat());
  }

  fileNameEl.addEventListener('click', () => {
    if (doc.filePath) window.api.showInFolder(doc.filePath);
  });

  // =====================================================================
  // Datei laden / neu / speichern
  // =====================================================================

  async function confirmDiscardIfDirty() {
    if (!doc.isDirty) return true;
    const choice = await window.api.confirmDiscard(doc.fileName || 'Unbenannt');
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      const saved = await saveFile();
      return saved;
    }
    return true;
  }

  async function openFileDialog() {
    if (!(await confirmDiscardIfDirty())) return;
    try {
      const filePath = await window.api.openFileDialog();
      if (filePath) await loadFile(filePath, { targetMode: 'visualizer' });
    } catch (err) {
      Toast.error(`Datei konnte nicht geöffnet werden: ${err.message}`);
    }
  }

  async function openDocument(filePath, options = {}) {
    if (options.respectDirty !== false && !(await confirmDiscardIfDirty())) return false;
    return loadFile(filePath, options);
  }

  async function loadFile(filePath, options = {}) {
    const targetMode = options.preserveMode ? currentMode : (options.targetMode || 'visualizer');
    try {
      const result = await window.api.readFile(filePath);
      const fmt = await window.api.detectFormat(result.filePath, result.content);

      doc.filePath = result.filePath;
      doc.fileName = result.fileName;
      doc.source = result.content;
      doc.eol = result.eol;
      doc.bom = result.bom;
      doc.format = fmt;
      doc.headings = [];
      doc.isUntitled = false;
      doc.loaded = true;
      doc.version++;
      doc.renderedVersion = -1;
      setDirty(false);
      updateTitle();
      updateFormatUi();

      showApp();
      TOCManager.update([]);
      EditorManager.setContent(result.content, { preserveCursor: Boolean(options.preserveCursor) });

      if (targetMode === 'visualizer' || (settings && settings.splitView && targetMode === 'editor')) {
        await refreshVisualizer({ force: true, preserveScroll: Boolean(options.preserveScroll) });
      }
      switchMode(targetMode);
      window.api.watchFile(result.filePath);
      return true;
    } catch (err) {
      Toast.error(cleanError(err), { title: 'Datei konnte nicht geöffnet werden' });
      if (!doc.loaded) renderRecentFiles();
      return false;
    }
  }

  function cleanError(err) {
    const msg = err && err.message ? err.message : String(err);
    return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }

  function newDocument() {
    doc.filePath = null;
    doc.fileName = 'Unbenannt.md';
    doc.source = '';
    doc.eol = 'crlf';
    doc.bom = false;
    doc.format = { id: 'markdown', label: 'Markdown', kind: 'markdown', language: 'markdown', canFormat: true, canExecute: false };
    doc.headings = [];
    doc.isUntitled = true;
    doc.loaded = true;
    doc.version++;
    doc.renderedVersion = -1;
    window.api.watchFile(null);
    setDirty(false);
    updateTitle();
    updateFormatUi();
    showApp();
    TOCManager.update([]);
    EditorManager.setContent('');
    article.innerHTML = '';
    switchMode('editor');
  }

  function showApp() {
    welcomeScreen.classList.add('hidden');
    appLayout.classList.remove('hidden');
  }

  async function saveFile() {
    if (!doc.loaded) return false;
    if (!doc.filePath) return saveFileAs();
    try {
      await window.api.saveFile(doc.filePath, doc.source, { eol: doc.eol, bom: doc.bom });
      setDirty(false);
      return true;
    } catch (err) {
      Toast.error(cleanError(err), { title: 'Speichern fehlgeschlagen' });
      return false;
    }
  }

  async function saveFileAs() {
    if (!doc.loaded) return false;
    try {
      const result = await window.api.saveFileAs(doc.source, doc.fileName || 'unbenannt.md', { eol: doc.eol, bom: doc.bom });
      if (!result.success) return false;
      doc.filePath = result.filePath;
      doc.fileName = result.fileName;
      doc.isUntitled = false;
      const fmt = await window.api.detectFormat(result.filePath, doc.source);
      const formatChanged = fmt.id !== doc.format.id;
      doc.format = fmt;
      setDirty(false);
      updateTitle();
      updateFormatUi();
      syncTocVisibility();
      window.api.watchFile(result.filePath);
      if (formatChanged) {
        doc.renderedVersion = -1;
        await refreshVisualizer({ force: true });
        if (currentMode === 'fix-syntax') {
          FixSyntaxManager.setSource(doc.source, doc.filePath);
          FixSyntaxManager.analyze(doc.source, doc.filePath);
        }
      }
      Toast.success(`Gespeichert als ${result.fileName}`);
      return true;
    } catch (err) {
      Toast.error(cleanError(err), { title: 'Speichern fehlgeschlagen' });
      return false;
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    if (!settings || !settings.autosave || !doc.filePath || !doc.isDirty) return;
    autosaveTimer = setTimeout(() => {
      if (doc.isDirty && doc.filePath) saveFile();
    }, 1500);
  }

  // =====================================================================
  // Visualizer
  // =====================================================================

  async function refreshVisualizer({ force = false, preserveScroll = false } = {}) {
    if (!doc.loaded) return;
    if (!force && doc.renderedVersion === doc.version) return;
    const version = doc.version;
    const scrollTop = contentArea.scrollTop;

    if (doc.format.kind === 'markdown') {
      const headings = await PreviewEngine.renderMarkdown(doc.source);
      if (version !== doc.version && !force) return; // inzwischen erneut geändert
      doc.headings = headings || [];
      TOCManager.update(doc.headings);
      await processImages();
      processLinks();
      requestAnimationFrame(() => ScrollSpy.observe());
    } else {
      doc.headings = [];
      TOCManager.update([]);
      TOCManager.setActive(null);
      ScrollSpy.destroy();
      await PreviewEngine.render(doc.source, doc.format, doc.filePath);
    }
    doc.renderedVersion = version;

    contentArea.classList.add('no-smooth');
    contentArea.scrollTop = preserveScroll ? scrollTop : 0;
    requestAnimationFrame(() => contentArea.classList.remove('no-smooth'));
    FindBar.refresh();
  }

  function scheduleLiveRender() {
    clearTimeout(liveRenderTimer);
    const visible = !visualizerPanel.classList.contains('hidden');
    if (!visible) return;
    liveRenderTimer = setTimeout(() => {
      refreshVisualizer({ preserveScroll: true }).then(() => syncPreviewFromEditor(true));
    }, 300);
  }

  /**
   * Relative Bildpfade in file://-URLs auflösen (über den Main-Prozess, inkl. URL-Encoding)
   */
  async function processImages() {
    const images = article.querySelectorAll('img');
    for (const img of images) {
      const src = img.getAttribute('src');
      if (!src || /^(https?:|data:|blob:|file:)/i.test(src)) {
        attachImageFallback(img);
        continue;
      }
      if (!doc.filePath) continue;
      try {
        const resolved = await window.api.resolvePath(doc.filePath, src);
        if (resolved && resolved.url) {
          img.src = resolved.url;
          if (!img.title) img.title = resolved.path;
        }
      } catch { /* ignorieren */ }
      attachImageFallback(img);
    }
  }

  function attachImageFallback(img) {
    img.addEventListener('error', () => {
      img.classList.add('is-broken');
      img.alt = img.alt || 'Bild nicht gefunden';
    }, { once: true });
  }

  /**
   * Links: extern → Browser, Anker → scrollen, relative Dateien → in der App öffnen
   */
  function processLinks() {
    article.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      if (/^(https?:|mailto:)/i.test(href)) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          window.api.openExternal(href);
        });
      } else if (href.startsWith('#')) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const id = decodeURIComponent(href.slice(1));
          const target = article.querySelector(`#${CSS.escape(id)}`) || article.querySelector(`[name="${CSS.escape(id)}"]`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          if (!doc.filePath) return;
          const [relPath, anchor] = href.split('#');
          const resolved = await window.api.resolvePath(doc.filePath, relPath || '.');
          if (!resolved || !resolved.exists) {
            link.classList.add('is-missing');
            Toast.warning(`Ziel nicht gefunden: ${relPath}`);
            return;
          }
          if (resolved.isFile && resolved.supported) {
            const ok = await openDocument(resolved.path, { targetMode: 'visualizer' });
            if (ok && anchor) setTimeout(() => navigateToHeading(decodeURIComponent(anchor)), 150);
          } else {
            window.api.showInFolder(resolved.path);
          }
        });
        link.title = link.title || href;
      }
    });
  }

  // Doppelklick in der Vorschau → zugehörige Quellzeile im Editor
  article.addEventListener('dblclick', (e) => {
    if (doc.format.kind !== 'markdown') return;
    const el = e.target.closest('[data-source-line]');
    if (!el) return;
    const line = Number(el.dataset.sourceLine);
    if (!line) return;
    if (currentMode !== 'editor') switchMode('editor');
    EditorManager.goToLine(line);
    window.getSelection()?.removeAllRanges();
  });

  // ---- Scroll-Sync Editor ↔ Vorschau (Split-View) ----

  function lockSync(source) {
    syncLock = { source, until: performance.now() + 150 };
  }
  function syncBlockedFor(source) {
    return syncLock.source && syncLock.source !== source && performance.now() < syncLock.until;
  }

  function sourceLineElements() {
    return Array.from(article.querySelectorAll('[data-source-line]'))
      .map(el => ({ el, line: Number(el.dataset.sourceLine) }))
      .filter(x => x.line > 0)
      .sort((a, b) => a.line - b.line);
  }

  function syncPreviewFromEditor(force = false) {
    if (!panels.classList.contains('is-split') || doc.format.kind !== 'markdown') return;
    if (!force && syncBlockedFor('editor')) return;
    const topLine = EditorManager.getTopVisibleLine();
    const items = sourceLineElements();
    if (items.length === 0) {
      const info = EditorManager.getScrollInfo();
      const ratio = info.scrollHeight > info.clientHeight ? info.scrollTop / (info.scrollHeight - info.clientHeight) : 0;
      setPreviewScroll(ratio * (contentArea.scrollHeight - contentArea.clientHeight));
      return;
    }
    let idx = -1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].line <= topLine) idx = i; else break;
    }
    const base = contentArea.getBoundingClientRect().top - contentArea.scrollTop;
    let target;
    if (idx === -1) {
      target = 0;
    } else {
      const cur = items[idx];
      const curTop = cur.el.getBoundingClientRect().top - base;
      const next = items[idx + 1];
      if (next && next.line > cur.line) {
        const nextTop = next.el.getBoundingClientRect().top - base;
        const t = (topLine - cur.line) / (next.line - cur.line);
        target = curTop + t * (nextTop - curTop);
      } else {
        target = curTop;
      }
      target -= 24;
    }
    lockSync('editor');
    setPreviewScroll(target);
  }

  function setPreviewScroll(top) {
    contentArea.classList.add('no-smooth');
    contentArea.scrollTop = Math.max(0, top);
    requestAnimationFrame(() => contentArea.classList.remove('no-smooth'));
  }

  contentArea.addEventListener('scroll', () => {
    if (!panels.classList.contains('is-split') || doc.format.kind !== 'markdown') return;
    if (syncBlockedFor('preview')) return;
    const items = sourceLineElements();
    if (items.length === 0) return;
    const base = contentArea.getBoundingClientRect().top;
    let idx = -1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].el.getBoundingClientRect().top - base <= 24) idx = i; else break;
    }
    const line = idx === -1 ? 1 : items[idx].line;
    lockSync('preview');
    EditorManager.scrollToLine(line);
  }, { passive: true });

  // =====================================================================
  // Zoom
  // =====================================================================

  function zoomBy(delta) {
    const current = settings ? settings.zoom : 100;
    const next = Math.min(200, Math.max(60, Math.round((current + delta) / 10) * 10));
    if (next === current) return;
    applyZoom(next);
    setSetting('zoom', next);
  }
  function zoomReset() {
    applyZoom(100);
    setSetting('zoom', 100);
  }
  zoomBadge.addEventListener('click', zoomReset);
  document.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 10 : -10);
  }, { passive: false });

  // =====================================================================
  // Goto / Hilfe / Menü
  // =====================================================================

  function showGotoDialog() {
    if (!doc.loaded) return;
    if (currentMode !== 'editor') switchMode('editor');
    gotoDialog.classList.remove('hidden');
    gotoInput.value = '';
    gotoInput.max = String(EditorManager.getLineCount());
    gotoInput.placeholder = `1–${EditorManager.getLineCount()}`;
    gotoInput.focus();
  }
  function hideGotoDialog() {
    gotoDialog.classList.add('hidden');
    if (currentMode === 'editor') EditorManager.focus();
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

  function showHelp() { helpModal.classList.remove('hidden'); }
  function hideHelp() { helpModal.classList.add('hidden'); }
  btnHelp.addEventListener('click', showHelp);
  btnHelpClose.addEventListener('click', hideHelp);
  helpModal.addEventListener('click', (e) => { if (e.target === helpModal) hideHelp(); });

  function openAppMenu(button) {
    const rect = button.getBoundingClientRect();
    window.api.showAppMenu(rect.left, rect.bottom + 2);
  }
  btnAppMenu.addEventListener('click', () => openAppMenu(btnAppMenu));
  btnWelcomeMenu.addEventListener('click', () => openAppMenu(btnWelcomeMenu));

  // =====================================================================
  // Code ausführen
  // =====================================================================

  function toggleRunCode() {
    if (!doc.loaded || !doc.format.canExecute) return;
    const isExec = PreviewEngine.toggleExecution();
    btnRunCode.classList.toggle('active', isExec);
    btnRunCode.title = isExec ? 'Code anzeigen' : 'Code ausführen (Strg+R)';
    if (currentMode !== 'visualizer') switchMode('visualizer');
    refreshVisualizer({ force: true });
  }
  btnRunCode.addEventListener('click', toggleRunCode);

  // =====================================================================
  // Zuletzt geöffnet (Welcome)
  // =====================================================================

  async function renderRecentFiles() {
    if (!recentList) return;
    let files = [];
    try { files = await window.api.getRecentFiles(); } catch { files = []; }
    recentList.innerHTML = '';
    recentSection.classList.toggle('hidden', files.length === 0);
    for (const filePath of files) {
      const parts = filePath.split(/[\\/]/);
      const name = parts.pop();
      const dir = parts.join('\\');
      const li = document.createElement('li');
      li.className = 'recent-item';
      li.title = filePath;
      li.innerHTML = `<span class="recent-item-icon"><svg width="16" height="16"><use href="#i-file"/></svg></span>
        <span class="recent-item-text"><span class="recent-item-name"></span><span class="recent-item-dir"></span></span>
        <button class="btn-icon-sm recent-item-remove" title="Aus Liste entfernen"><svg width="12" height="12"><use href="#i-close"/></svg></button>`;
      li.querySelector('.recent-item-name').textContent = name;
      li.querySelector('.recent-item-dir').textContent = dir;
      li.addEventListener('click', (e) => {
        if (e.target.closest('.recent-item-remove')) return;
        openDocument(filePath, { targetMode: 'visualizer' });
      });
      li.querySelector('.recent-item-remove').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.removeRecentFile(filePath);
        renderRecentFiles();
      });
      recentList.appendChild(li);
    }
  }
  btnClearRecent.addEventListener('click', async () => {
    await window.api.clearRecentFiles();
    renderRecentFiles();
  });

  // =====================================================================
  // Drag & Drop
  // =====================================================================

  function updateDropOverlayText() {
    if (!doc.loaded || currentMode === 'visualizer') {
      dropMessageText.textContent = 'Datei zum Öffnen ablegen';
      dropMessageHint.textContent = 'Die Anwendung öffnet die abgelegte Datei.';
    } else if (currentMode === 'editor') {
      dropMessageText.textContent = 'Datei im Editor ablegen';
      dropMessageHint.textContent = 'Sie können den Inhalt an der Cursorposition einfügen oder die Datei als neues Dokument öffnen.';
    } else {
      dropMessageText.textContent = 'Datei für Fix Syntax ablegen';
      dropMessageHint.textContent = 'Sie können den Inhalt in dieses Dokument einfügen oder die Datei separat in Fix Syntax bearbeiten.';
    }
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
    if (/^file:/i.test(trimmed)) return fileUriToPath(trimmed);
    if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) return trimmed;
    return null;
  }

  function fileUriToPath(fileUri) {
    try {
      const parsed = new URL(fileUri);
      if (parsed.protocol !== 'file:') return null;
      let pathname = decodeURIComponent(parsed.pathname || '');
      if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1);
      if (parsed.host) return `\\\\${parsed.host}${pathname.replace(/\//g, '\\')}`;
      return pathname.replace(/\//g, '\\');
    } catch {
      return null;
    }
  }

  function extractDroppedFilePath(dataTransfer) {
    if (!dataTransfer) return null;
    const file = dataTransfer.files && dataTransfer.files[0];
    if (file) {
      try {
        const filePath = window.api.getDroppedFilePath(file);
        if (filePath) return filePath;
      } catch { /* weiter mit URI-Liste */ }
    }
    const uriList = dataTransfer.getData('text/uri-list');
    if (uriList) {
      const lines = uriList.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      const fromUri = parseDroppedPathFromText(lines[0]);
      if (fromUri) return fromUri;
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
    return new Promise(resolve => { dropDecisionResolver = resolve; });
  }

  function resolveDropDecision(decision) {
    dropDecisionModal.classList.add('hidden');
    if (dropDecisionResolver) {
      dropDecisionResolver(decision);
      dropDecisionResolver = null;
    }
    if (decision !== 'insert') pendingDropSelection = null;
  }

  async function insertDroppedFile(filePath) {
    const result = await window.api.readFile(filePath);
    if (currentMode !== 'editor') {
      // Fix Syntax: am Ende anhängen (kein Cursor sichtbar)
      const sep = doc.source && !doc.source.endsWith('\n') ? '\n' : '';
      EditorManager.setContent(doc.source + sep + result.content);
      setSource(EditorManager.getContent());
    } else {
      EditorManager.insertTextAtCursor(result.content, pendingDropSelection);
      setSource(EditorManager.getContent());
    }
    pendingDropSelection = null;
    await refreshVisualizer({ preserveScroll: true });
    if (currentMode === 'fix-syntax') {
      FixSyntaxManager.setSource(doc.source, analysisPath());
      await FixSyntaxManager.analyze(doc.source, analysisPath());
    }
  }

  async function handleDroppedFile(filePath) {
    if (!filePath) return;
    try {
      if (!doc.loaded || currentMode === 'visualizer') {
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
      Toast.error(cleanError(err), { title: 'Datei konnte nicht verarbeitet werden' });
    } finally {
      pendingDropSelection = null;
    }
  }

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
    if (dragCounter === 0) dropOverlay.classList.add('hidden');
  });
  document.addEventListener('dragover', (e) => {
    if (!hasDropPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', async (e) => {
    if (!hasDropPayload(e.dataTransfer)) return;
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.add('hidden');
    const filePath = extractDroppedFilePath(e.dataTransfer);
    if (filePath) await handleDroppedFile(filePath);
  });
  document.addEventListener('dragend', () => {
    dragCounter = 0;
    dropOverlay.classList.add('hidden');
  });

  btnDropDecisionClose.addEventListener('click', () => resolveDropDecision('cancel'));
  btnDropInsert.addEventListener('click', () => resolveDropDecision('insert'));
  btnDropOpen.addEventListener('click', () => resolveDropDecision('open'));
  btnDropCancel.addEventListener('click', () => resolveDropDecision('cancel'));
  dropDecisionModal.addEventListener('click', (e) => { if (e.target === dropDecisionModal) resolveDropDecision('cancel'); });

  // =====================================================================
  // Toolbar-Buttons
  // =====================================================================

  btnOpenFile.addEventListener('click', openFileDialog);
  btnNewFile.addEventListener('click', async () => { if (await confirmDiscardIfDirty()) newDocument(); });
  btnThemeToggle.addEventListener('click', toggleTheme);
  btnExportPdf.addEventListener('click', () => { if (doc.loaded) PDFExport.showModal(); });
  btnSplit.addEventListener('click', () => setSetting('splitView', !(settings && settings.splitView)).then(applySplit));
  btnFind.addEventListener('click', () => FindBar.open());

  // =====================================================================
  // Ereignisse vom Main-Prozess
  // =====================================================================

  window.api.on('file-opened', (filePath) => openDocument(filePath, { targetMode: 'visualizer' }));

  window.api.on('file-changed', async (filePath) => {
    if (!doc.filePath || filePath.toLowerCase() !== doc.filePath.toLowerCase()) return;
    if (doc.isDirty) {
      const choice = await window.api.confirmReloadExternal(doc.fileName);
      if (choice !== 'reload') return;
    }
    const scrollPos = contentArea.scrollTop;
    await loadFile(filePath, { preserveMode: true, preserveCursor: true, preserveScroll: true });
    if (currentMode === 'visualizer') {
      requestAnimationFrame(() => { contentArea.scrollTop = scrollPos; });
    }
    Toast.info('Datei wurde extern geändert und neu geladen', { duration: 2500 });
  });

  window.api.on('file-removed', (filePath) => {
    if (!doc.filePath || filePath.toLowerCase() !== doc.filePath.toLowerCase()) return;
    setDirty(true);
    Toast.warning('Die Datei wurde außerhalb der Anwendung gelöscht oder verschoben. Mit Speichern wird sie neu angelegt.', { duration: 8000 });
  });

  window.api.on('request-close', async () => {
    if (closing) return;
    closing = true;
    try {
      if (!doc.isDirty) { await window.api.confirmClose(); return; }
      const choice = await window.api.confirmDiscard(doc.fileName || 'Unbenannt');
      if (choice === 'cancel') return;
      if (choice === 'save') {
        const saved = await saveFile();
        if (!saved) return;
      }
      await window.api.confirmClose();
    } finally {
      closing = false;
    }
  });

  // Befehle kommen über das Menü (Accelerator) ODER die Tastatur im Renderer.
  // Beide Wege laufen hier zusammen; identische Befehle innerhalb von 250 ms werden entprellt.
  let lastCommand = { name: null, payload: null, time: 0 };

  async function dispatchCommand(command, payload) {
    const now = performance.now();
    if (lastCommand.name === command && lastCommand.payload === payload && now - lastCommand.time < 250) return;
    lastCommand = { name: command, payload, time: now };
    switch (command) {
      case 'new-file': if (await confirmDiscardIfDirty()) newDocument(); break;
      case 'open-file': openFileDialog(); break;
      case 'open-recent': openDocument(payload, { targetMode: 'visualizer' }); break;
      case 'save': if (doc.loaded) saveFile(); break;
      case 'save-as': if (doc.loaded) saveFileAs(); break;
      case 'export-pdf': if (doc.loaded) PDFExport.showModal(); break;
      case 'export-html': if (doc.loaded) PDFExport.exportHtml(); break;
      case 'show-in-folder': if (doc.filePath) window.api.showInFolder(doc.filePath); else Toast.info('Das Dokument wurde noch nicht gespeichert.'); break;
      case 'copy-path':
        if (doc.filePath) { window.api.copyToClipboard(doc.filePath); Toast.success('Pfad kopiert'); }
        break;
      case 'find': if (doc.loaded) FindBar.open(); break;
      case 'replace': if (doc.loaded) FindBar.open({ replace: true }); break;
      case 'goto-line': showGotoDialog(); break;
      case 'toggle-fix-syntax': if (doc.loaded) switchMode(currentMode === 'fix-syntax' ? 'visualizer' : 'fix-syntax'); break;
      case 'run-code': toggleRunCode(); break;
      case 'switch-mode': if (doc.loaded) switchMode(payload); break;
      case 'toggle-editor': if (doc.loaded) switchMode(currentMode === 'editor' ? 'visualizer' : 'editor'); break;
      case 'toggle-theme': toggleTheme(); break;
      case 'toggle-split': if (doc.loaded) setSetting('splitView', !(settings && settings.splitView)).then(applySplit); break;
      case 'toggle-toc': if (tocAvailable()) setTocVisible(!(settings && settings.tocVisible)); break;
      case 'zoom-in': zoomBy(10); break;
      case 'zoom-out': zoomBy(-10); break;
      case 'zoom-reset': zoomReset(); break;
      case 'show-help': showHelp(); break;
      default: break;
    }
  }

  window.api.on('command', (command, payload) => dispatchCommand(command, payload));

  // =====================================================================
  // Tastatur – Fallback für alle Menü-Kürzel plus Kürzel ohne Menüeintrag
  // =====================================================================

  function commandForKey(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'F1') return ['show-help'];
    if (!ctrl || e.altKey) return null;
    if (e.shiftKey) {
      switch (key) {
        case 's': return ['save-as'];
        case 'e': return ['export-pdf'];
        case 'h': return ['export-html'];
        case 'f': return ['toggle-fix-syntax'];
        case '+': case '=': return ['zoom-in'];
        default: return null;
      }
    }
    switch (key) {
      case 'n': return ['new-file'];
      case 'o': return ['open-file'];
      case 's': return ['save'];
      case 'f': return ['find'];
      case 'h': return ['replace'];
      case 'g': return ['goto-line'];
      case 'r': return ['run-code'];
      case '1': return ['switch-mode', 'visualizer'];
      case '2': return ['switch-mode', 'editor'];
      case '3': return ['switch-mode', 'fix-syntax'];
      case 'e': return ['toggle-editor'];
      case '\\': return ['toggle-split'];
      case 'b': return ['toggle-toc'];
      case 't': return ['toggle-theme'];
      case '=': case '+': return ['zoom-in'];
      case '-': return ['zoom-out'];
      case '0': return ['zoom-reset'];
      default: return null;
    }
  }

  document.addEventListener('keydown', (e) => {
    const mapped = commandForKey(e);
    if (mapped) {
      e.preventDefault();
      dispatchCommand(mapped[0], mapped[1]);
      return;
    }
    if (e.key === 'Escape') {
      if (!gotoDialog.classList.contains('hidden')) hideGotoDialog();
      else if (!dropDecisionModal.classList.contains('hidden')) resolveDropDecision('cancel');
      else if (!helpModal.classList.contains('hidden')) hideHelp();
      else if (PDFExport.isOpen()) PDFExport.hideModal();
      else if (FindBar.isOpen()) FindBar.close();
      return;
    }
    const inInput = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
    if (e.key === '?' && !inInput && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      showHelp();
    }
    if (e.key === 'F3') {
      e.preventDefault();
      if (FindBar.isOpen()) { e.shiftKey ? FindBar.prev() : FindBar.next(); } else if (doc.loaded) FindBar.open();
    }
  });

  // Fenster-Resize: Scroll-Spy-Positionen aktualisieren
  window.addEventListener('resize', () => ScrollSpy.refresh());

  // =====================================================================
  // Start
  // =====================================================================

  (async () => {
    try {
      applySettings(await window.api.getSettings());
    } catch (err) {
      console.error('Einstellungen konnten nicht geladen werden:', err);
      settings = { zoom: 100, tocVisible: true, readingWidth: true, splitView: false, splitRatio: 0.5, spellcheck: true, pdf: {} };
    }
    renderRecentFiles();
    try {
      const initialFile = await window.api.getInitialFile();
      if (initialFile) await loadFile(initialFile, { targetMode: 'visualizer' });
    } catch (err) {
      Toast.error(cleanError(err), { title: 'Datei konnte nicht geöffnet werden' });
    }
  })();
})();
