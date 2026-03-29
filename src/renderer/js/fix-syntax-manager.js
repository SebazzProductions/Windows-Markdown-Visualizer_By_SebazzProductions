/**
 * Fix Syntax Manager - analyze, diff, and apply formatting fixes
 */
const FixSyntaxManager = (() => {
  let issuesContent = null;
  let issueCountBadge = null;
  let diffContent = null;
  let btnApply = null;
  let btnCancel = null;

  let btnScan = null;

  let currentOriginal = '';
  let currentFormatted = '';
  let currentIssues = [];
  let onApplyCallback = null;
  let getSourceCallback = null;
  let lastFilePath = null;

  function init(options = {}) {
    issuesContent = document.getElementById('fix-issues-content');
    issueCountBadge = document.getElementById('fix-issue-count');
    diffContent = document.getElementById('fix-diff-content');
    btnApply = document.getElementById('btn-fix-apply');
    btnCancel = document.getElementById('btn-fix-cancel');
    btnScan = document.getElementById('btn-fix-scan');
    onApplyCallback = options.onApply || null;
    getSourceCallback = options.getSource || null;

    btnApply.addEventListener('click', applyFix);
    btnCancel.addEventListener('click', reset);
    btnScan.addEventListener('click', rescan);
  }

  /**
   * Analyze source and show issues + diff
   */
  async function analyze(source, filePath) {
    currentOriginal = source;
    lastFilePath = filePath;

    setScanningState(true);

    try {
      const result = await window.api.formatCode(filePath, source);
      currentFormatted = typeof result.formatted === 'string' ? result.formatted : currentOriginal;
      currentIssues = Array.isArray(result.issues) ? result.issues : [];

      renderIssues();
      renderDiff();

      // Enable apply button only if there are changes
      const hasChanges = currentOriginal !== currentFormatted;
      btnApply.disabled = !hasChanges;
      issueCountBadge.textContent = String(currentIssues.length || (hasChanges ? '!' : '0'));
    } catch (err) {
      currentFormatted = currentOriginal;
      currentIssues = [{
        line: 1,
        message: `Analyse fehlgeschlagen: ${err.message}`,
        severity: 'error'
      }];
      renderIssues();
      renderDiff();
      btnApply.disabled = true;
      issueCountBadge.textContent = String(currentIssues.length);
    } finally {
      setScanningState(false);
    }
  }

  function renderIssues() {
    if (!issuesContent) return;

    if (currentIssues.length === 0 && currentOriginal === currentFormatted) {
      issuesContent.innerHTML = '<p class="fix-placeholder">Keine Probleme gefunden.</p>';
      return;
    }

    if (currentIssues.length === 0 && currentOriginal !== currentFormatted) {
      issuesContent.innerHTML = '<p class="fix-placeholder">Formatierung kann verbessert werden.</p>';
      return;
    }

    const html = currentIssues.map(issue => {
      const severity = issue.severity || 'info';
      return `<div class="issue-item issue-severity-${severity}">
        <span class="issue-line">Z.${issue.line || '?'}</span>
        <span class="issue-message">${escapeHtml(issue.message)}</span>
      </div>`;
    }).join('');

    issuesContent.innerHTML = html;
  }

  function renderDiff() {
    if (!diffContent) return;

    if (currentOriginal === currentFormatted) {
      diffContent.innerHTML = '<p class="fix-placeholder">Keine Änderungen erforderlich.</p>';
      return;
    }

    const origLines = currentOriginal.split('\n');
    const formLines = currentFormatted.split('\n');
    const diffHtml = buildLineDiff(origLines, formLines);
    diffContent.innerHTML = diffHtml;
  }

  /**
   * Simple line-by-line diff
   */
  function buildLineDiff(origLines, formLines) {
    const maxLen = Math.max(origLines.length, formLines.length);
    let html = '';
    let oi = 0, fi = 0;

    while (oi < origLines.length || fi < formLines.length) {
      const origLine = oi < origLines.length ? origLines[oi] : undefined;
      const formLine = fi < formLines.length ? formLines[fi] : undefined;

      if (origLine === formLine) {
        html += diffLineHtml(oi + 1, 'unchanged', origLine);
        oi++;
        fi++;
      } else if (origLine !== undefined && formLine !== undefined) {
        // Changed line: show removed then added
        html += diffLineHtml(oi + 1, 'removed', origLine);
        html += diffLineHtml(fi + 1, 'added', formLine);
        oi++;
        fi++;
      } else if (origLine !== undefined) {
        html += diffLineHtml(oi + 1, 'removed', origLine);
        oi++;
      } else {
        html += diffLineHtml(fi + 1, 'added', formLine);
        fi++;
      }
    }
    return html;
  }

  function diffLineHtml(lineNum, type, content) {
    return `<div class="diff-line ${type}">
      <span class="diff-line-num">${lineNum}</span>
      <span class="diff-line-content">${escapeHtml(content || '')}</span>
    </div>`;
  }

  function applyFix() {
    if (onApplyCallback && currentFormatted) {
      onApplyCallback(currentFormatted);
    }
    // Don't reset - let app.js handle refresh
  }

  function reset() {
    currentOriginal = '';
    currentFormatted = '';
    currentIssues = [];
    if (issuesContent) issuesContent.innerHTML = '<p class="fix-placeholder">Keine Probleme gefunden.</p>';
    if (diffContent) diffContent.innerHTML = '<p class="fix-placeholder">Kein Diff verfügbar.</p>';
    if (issueCountBadge) issueCountBadge.textContent = '0';
    if (btnApply) btnApply.disabled = true;
  }

  async function rescan() {
    if (typeof getSourceCallback === 'function') {
      currentOriginal = getSourceCallback();
    }

    if (lastFilePath !== null && currentOriginal !== null) {
      await analyze(currentOriginal, lastFilePath);
    }
  }

  function setSource(source, filePath) {
    currentOriginal = source;
    lastFilePath = filePath;
  }

  function setScanningState(isScanning) {
    if (!btnScan) return;
    btnScan.disabled = isScanning;
    btnScan.classList.toggle('is-loading', isScanning);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { init, analyze, reset, setSource, rescan };
})();
