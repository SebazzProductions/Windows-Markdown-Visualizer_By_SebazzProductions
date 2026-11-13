/**
 * Kontextmenü – Bearbeiten-Aktionen, Rechtschreibvorschläge, Link-/Bild-Aktionen
 */
const { Menu, MenuItem, clipboard, shell } = require('electron');
const { t } = require('./i18n');

function attachContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    const wc = win.webContents;

    if (params.misspelledWord) {
      const suggestions = (params.dictionarySuggestions || []).slice(0, 6);
      if (suggestions.length === 0) {
        menu.append(new MenuItem({ label: t('ctx.noSuggestions'), enabled: false }));
      }
      for (const suggestion of suggestions) {
        menu.append(new MenuItem({
          label: suggestion,
          click: () => wc.replaceMisspelling(suggestion)
        }));
      }
      menu.append(new MenuItem({
        label: t('ctx.addToDictionary', { word: params.misspelledWord }),
        click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.linkURL) {
      const isHttp = /^https?:\/\//i.test(params.linkURL);
      if (isHttp) {
        menu.append(new MenuItem({ label: t('ctx.openLink'), click: () => shell.openExternal(params.linkURL) }));
      }
      menu.append(new MenuItem({ label: t('ctx.copyLink'), click: () => clipboard.writeText(params.linkURL) }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.mediaType === 'image' && params.srcURL) {
      menu.append(new MenuItem({ label: t('ctx.copyImage'), click: () => wc.copyImageAt(params.x, params.y) }));
      if (/^file:/i.test(params.srcURL)) {
        menu.append(new MenuItem({
          label: t('ctx.showImage'),
          click: () => {
            try {
              const p = decodeURIComponent(new URL(params.srcURL).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
              shell.showItemInFolder(p);
            } catch { /* ignore */ }
          }
        }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.isEditable) {
      const f = params.editFlags || {};
      menu.append(new MenuItem({ label: t('menu.undo'), role: 'undo', enabled: f.canUndo !== false }));
      menu.append(new MenuItem({ label: t('menu.redo'), role: 'redo', enabled: f.canRedo !== false }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: t('menu.cut'), role: 'cut', enabled: f.canCut !== false }));
      menu.append(new MenuItem({ label: t('menu.copy'), role: 'copy', enabled: f.canCopy !== false }));
      menu.append(new MenuItem({ label: t('menu.paste'), role: 'paste', enabled: f.canPaste !== false }));
      menu.append(new MenuItem({ label: t('menu.delete'), role: 'delete', enabled: f.canDelete !== false }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: t('menu.selectAll'), role: 'selectAll' }));
    } else {
      if (params.selectionText && params.selectionText.trim()) {
        menu.append(new MenuItem({ label: t('menu.copy'), role: 'copy' }));
      }
      menu.append(new MenuItem({ label: t('menu.selectAll'), role: 'selectAll' }));
    }

    if (menu.items.length > 0) {
      menu.popup({ window: win });
    }
  });
}

module.exports = { attachContextMenu };
