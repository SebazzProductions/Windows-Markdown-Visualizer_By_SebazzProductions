/**
 * Markdown Visualizer – Main-Prozess-Einstiegspunkt
 */
const { app, BrowserWindow, shell, nativeTheme, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Testläufe (Playwright) nutzen ein eigenes userData-Verzeichnis
if (process.env.MV_USER_DATA_DIR) {
  app.setPath('userData', process.env.MV_USER_DATA_DIR);
}
const IS_E2E = process.env.MV_E2E === '1';

const { settings } = require('./settings');
const { setupIpcHandlers } = require('./ipc-handlers');
const { createAppMenu } = require('./menu');
const { attachContextMenu } = require('./context-menu');

app.setAppUserModelId('com.markdownvisualizer.app');
// Im Entwicklungsmodus liefert app.getVersion() sonst die Electron-Version
try { app.setVersion(require('../../package.json').version); } catch { /* ignore */ }

const THEME_COLORS = {
  light: { background: '#ffffff', overlay: '#ffffff', symbol: '#5a5d7a' },
  dark: { background: '#13141f', overlay: '#181928', symbol: '#9a9cb8' }
};
const TOOLBAR_HEIGHT = 44;

let mainWindow = null;
let fileToOpen = null;

/** Zustand, den der Main-Prozess über den Renderer kennen muss */
const state = {
  isDirty: false,
  currentFilePath: null,
  forceClose: false
};

// ---- Einzelinstanz ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = extractFilePathFromArgs(argv);
    if (mainWindow) {
      if (filePath) mainWindow.webContents.send('file-opened', filePath);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function extractFilePathFromArgs(argv) {
  const ownEntry = path.resolve(__filename);
  for (let i = argv.length - 1; i >= 1; i--) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-') || arg === '.') continue;
    try {
      const resolved = path.resolve(arg);
      if (resolved === ownEntry || resolved === path.resolve(app.getAppPath())) continue; // "electron ." bzw. "electron src/main/main.js"
      if (fs.statSync(resolved).isFile()) return resolved;
    } catch {
      // kein Dateipfad
    }
  }
  return null;
}

function effectiveTheme() {
  const t = settings.get('theme');
  return t === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : t;
}

function applyTheme() {
  const theme = effectiveTheme();
  const colors = THEME_COLORS[theme];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(colors.background);
    if (process.platform === 'win32' && typeof mainWindow.setTitleBarOverlay === 'function') {
      try {
        mainWindow.setTitleBarOverlay({ color: colors.overlay, symbolColor: colors.symbol, height: TOOLBAR_HEIGHT });
      } catch { /* z. B. ohne Overlay-Unterstützung */ }
    }
    mainWindow.webContents.send('theme-changed', theme);
  }
}

function restoreWindowState() {
  const saved = settings.get('windowState') || {};
  const width = Math.max(600, Number(saved.width) || 1200);
  const height = Math.max(400, Number(saved.height) || 800);
  const bounds = { width, height };
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const display = screen.getDisplayMatching({ x: saved.x, y: saved.y, width, height });
    const area = display.workArea;
    // Nur wiederherstellen, wenn das Fenster noch sichtbar auf einem Display liegt
    if (saved.x + width > area.x + 50 && saved.x < area.x + area.width - 50 &&
        saved.y >= area.y - 10 && saved.y < area.y + area.height - 50) {
      bounds.x = saved.x;
      bounds.y = saved.y;
    }
  }
  return { bounds, maximized: Boolean(saved.maximized) };
}

function trackWindowState(win) {
  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const maximized = win.isMaximized();
      const b = maximized ? win.getNormalBounds() : win.getBounds();
      settings.set('windowState', { x: b.x, y: b.y, width: b.width, height: b.height, maximized }, { silent: true });
    }, 250);
  };
  win.on('resize', persist);
  win.on('move', persist);
  win.on('maximize', persist);
  win.on('unmaximize', persist);
}

function createWindow() {
  const theme = effectiveTheme();
  const colors = THEME_COLORS[theme];
  const { bounds, maximized } = restoreWindowState();

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 600,
    minHeight: 400,
    show: false,
    backgroundColor: colors.background,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: colors.overlay, symbolColor: colors.symbol, height: TOOLBAR_HEIGHT },
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (maximized) mainWindow.maximize();
    mainWindow.show();
  });

  // Externe Links im Standardbrowser öffnen, alles andere blockieren
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Navigation des Hauptfensters verhindern (z. B. Drop eines Links)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') || !url.includes('renderer')) event.preventDefault();
  });

  // Ungespeicherte Änderungen beim Schließen abfangen
  mainWindow.on('close', (event) => {
    if (state.forceClose || !state.isDirty || IS_E2E) return;
    event.preventDefault();
    mainWindow.webContents.send('request-close');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  trackWindowState(mainWindow);
  attachContextMenu(mainWindow);
  return mainWindow;
}

function getAndClearFileToOpen() {
  const f = fileToOpen;
  fileToOpen = null;
  return f;
}

app.whenReady().then(() => {
  settings.init();
  nativeTheme.themeSource = settings.get('theme');

  try {
    session.defaultSession.setSpellCheckerLanguages(['de-DE', 'en-US']);
  } catch { /* Sprache ggf. nicht verfügbar */ }
  session.defaultSession.setSpellCheckerEnabled(Boolean(settings.get('spellcheck')));

  fileToOpen = extractFilePathFromArgs(process.argv);

  setupIpcHandlers({ getInitialFile: getAndClearFileToOpen, state });

  const win = createWindow();
  createAppMenu(win);

  settings.on('change', (key, value) => {
    if (key === 'theme') {
      nativeTheme.themeSource = value;
      applyTheme();
    }
    if (key === 'spellcheck') {
      session.defaultSession.setSpellCheckerEnabled(Boolean(value));
    }
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings-changed', key, value);
    }
  });

  nativeTheme.on('updated', () => {
    if (settings.get('theme') === 'system') applyTheme();
  });
});

app.on('window-all-closed', () => {
  settings.flush();
  app.quit();
});

app.on('before-quit', () => {
  settings.flush();
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('file-opened', filePath);
  } else {
    fileToOpen = filePath;
  }
});

module.exports = { getMainWindow: () => mainWindow };
