/**
 * IPC-Handler – die gesamte Schnittstelle zwischen Renderer und Main-Prozess.
 */
const { ipcMain, dialog, BrowserWindow, shell, clipboard, app, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { renderMarkdown, extractHeadings } = require('./markdown-engine');
const { highlightCode } = require('./highlighter');
const { getHandler, getLanguageFor, getSupportedExtensions, getDialogFilters, getAllFormats } = require('./format-registry');
const { readTextFile, writeTextFile, FileWatcher } = require('./file-service');
const { exportPdf, exportHtml, exportSvg } = require('./export-service');
const { settings } = require('./settings');
const { popupAppMenu } = require('./menu');
const { t, effectiveLanguage } = require('./i18n');

require('./formats');

const MAX_INLINE_ASSET = 8 * 1024 * 1024;
const IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif'
};

function windowOf(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function effectiveTheme() {
  const th = settings.get('theme');
  return th === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : th;
}

function dialogFilters() {
  return getDialogFilters({ allSupported: t('dialog.allSupported'), allFiles: t('dialog.allFiles') });
}

function describeHandler(handler, filePath) {
  if (!handler) return { id: 'text', label: 'Text', kind: 'text', language: 'plaintext', canFormat: false, canExecute: false };
  return {
    id: handler.id,
    label: handler.label,
    kind: handler.kind || 'code',
    language: typeof handler.languageFor === 'function' ? handler.languageFor(filePath) : (handler.language || 'plaintext'),
    canFormat: typeof handler.format === 'function',
    canExecute: handler.id === 'javascript' || handler.id === 'typescript'
  };
}

/**
 * Zielpfad für einen Export ermitteln: entweder vorgegeben (Tests) oder per Speichern-Dialog.
 */
async function resolveExportPath(win, state, payload, { title, defaultName, filterName, extensions }) {
  if (typeof payload.targetPath === 'string' && payload.targetPath.trim()) return path.resolve(payload.targetPath);
  const dir = state.currentFilePath ? path.dirname(state.currentFilePath) : app.getPath('documents');
  const saveResult = await dialog.showSaveDialog(win, {
    title,
    defaultPath: path.join(dir, payload.defaultFileName || defaultName),
    filters: [{ name: filterName, extensions }]
  });
  if (saveResult.canceled || !saveResult.filePath) return null;
  return saveResult.filePath;
}

function setupIpcHandlers({ getInitialFile, state }) {
  const fileWatcher = new FileWatcher();

  // ---- App / Einstellungen ----
  ipcMain.handle('get-initial-file', () => (getInitialFile ? getInitialFile() : null));

  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    formats: getAllFormats()
  }));

  ipcMain.handle('get-settings', () => ({
    ...settings.getAll(),
    effectiveTheme: effectiveTheme(),
    effectiveLanguage: effectiveLanguage()
  }));
  ipcMain.handle('set-setting', (_e, key, value) => settings.set(key, value));
  ipcMain.handle('get-recent-files', () => {
    const list = settings.get('recentFiles').filter(p => {
      try { return fs.statSync(p).isFile(); } catch { return false; }
    });
    if (list.length !== settings.get('recentFiles').length) settings.set('recentFiles', list);
    return list;
  });
  ipcMain.handle('remove-recent-file', (_e, p) => settings.removeRecentFile(p));
  ipcMain.handle('clear-recent-files', () => settings.clearRecentFiles());

  // ---- Rendering ----
  ipcMain.handle('render-markdown', (_e, source) => renderMarkdown(source, { frontMatterLabel: t('exportDoc.frontMatter') }));
  ipcMain.handle('extract-headings', (_e, source) => extractHeadings(source));
  ipcMain.handle('highlight-code', (_e, source, lang) => highlightCode(source, lang));

  ipcMain.handle('detect-format', (_e, filePath, content) => {
    const handler = getHandler(filePath, content);
    return describeHandler(handler, filePath);
  });

  ipcMain.handle('format-code', async (_e, filePath, source) => {
    const handler = getHandler(filePath, source);
    if (!handler || typeof handler.format !== 'function') {
      return { formatted: source, issues: [] };
    }
    try {
      const result = await handler.format(source, filePath);
      return { formatted: typeof result.formatted === 'string' ? result.formatted : source, issues: Array.isArray(result.issues) ? result.issues : [] };
    } catch (err) {
      return { formatted: source, issues: [{ line: 1, message: t('fix.failed', { error: err.message }), severity: 'error' }] };
    }
  });

  ipcMain.handle('transpile-ts', (_e, source) => {
    const handler = getHandler('.ts');
    if (!handler || !handler.transpile) return { code: null, error: 'TypeScript-Handler nicht gefunden' };
    return handler.transpile(source);
  });

  /**
   * HTML-Vorschau: relative CSS/JS/Bild-Referenzen einbetten, damit sie in der
   * sandboxed Blob-iframe (ohne Dateizugriff) funktionieren.
   */
  ipcMain.handle('resolve-html-assets', async (_e, htmlSource, basePath) => {
    if (!basePath || typeof htmlSource !== 'string') return htmlSource;
    const dir = path.dirname(basePath);
    const isRemote = (ref) => /^(https?:)?\/\//i.test(ref) || /^(data|blob|mailto|javascript):/i.test(ref);
    const readLocal = async (ref) => {
      const clean = decodeURIComponent(ref.replace(/[?#].*$/, ''));
      const target = path.resolve(dir, clean);
      const stat = await fs.promises.stat(target);
      if (!stat.isFile() || stat.size > MAX_INLINE_ASSET) throw new Error('skip');
      return { target, buffer: await fs.promises.readFile(target) };
    };

    let result = htmlSource;

    // <link rel="stylesheet" href="…">
    for (const m of [...htmlSource.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]) {
      const href = m[1];
      if (isRemote(href) || !/\.css(\?|#|$)/i.test(href) || !/stylesheet/i.test(m[0]) && !/\.css/i.test(href)) continue;
      try {
        const { buffer } = await readLocal(href);
        result = result.replace(m[0], `<style data-src="${href}">\n${buffer.toString('utf-8').replace(/<\/style/gi, '<\\/style')}\n</style>`);
      } catch { /* fehlende Datei überspringen */ }
    }

    // <script src="…"></script>
    for (const m of [...htmlSource.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi)]) {
      const src = m[2];
      if (isRemote(src)) continue;
      try {
        const { buffer } = await readLocal(src);
        const attrs = `${m[1]} ${m[3]}`.replace(/\bsrc=["'][^"']*["']/i, '').trim();
        result = result.replace(m[0], `<script ${attrs} data-src="${src}">\n${buffer.toString('utf-8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
      } catch { /* fehlende Datei überspringen */ }
    }

    // <img src="…"> → data:-URI
    for (const m of [...htmlSource.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]) {
      const src = m[1];
      if (isRemote(src)) continue;
      try {
        const { target, buffer } = await readLocal(src);
        const mime = IMAGE_MIME[path.extname(target).toLowerCase()];
        if (!mime) continue;
        result = result.replace(m[0], m[0].replace(src, `data:${mime};base64,${buffer.toString('base64')}`));
      } catch { /* überspringen */ }
    }

    return result;
  });

  // ---- Dateien ----
  ipcMain.handle('open-file-dialog', async (event) => {
    const win = windowOf(event);
    const defaultPath = state.currentFilePath ? path.dirname(state.currentFilePath) : undefined;
    const result = await dialog.showOpenDialog(win, {
      title: t('dialog.open'),
      defaultPath,
      filters: dialogFilters(),
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('read-file', async (_e, filePath) => {
    const result = await readTextFile(filePath);
    settings.addRecentFile(result.filePath);
    app.addRecentDocument(result.filePath);
    return result;
  });

  ipcMain.handle('save-file', async (_e, filePath, content, options) => {
    return writeTextFile(filePath, content, options || {});
  });

  ipcMain.handle('save-file-as', async (event, content, defaultName, options) => {
    const win = windowOf(event);
    const dir = state.currentFilePath ? path.dirname(state.currentFilePath) : app.getPath('documents');
    const result = await dialog.showSaveDialog(win, {
      title: t('dialog.saveAs'),
      defaultPath: path.join(dir, defaultName || 'unbenannt.md'),
      filters: dialogFilters()
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    const written = await writeTextFile(result.filePath, content, options || {});
    settings.addRecentFile(written.filePath);
    return written;
  });

  ipcMain.handle('resolve-path', async (_e, basePath, relativePath) => {
    if (!basePath || !relativePath) return null;
    try {
      const clean = decodeURIComponent(String(relativePath).replace(/[?#].*$/, ''));
      const resolved = path.resolve(path.dirname(basePath), clean);
      let exists = false;
      let isFile = false;
      try {
        const st = await fs.promises.stat(resolved);
        exists = true;
        isFile = st.isFile();
      } catch { /* nicht vorhanden */ }
      const ext = path.extname(resolved).toLowerCase();
      return {
        path: resolved,
        url: pathToFileURL(resolved).href,
        exists,
        isFile,
        supported: isFile && (getSupportedExtensions().includes(ext) || ext === '')
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle('watch-file', (event, filePath) => {
    const win = windowOf(event);
    if (!filePath) {
      fileWatcher.close();
      return;
    }
    fileWatcher.watch(filePath, {
      onChange: (result) => {
        if (win && !win.isDestroyed()) win.webContents.send('file-changed', result.filePath);
      },
      onRemove: (p) => {
        if (win && !win.isDestroyed()) win.webContents.send('file-removed', p);
      }
    });
  });

  ipcMain.handle('set-title', (event, title) => {
    const win = windowOf(event);
    if (win) win.setTitle(title || t('app.name'));
  });

  ipcMain.handle('set-document-state', (_e, docState) => {
    state.isDirty = Boolean(docState && docState.isDirty);
    state.currentFilePath = docState && docState.filePath ? docState.filePath : null;
  });

  // ---- Dialoge ----
  ipcMain.handle('show-message', async (event, { type = 'info', title, message, detail }) => {
    const win = windowOf(event);
    await dialog.showMessageBox(win, { type, title: title || t('app.name'), message: String(message || ''), detail, buttons: [t('common.ok')], noLink: true });
  });

  ipcMain.handle('confirm-close', (event) => {
    const win = windowOf(event);
    if (win) {
      state.forceClose = true;
      win.close();
    }
  });

  // ---- Export ----
  ipcMain.handle('export-pdf', async (event, payload = {}) => {
    const win = windowOf(event);
    const outputPath = await resolveExportPath(win, state, payload, {
      title: t('dialog.exportPdf'), defaultName: 'dokument.pdf', filterName: t('dialog.pdfFiles'), extensions: ['pdf']
    });
    if (!outputPath) return { success: false, canceled: true };
    if (payload.options) settings.set('pdf', {
      includeToc: Boolean(payload.options.includeToc),
      pageSize: payload.options.pageSize,
      landscape: Boolean(payload.options.landscape),
      pageNumbers: Boolean(payload.options.pageNumbers),
      lineNumbers: Boolean(payload.options.lineNumbers),
      outline: Boolean(payload.options.outline)
    });
    try {
      return await exportPdf({ ...payload, outputPath, lang: effectiveLanguage(), tocTitle: t('exportDoc.toc') });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-html', async (event, payload = {}) => {
    const win = windowOf(event);
    const outputPath = await resolveExportPath(win, state, payload, {
      title: t('dialog.exportHtml'), defaultName: 'dokument.html', filterName: t('dialog.htmlFiles'), extensions: ['html']
    });
    if (!outputPath) return { success: false, canceled: true };
    try {
      return await exportHtml({ ...payload, outputPath, lang: effectiveLanguage(), tocTitle: t('exportDoc.toc') });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-svg', async (event, payload = {}) => {
    const win = windowOf(event);
    const outputPath = await resolveExportPath(win, state, payload, {
      title: t('dialog.exportSvg'), defaultName: 'diagramm.svg', filterName: t('dialog.svgFiles'), extensions: ['svg']
    });
    if (!outputPath) return { success: false, canceled: true };
    try {
      return await exportSvg({ ...payload, outputPath });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---- Shell / System ----
  ipcMain.handle('show-in-folder', (_e, filePath) => {
    if (filePath && typeof filePath === 'string') shell.showItemInFolder(path.resolve(filePath));
  });
  ipcMain.handle('open-path', async (_e, filePath) => {
    if (!filePath || typeof filePath !== 'string') return 'Ungültiger Pfad';
    return shell.openPath(path.resolve(filePath));
  });
  ipcMain.handle('open-external', (_e, url) => {
    if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) return shell.openExternal(url);
    return Promise.resolve();
  });
  ipcMain.handle('copy-to-clipboard', (_e, text) => {
    clipboard.writeText(String(text ?? ''));
  });
  ipcMain.handle('show-app-menu', (event, x, y) => {
    popupAppMenu(windowOf(event), x, y);
  });
  ipcMain.handle('get-language-for', (_e, filePath, content) => getLanguageFor(filePath, content));

  return { fileWatcher };
}

module.exports = { setupIpcHandlers, effectiveTheme };
