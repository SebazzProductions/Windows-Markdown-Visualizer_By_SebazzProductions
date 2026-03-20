const { Menu, app } = require('electron');

function createAppMenu(mainWindow) {
  const template = [
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Öffnen…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu-open-file')
        },
        { type: 'separator' },
        {
          label: 'Als PDF exportieren…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow.webContents.send('menu-export-pdf')
        },
        { type: 'separator' },
        {
          label: 'Beenden',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Ansicht',
      submenu: [
        {
          label: 'Inhaltsverzeichnis',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('menu-toggle-toc')
        },
        {
          label: 'Theme wechseln',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow.webContents.send('menu-toggle-theme')
        },
        { type: 'separator' },
        {
          label: 'Vergrößern',
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow.webContents.send('menu-zoom-in')
        },
        {
          label: 'Verkleinern',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('menu-zoom-out')
        },
        {
          label: 'Zoom zurücksetzen',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.send('menu-zoom-reset')
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Entwicklertools' }
      ]
    },
    {
      label: 'Hilfe',
      submenu: [
        {
          label: 'Über Markdown Visualizer',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Über Markdown Visualizer',
              message: 'Markdown Visualizer',
              detail: `Version ${app.getVersion()}\nEin eleganter Markdown-Viewer für Windows.\n\n© ${new Date().getFullYear()} Markdown Visualizer`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { createAppMenu };
