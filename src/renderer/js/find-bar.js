/**
 * Find Bar – Suchen (Visualizer + Editor) und Ersetzen (Editor).
 * Visualizer: Custom Highlight API (CSS.highlights), kein DOM-Umbau.
 * Editor:     Treffer werden als Auswahl im Textarea angezeigt.
 */
const FindBar = (() => {
  let bar, input, countEl, hintEl, replaceRow, replaceInput;
  let btnPrev, btnNext, btnCase, btnClose, btnReplaceOne, btnReplaceAll;
  let getMode = () => 'visualizer';       // 'visualizer' | 'editor'
  let getArticle = () => null;            // scrollbarer Vorschau-Container
  let onRequestEditor = () => {};
  let onReplaced = () => {};

  let caseSensitive = false;
  let matches = [];       // Visualizer: Range[]; Editor: {start,end}[]
  let activeIndex = -1;
  let lastQuery = '';
  let debounceTimer = null;

  const supportsHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';

  function init(options = {}) {
    bar = document.getElementById('find-bar');
    input = document.getElementById('find-input');
    countEl = document.getElementById('find-count');
    hintEl = document.getElementById('find-hint');
    replaceRow = document.getElementById('replace-row');
    replaceInput = document.getElementById('replace-input');
    btnPrev = document.getElementById('btn-find-prev');
    btnNext = document.getElementById('btn-find-next');
    btnCase = document.getElementById('btn-find-case');
    btnClose = document.getElementById('btn-find-close');
    btnReplaceOne = document.getElementById('btn-replace-one');
    btnReplaceAll = document.getElementById('btn-replace-all');

    getMode = options.getMode || getMode;
    getArticle = options.getArticle || getArticle;
    onRequestEditor = options.onRequestEditor || onRequestEditor;
    onReplaced = options.onReplaced || onReplaced;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => search(), 120);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prev() : next(); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    btnPrev.addEventListener('click', prev);
    btnNext.addEventListener('click', next);
    btnCase.addEventListener('click', () => {
      caseSensitive = !caseSensitive;
      btnCase.classList.toggle('active', caseSensitive);
      btnCase.setAttribute('aria-pressed', String(caseSensitive));
      search();
    });
    btnClose.addEventListener('click', close);
    btnReplaceOne.addEventListener('click', replaceOne);
    btnReplaceAll.addEventListener('click', replaceAll);
  }

  function isOpen() {
    return bar && !bar.classList.contains('hidden');
  }

  function open({ replace = false, prefill } = {}) {
    if (replace && getMode() !== 'editor') {
      onRequestEditor();
    }
    bar.classList.remove('hidden');
    replaceRow.classList.toggle('hidden', !replace);
    const text = prefill !== undefined ? prefill : currentSelectionText();
    if (text && !text.includes('\n') && text.length < 200) input.value = text;
    input.focus();
    input.select();
    updateModeHint();
    search();
  }

  function close() {
    if (!bar) return;
    bar.classList.add('hidden');
    clearHighlights();
    matches = [];
    activeIndex = -1;
    countEl.textContent = '';
    input.classList.remove('no-match');
    if (getMode() === 'editor') EditorManager.focus();
  }

  function toggleReplace(show) {
    replaceRow.classList.toggle('hidden', !show);
    if (show) replaceInput.focus();
  }

  function currentSelectionText() {
    if (getMode() === 'editor') return EditorManager.getSelectedText();
    const sel = window.getSelection();
    return sel ? sel.toString() : '';
  }

  function updateModeHint() {
    const editor = getMode() === 'editor';
    btnReplaceOne.disabled = !editor;
    btnReplaceAll.disabled = !editor;
    hintEl.textContent = editor ? '' : (supportsHighlights ? '' : 'Hervorhebung nicht verfügbar');
  }

  /**
   * Suche neu ausführen (z. B. nach Modus-Wechsel oder Neu-Rendering).
   */
  function refresh() {
    if (isOpen()) {
      updateModeHint();
      search({ keepIndex: true });
    }
  }

  function search({ keepIndex = false } = {}) {
    const query = input.value;
    const previousIndex = keepIndex && query === lastQuery ? activeIndex : -1;
    lastQuery = query;
    clearHighlights();
    matches = [];
    activeIndex = -1;

    if (!query) {
      countEl.textContent = '';
      input.classList.remove('no-match');
      return;
    }

    if (getMode() === 'editor') {
      matches = EditorManager.findAll(query, { caseSensitive });
    } else {
      matches = findInArticle(query);
    }

    if (matches.length === 0) {
      countEl.textContent = '0';
      input.classList.add('no-match');
      return;
    }
    input.classList.remove('no-match');
    activeIndex = previousIndex >= 0 && previousIndex < matches.length ? previousIndex : nearestMatchIndex();
    showActive();
  }

  function nearestMatchIndex() {
    if (getMode() === 'editor') {
      const { start } = EditorManager.getSelection();
      const idx = matches.findIndex(m => m.start >= start);
      return idx === -1 ? 0 : idx;
    }
    const container = getArticle();
    if (!container) return 0;
    const top = container.getBoundingClientRect().top;
    const idx = matches.findIndex(r => r.getBoundingClientRect().top >= top);
    return idx === -1 ? 0 : idx;
  }

  function findInArticle(query) {
    const container = getArticle();
    if (!container || !supportsHighlights) return [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || p.closest('.code-copy, .code-view-gutter, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let full = '';
    let n;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, start: full.length, end: full.length + n.nodeValue.length });
      full += n.nodeValue;
    }
    const hay = caseSensitive ? full : full.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const ranges = [];
    let idx = hay.indexOf(needle);
    let ni = 0;
    while (idx !== -1 && ranges.length < 5000) {
      const endIdx = idx + needle.length;
      while (ni < nodes.length && nodes[ni].end <= idx) ni++;
      let si = ni;
      let ei = ni;
      while (ei < nodes.length && nodes[ei].end < endIdx) ei++;
      if (si < nodes.length && ei < nodes.length) {
        try {
          const range = new Range();
          range.setStart(nodes[si].node, idx - nodes[si].start);
          range.setEnd(nodes[ei].node, endIdx - nodes[ei].start);
          ranges.push(range);
        } catch { /* ungültiger Bereich */ }
      }
      idx = hay.indexOf(needle, idx + Math.max(1, needle.length));
    }
    if (ranges.length) {
      CSS.highlights.set('mv-find', new Highlight(...ranges));
    }
    return ranges;
  }

  function clearHighlights() {
    if (!supportsHighlights) return;
    CSS.highlights.delete('mv-find');
    CSS.highlights.delete('mv-find-active');
  }

  function showActive() {
    if (matches.length === 0 || activeIndex < 0) return;
    countEl.textContent = `${activeIndex + 1} / ${matches.length}`;
    const m = matches[activeIndex];
    if (getMode() === 'editor') {
      EditorManager.selectMatch(m);
      return;
    }
    if (supportsHighlights) {
      CSS.highlights.set('mv-find-active', new Highlight(m));
    }
    const container = getArticle();
    if (container) {
      const rect = m.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      if (rect.top < cRect.top + 40 || rect.bottom > cRect.bottom - 40) {
        container.classList.add('no-smooth');
        container.scrollTop += rect.top - cRect.top - cRect.height / 3;
        container.classList.remove('no-smooth');
      }
    }
  }

  function next() {
    if (matches.length === 0) { search(); return; }
    activeIndex = (activeIndex + 1) % matches.length;
    showActive();
  }

  function prev() {
    if (matches.length === 0) { search(); return; }
    activeIndex = (activeIndex - 1 + matches.length) % matches.length;
    showActive();
  }

  function replaceOne() {
    if (getMode() !== 'editor') return;
    if (matches.length === 0) { search(); if (matches.length === 0) return; }
    const m = matches[activeIndex];
    const sel = EditorManager.getSelection();
    if (sel.start !== m.start || sel.end !== m.end) {
      EditorManager.selectMatch(m);
    }
    EditorManager.replaceSelection(replaceInput.value);
    onReplaced(1);
    search();
    if (matches.length > 0) {
      const { start } = EditorManager.getSelection();
      const idx = matches.findIndex(x => x.start >= start);
      activeIndex = idx === -1 ? 0 : idx;
      showActive();
    }
  }

  function replaceAll() {
    if (getMode() !== 'editor' || !input.value) return;
    const count = EditorManager.replaceAll(input.value, replaceInput.value, { caseSensitive });
    onReplaced(count);
    search();
    if (count > 0) {
      Toast.success(`${count} ${count === 1 ? 'Stelle' : 'Stellen'} ersetzt`);
    }
  }

  return { init, open, close, isOpen, refresh, toggleReplace, next, prev };
})();
