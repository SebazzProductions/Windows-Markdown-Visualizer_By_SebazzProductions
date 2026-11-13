/**
 * Markdown-Formatter – sichere, kontextbewusste Korrekturen im Stil von markdownlint.
 *
 * Grundsätze:
 *  - Fenced-Code-Blöcke und Front Matter werden nie verändert
 *  - Leerzeilen werden nur zwischen unterschiedlichen Blocktypen eingefügt
 *    (nicht zwischen Listenpunkten oder Tabellenzeilen)
 *  - Harte Zeilenumbrüche (genau zwei Leerzeichen am Zeilenende) bleiben erhalten
 *  - Alle gemeldeten Zeilennummern beziehen sich auf den ORIGINAL-Text
 */

const RE_FENCE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
const RE_HEADING = /^(#{1,6})(\s+|$)/;
const RE_HEADING_NO_SPACE = /^(#{1,6})([^\s#])/;
const RE_LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+\S|\s*$)/;
const RE_QUOTE = /^\s{0,3}>/;
const RE_SETEXT = /^\s{0,3}(=+|-+)\s*$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const RE_HR = /^\s{0,3}((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$/;

function formatMarkdown(source) {
  const issues = [];
  const seen = new Set();
  const addIssue = (line, message, severity = 'info') => {
    const key = `${line}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ line, message, severity });
  };

  const original = String(source ?? '').replace(/\r\n?/g, '\n');
  const lines = original.split('\n');
  const n = lines.length;

  // ---- 1. Geschützte Bereiche (Fences, Front Matter) ----
  const kind = new Array(n).fill(null); // 'protected' | 'fenceOpen' | 'fenceClose'
  let i = 0;
  if (lines[0] !== undefined && /^---\s*$/.test(lines[0])) {
    for (let j = 1; j < n; j++) {
      if (/^(---|\.\.\.)\s*$/.test(lines[j])) {
        for (let k = 0; k <= j; k++) kind[k] = 'protected';
        i = j + 1;
        break;
      }
    }
  }
  for (; i < n; i++) {
    const m = lines[i].match(RE_FENCE);
    if (!m) continue;
    const fenceChar = m[2][0];
    const fenceLen = m[2].length;
    const info = m[3].trim();
    if (fenceChar === '`' && info.includes('`')) continue; // Backtick-Fences dürfen im Info-String keine Backticks enthalten
    kind[i] = 'fenceOpen';
    if (!info) addIssue(i + 1, 'Codeblock ohne Sprachangabe (kein Syntax-Highlighting)', 'info');
    let closed = false;
    for (let j = i + 1; j < n; j++) {
      const c = lines[j].match(RE_FENCE);
      if (c && c[2][0] === fenceChar && c[2].length >= fenceLen && c[3].trim() === '') {
        kind[j] = 'fenceClose';
        closed = true;
        i = j;
        break;
      }
      kind[j] = 'protected';
    }
    if (!closed) {
      addIssue(i + 1, 'Codeblock wird nicht geschlossen', 'error');
      i = n;
    }
  }
  const isProtected = (idx) => kind[idx] !== null;

  // ---- 2. Zeilenweise Korrekturen (außerhalb geschützter Bereiche) ----
  for (let k = 0; k < n; k++) {
    if (isProtected(k)) continue;
    let line = lines[k];

    if (RE_HEADING_NO_SPACE.test(line)) {
      addIssue(k + 1, 'Leerzeichen nach # fehlt', 'warning');
      line = line.replace(RE_HEADING_NO_SPACE, '$1 $2');
    }
    if (/^(#{1,6})\s{2,}\S/.test(line)) {
      addIssue(k + 1, 'Mehrfache Leerzeichen nach # korrigiert', 'info');
      line = line.replace(/^(#{1,6})\s{2,}/, '$1 ');
    }

    // Nachgestellte Leerzeichen – genau zwei Leerzeichen = harter Zeilenumbruch, bleibt
    if (/[ \t]+$/.test(line)) {
      const trimmed = line.replace(/[ \t]+$/, '');
      const trailing = line.slice(trimmed.length);
      const isHardBreak = trailing === '  ' && trimmed.length > 0;
      if (!isHardBreak) {
        addIssue(k + 1, 'Nachgestellte Leerzeichen entfernt', 'info');
        line = trimmed;
      }
    }

    lines[k] = line;
  }

  // ---- 3. Tabellen ausrichten ----
  for (let k = 0; k < n - 1; k++) {
    if (isProtected(k) || isProtected(k + 1)) continue;
    if (!lines[k].includes('|') || !RE_TABLE_SEP.test(lines[k + 1]) || !lines[k + 1].includes('|')) continue;
    let end = k + 1;
    while (end + 1 < n && !isProtected(end + 1) && lines[end + 1].trim() !== '' && lines[end + 1].includes('|')) end++;
    const block = lines.slice(k, end + 1);
    const aligned = alignTable(block);
    if (aligned) {
      let changed = false;
      for (let j = 0; j < aligned.length; j++) {
        if (lines[k + j] !== aligned[j]) { lines[k + j] = aligned[j]; changed = true; }
      }
      if (changed) addIssue(k + 1, 'Tabelle ausgerichtet', 'info');
    }
    k = end;
  }

  // ---- 4. Listen-Marker innerhalb eines Blocks vereinheitlichen ----
  let block = [];
  const flushList = () => {
    if (block.length >= 2) {
      const markers = new Set(block.map(idx => lines[idx].match(RE_LIST_ITEM)[2]).filter(m => /^[-*+]$/.test(m)));
      if (markers.size > 1) {
        for (const idx of block) {
          const m = lines[idx].match(RE_LIST_ITEM);
          if (/^[-*+]$/.test(m[2]) && m[2] !== '-') {
            lines[idx] = lines[idx].replace(/^(\s*)[-*+]/, '$1-');
            addIssue(idx + 1, 'Inkonsistenter Listen-Marker vereinheitlicht (-)', 'info');
          }
        }
      }
    }
    block = [];
  };
  for (let k = 0; k < n; k++) {
    if (isProtected(k)) { flushList(); continue; }
    const m = lines[k].match(RE_LIST_ITEM);
    if (m && !RE_HR.test(lines[k]) && m[1].length < 4) {
      block.push(k);
    } else if (lines[k].trim() === '' || /^\s+/.test(lines[k])) {
      // Leerzeile oder eingerückte Fortsetzung: Liste läuft weiter
    } else {
      flushList();
    }
  }
  flushList();

  // ---- 5. Blocktypen klassifizieren ----
  const types = new Array(n);
  for (let k = 0; k < n; k++) {
    types[k] = classify(lines, k, kind, types);
  }

  // ---- 6. Leerzeilen zwischen Blöcken ----
  const out = [];
  let prevType = 'start';
  let prevIdx = -1;
  const pushBlank = (idx, message) => {
    out.push('');
    addIssue(idx + 1, message, 'info');
  };

  for (let k = 0; k < n; k++) {
    const type = types[k];
    const line = lines[k];

    if (type === 'blank') {
      if (prevType === 'blank' || prevType === 'start') {
        if (prevType === 'blank') addIssue(k + 1, 'Mehrfache Leerzeilen reduziert', 'info');
        continue;
      }
      out.push('');
      prevType = 'blank';
      prevIdx = k;
      continue;
    }

    if (prevType !== 'blank' && prevType !== 'start' && prevType !== 'protected') {
      const rule = blankLineRule(prevType, type);
      if (rule) pushBlank(k, rule);
    }

    out.push(line);
    prevType = type === 'protected' && kind[k] === 'fenceClose' ? 'fenceClose' : type;
    prevIdx = k;
  }
  void prevIdx;

  // Führende Leerzeilen entfernen, genau ein Zeilenumbruch am Ende
  while (out.length > 0 && out[0] === '') out.shift();
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  let formatted = out.join('\n');
  if (formatted.length > 0) formatted += '\n';
  if (original.length > 0 && !original.endsWith('\n')) {
    addIssue(n, 'Zeilenumbruch am Dateiende ergänzt', 'info');
  }

  // ---- 7. Analyse der Überschriften-Hierarchie (nur Hinweise) ----
  analyzeHeadings(lines, types, addIssue);

  issues.sort((a, b) => a.line - b.line || severityRank(a.severity) - severityRank(b.severity));
  return { formatted, issues };
}

function classify(lines, k, kind, types) {
  if (kind[k] === 'fenceOpen') return 'fenceOpen';
  if (kind[k] === 'fenceClose') return 'fenceClose';
  if (kind[k] === 'protected') return 'protected';
  const line = lines[k];
  if (line.trim() === '') return 'blank';
  if (RE_HR.test(line)) return 'hr';
  if (RE_HEADING.test(line)) return 'heading';
  if (RE_SETEXT.test(line) && k > 0 && types[k - 1] === 'text') return 'setext';
  if (RE_QUOTE.test(line)) return 'quote';
  if (/^(\s{4,}|\t)/.test(line)) return 'indented';
  if (RE_LIST_ITEM.test(line)) return 'list';
  if (line.includes('|') && k + 1 < lines.length && RE_TABLE_SEP.test(lines[k + 1]) && lines[k + 1].includes('|')) return 'table';
  if (k > 0 && (types[k - 1] === 'table') && line.includes('|')) return 'table';
  if (/^\s{0,3}<\/?[a-zA-Z!]/.test(line)) return 'html';
  return 'text';
}

/**
 * Liefert die Begründung, wenn zwischen zwei Blocktypen eine Leerzeile fehlt.
 */
function blankLineRule(prev, cur) {
  if (cur === 'heading') return 'Leerzeile vor Überschrift eingefügt';
  if (prev === 'heading' || prev === 'setext') return 'Leerzeile nach Überschrift eingefügt';
  if (cur === 'fenceOpen' && prev !== 'list' && prev !== 'indented' && prev !== 'quote') return 'Leerzeile vor Codeblock eingefügt';
  if (prev === 'fenceClose') return 'Leerzeile nach Codeblock eingefügt';
  if (cur === 'list' && (prev === 'text' || prev === 'html')) return 'Leerzeile vor Liste eingefügt';
  if ((prev === 'list' || prev === 'indented') && (cur === 'text' || cur === 'html' || cur === 'table')) return 'Leerzeile nach Liste eingefügt';
  if (cur === 'table' && (prev === 'text' || prev === 'html' || prev === 'quote')) return 'Leerzeile vor Tabelle eingefügt';
  if (prev === 'table' && (cur === 'text' || cur === 'html' || cur === 'list' || cur === 'quote')) return 'Leerzeile nach Tabelle eingefügt';
  if (cur === 'hr' && prev !== 'hr') return 'Leerzeile vor Trennlinie eingefügt';
  if (prev === 'hr') return 'Leerzeile nach Trennlinie eingefügt';
  return null;
}

function analyzeHeadings(lines, types, addIssue) {
  const stack = [];
  const seenAtLevel = new Map(); // level → Set(text)
  for (let k = 0; k < lines.length; k++) {
    let level = null;
    let text = null;
    if (types[k] === 'heading') {
      const m = lines[k].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/) || lines[k].match(/^(#{1,6})\s*$/);
      if (!m) continue;
      level = m[1].length;
      text = (m[2] || '').trim();
      if (!text) addIssue(k + 1, 'Leere Überschrift', 'warning');
    } else if (types[k] === 'setext') {
      level = lines[k].trim()[0] === '=' ? 1 : 2;
      text = lines[k - 1].trim();
    } else {
      continue;
    }

    if (stack.length === 0) {
      if (level > 1) addIssue(k + 1, `Dokument beginnt mit Ebene ${level} statt 1 – Inhaltsverzeichnis-Struktur prüfen`, 'warning');
    } else {
      const prevLevel = stack[stack.length - 1];
      if (level > prevLevel + 1) {
        addIssue(k + 1, `Überschrift springt von Ebene ${prevLevel} auf ${level} – Ebene ${prevLevel + 1} fehlt`, 'warning');
      }
    }
    while (stack.length > 0 && stack[stack.length - 1] >= level) stack.pop();
    stack.push(level);

    if (text) {
      if (!seenAtLevel.has(level)) seenAtLevel.set(level, new Set());
      const set = seenAtLevel.get(level);
      if (set.has(text.toLowerCase())) {
        addIssue(k + 1, `Doppelte Überschrift „${text}“ – Anker erhält ein Zahlensuffix`, 'info');
      }
      set.add(text.toLowerCase());
    }
  }
}

/**
 * Pipe-Tabelle spaltenweise ausrichten. Gibt null zurück, wenn die Tabelle
 * nicht sicher verarbeitet werden kann.
 */
function alignTable(blockLines) {
  const rows = blockLines.map(splitTableRow);
  if (rows.some(r => r === null)) return null;
  const colCount = Math.max(...rows.map(r => r.length));
  if (colCount < 1 || colCount > 60) return null;

  const sepCells = rows[1];
  const aligns = [];
  for (let c = 0; c < colCount; c++) {
    const cell = (sepCells[c] || '---').trim();
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    aligns.push(left && right ? 'center' : right ? 'right' : left ? 'left' : 'none');
  }

  const widths = new Array(colCount).fill(3);
  rows.forEach((r, ri) => {
    if (ri === 1) return;
    for (let c = 0; c < colCount; c++) {
      widths[c] = Math.max(widths[c], displayWidth(r[c] || ''));
    }
  });

  return rows.map((r, ri) => {
    const cells = [];
    for (let c = 0; c < colCount; c++) {
      if (ri === 1) {
        const w = widths[c];
        const a = aligns[c];
        let dashes = '-'.repeat(Math.max(1, w - (a === 'center' ? 2 : a === 'none' ? 0 : 1)));
        if (a === 'left') dashes = ':' + dashes;
        else if (a === 'right') dashes = dashes + ':';
        else if (a === 'center') dashes = ':' + dashes + ':';
        cells.push(dashes);
      } else {
        cells.push(pad(r[c] || '', widths[c], aligns[c]));
      }
    }
    return `| ${cells.join(' | ')} |`;
  });
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  if (cells.length === 0) return null;
  return cells;
}

function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    // Ostasiatische Breitzeichen und Emoji zählen doppelt
    w += (cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff))) ? 2 : 1;
  }
  return w;
}

function pad(str, width, align) {
  const diff = Math.max(0, width - displayWidth(str));
  if (align === 'right') return ' '.repeat(diff) + str;
  if (align === 'center') {
    const left = Math.floor(diff / 2);
    return ' '.repeat(left) + str + ' '.repeat(diff - left);
  }
  return str + ' '.repeat(diff);
}

function severityRank(s) {
  return s === 'error' ? 0 : s === 'warning' ? 1 : 2;
}

module.exports = { formatMarkdown, alignTable };
