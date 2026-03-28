const { app, BrowserWindow, protocol, shell } = require('electron');
const path = require('path');
const { setupIpcHandlers } = require('./ipc-handlers');
const { createAppMenu } = require('./menu');
const { getSupportedExtensions } = require('./format-registry');

// Load all format handlers so registry is populated
require('./formats/markdown-handler');
require('./formats/html-handler');
require('./formats/css-handler');
require('./formats/js-handler');
require('./formats/ts-handler');
require('./formats/json-handler');
require('./formats/text-handler');

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
  const supported = getSupportedExtensions();
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i];
    if (arg && !arg.startsWith('-') && !arg.startsWith('--')) {
      const ext = path.extname(arg).toLowerCase();
      if (supported.includes(ext)) {
        return path.resolve(arg);
      }
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

  // Before close: check dirty state
  mainWindow.on('close', (e) => {
    // Renderer will handle dirty-state dialog via IPC
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
