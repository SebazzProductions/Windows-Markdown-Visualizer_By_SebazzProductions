/**
 * Format Registry - Central format handler management
 * Modular architecture: new formats = new handler + registerFormat() call
 */
const path = require('path');

const handlers = [];

/**
 * Register a format handler
 * @param {Object} handler - { id, extensions, label, detect, format, highlight }
 */
function registerFormat(handler) {
  if (!handler.id || !handler.extensions || !handler.label) {
    throw new Error(`Invalid format handler: missing id, extensions, or label`);
  }
  handlers.push(handler);
}

/**
 * Find handler by file path (extension match) with optional content fallback
 */
function getHandler(filePath, content) {
  if (!filePath) return null;
  const ext = filePath.startsWith('.')
    ? filePath.toLowerCase()
    : path.extname(filePath).toLowerCase();

  // Primary: match by extension
  const byExt = handlers.find(h => h.extensions.includes(ext));
  if (byExt) return byExt;

  // Fallback: content heuristic
  if (content) {
    const byContent = handlers.find(h => h.detect && h.detect(filePath, content));
    if (byContent) return byContent;
  }

  return null;
}

/**
 * Get all registered format handlers
 */
function getAllFormats() {
  return handlers.map(h => ({ id: h.id, label: h.label, extensions: h.extensions }));
}

/**
 * Get flat array of all supported extensions
 */
function getSupportedExtensions() {
  return handlers.flatMap(h => h.extensions);
}

/**
 * Get dialog filters for file-open dialog
 */
function getDialogFilters() {
  const filters = handlers.map(h => ({
    name: h.label,
    extensions: h.extensions.map(e => e.slice(1)) // remove leading dot
  }));
  filters.push({ name: 'Alle Dateien', extensions: ['*'] });
  return filters;
}

module.exports = { registerFormat, getHandler, getAllFormats, getSupportedExtensions, getDialogFilters };
