const { ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { renderMarkdown, renderMarkdownToHtml } = require('./markdown-engine');

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

  // Open file dialog
  ipcMain.handle('open-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Markdown-Datei öffnen',
      filters: [
        { name: 'Markdown-Dateien', extensions: ['md', 'markdown'] },
        { name: 'Textdateien', extensions: ['txt'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Read file content
  ipcMain.handle('read-file', async (_event, filePath) => {
    // Security: validate path
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Ungültiger Dateipfad');
    }

    const resolvedPath = path.resolve(filePath);

    // Ensure the path has a valid extension
    const ext = path.extname(resolvedPath).toLowerCase();
    const allowedExtensions = ['.md', '.markdown', '.txt'];
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

  // Resolve relative image paths
  ipcMain.handle('resolve-path', (_event, basePath, relativePath) => {
    if (!basePath || !relativePath) return null;
    const dir = path.dirname(basePath);
    return path.resolve(dir, relativePath);
  });

  // Export to PDF
  ipcMain.handle('export-pdf', async (event, htmlContent, options = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    const saveResult = await dialog.showSaveDialog(win, {
      title: 'PDF exportieren',
      defaultPath: options.defaultFileName || 'dokument.pdf',
      filters: [{ name: 'PDF-Dateien', extensions: ['pdf'] }]
    });

    if (saveResult.canceled) return { success: false, canceled: true };

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

      await fs.promises.writeFile(saveResult.filePath, pdfBuffer);
      return { success: true, filePath: saveResult.filePath };
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
