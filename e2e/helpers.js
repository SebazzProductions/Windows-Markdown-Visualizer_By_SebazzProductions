/**
 * Gemeinsame Hilfsfunktionen für die Playwright-E2E-Tests
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const mainEntry = path.join(repoRoot, 'src', 'main', 'main.js');
const fixturesDir = path.join(__dirname, 'fixtures');
const tempDirs = new Set();

function resolveFixturePath(fileNameOrPath) {
  return path.isAbsolute(fileNameOrPath) ? fileNameOrPath : path.join(fixturesDir, fileNameOrPath);
}

function createTempDir(prefix = 'mv-e2e-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

function createTempFixtureCopy(sourceName, targetName = sourceName) {
  const dir = createTempDir();
  const targetPath = path.join(dir, targetName);
  fs.copyFileSync(resolveFixturePath(sourceName), targetPath);
  return targetPath;
}

function createUserDataDir() {
  return createTempDir('mv-userdata-');
}

function cleanupTempDirs() {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
}

async function dispatchFileDrop(window, selector, filePath) {
  const fileUrl = pathToFileURL(filePath).toString();
  await window.evaluate(({ targetSelector, url }) => {
    const target = document.querySelector(targetSelector) || document.body;
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/uri-list', url);
    dataTransfer.setData('text/plain', url);
    ['dragenter', 'dragover', 'drop'].forEach(type => {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
    });
  }, { targetSelector: selector, url: fileUrl });
}

/**
 * Startet die App. Ohne Fixture erscheint der Startbildschirm.
 */
async function launchApp(fixtureNameOrPath, { userDataDir } = {}) {
  const inputPath = fixtureNameOrPath ? resolveFixturePath(fixtureNameOrPath) : null;
  const expectedFileName = inputPath ? path.basename(inputPath) : null;

  const electronApp = await electron.launch({
    args: inputPath ? [mainEntry, inputPath] : [mainEntry],
    env: {
      ...process.env,
      CI: '1',
      MV_E2E: '1',
      MV_LANG: 'de', // Tests erwarten deutsche Oberfläche, unabhängig von der Sprache des Runners
      MV_USER_DATA_DIR: userDataDir || createUserDataDir(),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
    }
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  if (expectedFileName) {
    await expect(window.locator('#app-layout')).toBeVisible();
    await expect(window.locator('#file-name')).toHaveText(expectedFileName);
  } else {
    await expect(window.locator('#welcome-screen')).toBeVisible();
  }
  return { electronApp, window };
}

module.exports = {
  repoRoot,
  fixturesDir,
  resolveFixturePath,
  createTempDir,
  createTempFixtureCopy,
  createUserDataDir,
  cleanupTempDirs,
  dispatchFileDrop,
  launchApp
};
