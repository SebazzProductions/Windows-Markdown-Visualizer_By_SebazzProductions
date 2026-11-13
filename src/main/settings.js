/**
 * Settings Store – persistente Benutzereinstellungen als JSON in userData.
 * Einzige Quelle der Wahrheit für Theme, Zoom, Fensterzustand, zuletzt
 * geöffnete Dateien usw. Schreibvorgänge werden gebündelt und atomar ausgeführt.
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const MAX_RECENT_FILES = 15;

const DEFAULTS = Object.freeze({
  theme: 'system',            // 'system' | 'light' | 'dark'
  language: 'system',         // 'system' | 'de' | 'en'
  zoom: 100,                  // 60 … 200 (Prozent)
  tocVisible: true,
  tocWidth: 240,
  readingWidth: true,         // Lesebreite im Visualizer begrenzen
  splitView: false,           // Editor + Live-Vorschau nebeneinander
  splitRatio: 0.5,
  autosave: false,
  spellcheck: true,
  recentFiles: [],
  windowState: { width: 1200, height: 800, x: undefined, y: undefined, maximized: false },
  pdf: {
    includeToc: true,
    pageSize: 'A4',
    landscape: false,
    pageNumbers: true,
    lineNumbers: false,
    outline: true
  }
});

class Settings extends EventEmitter {
  constructor() {
    super();
    this.filePath = null;
    this.data = null;
    this.writeTimer = null;
  }

  init() {
    this.filePath = path.join(app.getPath('userData'), 'settings.json');
    this.data = this._load();
  }

  _load() {
    let loaded = {};
    try {
      loaded = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      loaded = {};
    }
    const merged = structuredClone(DEFAULTS);
    if (loaded && typeof loaded === 'object') {
      for (const [key, value] of Object.entries(loaded)) {
        if (!(key in DEFAULTS)) continue;
        if (isPlainObject(DEFAULTS[key]) && isPlainObject(value)) {
          merged[key] = { ...DEFAULTS[key], ...value };
        } else if (value !== undefined) {
          merged[key] = value;
        }
      }
    }
    merged.recentFiles = Array.isArray(merged.recentFiles)
      ? merged.recentFiles.filter(p => typeof p === 'string').slice(0, MAX_RECENT_FILES)
      : [];
    merged.zoom = clamp(Number(merged.zoom) || 100, 60, 200);
    if (!['system', 'light', 'dark'].includes(merged.theme)) merged.theme = 'system';
    if (!['system', 'de', 'en'].includes(merged.language)) merged.language = 'system';
    return merged;
  }

  getAll() {
    return structuredClone(this.data);
  }

  get(key) {
    return structuredClone(this.data[key]);
  }

  /**
   * Setzt einen Wert. Für Objekt-Werte (z. B. pdf) wird flach gemerged.
   */
  set(key, value, { silent = false } = {}) {
    if (!(key in DEFAULTS)) {
      throw new Error(`Unbekannte Einstellung: ${key}`);
    }
    if (isPlainObject(DEFAULTS[key]) && isPlainObject(value)) {
      this.data[key] = { ...this.data[key], ...value };
    } else {
      this.data[key] = value;
    }
    this._scheduleWrite();
    if (!silent) this.emit('change', key, this.get(key));
    return this.get(key);
  }

  addRecentFile(filePath) {
    if (!filePath) return;
    const list = this.data.recentFiles.filter(p => p.toLowerCase() !== filePath.toLowerCase());
    list.unshift(filePath);
    this.set('recentFiles', list.slice(0, MAX_RECENT_FILES));
  }

  removeRecentFile(filePath) {
    this.set('recentFiles', this.data.recentFiles.filter(p => p.toLowerCase() !== filePath.toLowerCase()));
  }

  clearRecentFiles() {
    this.set('recentFiles', []);
  }

  _scheduleWrite() {
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.writeTimer);
    this.writeTimer = null;
    if (!this.filePath || !this.data) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('Einstellungen konnten nicht gespeichert werden:', err.message);
    }
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

module.exports = { settings: new Settings(), DEFAULTS, MAX_RECENT_FILES };
