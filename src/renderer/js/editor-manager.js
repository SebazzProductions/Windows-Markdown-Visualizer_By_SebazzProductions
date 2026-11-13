/**
 * Editor Manager – Textarea-Editor mit Zeilennummern, Undo-erhaltenden Einfügungen,
 * Auto-Einrückung, Listenfortführung, Zeilen-Operationen, Suche und Statusleiste.
 */
const EditorManager = (() => {
  let textarea = null;
  let gutter = null;
  let statusPos = null;
  let statusLines = null;
  let statusWords = null;
  let statusFormat = null;
  let statusEol = null;
  let onChangeCallback = null;
  let onScrollCallback = null;
  let onEolToggle = null;
  let onCursorLine = null;
  let lastReportedLine = 0;
  let lineCount = 0;
  let activeGutterLine = null;
  let isMarkdown = true;
  let statusRaf = null;

  const LIST_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/;
  const QUOTE_RE = /^(\s*>\s?)+/;

  function init(textareaEl, gutterEl, callbacks = {}) {
    textarea = textareaEl;
    gutter = gutterEl;
    statusPos = document.getElementById('editor-status-pos');
    statusLines = document.getElementById('editor-status-lines');
    statusWords = document.getElementById('editor-status-words');
    statusFormat = document.getElementById('editor-status-format');
    statusEol = document.getElementById('editor-status-eol');
    onChangeCallback = callbacks.onChange || null;
    onScrollCallback = callbacks.onScroll || null;
    onEolToggle = callbacks.onEolToggle || null;
    onCursorLine = callbacks.onCursorLine || null;

    textarea.addEventListener('input', () => {
      updateLineNumbers();
      scheduleStatus();
      if (onChangeCallback) onChangeCallback(textarea.value);
    });

    textarea.addEventListener('scroll', () => {
      gutter.scrollTop = textarea.scrollTop;
      if (onScrollCallback) onScrollCallback();
    }, { passive: true });

    textarea.addEventListener('click', scheduleStatus);
    textarea.addEventListener('keyup', scheduleStatus);
    textarea.addEventListener('select', scheduleStatus);
    textarea.addEventListener('keydown', handleKeyDown);

    if (statusEol) {
      statusEol.addEventListener('click', () => { if (onEolToggle) onEolToggle(); });
    }

    updateLineNumbers();
    updateStatus();
  }

  // ---- Inhalt ----

  function setContent(text, { preserveCursor = false } = {}) {
    if (!textarea) return;
    const sel = preserveCursor ? getSelection() : null;
    textarea.value = text;
    if (sel) {
      const max = textarea.value.length;
      textarea.selectionStart = Math.min(sel.start, max);
      textarea.selectionEnd = Math.min(sel.end, max);
      textarea.scrollTop = sel.scrollTop;
    } else {
      // Neues Dokument: oben beginnen (value-Zuweisung setzt den Cursor sonst ans Ende)
      textarea.selectionStart = textarea.selectionEnd = 0;
      textarea.scrollTop = 0;
      textarea.scrollLeft = 0;
    }
    updateLineNumbers();
    updateStatus();
  }

  function getContent() {
    return textarea ? textarea.value : '';
  }

  function getSelection() {
    if (!textarea) return { start: 0, end: 0, scrollTop: 0 };
    return { start: textarea.selectionStart, end: textarea.selectionEnd, scrollTop: textarea.scrollTop };
  }

  function setSelection(start, end = start) {
    if (!textarea) return;
    textarea.selectionStart = start;
    textarea.selectionEnd = end;
  }

  /**
   * Ersetzt die aktuelle Auswahl – über execCommand, damit der native Undo-Stack erhalten bleibt.
   */
  function replaceSelection(text, { select = false } = {}) {
    if (!textarea) return;
    textarea.focus();
    const start = textarea.selectionStart;
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (select) {
      textarea.selectionStart = start;
      textarea.selectionEnd = start + text.length;
    }
    scheduleStatus();
  }

  function insertTextAtCursor(text, selection = null) {
    if (!textarea) return;
    if (selection) {
      textarea.selectionStart = selection.start;
      textarea.selectionEnd = selection.end;
      if (typeof selection.scrollTop === 'number') textarea.scrollTop = selection.scrollTop;
    }
    replaceSelection(text);
  }

  // ---- Tastatur ----

  function handleKeyDown(e) {
    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    if (key === 'Tab') {
      e.preventDefault();
      if (hasMultiLineSelection() || e.shiftKey) {
        indentLines(e.shiftKey ? -1 : 1);
      } else {
        replaceSelection('  ');
      }
      return;
    }

    if (key === 'Enter' && !ctrl && !e.shiftKey && !e.altKey && !e.isComposing) {
      if (handleEnter()) e.preventDefault();
      return;
    }

    if (e.altKey && !ctrl && (key === 'ArrowUp' || key === 'ArrowDown')) {
      e.preventDefault();
      moveLines(key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (ctrl && !e.shiftKey && !e.altKey && key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateLine();
      return;
    }

    if (ctrl && e.shiftKey && key.toLowerCase() === 'k') {
      e.preventDefault();
      deleteLines();
      return;
    }

    if (ctrl && e.shiftKey && isMarkdown && (key.toLowerCase() === 'b' || key.toLowerCase() === 'i')) {
      e.preventDefault();
      wrapSelection(key.toLowerCase() === 'b' ? '**' : '_');
      return;
    }

    if (key === 'Escape') {
      // Escape im Editor an die App weiterreichen (Dialoge schließen)
      return;
    }
  }

  function hasMultiLineSelection() {
    const { start, end } = getSelection();
    if (start === end) return false;
    return textarea.value.slice(start, end).includes('\n');
  }

  function lineBoundsOfSelection() {
    const value = textarea.value;
    const { start, end } = getSelection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', Math.max(end - (end > start && value[end - 1] === '\n' ? 1 : 0), start));
    if (lineEnd === -1) lineEnd = value.length;
    return { lineStart, lineEnd };
  }

  function indentLines(direction) {
    const value = textarea.value;
    const { start, end } = getSelection();
    const { lineStart, lineEnd } = lineBoundsOfSelection();
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    let removedBeforeCursor = 0;
    const out = lines.map((line, i) => {
      if (direction > 0) {
        if (i === 0) removedBeforeCursor = -2;
        return '  ' + line;
      }
      const m = line.match(/^( {1,2}|\t)/);
      if (!m) return line;
      if (i === 0) removedBeforeCursor = m[1].length;
      return line.slice(m[1].length);
    }).join('\n');
    if (out === block) return;
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineEnd;
    replaceSelection(out);
    const delta = out.length - block.length;
    if (start === end) {
      const pos = Math.max(lineStart, start - removedBeforeCursor);
      setSelection(pos, pos);
    } else {
      setSelection(lineStart, lineEnd + delta);
    }
  }

  /**
   * Enter: Einrückung übernehmen, Listen und Zitate fortführen.
   * @returns {boolean} true, wenn das Standardverhalten ersetzt wurde
   */
  function handleEnter() {
    const value = textarea.value;
    const { start, end } = getSelection();
    if (start !== end) return false;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = value.indexOf('\n', start);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const line = value.slice(lineStart, lineEnd);
    const beforeCursor = value.slice(lineStart, start);

    if (isMarkdown) {
      const list = beforeCursor.match(LIST_RE);
      if (list) {
        const content = line.slice(list[0].length).trim();
        if (!content && start >= lineEnd) {
          // Leerer Listenpunkt → Liste beenden
          textarea.selectionStart = lineStart;
          textarea.selectionEnd = lineEnd;
          replaceSelection('');
          return true;
        }
        let marker = list[2];
        const num = marker.match(/^(\d+)([.)])$/);
        if (num) marker = `${Number(num[1]) + 1}${num[2]}`;
        const task = list[4] ? '[ ] ' : '';
        replaceSelection(`\n${list[1]}${marker}${list[3]}${task}`);
        return true;
      }
      const quote = beforeCursor.match(QUOTE_RE);
      if (quote) {
        const content = line.slice(quote[0].length).trim();
        if (!content && start >= lineEnd) {
          textarea.selectionStart = lineStart;
          textarea.selectionEnd = lineEnd;
          replaceSelection('');
          return true;
        }
        replaceSelection(`\n${quote[0]}`);
        return true;
      }
    }

    const indent = (beforeCursor.match(/^[ \t]*/) || [''])[0];
    if (!indent) return false;
    replaceSelection(`\n${indent}`);
    return true;
  }

  function moveLines(direction) {
    const value = textarea.value;
    const { start, end } = getSelection();
    const { lineStart, lineEnd } = lineBoundsOfSelection();
    if (direction < 0 && lineStart === 0) return;
    if (direction > 0 && lineEnd >= value.length) return;

    const block = value.slice(lineStart, lineEnd);
    let newStart, newEnd, replacement, rangeStart, rangeEnd;
    if (direction < 0) {
      const prevStart = value.lastIndexOf('\n', lineStart - 2) + 1;
      const prevLine = value.slice(prevStart, lineStart - 1);
      rangeStart = prevStart;
      rangeEnd = lineEnd;
      replacement = `${block}\n${prevLine}`;
      newStart = start - (prevLine.length + 1);
      newEnd = end - (prevLine.length + 1);
    } else {
      const nextEndIdx = value.indexOf('\n', lineEnd + 1);
      const nextEnd = nextEndIdx === -1 ? value.length : nextEndIdx;
      const nextLine = value.slice(lineEnd + 1, nextEnd);
      rangeStart = lineStart;
      rangeEnd = nextEnd;
      replacement = `${nextLine}\n${block}`;
      newStart = start + nextLine.length + 1;
      newEnd = end + nextLine.length + 1;
    }
    textarea.selectionStart = rangeStart;
    textarea.selectionEnd = rangeEnd;
    replaceSelection(replacement);
    setSelection(newStart, newEnd);
    revealCursor();
  }

  function duplicateLine() {
    const value = textarea.value;
    const { start, end } = getSelection();
    const { lineStart, lineEnd } = lineBoundsOfSelection();
    const block = value.slice(lineStart, lineEnd);
    textarea.selectionStart = lineEnd;
    textarea.selectionEnd = lineEnd;
    replaceSelection(`\n${block}`);
    setSelection(start + block.length + 1, end + block.length + 1);
  }

  function deleteLines() {
    const value = textarea.value;
    const { lineStart, lineEnd } = lineBoundsOfSelection();
    let from = lineStart;
    let to = lineEnd < value.length ? lineEnd + 1 : lineEnd;
    if (to === lineEnd && from > 0) from -= 1; // letzte Zeile: vorangehenden Umbruch entfernen
    textarea.selectionStart = from;
    textarea.selectionEnd = to;
    replaceSelection('');
  }

  function wrapSelection(marker) {
    const value = textarea.value;
    const { start, end } = getSelection();
    const selected = value.slice(start, end);
    if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
      replaceSelection(selected.slice(marker.length, selected.length - marker.length), { select: true });
      return;
    }
    replaceSelection(`${marker}${selected}${marker}`);
    if (!selected) {
      setSelection(start + marker.length, start + marker.length);
    } else {
      setSelection(start + marker.length, start + marker.length + selected.length);
    }
  }

  // ---- Zeilennummern & Status ----

  function updateLineNumbers() {
    if (!textarea || !gutter) return;
    const value = textarea.value;
    let count = 1;
    for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) count++;
    lineCount = count;

    const existing = gutter.children.length;
    if (existing === lineCount) return;
    if (existing < lineCount) {
      const fragment = document.createDocumentFragment();
      for (let i = existing + 1; i <= lineCount; i++) {
        const span = document.createElement('span');
        span.className = 'line-number';
        span.textContent = i;
        fragment.appendChild(span);
      }
      gutter.appendChild(fragment);
    } else {
      while (gutter.children.length > lineCount) gutter.lastElementChild.remove();
      if (activeGutterLine && !activeGutterLine.isConnected) activeGutterLine = null;
    }
  }

  function scheduleStatus() {
    if (statusRaf) return;
    statusRaf = requestAnimationFrame(() => {
      statusRaf = null;
      updateStatus();
    });
  }

  function updateStatus() {
    if (!textarea || !statusPos || !statusLines) return;
    const val = textarea.value;
    const pos = textarea.selectionStart;
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
    let line = 1;
    for (let i = 0; i < lineStart; i++) if (val.charCodeAt(i) === 10) line++;
    const col = pos - lineStart + 1;

    const selLen = textarea.selectionEnd - textarea.selectionStart;
    statusPos.textContent = selLen > 0
      ? I18n.t('editor.posSelected', { line, col, count: selLen })
      : I18n.t('editor.pos', { line, col });
    statusLines.textContent = I18n.plural(lineCount, 'editor.lineOne', 'editor.lines');

    if (statusWords) {
      if (val.length <= 500000) {
        const words = val.trim() ? val.trim().split(/\s+/).length : 0;
        statusWords.textContent = I18n.plural(words, 'editor.wordOne', 'editor.words', { words, chars: val.length });
      } else {
        statusWords.textContent = I18n.t('editor.chars', { chars: val.length });
      }
    }

    if (onCursorLine && line !== lastReportedLine) {
      lastReportedLine = line;
      onCursorLine(line);
    }

    const target = gutter.children[line - 1] || null;
    if (target !== activeGutterLine) {
      if (activeGutterLine) activeGutterLine.classList.remove('active');
      if (target) target.classList.add('active');
      activeGutterLine = target;
    }
  }

  function setFormatLabel(label, markdown = true) {
    if (statusFormat) statusFormat.textContent = label || '';
    isMarkdown = Boolean(markdown);
  }

  function setEolLabel(eol) {
    if (statusEol) statusEol.textContent = eol === 'crlf' ? 'CRLF' : 'LF';
  }

  function setSpellcheck(enabled) {
    if (textarea) textarea.spellcheck = Boolean(enabled);
  }

  // ---- Navigation ----

  function lineHeightPx() {
    return parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  }

  function goToLine(n, { select = false } = {}) {
    if (!textarea) return;
    const lines = textarea.value.split('\n');
    const target = Math.max(1, Math.min(Number(n) || 1, lines.length));
    let charPos = 0;
    for (let i = 0; i < target - 1; i++) charPos += lines[i].length + 1;
    textarea.focus();
    textarea.selectionStart = charPos;
    textarea.selectionEnd = select ? charPos + lines[target - 1].length : charPos;
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 0;
    textarea.scrollTop = Math.max(0, paddingTop + (target - 1) * lineHeightPx() - textarea.clientHeight / 3);
    updateStatus();
  }

  function revealCursor() {
    const pos = textarea.selectionStart;
    const line = textarea.value.slice(0, pos).split('\n').length;
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 0;
    const top = paddingTop + (line - 1) * lineHeightPx();
    if (top < textarea.scrollTop + 10) textarea.scrollTop = top - 10;
    else if (top > textarea.scrollTop + textarea.clientHeight - lineHeightPx() * 2) textarea.scrollTop = top - textarea.clientHeight + lineHeightPx() * 2;
  }

  function getTopVisibleLine() {
    if (!textarea) return 1;
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 0;
    const line = Math.floor((textarea.scrollTop - paddingTop) / lineHeightPx()) + 1;
    return Math.max(1, Math.min(line, lineCount));
  }

  function getScrollInfo() {
    if (!textarea) return { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
    return { scrollTop: textarea.scrollTop, scrollHeight: textarea.scrollHeight, clientHeight: textarea.clientHeight };
  }

  function scrollToLine(line) {
    if (!textarea) return;
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 0;
    textarea.scrollTop = Math.max(0, paddingTop + (Math.max(1, line) - 1) * lineHeightPx());
  }

  function getLineCount() {
    return lineCount;
  }

  function getSelectedText() {
    if (!textarea) return '';
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  }

  // ---- Suche ----

  function findAll(query, { caseSensitive = false } = {}) {
    if (!textarea || !query) return [];
    const hay = caseSensitive ? textarea.value : textarea.value.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const results = [];
    let idx = hay.indexOf(needle);
    while (idx !== -1 && results.length < 100000) {
      results.push({ start: idx, end: idx + needle.length });
      idx = hay.indexOf(needle, idx + Math.max(1, needle.length));
    }
    return results;
  }

  function selectMatch(match) {
    if (!textarea || !match) return;
    textarea.focus({ preventScroll: true });
    textarea.selectionStart = match.start;
    textarea.selectionEnd = match.end;
    revealCursor();
    updateStatus();
  }

  function replaceAll(query, replacement, { caseSensitive = false } = {}) {
    const matches = findAll(query, { caseSensitive });
    if (matches.length === 0) return 0;
    const value = textarea.value;
    let out = '';
    let last = 0;
    for (const m of matches) {
      out += value.slice(last, m.start) + replacement;
      last = m.end;
    }
    out += value.slice(last);
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = value.length;
    replaceSelection(out);
    setSelection(0, 0);
    return matches.length;
  }

  function focus() {
    if (textarea) textarea.focus();
  }

  /** Statusleiste neu beschriften (Sprachwechsel). */
  function refreshStatus() {
    lastReportedLine = 0;
    updateStatus();
  }

  function getCursorLine() {
    if (!textarea) return 1;
    const val = textarea.value;
    const pos = textarea.selectionStart;
    let line = 1;
    for (let i = 0; i < pos; i++) if (val.charCodeAt(i) === 10) line++;
    return line;
  }

  return {
    init, setContent, getContent, getSelection, setSelection, replaceSelection, insertTextAtCursor,
    updateLineNumbers, goToLine, scrollToLine, getTopVisibleLine, getScrollInfo, getLineCount,
    getSelectedText, findAll, selectMatch, replaceAll,
    setFormatLabel, setEolLabel, setSpellcheck, focus, refreshStatus, getCursorLine
  };
})();
