/**
 * E2E – Funktionen ab Version 2.0
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchApp, createTempFixtureCopy, createTempDir, createUserDataDir, cleanupTempDirs } = require('./helpers');

test.afterEach(() => cleanupTempDirs());

test('rendert Task-Listen, Fußnoten, Front Matter und bereinigt gefährliches HTML', async () => {
  const { electronApp, window } = await launchApp('features.md');

  try {
    const article = window.locator('#markdown-article');
    await expect(article.locator('input[type="checkbox"]')).toHaveCount(2);
    await expect(article.locator('input[type="checkbox"]').first()).toBeChecked();
    await expect(article.locator('.footnotes')).toBeVisible();
    await expect(article.locator('mark')).toHaveText('Markierung');
    await expect(article.locator('details.front-matter')).toHaveCount(1);
    await expect(article.locator('pre.code-block .hljs-keyword').first()).toHaveText('const');
    await expect(article.locator('h2#über-umlaute-sonderzeichen')).toHaveCount(1);

    // Sanitizer: kein <script>, kein onerror, Titel unverändert
    expect(await article.locator('script').count()).toBe(0);
    expect(await article.locator('img[onerror]').count()).toBe(0);
    expect(await window.title()).not.toContain('xss');

    // TOC enthält alle Überschriften, Filter blendet Nicht-Treffer aus
    await expect(window.locator('#toc-content .toc-link')).toHaveCount(6);
    await window.locator('#toc-filter').fill('Tabelle');
    await expect(window.locator('#toc-content .toc-item:not(.filtered-out) > .toc-link-row > .toc-link')).toHaveCount(2);
  } finally {
    await electronApp.close();
  }
});

test('zeigt Code-Dateien mit Syntax-Highlighting und Zeilennummern', async () => {
  const { electronApp, window } = await launchApp('script-preview.js');

  try {
    const view = window.locator('#markdown-article .code-view');
    await expect(view).toBeVisible();
    await expect(view.locator('.code-view-gutter')).toContainText('1');
    expect(await view.locator('.hljs-keyword, .hljs-title, .hljs-string').count()).toBeGreaterThan(0);
    await expect(window.locator('#toc-sidebar')).toHaveClass(/collapsed/);
    await expect(window.locator('#btn-expand-toc')).toBeHidden();
  } finally {
    await electronApp.close();
  }
});

test('erhält BOM und CRLF-Zeilenenden beim Speichern', async () => {
  const tempFile = createTempFixtureCopy('crlf.md', 'crlf-copy.md');
  const { electronApp, window } = await launchApp(tempFile);

  try {
    await window.locator('[data-mode="editor"]').click();
    await expect(window.locator('#editor-status-eol')).toHaveText('CRLF');
    const editor = window.locator('#editor-textarea');
    await editor.evaluate((el) => { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; });
    await window.keyboard.type('Dritte Zeile.');
    await window.keyboard.press('Control+S');
    await expect(window.locator('#dirty-indicator')).toBeHidden();

    await expect.poll(() => fs.readFileSync(tempFile, 'utf8')).toContain('Dritte Zeile.');
    const buffer = fs.readFileSync(tempFile);
    expect([buffer[0], buffer[1], buffer[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = buffer.toString('utf8');
    expect(text).toContain('Zeile zwei.\r\nDritte Zeile.');
    expect(text).not.toMatch(/[^\r]\n/);
  } finally {
    await electronApp.close();
  }
});

test('sucht und ersetzt im Editor und hebt Treffer im Visualizer hervor', async () => {
  const tempFile = createTempFixtureCopy('toc.md', 'replace.md');
  const { electronApp, window } = await launchApp(tempFile);

  try {
    await window.locator('[data-mode="editor"]').click();
    await window.keyboard.press('Control+H');
    await expect(window.locator('#find-bar')).toBeVisible();
    await expect(window.locator('#replace-row')).toBeVisible();

    await window.locator('#find-input').fill('Alpha');
    await expect(window.locator('#find-count')).toHaveText(/\/ 2$/);
    await window.locator('#replace-input').fill('Omega');
    await window.locator('#btn-replace-all').click();

    const value = await window.locator('#editor-textarea').inputValue();
    expect(value).toContain('Abschnitt Omega');
    expect(value).not.toContain('Alpha');
    await expect(window.locator('#dirty-indicator')).toBeVisible();

    await window.keyboard.press('Escape');
    await window.locator('[data-mode="visualizer"]').click();
    await window.keyboard.press('Control+F');
    await window.locator('#find-input').fill('Omega');
    await expect(window.locator('#find-count')).toHaveText(/\/ 2$/);
    expect(await window.evaluate(() => CSS.highlights.has('mv-find'))).toBe(true);
  } finally {
    await electronApp.close();
  }
});

test('zeigt zuletzt geöffnete Dateien auf dem Startbildschirm und öffnet sie', async () => {
  const userDataDir = createUserDataDir();
  const first = await launchApp('toc.md', { userDataDir });
  await first.window.waitForTimeout(500); // Settings-Write ist entprellt
  await first.electronApp.close();

  const { electronApp, window } = await launchApp(null, { userDataDir });
  try {
    const recent = window.locator('#recent-list .recent-item');
    await expect(recent).toHaveCount(1);
    await expect(recent.first().locator('.recent-item-name')).toHaveText('toc.md');
    await recent.first().click();
    await expect(window.locator('#app-layout')).toBeVisible();
    await expect(window.locator('#file-name')).toHaveText('toc.md');
  } finally {
    await electronApp.close();
  }
});

test('erstellt ein neues Dokument, rendert live in der Split-Ansicht und exportiert HTML', async () => {
  const targetHtml = path.join(createTempDir('mv-html-'), 'neu.html');
  const { electronApp, window } = await launchApp(null);

  try {
    await window.keyboard.press('Control+N');
    await expect(window.locator('#app-layout')).toBeVisible();
    await expect(window.locator('#file-name')).toHaveText('Unbenannt.md');
    await expect(window.locator('[data-mode="editor"]')).toHaveClass(/active/);

    await window.keyboard.press('Control+\\');
    await expect(window.locator('#panels')).toHaveClass(/is-split/);
    await expect(window.locator('#visualizer-panel')).toBeVisible();

    await window.locator('#editor-textarea').focus();
    await window.keyboard.type('# Neues Dokument\n\n- erster Punkt\n');
    await expect(window.locator('#markdown-article h1')).toHaveText('Neues Dokument');
    await expect(window.locator('#toc-content .toc-link')).toHaveCount(1);
    await expect(window.locator('#dirty-indicator')).toBeVisible();

    // Listenfortführung: Enter nach einem Listenpunkt erzeugt den nächsten Marker
    await window.keyboard.type('- zweiter Punkt');
    await window.keyboard.press('Enter');
    const value = await window.locator('#editor-textarea').inputValue();
    expect(value.endsWith('- zweiter Punkt\n- ')).toBe(true);

    await window.evaluate((p) => { window.__mvE2eHtmlTargetPath = p; }, targetHtml);
    await window.locator('#btn-export-pdf').click();
    await window.locator('#btn-html-export').click();
    await expect.poll(() => fs.existsSync(targetHtml)).toBe(true);
    const html = fs.readFileSync(targetHtml, 'utf8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Neues Dokument');
    expect(html).toContain('markdown-article');
  } finally {
    await electronApp.close();
  }
});

test('springt per Klick auf ein Fix-Syntax-Problem zur Zeile im Editor', async () => {
  const { electronApp, window } = await launchApp('scan.md');

  try {
    await window.locator('[data-mode="fix-syntax"]').click();
    const issue = window.locator('#fix-issues-content .issue-item').first();
    await expect(issue).toBeVisible();
    await issue.click();
    await expect(window.locator('[data-mode="editor"]')).toHaveClass(/active/);
    await expect(window.locator('#editor-status-pos')).toContainText('Zeile 1');
  } finally {
    await electronApp.close();
  }
});

test('öffnet relative Markdown-Links in der App', async () => {
  const { electronApp, window } = await launchApp('links.md');

  try {
    await window.locator('#markdown-article a', { hasText: 'Inhaltsverzeichnis-Fixture' }).click();
    await expect(window.locator('#file-name')).toHaveText('toc.md');
    await expect(window.locator('#toc-content .toc-link')).toHaveCount(6);
  } finally {
    await electronApp.close();
  }
});

test('zoomt mit Tastenkürzel und merkt sich den Wert', async () => {
  const userDataDir = createUserDataDir();
  const first = await launchApp('toc.md', { userDataDir });
  try {
    await first.window.keyboard.press('Control+=');
    await expect(first.window.locator('#zoom-badge')).toHaveText('110 %');
    await first.window.waitForTimeout(600);
  } finally {
    await first.electronApp.close();
  }

  const second = await launchApp('toc.md', { userDataDir });
  try {
    await expect(second.window.locator('#zoom-badge')).toHaveText('110 %');
    await second.window.keyboard.press('Control+0');
    await expect(second.window.locator('#zoom-badge')).toBeHidden();
  } finally {
    await second.electronApp.close();
  }
});
