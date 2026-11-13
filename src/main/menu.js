/**
 * Anwendungsmenü – wird dynamisch aus den Einstellungen gebaut
 * (zuletzt geöffnete Dateien, Theme, Sprache, Umschalter) und bei Änderungen neu gesetzt.
 *
 * Alle Aktionen werden als 'command' an den Renderer gesendet; Einstellungs-Umschalter
 * ändern direkt den Settings-Store (Renderer wird über 'settings-changed' informiert).
 */
const { Menu, app, shell, dialog } = require('electron');
const path = require('path');
const { settings } = require('./settings');
const { t } = require('./i18n');

const REPO_URL = 'https://github.com/SebazzProductions/Windows-Markdown-Visualizer_By_SebazzProductions';

let currentWindow = null;

function send(command, payload) {
  if (currentWindow && !currentWindow.isDestroyed()) {
    currentWindow.webContents.send('command', command, payload);
  }
}

function buildTemplate() {
  const s = settings.getAll();
  const recent = s.recentFiles || [];
  const appName = t('app.name');

  const recentSubmenu = recent.length === 0
    ? [{ label: t('menu.noEntries'), enabled: false }]
    : [
      ...recent.map((filePath, i) => ({
        label: `${i < 9 ? `&${i + 1}  ` : ''}${path.basename(filePath)}`,
        sublabel: path.dirname(filePath),
        toolTip: filePath,
        click: () => send('open-recent', filePath)
      })),
      { type: 'separator' },
      { label: t('menu.clearList'), click: () => settings.clearRecentFiles() }
    ];

  return [
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.new'), accelerator: 'CmdOrCtrl+N', click: () => send('new-file') },
        { label: t('menu.newDiagram'), accelerator: 'CmdOrCtrl+Shift+N', click: () => send('new-diagram') },
        { label: t('menu.open'), accelerator: 'CmdOrCtrl+O', click: () => send('open-file') },
        { label: t('menu.recent'), submenu: recentSubmenu },
        { type: 'separator' },
        { label: t('menu.save'), accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: t('menu.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { label: t('menu.autosave'), type: 'checkbox', checked: Boolean(s.autosave), click: (item) => settings.set('autosave', item.checked) },
        { type: 'separator' },
        { label: t('menu.exportPdf'), accelerator: 'CmdOrCtrl+Shift+E', click: () => send('export-pdf') },
        { label: t('menu.exportHtml'), accelerator: 'CmdOrCtrl+Shift+H', click: () => send('export-html') },
        { label: t('menu.exportSvg'), click: () => send('export-svg') },
        { type: 'separator' },
        { label: t('menu.showInFolder'), click: () => send('show-in-folder') },
        { label: t('menu.copyPath'), click: () => send('copy-path') },
        { type: 'separator' },
        { label: t('menu.quit'), accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.undo'), role: 'undo' },
        { label: t('menu.redo'), role: 'redo' },
        { type: 'separator' },
        { label: t('menu.cut'), role: 'cut' },
        { label: t('menu.copy'), role: 'copy' },
        { label: t('menu.paste'), role: 'paste' },
        { label: t('menu.selectAll'), role: 'selectAll' },
        { type: 'separator' },
        { label: t('menu.find'), accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { label: t('menu.replace'), accelerator: 'CmdOrCtrl+H', click: () => send('replace') },
        { label: t('menu.goto'), accelerator: 'CmdOrCtrl+G', click: () => send('goto-line') },
        { type: 'separator' },
        { label: t('menu.fix'), accelerator: 'CmdOrCtrl+Shift+F', click: () => send('toggle-fix-syntax') },
        { label: t('menu.run'), accelerator: 'CmdOrCtrl+R', click: () => send('run-code') },
        { type: 'separator' },
        { label: t('menu.spellcheck'), type: 'checkbox', checked: Boolean(s.spellcheck), click: (item) => settings.set('spellcheck', item.checked) }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        { label: t('menu.visualizer'), accelerator: 'CmdOrCtrl+1', click: () => send('switch-mode', 'visualizer') },
        { label: t('menu.editor'), accelerator: 'CmdOrCtrl+2', click: () => send('switch-mode', 'editor') },
        { label: t('menu.fixSyntax'), accelerator: 'CmdOrCtrl+3', click: () => send('switch-mode', 'fix-syntax') },
        { label: t('menu.toggleEditor'), accelerator: 'CmdOrCtrl+E', click: () => send('toggle-editor') },
        { label: t('menu.split'), type: 'checkbox', accelerator: 'CmdOrCtrl+\\', checked: Boolean(s.splitView), click: (item) => settings.set('splitView', item.checked) },
        { type: 'separator' },
        { label: t('menu.toc'), type: 'checkbox', accelerator: 'CmdOrCtrl+B', checked: Boolean(s.tocVisible), click: (item) => settings.set('tocVisible', item.checked) },
        { label: t('menu.readingWidth'), type: 'checkbox', checked: Boolean(s.readingWidth), click: (item) => settings.set('readingWidth', item.checked) },
        { type: 'separator' },
        {
          label: t('menu.theme'),
          submenu: [
            { label: t('menu.themeSystem'), type: 'radio', checked: s.theme === 'system', click: () => settings.set('theme', 'system') },
            { label: t('menu.themeLight'), type: 'radio', checked: s.theme === 'light', click: () => settings.set('theme', 'light') },
            { label: t('menu.themeDark'), type: 'radio', checked: s.theme === 'dark', click: () => settings.set('theme', 'dark') },
            { type: 'separator' },
            { label: t('menu.toggleTheme'), accelerator: 'CmdOrCtrl+T', click: () => send('toggle-theme') }
          ]
        },
        {
          label: t('menu.language'),
          submenu: [
            { label: t('menu.langSystem'), type: 'radio', checked: s.language === 'system', click: () => settings.set('language', 'system') },
            { label: t('menu.langDe'), type: 'radio', checked: s.language === 'de', click: () => settings.set('language', 'de') },
            { label: t('menu.langEn'), type: 'radio', checked: s.language === 'en', click: () => settings.set('language', 'en') }
          ]
        },
        { type: 'separator' },
        { label: t('menu.zoomIn'), accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: t('menu.zoomIn'), accelerator: 'CmdOrCtrl+Plus', visible: false, acceleratorWorksWhenHidden: true, click: () => send('zoom-in') },
        { label: t('menu.zoomIn'), accelerator: 'CmdOrCtrl+numadd', visible: false, acceleratorWorksWhenHidden: true, click: () => send('zoom-in') },
        { label: t('menu.zoomOut'), accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: t('menu.zoomOut'), accelerator: 'CmdOrCtrl+numsub', visible: false, acceleratorWorksWhenHidden: true, click: () => send('zoom-out') },
        { label: t('menu.zoomReset'), accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { type: 'separator' },
        { label: t('menu.fullscreen'), role: 'togglefullscreen' },
        { label: t('menu.devtools'), role: 'toggleDevTools' }
      ]
    },
    {
      label: t('menu.help'),
      submenu: [
        { label: t('menu.shortcuts'), accelerator: 'F1', click: () => send('show-help') },
        { type: 'separator' },
        { label: t('menu.repo'), click: () => shell.openExternal(REPO_URL) },
        { label: t('menu.updates'), click: () => shell.openExternal(`${REPO_URL}/releases`) },
        { label: t('menu.issue'), click: () => shell.openExternal(`${REPO_URL}/issues`) },
        { type: 'separator' },
        {
          label: t('menu.about', { app: appName }),
          click: () => {
            dialog.showMessageBox(currentWindow, {
              type: 'info',
              title: t('menu.about', { app: appName }),
              message: `${appName} ${app.getVersion()}`,
              detail: [
                t('about.detail'),
                '',
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
                '',
                t('about.license', { year: new Date().getFullYear() }),
                REPO_URL
              ].join('\n'),
              buttons: [t('common.ok'), t('about.github')],
              defaultId: 0,
              noLink: true
            }).then(({ response }) => {
              if (response === 1) shell.openExternal(REPO_URL);
            });
          }
        }
      ]
    }
  ];
}

function rebuildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()));
}

function createAppMenu(mainWindow) {
  currentWindow = mainWindow;
  rebuildMenu();
  const relevant = new Set(['recentFiles', 'theme', 'language', 'autosave', 'spellcheck', 'splitView', 'tocVisible', 'readingWidth']);
  settings.on('change', (key) => {
    if (relevant.has(key)) rebuildMenu();
  });
}

function popupAppMenu(win, x, y) {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  menu.popup({ window: win, x: Math.round(x), y: Math.round(y) });
}

module.exports = { createAppMenu, rebuildMenu, popupAppMenu, REPO_URL };
