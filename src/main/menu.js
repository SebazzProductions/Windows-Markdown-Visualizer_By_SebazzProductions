/**
 * Anwendungsmenü – wird dynamisch aus den Einstellungen gebaut
 * (zuletzt geöffnete Dateien, Theme, Umschalter) und bei Änderungen neu gesetzt.
 *
 * Alle Aktionen werden als 'command' an den Renderer gesendet; Einstellungs-Umschalter
 * ändern direkt den Settings-Store (Renderer wird über 'settings-changed' informiert).
 */
const { Menu, app, shell, dialog } = require('electron');
const path = require('path');
const { settings } = require('./settings');

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

  const recentSubmenu = recent.length === 0
    ? [{ label: 'Keine Einträge', enabled: false }]
    : [
      ...recent.map((filePath, i) => ({
        label: `${i < 9 ? `&${i + 1}  ` : ''}${path.basename(filePath)}`,
        sublabel: path.dirname(filePath),
        toolTip: filePath,
        click: () => send('open-recent', filePath)
      })),
      { type: 'separator' },
      { label: 'Liste leeren', click: () => settings.clearRecentFiles() }
    ];

  return [
    {
      label: '&Datei',
      submenu: [
        { label: 'Neu', accelerator: 'CmdOrCtrl+N', click: () => send('new-file') },
        { label: 'Öffnen…', accelerator: 'CmdOrCtrl+O', click: () => send('open-file') },
        { label: 'Zuletzt geöffnet', submenu: recentSubmenu },
        { type: 'separator' },
        { label: 'Speichern', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Speichern unter…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { label: 'Automatisch speichern', type: 'checkbox', checked: Boolean(s.autosave), click: (item) => settings.set('autosave', item.checked) },
        { type: 'separator' },
        { label: 'Als PDF exportieren…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('export-pdf') },
        { label: 'Als HTML exportieren…', accelerator: 'CmdOrCtrl+Shift+H', click: () => send('export-html') },
        { type: 'separator' },
        { label: 'Im Explorer anzeigen', click: () => send('show-in-folder') },
        { label: 'Dateipfad kopieren', click: () => send('copy-path') },
        { type: 'separator' },
        { label: 'Beenden', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: '&Bearbeiten',
      submenu: [
        { label: 'Rückgängig', role: 'undo' },
        { label: 'Wiederholen', role: 'redo' },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einfügen', role: 'paste' },
        { label: 'Alles auswählen', role: 'selectAll' },
        { type: 'separator' },
        { label: 'Suchen…', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { label: 'Ersetzen…', accelerator: 'CmdOrCtrl+H', click: () => send('replace') },
        { label: 'Gehe zu Zeile…', accelerator: 'CmdOrCtrl+G', click: () => send('goto-line') },
        { type: 'separator' },
        { label: 'Syntax korrigieren (Fix Syntax)', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('toggle-fix-syntax') },
        { label: 'Code ausführen', accelerator: 'CmdOrCtrl+R', click: () => send('run-code') },
        { type: 'separator' },
        { label: 'Rechtschreibprüfung', type: 'checkbox', checked: Boolean(s.spellcheck), click: (item) => settings.set('spellcheck', item.checked) }
      ]
    },
    {
      label: '&Ansicht',
      submenu: [
        { label: 'Visualizer', accelerator: 'CmdOrCtrl+1', click: () => send('switch-mode', 'visualizer') },
        { label: 'Editor', accelerator: 'CmdOrCtrl+2', click: () => send('switch-mode', 'editor') },
        { label: 'Fix Syntax', accelerator: 'CmdOrCtrl+3', click: () => send('switch-mode', 'fix-syntax') },
        { label: 'Editor ein/aus', accelerator: 'CmdOrCtrl+E', click: () => send('toggle-editor') },
        { label: 'Live-Vorschau neben dem Editor', type: 'checkbox', accelerator: 'CmdOrCtrl+\\', checked: Boolean(s.splitView), click: (item) => settings.set('splitView', item.checked) },
        { type: 'separator' },
        { label: 'Inhaltsverzeichnis', type: 'checkbox', accelerator: 'CmdOrCtrl+B', checked: Boolean(s.tocVisible), click: (item) => settings.set('tocVisible', item.checked) },
        { label: 'Lesebreite begrenzen', type: 'checkbox', checked: Boolean(s.readingWidth), click: (item) => settings.set('readingWidth', item.checked) },
        { type: 'separator' },
        {
          label: 'Design',
          submenu: [
            { label: 'System', type: 'radio', checked: s.theme === 'system', click: () => settings.set('theme', 'system') },
            { label: 'Hell', type: 'radio', checked: s.theme === 'light', click: () => settings.set('theme', 'light') },
            { label: 'Dunkel', type: 'radio', checked: s.theme === 'dark', click: () => settings.set('theme', 'dark') },
            { type: 'separator' },
            { label: 'Hell/Dunkel wechseln', accelerator: 'CmdOrCtrl+T', click: () => send('toggle-theme') }
          ]
        },
        { type: 'separator' },
        { label: 'Vergrößern', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Vergrößern', accelerator: 'CmdOrCtrl+Plus', visible: false, acceleratorWorksWhenHidden: true, click: () => send('zoom-in') },
        { label: 'Vergrößern', accelerator: 'CmdOrCtrl+numadd', visible: false, acceleratorWorksWhenHidden: true, click: () => send('zoom-in') },
        { label: 'Verkleinern', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: 'Verkleinern', accelerator: 'CmdOrCtrl+numsub', visible: false, acceleratorWorksWhenHidden: true, click: () => send('zoom-out') },
        { label: 'Zoom zurücksetzen', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { type: 'separator' },
        { label: 'Vollbild', role: 'togglefullscreen' },
        { label: 'Entwicklertools', role: 'toggleDevTools' }
      ]
    },
    {
      label: '&Hilfe',
      submenu: [
        { label: 'Tastenkürzel', accelerator: 'F1', click: () => send('show-help') },
        { type: 'separator' },
        { label: 'GitHub-Repository', click: () => shell.openExternal(REPO_URL) },
        { label: 'Nach Updates suchen (Releases)', click: () => shell.openExternal(`${REPO_URL}/releases`) },
        { label: 'Problem melden', click: () => shell.openExternal(`${REPO_URL}/issues`) },
        { type: 'separator' },
        {
          label: 'Über Markdown Visualizer',
          click: () => {
            dialog.showMessageBox(currentWindow, {
              type: 'info',
              title: 'Über Markdown Visualizer',
              message: `Markdown Visualizer ${app.getVersion()}`,
              detail: [
                'Viewer, Editor und PDF-Export für Markdown- und Code-Dateien.',
                '',
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
                '',
                `© ${new Date().getFullYear()} SebazzProductions · MIT-Lizenz`,
                REPO_URL
              ].join('\n'),
              buttons: ['OK', 'GitHub öffnen'],
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
  const relevant = new Set(['recentFiles', 'theme', 'autosave', 'spellcheck', 'splitView', 'tocVisible', 'readingWidth']);
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
