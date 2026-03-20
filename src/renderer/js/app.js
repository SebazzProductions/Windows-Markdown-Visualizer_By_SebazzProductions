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

  // ---- DOM References ----
  const welcomeScreen = document.getElementById('welcome-screen');
  const appLayout = document.getElementById('app-layout');
  const tocSidebar = document.getElementById('toc-sidebar');
  const tocContent = document.getElementById('toc-content');
  const btnCollapseToc = document.getElementById('btn-collapse-toc');
  const btnExpandToc = document.getElementById('btn-expand-toc');
  const contentArea = document.getElementById('markdown-content');
  const fileNameEl = document.getElementById('file-name');
  const btnOpenFile = document.getElementById('btn-open-file');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const btnExportPdf = document.getElementById('btn-export-pdf');
  const dropOverlay = document.getElementById('drop-overlay');

  // ---- Initialize Modules ----
  TOCManager.init(tocContent, navigateToHeading);
  ScrollSpy.init(contentArea, (headingId) => {
    TOCManager.setActive(headingId);
  });
  PDFExport.initModal();

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

  // ---- File Loading ----
  async function openFileDialog() {
    try {
      const filePath = await window.api.openFile();
      if (filePath) {
        await loadFile(filePath);
      }
    } catch (err) {
      console.error('openFileDialog error:', err);
    }
  }

  async function loadFile(filePath) {
    try {
      const result = await window.api.readFile(filePath);
      currentFilePath = result.filePath;
      currentSource = result.content;

      // Render markdown (async IPC call to main process)
      const { html, headings } = await window.api.renderMarkdown(currentSource);
      currentHeadings = headings;

      // Update UI
      contentArea.innerHTML = html;
      fileNameEl.textContent = result.fileName;
      window.api.setTitle(`${result.fileName} – Markdown Visualizer`);

      // Process images - resolve relative paths
      await processImages(result.filePath);

      // Make external links open in default browser
      processLinks();

      // Update TOC
      TOCManager.update(headings);

      // Update PDF export data
      PDFExport.setDocumentData(currentSource, currentHeadings, result.fileName);

      // Show app layout, hide welcome
      welcomeScreen.classList.add('hidden');
      appLayout.classList.remove('hidden');

      // Start scroll spy (after DOM update)
      requestAnimationFrame(() => {
        ScrollSpy.observe();
      });

      // Watch file for external changes
      window.api.watchFile(result.filePath);

      // Scroll to top
      contentArea.scrollTop = 0;

    } catch (err) {
      console.error('Failed to load file:', err);
    }
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
          // shell.openExternal is handled by setWindowOpenHandler in main
          window.open(href, '_blank');
        });
      } else if (href && href.startsWith('#')) {
        // Internal anchor link
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const id = href.slice(1);
          navigateToHeading(id);
        });
      }
    });
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
      const name = file.name.toLowerCase();
      if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
        loadFile(file.path);
      }
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

  // ---- IPC Events from Main ----
  window.api.onFileOpened((filePath) => {
    loadFile(filePath);
  });

  window.api.onFileChanged(async (filePath) => {
    if (filePath === currentFilePath) {
      // Save scroll position
      const scrollPos = contentArea.scrollTop;
      await loadFile(filePath);
      // Restore scroll position
      requestAnimationFrame(() => {
        contentArea.scrollTop = scrollPos;
      });
    }
  });

  // ---- Menu Events ----
  window.api.onMenuOpenFile(openFileDialog);
  window.api.onMenuExportPDF(() => {
    if (currentSource) PDFExport.showModal();
  });
  window.api.onMenuToggleTOC(toggleToc);
  window.api.onMenuToggleTheme(toggleTheme);
  window.api.onMenuZoomIn(zoomIn);
  window.api.onMenuZoomOut(zoomOut);
  window.api.onMenuZoomReset(zoomReset);

  // ---- Keyboard Shortcuts (fallback for when menu doesn't capture) ----
  document.addEventListener('keydown', (e) => {
    // Ctrl+O - Open file
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      openFileDialog();
    }
  });

})();
