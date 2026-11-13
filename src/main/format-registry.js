/**
 * Format Registry – zentrale Verwaltung der Format-Handler.
 * Neues Format = neuer Handler + registerFormat()-Aufruf.
 *
 * Handler-Schema:
 *   id          eindeutige Kennung (z. B. 'markdown')
 *   label       Anzeigename
 *   extensions  ['.md', ...] (mit Punkt, Kleinschreibung)
 *   language    highlight.js-Sprache für die Code-Ansicht (optional)
 *   detect      (filePath, content) => boolean – Inhalts-Heuristik für unbekannte Endungen
 *   format      async (source, filePath) => { formatted, issues } (optional)
 *   transpile   (source) => { code, error } (optional, TypeScript)
 *   kind        'markdown' | 'html' | 'css' | 'script' | 'json' | 'code' | 'text'
 */
const path = require('path');

const handlers = [];

function registerFormat(handler) {
  if (!handler.id || !Array.isArray(handler.extensions) || !handler.label) {
    throw new Error('Ungültiger Format-Handler: id, extensions oder label fehlen');
  }
  if (handlers.some(h => h.id === handler.id)) {
    throw new Error(`Format-Handler "${handler.id}" ist bereits registriert`);
  }
  handlers.push(handler);
}

function extensionOf(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('.') && !filePath.includes(path.sep) && !filePath.includes('/')) {
    return filePath.toLowerCase();
  }
  return path.extname(filePath).toLowerCase();
}

/**
 * Handler per Endung ermitteln, Fallback über Inhaltsheuristik, zuletzt Text.
 */
function getHandler(filePath, content) {
  const baseName = filePath ? String(filePath).split(/[\\/]/).pop().toLowerCase() : '';
  if (baseName) {
    const byName = handlers.find(h => Array.isArray(h.filenames) && h.filenames.includes(baseName));
    if (byName) return byName;
  }
  const ext = extensionOf(filePath);
  if (ext) {
    const byExt = handlers.find(h => h.extensions.includes(ext));
    if (byExt) return byExt;
  }
  if (typeof content === 'string' && content.length > 0) {
    const sample = content.slice(0, 4000);
    const byContent = handlers.find(h => h.id !== 'text' && typeof h.detect === 'function' && h.detect(filePath, sample));
    if (byContent) return byContent;
  }
  return handlers.find(h => h.id === 'text') || null;
}

/**
 * highlight.js-Sprache für eine Datei (Handler-Standard oder dateispezifisch).
 */
function getLanguageFor(filePath, content) {
  const handler = getHandler(filePath, content);
  if (!handler) return 'plaintext';
  if (typeof handler.languageFor === 'function') return handler.languageFor(filePath) || 'plaintext';
  return handler.language || 'plaintext';
}

function getAllFormats() {
  return handlers.map(h => ({ id: h.id, label: h.label, extensions: [...h.extensions], kind: h.kind || 'code' }));
}

function getSupportedExtensions() {
  return handlers.flatMap(h => h.extensions);
}

function getDialogFilters() {
  const filters = handlers
    .filter(h => h.extensions.length > 0)
    .map(h => ({ name: h.label, extensions: h.extensions.map(e => e.slice(1)) }));
  filters.unshift({ name: 'Alle unterstützten Dateien', extensions: getSupportedExtensions().map(e => e.slice(1)) });
  filters.push({ name: 'Alle Dateien', extensions: ['*'] });
  return filters;
}

module.exports = { registerFormat, getHandler, getLanguageFor, getAllFormats, getSupportedExtensions, getDialogFilters, extensionOf };
