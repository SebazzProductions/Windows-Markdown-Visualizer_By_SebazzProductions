const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const mainEntry = path.join(repoRoot, 'src', 'main', 'main.js');
const fixturesDir = path.join(__dirname, 'fixtures');
const tempDirs = new Set();

function resolveFixturePath(fileNameOrPath) {
  return path.isAbsolute(fileNameOrPath)
    ? fileNameOrPath
    : path.join(fixturesDir, fileNameOrPath);
}

function createTempFixtureCopy(sourceName, targetName = sourceName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-e2e-'));
  const sourcePath = resolveFixturePath(sourceName);
  const targetPath = path.join(dir, targetName);
  fs.copyFileSync(sourcePath, targetPath);
  tempDirs.add(dir);
  return targetPath;
}

async function dispatchFileDrop(window, selector, filePath) {
  const fileUrl = pathToFileURL(filePath).toString();

  await window.evaluate(({ targetSelector, url }) => {
    const target = document.querySelector(targetSelector) || document.body;
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/uri-list', url);
    dataTransfer.setData('text/plain', url);

    ['dragenter', 'dragover', 'drop'].forEach(type => {
      const event = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer
      });
      target.dispatchEvent(event);
    });
  }, { targetSelector: selector, url: fileUrl });
}

async function overridePdfExportTarget(window, targetPath) {
  await window.evaluate((pdfPath) => {
    window.__mvE2ePdfTargetPath = pdfPath;
  }, targetPath);
}

async function launchApp(fixtureNameOrPath) {
  const inputPath = resolveFixturePath(fixtureNameOrPath);
  const expectedFileName = path.basename(inputPath);

  const electronApp = await electron.launch({
    args: [mainEntry, inputPath],
    env: {
      ...process.env,
      CI: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
    }
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('#app-layout')).toBeVisible();
  await expect(window.locator('#file-name')).toHaveText(expectedFileName);

  return { electronApp, window };
}

test.afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

test('stellt das Inhaltsverzeichnis dar und navigiert ueber TOC-Links', async () => {
  const { electronApp, window } = await launchApp('toc.md');

  try {
    const tocSidebar = window.locator('#toc-sidebar');
    const tocLinks = window.locator('#toc-content .toc-link');
    const tocBetaLink = tocLinks.filter({ hasText: /^Abschnitt Beta$/ });
    const tocGammaLink = tocLinks.filter({ hasText: /^Abschnitt Gamma$/ });

    await expect(tocSidebar).toBeVisible();
    await expect(tocSidebar).not.toHaveClass(/collapsed/);
    await expect(tocLinks).toHaveCount(6);
    await expect(tocBetaLink).toBeVisible();

    await tocGammaLink.click();

    await expect.poll(async () => {
      return window.locator('#markdown-content').evaluate(element => element.scrollTop);
    }).toBeGreaterThan(0);

    await window.locator('#btn-collapse-toc').click();
    await expect(tocSidebar).toHaveClass(/collapsed/);

    await window.locator('#btn-expand-toc').click();
    await expect(tocSidebar).not.toHaveClass(/collapsed/);
  } finally {
    await electronApp.close();
  }
});

test('scan bewahrt fenced code blocks und uebernimmt nur sichere markdown-fixes', async () => {
  const { electronApp, window } = await launchApp('scan.md');

  try {
    await window.locator('[data-mode="fix-syntax"]').click();
    await expect(window.locator('#btn-fix-scan')).toBeVisible();
    await window.locator('#btn-fix-scan').click();

    await expect(window.locator('#btn-fix-apply')).toBeEnabled();
    await expect(window.locator('#fix-issue-count')).not.toHaveText('0');

    await window.locator('#btn-fix-apply').click();
    await window.locator('[data-mode="editor"]').click();

    const editorValue = await window.locator('#editor-textarea').inputValue();
    expect(editorValue).toContain('# Kapitel');
    expect(editorValue).toContain('## Unterabschnitt');
    expect(editorValue).toContain('```javascript\nconst preserved = true;');
    expect(editorValue).not.toContain('```javascript\n\nconst preserved = true;');
  } finally {
    await electronApp.close();
  }
});

test('rendert HTML mit lokalen CSS- und JS-Assets im Visualizer', async () => {
  const { electronApp, window } = await launchApp('html-preview.html');

  try {
    const previewFrame = window.frameLocator('#preview-iframe');

    await expect(window.locator('#preview-iframe')).toBeVisible();
    await expect(previewFrame.locator('#asset-target')).toHaveText('HTML + Assets OK');
    await expect(previewFrame.locator('#asset-script-result')).toHaveText('Script OK');

    const computedColor = await previewFrame.locator('#asset-target').evaluate((element) => {
      return getComputedStyle(element).color;
    });
    expect(computedColor).toBe('rgb(12, 34, 56)');
  } finally {
    await electronApp.close();
  }
});

test('rendert CSS-Vorschau mit angewendeten Styles', async () => {
  const { electronApp, window } = await launchApp('style-preview.css');

  try {
    const previewFrame = window.frameLocator('#preview-iframe');
    const primaryButton = previewFrame.locator('button.primary');

    await expect(window.locator('#preview-iframe')).toBeVisible();
    await expect(primaryButton).toBeVisible();

    const buttonStyles = await primaryButton.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius
      };
    });

    expect(buttonStyles.backgroundColor).toBe('rgb(12, 34, 56)');
    expect(buttonStyles.borderRadius).toBe('12px');
  } finally {
    await electronApp.close();
  }
});

