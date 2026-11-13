/**
 * Preload – sichere IPC-Brücke (contextBridge). Der Renderer erhält nur die hier
 * freigegebenen Funktionen; Ereignis-Kanäle sind explizit aufgelistet.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const EVENT_CHANNELS = new Set([
  'file-opened',
  'file-changed',
  'file-removed',
  'command',
  'settings-changed',
  'theme-changed',
  'language-changed',
  'request-close'
]);

function on(channel, callback) {
  if (!EVENT_CHANNELS.has(channel)) {
    throw new Error(`Unbekannter Ereigniskanal: ${channel}`);
  }
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('api', {
  // App & Einstellungen
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getInitialFile: () => ipcRenderer.invoke('get-initial-file'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  removeRecentFile: (filePath) => ipcRenderer.invoke('remove-recent-file', filePath),
  clearRecentFiles: () => ipcRenderer.invoke('clear-recent-files'),

  // Rendering
  renderMarkdown: (source) => ipcRenderer.invoke('render-markdown', source),
  extractHeadings: (source) => ipcRenderer.invoke('extract-headings', source),
  highlightCode: (source, lang) => ipcRenderer.invoke('highlight-code', source, lang),
  detectFormat: (filePath, content) => ipcRenderer.invoke('detect-format', filePath, content),
  getLanguageFor: (filePath, content) => ipcRenderer.invoke('get-language-for', filePath, content),
  formatCode: (filePath, source) => ipcRenderer.invoke('format-code', filePath, source),
  transpileTs: (source) => ipcRenderer.invoke('transpile-ts', source),
  resolveHtmlAssets: (htmlSource, basePath) => ipcRenderer.invoke('resolve-html-assets', htmlSource, basePath),

  // Dateien
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath, content, options) => ipcRenderer.invoke('save-file', filePath, content, options),
  saveFileAs: (content, defaultName, options) => ipcRenderer.invoke('save-file-as', content, defaultName, options),
  resolvePath: (basePath, relativePath) => ipcRenderer.invoke('resolve-path', basePath, relativePath),
  watchFile: (filePath) => ipcRenderer.invoke('watch-file', filePath),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  setDocumentState: (docState) => ipcRenderer.invoke('set-document-state', docState),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),

  // Dialoge / Fenster
  showMessage: (options) => ipcRenderer.invoke('show-message', options),
  confirmClose: () => ipcRenderer.invoke('confirm-close'),

  // Export
  exportPDF: (payload) => ipcRenderer.invoke('export-pdf', payload),
  exportHTML: (payload) => ipcRenderer.invoke('export-html', payload),
  exportSVG: (payload) => ipcRenderer.invoke('export-svg', payload),

  // Shell / System
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  showAppMenu: (x, y) => ipcRenderer.invoke('show-app-menu', x, y),

  // Ereignisse vom Main-Prozess
  on
});
