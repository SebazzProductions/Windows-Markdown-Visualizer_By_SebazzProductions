const { ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { renderMarkdown, renderMarkdownToHtml } = require('./markdown-engine');
const { getHandler, getSupportedExtensions, getDialogFilters } = require('./format-registry');

// Load all format handlers (registers them in the registry)
require('./formats/markdown-handler');
require('./formats/html-handler');
require('./formats/css-handler');
require('./formats/js-handler');
require('./formats/ts-handler');
require('./formats/json-handler');
require('./formats/text-handler');

function setupIpcHandlers(getInitialFile) {
  // Initial file (opened via file association / command line)
  ipcMain.handle('get-initial-file', () => {
    return getInitialFile ? getInitialFile() : null;
  });

  // Markdown rendering
  ipcMain.handle('render-markdown', (_event, source) => {
    return renderMarkdown(source);
  });

  ipcMain.handle('render-markdown-html', (_event, source) => {
    return renderMarkdownToHtml(source);
  });

  // Detect format for a file
  ipcMain.handle('detect-format', (_event, filePath, content) => {
    const handler = getHandler(filePath, content);
    if (!handler) return { id: 'unknown', label: 'Unbekannt' };
    return { id: handler.id, label: handler.label };
  });

  // Format / beautify code via handler
  ipcMain.handle('format-code', (_event, filePath, source) => {
    const handler = getHandler(filePath, source);
    if (!handler || !handler.format) {
      return { formatted: source, issues: [] };
    }
    return handler.format(source);
  });

  // Transpile TypeScript
  ipcMain.handle('transpile-ts', (_event, source) => {
    const handler = getHandler('.ts');
    if (!handler || !handler.transpile) {
      return { code: null, error: 'TypeScript-Handler nicht gefunden' };
    }
    return handler.transpile(source);
  });

  // Resolve HTML assets (CSS/JS references)
  ipcMain.handle('resolve-html-assets', async (_event, htmlSource, basePath) => {
    if (!basePath) return htmlSource;
    const dir = path.dirname(basePath);

    // Replace relative <link href="..."> with inline <style>
    let result = htmlSource;
    const linkRegex = /<link\s+[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
    let match;
    const cssReplacements = [];

    while ((match = linkRegex.exec(htmlSource)) !== null) {
      const href = match[1];
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) continue;
      const cssPath = path.resolve(dir, href);
      try {
        const cssContent = await fs.promises.readFile(cssPath, 'utf-8');
        cssReplacements.push({ original: match[0], replacement: `<style>/* ${href} */\n${cssContent}\n</style>` });
      } catch { /* skip missing files */ }
    }

    for (const rep of cssReplacements) {
      result = result.replace(rep.original, rep.replacement);
    }

    // Replace relative <script src="..."> with inline <script>
    const scriptRegex = /<script\s+[^>]*src=["']([^"']+\.(?:js|mjs))["'][^>]*>\s*<\/script>/gi;
    const jsReplacements = [];

    while ((match = scriptRegex.exec(htmlSource)) !== null) {
      const src = match[1];
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) continue;
      const jsPath = path.resolve(dir, src);
      try {
        const jsContent = await fs.promises.readFile(jsPath, 'utf-8');
        jsReplacements.push({ original: match[0], replacement: `<script>/* ${src} */\n${jsContent}\n</script>` });
      } catch { /* skip missing files */ }
    }

    for (const rep of jsReplacements) {
      result = result.replace(rep.original, rep.replacement);
    }

    return result;
  });

  // Open file dialog — dynamic filters from registry
  ipcMain.handle('open-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Datei öffnen',
      filters: getDialogFilters(),
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Read file content — dynamic extensions from registry
  ipcMain.handle('read-file', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Ungültiger Dateipfad');
    }

    const resolvedPath = path.resolve(filePath);

    // Ensure the path has a valid extension
    const ext = path.extname(resolvedPath).toLowerCase();
    const allowedExtensions = getSupportedExtensions();
    if (!allowedExtensions.includes(ext)) {
      throw new Error('Nicht unterstütztes Dateiformat');
    }

    // Check file exists and is a file (not directory)
    const stat = await fs.promises.stat(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Pfad ist keine Datei');
    }

    // Limit file size (10 MB)
    if (stat.size > 10 * 1024 * 1024) {
      throw new Error('Datei ist zu groß (max. 10 MB)');
    }

    const content = await fs.promises.readFile(resolvedPath, 'utf-8');
    return { content, filePath: resolvedPath, fileName: path.basename(resolvedPath) };
  });

  // Save file
  ipcMain.handle('save-file', async (_event, filePath, content) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Ungültiger Dateipfad');
    }
    const resolvedPath = path.resolve(filePath);
    await fs.promises.writeFile(resolvedPath, content, 'utf-8');
    return { success: true, filePath: resolvedPath };
  });

  // Save file as (dialog)
  ipcMain.handle('save-file-as', async (event, content, defaultName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'Speichern unter',
      defaultPath: defaultName || 'untitled.md',
      filters: getDialogFilters()
    });
    if (result.canceled) return { success: false, canceled: true };
    await fs.promises.writeFile(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath, fileName: path.basename(result.filePath) };
  });

  // Resolve relative image paths
  ipcMain.handle('resolve-path', (_event, basePath, relativePath) => {
    if (!basePath || !relativePath) return null;
    const dir = path.dirname(basePath);
    return path.resolve(dir, relativePath);
  });

  // Export to PDF
  ipcMain.handle('export-pdf', async (event, htmlContent, options = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const targetPath = typeof options.targetPath === 'string' && options.targetPath.trim()
      ? path.resolve(options.targetPath)
      : null;

    let outputPath = targetPath;

    if (!outputPath) {
      const saveResult = await dialog.showSaveDialog(win, {
        title: 'PDF exportieren',
        defaultPath: options.defaultFileName || 'dokument.pdf',
        filters: [{ name: 'PDF-Dateien', extensions: ['pdf'] }]
      });

      if (saveResult.canceled) return { success: false, canceled: true };
      outputPath = saveResult.filePath;
    }

    // Create hidden window for PDF rendering
    const pdfWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    try {
      await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

      // Wait for content to fully render
      await new Promise(resolve => setTimeout(resolve, 500));

      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: options.pageSize || 'A4',
        margins: {
          top: 0.6,
          bottom: 0.6,
          left: 0.6,
          right: 0.6
        }
      });

      await fs.promises.writeFile(outputPath, pdfBuffer);
      return { success: true, filePath: outputPath };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      pdfWindow.destroy();
    }
  });

  // Watch file for changes
  let fileWatcher = null;
  ipcMain.handle('watch-file', (_event, filePath) => {
    if (fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
    }

    if (!filePath) return;

    const resolvedPath = path.resolve(filePath);
    try {
      fileWatcher = fs.watch(resolvedPath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.webContents.send('file-changed', resolvedPath);
          }
        }
      });
    } catch {
      // Silently ignore watch errors
    }
  });

  // Set window title
  ipcMain.handle('set-title', (event, title) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setTitle(title);
  });
}

module.exports = { setupIpcHandlers };
