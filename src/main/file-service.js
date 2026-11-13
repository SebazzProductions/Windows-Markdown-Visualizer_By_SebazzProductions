/**
 * File Service – Lesen/Schreiben von Textdateien und Dateiüberwachung.
 *
 * - Erkennt BOM und Zeilenende-Stil (LF/CRLF) und stellt beides beim Speichern wieder her
 * - Lehnt Binärdateien ab
 * - Schreibt atomar (Temp-Datei + Rename), damit ein Absturz keine halbe Datei hinterlässt
 * - Watcher mit Entprellung, Inhalts-Hash (ignoriert eigene Speichervorgänge) und
 *   Re-Attach nach "rename"-Ereignissen (atomare Saves anderer Editoren)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const BINARY_PROBE_BYTES = 8000;

const knownHashes = new Map(); // filePath (lowercase) → sha1 des zuletzt bekannten Inhalts

function hashOf(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

function normalizeKey(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  if (crlf === 0 && lf === 0) return process.platform === 'win32' ? 'crlf' : 'lf';
  return crlf >= lf ? 'crlf' : 'lf';
}

function looksBinary(buffer) {
  const probe = buffer.subarray(0, BINARY_PROBE_BYTES);
  for (let i = 0; i < probe.length; i++) {
    if (probe[i] === 0) return true;
  }
  return false;
}

async function readTextFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Ungültiger Dateipfad');
  }
  const resolvedPath = path.resolve(filePath);

  let stat;
  try {
    stat = await fs.promises.stat(resolvedPath);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('Datei nicht gefunden');
    throw err;
  }
  if (!stat.isFile()) throw new Error('Pfad ist keine Datei');
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`Datei ist zu groß (${formatBytes(stat.size)}, max. ${formatBytes(MAX_FILE_SIZE)})`);
  }

  const buffer = await fs.promises.readFile(resolvedPath);
  if (looksBinary(buffer)) {
    throw new Error('Binärdatei kann nicht als Text geöffnet werden');
  }

  const bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bom ? buffer.subarray(3) : buffer);
  const eol = detectEol(raw);
  const content = raw.replace(/\r\n?/g, '\n');

  knownHashes.set(normalizeKey(resolvedPath), hashOf(content));

  return {
    content,
    filePath: resolvedPath,
    fileName: path.basename(resolvedPath),
    eol,
    bom,
    size: stat.size,
    mtimeMs: stat.mtimeMs
  };
}

async function writeTextFile(filePath, content, { eol = 'lf', bom = false } = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Ungültiger Dateipfad');
  }
  if (typeof content !== 'string') {
    throw new Error('Ungültiger Inhalt');
  }
  const resolvedPath = path.resolve(filePath);
  const normalized = content.replace(/\r\n?/g, '\n');
  const out = (bom ? '﻿' : '') + (eol === 'crlf' ? normalized.replace(/\n/g, '\r\n') : normalized);

  // Hash VOR dem Schreiben registrieren, damit der Watcher das eigene Speichern ignoriert
  knownHashes.set(normalizeKey(resolvedPath), hashOf(normalized));

  await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(resolvedPath),
    `.${path.basename(resolvedPath)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await fs.promises.writeFile(tmpPath, out, 'utf-8');
    await fs.promises.rename(tmpPath, resolvedPath);
  } catch (err) {
    // Fallback: Direktes Schreiben (z. B. wenn Rename durch Sperren scheitert)
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {});
    if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY' || err.code === 'EXDEV') {
      await fs.promises.writeFile(resolvedPath, out, 'utf-8');
    } else {
      throw err;
    }
  }

  const stat = await fs.promises.stat(resolvedPath);
  return {
    success: true,
    filePath: resolvedPath,
    fileName: path.basename(resolvedPath),
    size: stat.size,
    mtimeMs: stat.mtimeMs
  };
}

/**
 * Überwacht genau eine Datei. Meldet nur echte Inhaltsänderungen.
 */
class FileWatcher {
  constructor() {
    this.watcher = null;
    this.filePath = null;
    this.debounceTimer = null;
    this.reattachTimer = null;
    this.listeners = { change: null, remove: null };
  }

  watch(filePath, { onChange, onRemove }) {
    this.close();
    if (!filePath) return;
    this.filePath = path.resolve(filePath);
    this.listeners.change = onChange || null;
    this.listeners.remove = onRemove || null;
    this._attach();
  }

  _attach() {
    if (!this.filePath) return;
    try {
      this.watcher = fs.watch(this.filePath, { persistent: false }, (eventType) => {
        this._onEvent(eventType);
      });
      this.watcher.on('error', () => {
        this._scheduleReattach();
      });
    } catch {
      this.watcher = null;
    }
  }

  _onEvent(eventType) {
    if (eventType === 'rename') {
      // Datei wurde ersetzt/umbenannt/gelöscht → Watcher neu anhängen
      this._scheduleReattach();
    }
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this._checkForChange(), 150);
  }

  _scheduleReattach() {
    if (this.watcher) {
      try { this.watcher.close(); } catch { /* ignore */ }
      this.watcher = null;
    }
    clearTimeout(this.reattachTimer);
    this.reattachTimer = setTimeout(() => {
      if (!this.filePath) return;
      if (fs.existsSync(this.filePath)) {
        this._attach();
      } else {
        // Noch einmal kurz warten (atomare Saves: unlink → rename)
        this.reattachTimer = setTimeout(() => {
          if (!this.filePath) return;
          if (fs.existsSync(this.filePath)) {
            this._attach();
            this._checkForChange();
          } else if (this.listeners.remove) {
            this.listeners.remove(this.filePath);
          }
        }, 400);
      }
    }, 200);
  }

  async _checkForChange() {
    if (!this.filePath) return;
    let result;
    try {
      const key = normalizeKey(this.filePath);
      const previous = knownHashes.get(key);
      result = await readTextFile(this.filePath); // aktualisiert knownHashes
      const current = knownHashes.get(key);
      if (previous !== undefined && previous === current) {
        return; // Eigenes Speichern oder reine mtime-Änderung → ignorieren
      }
    } catch {
      return; // Datei (noch) nicht lesbar – "remove" läuft über den Reattach-Pfad
    }
    if (this.listeners.change) {
      this.listeners.change(result);
    }
  }

  close() {
    clearTimeout(this.debounceTimer);
    clearTimeout(this.reattachTimer);
    if (this.watcher) {
      try { this.watcher.close(); } catch { /* ignore */ }
    }
    this.watcher = null;
    this.filePath = null;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = { readTextFile, writeTextFile, FileWatcher, MAX_FILE_SIZE, detectEol, formatBytes };