test('führt JavaScript im Visualizer aus und zeigt Console-Ausgabe', async () => {
  const { electronApp, window } = await launchApp('script-preview.js');

  try {
    await expect(window.locator('#btn-run-code')).toBeVisible();
    await window.locator('#btn-run-code').click();

    await expect(window.locator('#console-panel')).toBeVisible();
    await expect(window.locator('#console-output')).toContainText('js-executed');
    await expect(window.frameLocator('#preview-iframe').locator('#js-result')).toHaveText('JS OK');
  } finally {
    await electronApp.close();
  }
});

test('führt TypeScript im Visualizer aus und transpiliert korrekt', async () => {
  const { electronApp, window } = await launchApp('script-preview.ts');

  try {
    await expect(window.locator('#btn-run-code')).toBeVisible();
    await window.locator('#btn-run-code').click();

    await expect(window.locator('#console-output')).toContainText('ts-executed');
    await expect(window.frameLocator('#preview-iframe').locator('#ts-result')).toHaveText('TS OK');
  } finally {
    await electronApp.close();
  }
});

test('speichert Änderungen und lädt externe Dateiänderungen im Editor neu ohne Modusverlust', async () => {
  const tempFile = createTempFixtureCopy('toc.md', 'save-reload.md');
  const { electronApp, window } = await launchApp(tempFile);

  try {
    const editorTab = window.locator('[data-mode="editor"]');
    const editor = window.locator('#editor-textarea');

    await editorTab.click();
    await expect(editorTab).toHaveClass(/active/);

    await editor.click();
    await editor.press('End');
    await editor.type('\nLokale Speicherung aktiv.');
    await expect(window.locator('#dirty-indicator')).toBeVisible();

    await window.keyboard.press('Control+S');
    await expect(window.locator('#dirty-indicator')).toBeHidden();

    await expect.poll(() => fs.readFileSync(tempFile, 'utf8')).toContain('Lokale Speicherung aktiv.');

    fs.writeFileSync(tempFile, '# Reloaded\n\nExtern aktualisiert.\n', 'utf8');

    await expect(editorTab).toHaveClass(/active/);
    await expect.poll(async () => {
      return editor.inputValue();
    }).toContain('Extern aktualisiert.');
  } finally {
    await electronApp.close();
  }
});

test('exportiert PDF über den UI-Dialog in eine Test-Zieldatei', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-pdf-'));
  const targetPdf = path.join(tempDir, 'toc-export.pdf');
  tempDirs.add(tempDir);

  const { electronApp, window } = await launchApp('toc.md');

  try {
    await overridePdfExportTarget(window, targetPdf);

    await window.locator('#btn-export-pdf').click();
    await expect(window.locator('#pdf-modal')).toBeVisible();
    await window.locator('#btn-pdf-export').click();

    await expect.poll(() => fs.existsSync(targetPdf)).toBe(true);

    const pdfHeader = fs.readFileSync(targetPdf).subarray(0, 4).toString('utf8');
    expect(pdfHeader).toBe('%PDF');
  } finally {
    await electronApp.close();
  }
});

test('öffnet eine abgelegte Datei im Visualizer direkt als neues Dokument', async () => {
  const { electronApp, window } = await launchApp('toc.md');

  try {
    await dispatchFileDrop(window, 'body', resolveFixturePath('html-preview.html'));

    await expect(window.locator('#file-name')).toHaveText('html-preview.html');
    await expect(window.locator('#drop-decision-modal')).toBeHidden();
    await expect(window.locator('#format-badge')).toHaveText('HTML');
    await expect(window.locator('#preview-iframe')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test('fragt im Editor nach Einfügen oder neuem Dokument und fügt am Cursor ein', async () => {
  const tempFile = createTempFixtureCopy('toc.md', 'editor-drop.md');
  const { electronApp, window } = await launchApp(tempFile);

  try {
    const editor = window.locator('#editor-textarea');

    await window.locator('[data-mode="editor"]').click();
    await editor.evaluate((element) => {
      element.focus();
      element.selectionStart = element.selectionEnd = element.value.length;
    });

    await dispatchFileDrop(window, '#editor-textarea', resolveFixturePath('script-preview.js'));

    await expect(window.locator('#drop-decision-modal')).toBeVisible();
    await window.locator('#btn-drop-insert').click();

    await expect(window.locator('#file-name')).toHaveText('editor-drop.md');
    await expect(editor).toHaveValue(/js-executed/);
    await expect(window.locator('#dirty-indicator')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test('fragt in Fix Syntax nach Einfügen oder neuem Dokument und öffnet neues Dokument im gleichen Modus', async () => {
  const { electronApp, window } = await launchApp('scan.md');

  try {
    const fixSyntaxTab = window.locator('[data-mode="fix-syntax"]');

    await fixSyntaxTab.click();
    await expect(fixSyntaxTab).toHaveClass(/active/);

    await dispatchFileDrop(window, '#fix-syntax-panel', resolveFixturePath('toc.md'));

    await expect(window.locator('#drop-decision-modal')).toBeVisible();
    await window.locator('#btn-drop-open').click();

    await expect(window.locator('#file-name')).toHaveText('toc.md');
    await expect(fixSyntaxTab).toHaveClass(/active/);
    await expect(window.locator('#btn-fix-scan')).toBeVisible();
    await expect(window.locator('#fix-diff-content')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});