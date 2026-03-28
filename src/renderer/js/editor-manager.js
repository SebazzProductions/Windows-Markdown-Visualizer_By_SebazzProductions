/**
 * Editor Manager - textarea with line gutter, scroll sync, goto-line
 */
const EditorManager = (() => {
  let textarea = null;
  let gutter = null;
  let statusPos = null;
  let statusLines = null;
  let statusFormat = null;
  let onChangeCallback = null;
  let lineCount = 0;

  function init(textareaEl, gutterEl, onChange) {
    textarea = textareaEl;
    gutter = gutterEl;
    statusPos = document.getElementById('editor-status-pos');
    statusLines = document.getElementById('editor-status-lines');
    statusFormat = document.getElementById('editor-status-format');
    onChangeCallback = onChange;

    // Input handler
    textarea.addEventListener('input', () => {
      updateLineNumbers();
      updateStatus();
      if (onChangeCallback) onChangeCallback(textarea.value);
    });

    // Scroll sync gutter ↔ textarea
    textarea.addEventListener('scroll', () => {
      gutter.scrollTop = textarea.scrollTop;
    });

    // Cursor position tracking
    textarea.addEventListener('click', updateStatus);
    textarea.addEventListener('keyup', updateStatus);

    // Tab key → 2 spaces
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        textarea.value = value.substring(0, start) + '  ' + value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        updateLineNumbers();
        updateStatus();
        if (onChangeCallback) onChangeCallback(textarea.value);
      }
    });

    updateLineNumbers();
    updateStatus();
  }

  function setContent(text) {
    if (!textarea) return;
    textarea.value = text;
    updateLineNumbers();
    updateStatus();
  }

  function getContent() {
    return textarea ? textarea.value : '';
  }

  function updateLineNumbers() {
    if (!textarea || !gutter) return;
    const lines = textarea.value.split('\n');
    lineCount = lines.length;

    // Only rebuild DOM if line count changed
    const existing = gutter.children.length;
    if (existing !== lineCount) {
      const fragment = document.createDocumentFragment();
      for (let i = 1; i <= lineCount; i++) {
        const span = document.createElement('span');
        span.className = 'line-number';
        span.textContent = i;
        fragment.appendChild(span);
      }
      gutter.innerHTML = '';
      gutter.appendChild(fragment);
    }
  }

  function updateStatus() {
    if (!textarea || !statusPos || !statusLines) return;
    const val = textarea.value;
    const pos = textarea.selectionStart;
    const beforeCursor = val.substring(0, pos);
    const line = beforeCursor.split('\n').length;
    const col = pos - beforeCursor.lastIndexOf('\n');

    statusPos.textContent = `Zeile ${line}, Spalte ${col}`;
    statusLines.textContent = `${lineCount} Zeilen`;

    // Highlight active line in gutter
    const gutterLines = gutter.querySelectorAll('.line-number');
    gutterLines.forEach((el, idx) => {
      el.classList.toggle('active', idx === line - 1);
    });
  }

  function setFormatLabel(label) {
    if (statusFormat) statusFormat.textContent = label || '';
  }

  function goToLine(n) {
    if (!textarea) return;
    const lines = textarea.value.split('\n');
    const target = Math.max(1, Math.min(n, lines.length));
    let charPos = 0;
    for (let i = 0; i < target - 1; i++) {
      charPos += lines[i].length + 1;
    }
    textarea.selectionStart = textarea.selectionEnd = charPos;
    textarea.focus();

    // Scroll to line
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    textarea.scrollTop = (target - 1) * lineHeight - textarea.clientHeight / 3;
    updateStatus();
  }

  function getLineCount() {
    return lineCount;
  }

  function focus() {
    if (textarea) textarea.focus();
  }

  return { init, setContent, getContent, updateLineNumbers, goToLine, getLineCount, setFormatLabel, focus };
})();
