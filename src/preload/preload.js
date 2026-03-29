const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Markdown rendering (delegated to main process)
  renderMarkdown: (source) => ipcRenderer.invoke('render-markdown', source),
  renderMarkdownToHtml: (source) => ipcRenderer.invoke('render-markdown-html', source),

  // Initial file (from command line / file association)
  getInitialFile: () => ipcRenderer.invoke('get-initial-file'),

  // File operations
  openFile: () => ipcRenderer.invoke('open-file'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  saveFileAs: (content, defaultName) => ipcRenderer.invoke('save-file-as', content, defaultName),
  resolvePath: (basePath, relativePath) => ipcRenderer.invoke('resolve-path', basePath, relativePath),
  watchFile: (filePath) => ipcRenderer.invoke('watch-file', filePath),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),

  // Format detection & processing
  detectFormat: (filePath, content) => ipcRenderer.invoke('detect-format', filePath, content),
  formatCode: (filePath, source) => ipcRenderer.invoke('format-code', filePath, source),
  transpileTs: (source) => ipcRenderer.invoke('transpile-ts', source),
  resolveHtmlAssets: (htmlSource, basePath) => ipcRenderer.invoke('resolve-html-assets', htmlSource, basePath),

  // PDF export
  exportPDF: (htmlContent, options) => ipcRenderer.invoke('export-pdf', htmlContent, options),

  // Events from main process
  onFileOpened: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('file-opened', handler);
    return () => ipcRenderer.removeListener('file-opened', handler);
  },

  onFileChanged: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },

  // Menu events
  onMenuOpenFile: (callback) => {
    ipcRenderer.on('menu-open-file', () => callback());
  },
  onMenuSaveFile: (callback) => {
    ipcRenderer.on('menu-save-file', () => callback());
  },
  onMenuSaveFileAs: (callback) => {
    ipcRenderer.on('menu-save-file-as', () => callback());
  },
  onMenuExportPDF: (callback) => {
    ipcRenderer.on('menu-export-pdf', () => callback());
  },
  onMenuToggleTOC: (callback) => {
    ipcRenderer.on('menu-toggle-toc', () => callback());
  },
  onMenuToggleTheme: (callback) => {
    ipcRenderer.on('menu-toggle-theme', () => callback());
  },
  onMenuZoomIn: (callback) => {
    ipcRenderer.on('menu-zoom-in', () => callback());
  },
  onMenuZoomOut: (callback) => {
    ipcRenderer.on('menu-zoom-out', () => callback());
  },
  onMenuZoomReset: (callback) => {
    ipcRenderer.on('menu-zoom-reset', () => callback());
  },
  onMenuSwitchVisualizer: (callback) => {
    ipcRenderer.on('menu-switch-visualizer', () => callback());
  },
  onMenuSwitchEditor: (callback) => {
    ipcRenderer.on('menu-switch-editor', () => callback());
  },
  onMenuSwitchFixSyntax: (callback) => {
    ipcRenderer.on('menu-switch-fix-syntax', () => callback());
  },
  onMenuGoToLine: (callback) => {
    ipcRenderer.on('menu-goto-line', () => callback());
  },
  onMenuRunCode: (callback) => {
    ipcRenderer.on('menu-run-code', () => callback());
  }
});
