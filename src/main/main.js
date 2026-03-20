const { app, BrowserWindow, protocol, shell } = require('electron');
const path = require('path');
const { setupIpcHandlers } = require('./ipc-handlers');
const { createAppMenu } = require('./menu');

app.setAppUserModelId('com.markdownvisualizer.app');

let mainWindow = null;
let fileToOpen = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = extractFilePathFromArgs(argv);
    if (filePath && mainWindow) {
      mainWindow.webContents.send('file-opened', filePath);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function extractFilePathFromArgs(argv) {
  // In production, the file path is the last argument
  // In dev, skip electron executable and script path
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i];
    if (arg && !arg.startsWith('-') && !arg.startsWith('--') &&
        (arg.endsWith('.md') || arg.endsWith('.markdown') || arg.endsWith('.txt'))) {
      return path.resolve(arg);
    }
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Graceful show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// Register custom protocol for local file access (images etc.)
function registerProtocols() {
  protocol.registerFileProtocol('local-file', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('local-file://', ''));
    callback({ path: filePath });
  });
}

app.whenReady().then(() => {
  // Extract file path from command line args
  fileToOpen = extractFilePathFromArgs(process.argv);

  registerProtocols();
  setupIpcHandlers(getAndClearFileToOpen);

  const win = createWindow();
  createAppMenu(win);
});

function getAndClearFileToOpen() {
  const f = fileToOpen;
  fileToOpen = null;
  return f;
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('open-file', (_event, filePath) => {
  // macOS - not primary target but good to have
  if (mainWindow) {
    mainWindow.webContents.send('file-opened', filePath);
  } else {
    fileToOpen = filePath;
  }
});

module.exports = { getMainWindow: () => mainWindow };
