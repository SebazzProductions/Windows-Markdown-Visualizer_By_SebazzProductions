/**
 * E2E – Version 2.1: Mermaid, TOC im Editor, Speichern-Button, In-App-Dialog, Sprachumschalter
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchApp, createTempFixtureCopy, createTempDir, createUserDataDir, cleanupTempDirs } = require('./helpers');

test.afterEach(() => cleanupTempDirs());

test('rendert Mermaid-Dateien als Diagramm mit Zoom und exportiert SVG', async () => {
  const targetSvg = path.join(createTempDir('mv-svg-'), 'diagramm.svg');
  const { electronApp, window } = await launchApp('diagram.mmd');

  try {
    await expect(window.locator('#format-badge')).toHaveText('Mermaid');
    const svg = window.locator('.diagram-viewport svg');
    await expect(svg).toBeVisible({ timeout: 20000 });
    expect(await svg.locator('.node').count()).toBeGreaterThanOrEqual(4);
    await expect(window.locator('#toc-sidebar')).toHaveClass(/collapsed/);

    // Zoom über Toolbar
    const zoomLabel = window.locator('.diagram-zoom-label');
    const before = await zoomLabel.textContent();
    await window.locator('[data-action="zoom-in"]').click();
    await expect(zoomLabel).not.toHaveText(before);
    await window.locator('[data-action="fit"]').click();

    // SVG-Export
    await window.evaluate((p) => { window.__mvE2eSvgTargetPath = p; }, targetSvg);
    await window.locator('#btn-export-pdf').click();
    await expect(window.locator('#btn-svg-export')).toBeVisible();
    await window.locator('#btn-svg-export').click();
    await expect.poll(() => fs.existsSync(targetSvg)).toBe(true);
    const content = fs.readFileSync(targetSvg, 'utf8');
    expect(content).toContain('<svg');
    expect(content).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(content).toContain('Entscheidung');
  } finally {
    await electronApp.close();
  }
});

test('zeigt Mermaid-Syntaxfehler in Vorschau und Fix Syntax mit Zeilenangabe', async () => {
  const { electronApp, window } = await launchApp('diagram.mmd');

  try {
    await expect(window.locator('.diagram-viewport svg')).toBeVisible({ timeout: 20000 });
    await window.locator('[data-mode="editor"]').click();
    await window.keyboard.press('Control+\\');
    await expect(window.locator('#panels')).toHaveClass(/is-split/);

    const editor = window.locator('#editor-textarea');
    await editor.evaluate((el) => { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; });
    await window.keyboard.type('\n  X --> {{');
    const errorBar = window.locator('.diagram-error');
    await expect(errorBar).toBeVisible();
    await expect(errorBar).toContainText('Zeile 7');

    await window.locator('[data-mode="fix-syntax"]').click();
    const issue = window.locator('#fix-issues-content .issue-item').first();
    await expect(issue).toContainText('Mermaid');
    await expect(issue).toContainText('7');
    await expect(window.locator('#btn-fix-save')).toBeEnabled();
  } finally {
    await electronApp.close();
  }
});

test('rendert ```mermaid-Blöcke in Markdown und behält Codeblock bei Fehlern', async () => {
  const { electronApp, window } = await launchApp('mermaid.md');

  try {
    const figures = window.locator('figure.mermaid-diagram');
    await expect(figures).toHaveCount(3, { timeout: 20000 });
    await expect(window.locator('figure.mermaid-diagram:not(.has-error) > svg')).toHaveCount(2);
    const broken = window.locator('figure.mermaid-diagram.has-error');
    await expect(broken).toHaveCount(1);
    await expect(broken.locator('pre')).toBeVisible();
    await expect(broken.locator('.mermaid-error')).toContainText('Zeile 3');
    // Normale Codeblöcke bleiben unangetastet
    await expect(window.locator('#markdown-article pre.code-block[data-lang="javascript"]')).toHaveCount(1);
    await expect(window.locator('#toc-content .toc-link')).toHaveCount(5);
  } finally {
    await electronApp.close();
  }
});

test('navigiert über das Inhaltsverzeichnis auch im Editor und markiert die Cursorposition', async () => {
  const { electronApp, window } = await launchApp('toc.md');

  try {
    await window.locator('[data-mode="editor"]').click();
    await expect(window.locator('#toc-sidebar')).not.toHaveClass(/collapsed/);
    await window.locator('#toc-content .toc-link', { hasText: /^Abschnitt Gamma$/ }).click();

    const pos = window.locator('#editor-status-pos');
    await expect(pos).not.toContainText('Zeile 1,');
    const lineText = await pos.textContent();
    const line = Number((lineText.match(/Zeile (\d+)/) || [])[1]);
    const editorValue = await window.locator('#editor-textarea').inputValue();
    expect(editorValue.split('\n')[line - 1]).toMatch(/Abschnitt Gamma/);
    await expect(window.locator('#toc-content .toc-link.active')).toHaveText('Abschnitt Gamma');

    // Cursor an den Anfang → erster Eintrag aktiv
    await window.locator('#editor-textarea').evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); el.dispatchEvent(new Event('select')); });
    await window.keyboard.press('ArrowDown');
    await expect(window.locator('#toc-content .toc-link.active')).not.toHaveText('Abschnitt Gamma');
  } finally {
    await electronApp.close();
  }
});

test('Speichern-Button wird nach Änderungen aktiv und speichert dauerhaft', async () => {
  const tempFile = createTempFixtureCopy('toc.md', 'save-button.md');
  const { electronApp, window } = await launchApp(tempFile);

  try {
    const btnSave = window.locator('#btn-save');
    await expect(btnSave).toBeHidden();
    await window.locator('[data-mode="editor"]').click();
    await expect(btnSave).toBeVisible();
    await expect(btnSave).toBeDisabled();

    const editor = window.locator('#editor-textarea');
    await editor.evaluate((el) => { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; });
    await window.keyboard.type('\nNeuer Absatz.');
    await expect(btnSave).toBeEnabled();
    await btnSave.click();
    await expect(btnSave).toBeDisabled();
    await expect(window.locator('#dirty-indicator')).toBeHidden();
    await expect.poll(() => fs.readFileSync(tempFile, 'utf8')).toContain('Neuer Absatz.');

    // Der Datei-Watcher darf das eigene Speichern nicht als externe Änderung melden
    await window.waitForTimeout(1200);
    await expect(window.locator('#dirty-indicator')).toBeHidden();
    await expect(window.locator('.toast.warning, .toast.error')).toHaveCount(0);

    // Fix Syntax: eigener Speichern-Button
    await editor.evaluate((el) => { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; });
    await window.keyboard.type(' Noch mehr.');
    await window.locator('[data-mode="fix-syntax"]').click();
    await expect(window.locator('#btn-fix-save')).toBeEnabled();
    await window.locator('#btn-fix-save').click();
    await expect(window.locator('#btn-fix-save')).toBeDisabled();
    await expect.poll(() => fs.readFileSync(tempFile, 'utf8')).toContain('Noch mehr.');
  } finally {
    await electronApp.close();
  }
});

test('fragt bei ungespeicherten Änderungen im App-Dialog nach', async () => {
  const tempFile = createTempFixtureCopy('toc.md', 'unsaved.md');
  const { electronApp, window } = await launchApp(tempFile);

  try {
    await window.locator('[data-mode="editor"]').click();
    await window.locator('#editor-textarea').focus();
    await window.keyboard.type('x');
    await window.keyboard.press('Control+N');

    const dialog = window.locator('#app-dialog');
    await expect(dialog).toBeVisible();
    await expect(window.locator('#app-dialog-message')).toHaveText('Sie haben Änderungen vorgenommen. Möchten Sie diese speichern?');
    await expect(window.locator('#app-dialog-footer button')).toHaveCount(3);

    await window.locator('[data-dialog-action="cancel"]').click();
    await expect(dialog).toBeHidden();
    await expect(window.locator('#file-name')).toHaveText('unsaved.md');

    await window.keyboard.press('Control+N');
    await expect(dialog).toBeVisible();
    await window.locator('[data-dialog-action="discard"]').click();
    await expect(window.locator('#file-name')).toHaveText('Unbenannt.md');
    expect(fs.readFileSync(tempFile, 'utf8')).not.toContain('x\n');
  } finally {
    await electronApp.close();
  }
});

test('schaltet die Oberfläche auf Englisch um und merkt sich die Sprache', async () => {
  const userDataDir = createUserDataDir();
  const first = await launchApp(null, { userDataDir });
  try {
    await expect(first.window.locator('#btn-open-file')).toContainText('Datei öffnen');
    await first.window.locator('.welcome-titlebar .lang-toggle [data-lang="en"]').click();
    await expect(first.window.locator('#btn-open-file')).toContainText('Open file');
    await expect(first.window.locator('html')).toHaveAttribute('lang', 'en');
    await expect(first.window.locator('.welcome-shortcuts kbd').first()).toHaveText('Ctrl');
    await first.window.waitForTimeout(600);
  } finally {
    await first.electronApp.close();
  }

  const second = await launchApp('toc.md', { userDataDir });
  try {
    await expect(second.window.locator('html')).toHaveAttribute('lang', 'en');
    await expect(second.window.locator('.toolbar .lang-toggle [data-lang="en"]')).toHaveClass(/is-active/);
    await second.window.locator('[data-mode="editor"]').click();
    await expect(second.window.locator('#editor-status-pos')).toContainText('Line 1, Col 1');
    await second.window.locator('.toolbar .lang-toggle [data-lang="de"]').click();
    await expect(second.window.locator('#editor-status-pos')).toContainText('Zeile 1, Spalte 1');
  } finally {
    await second.electronApp.close();
  }
});

test('legt ein neues Mermaid-Diagramm mit Vorlage und Live-Vorschau an', async () => {
  const { electronApp, window } = await launchApp(null);

  try {
    await window.keyboard.press('Control+Shift+N');
    await expect(window.locator('#app-layout')).toBeVisible();
    await expect(window.locator('#file-name')).toHaveText('Unbenannt.mmd');
    await expect(window.locator('#format-badge')).toHaveText('Mermaid');
    await expect(window.locator('#panels')).toHaveClass(/is-split/);
    await expect(window.locator('.diagram-viewport svg')).toBeVisible({ timeout: 20000 });
    expect(await window.locator('#editor-textarea').inputValue()).toMatch(/^flowchart LR/);

    // Vorlage anhängen
    await window.locator('.diagram-presets').selectOption('pie');
    await expect(window.locator('#dirty-indicator')).toBeVisible();
    expect(await window.locator('#editor-textarea').inputValue()).toContain('pie showData');
  } finally {
    await electronApp.close();
  }
});
