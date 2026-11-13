/**
 * Fix Syntax Manager – Analyse, Diff (LCS) und Übernahme von Formatierungs-Korrekturen
 */
const FixSyntaxManager = (() => {
  let issuesContent, issueCountBadge, diffContent, diffStats, summaryEl;
  let btnApply, btnCancel, btnScan, btnSave;

  let currentOriginal = '';
  let currentFormatted = '';
  let currentIssues = [];
  let onApplyCallback = null;
  let getSourceCallback = null;
  let onGotoLine = null;
  let onSave = null;
  let extraIssues = null;     // async (source, filePath) => issues[] – z. B. Mermaid-Syntaxprüfung
  let lastFilePath = null;
  let scanSeq = 0;

  const DIFF_MAX_CELLS = 6_000_000; // LCS-Tabelle (Uint16) – darüber vereinfachter Diff
  const CONTEXT_LINES = 3;
  const t = (key, params) => I18n.t(key, params);

  function init(options = {}) {
    issuesContent = document.getElementById('fix-issues-content');
    issueCountBadge = document.getElementById('fix-issue-count');
    diffContent = document.getElementById('fix-diff-content');
    diffStats = document.getElementById('fix-diff-stats');
    summaryEl = document.getElementById('fix-summary');
    btnApply = document.getElementById('btn-fix-apply');
    btnCancel = document.getElementById('btn-fix-cancel');
    btnScan = document.getElementById('btn-fix-scan');
    btnSave = document.getElementById('btn-fix-save');
    onApplyCallback = options.onApply || null;
    getSourceCallback = options.getSource || null;
    onGotoLine = options.onGotoLine || null;
    onSave = options.onSave || null;
    extraIssues = options.extraIssues || null;

    btnApply.addEventListener('click', applyFix);
    btnCancel.addEventListener('click', reset);
    btnScan.addEventListener('click', rescan);
    if (btnSave) btnSave.addEventListener('click', () => { if (onSave) onSave(); });

    issuesContent.addEventListener('click', (e) => {
      const item = e.target.closest('.issue-item');
      if (item && onGotoLine) onGotoLine(Number(item.dataset.line) || 1);
    });
    diffContent.addEventListener('click', (e) => {
      const line = e.target.closest('.diff-line');
      if (line && onGotoLine && line.dataset.origLine) onGotoLine(Number(line.dataset.origLine));
    });
  }

  function setSaveEnabled(enabled) {
    if (btnSave) btnSave.disabled = !enabled;
  }

  async function analyze(source, filePath) {
    currentOriginal = source;
    lastFilePath = filePath;
    const seq = ++scanSeq;
    setScanningState(true);

    try {
      const [result, extra] = await Promise.all([
        window.api.formatCode(filePath || '.txt', source),
        extraIssues ? extraIssues(source, filePath).catch(() => []) : Promise.resolve([])
      ]);
      if (seq !== scanSeq) return; // veraltetes Ergebnis
      currentFormatted = typeof result.formatted === 'string' ? result.formatted : currentOriginal;
      currentIssues = [...(Array.isArray(extra) ? extra : []), ...(Array.isArray(result.issues) ? result.issues : [])]
        .sort((a, b) => (Number(a.line) || 0) - (Number(b.line) || 0));
    } catch (err) {
      if (seq !== scanSeq) return;
      currentFormatted = currentOriginal;
      currentIssues = [{ line: 1, message: t('fix.failed', { error: err.message }), severity: 'error' }];
    } finally {
      if (seq === scanSeq) setScanningState(false);
    }

    renderResults();
  }

  function renderResults() {
    renderIssues();
    renderDiff();
    const hasChanges = currentOriginal !== currentFormatted;
    btnApply.disabled = !hasChanges;
    const count = currentIssues.length;
    issueCountBadge.textContent = String(count || (hasChanges ? '!' : '0'));
    issueCountBadge.classList.toggle('is-zero', count === 0 && !hasChanges);
    if (summaryEl) {
      const errors = currentIssues.filter(i => i.severity === 'error').length;
      const warnings = currentIssues.filter(i => i.severity === 'warning').length;
      const infos = count - errors - warnings;
      const parts = [];
      if (errors) parts.push(I18n.plural(errors, 'fix.errorOne', 'fix.errors'));
      if (warnings) parts.push(I18n.plural(warnings, 'fix.warningOne', 'fix.warnings'));
      if (infos) parts.push(I18n.plural(infos, 'fix.infoOne', 'fix.infos'));
      summaryEl.textContent = parts.join(' · ') || (hasChanges ? t('fix.improvableShort') : t('fix.allGood'));
    }
  }

  function renderIssues() {
    if (!issuesContent) return;
    if (currentIssues.length === 0) {
      issuesContent.innerHTML = `<p class="fix-placeholder">${escapeHtml(currentOriginal === currentFormatted ? t('fix.noProblems') : t('fix.improvable'))}</p>`;
      return;
    }
    const icon = { error: 'i-error', warning: 'i-alert', info: 'i-info' };
    issuesContent.innerHTML = currentIssues.map(issue => {
      const severity = ['error', 'warning', 'info'].includes(issue.severity) ? issue.severity : 'info';
      const line = Number(issue.line) || 1;
      return `<button type="button" class="issue-item issue-severity-${severity}" data-line="${line}" title="${escapeHtml(t('fix.gotoLine', { line }))}">
        <svg class="issue-icon"><use href="#${icon[severity]}"/></svg>
        <span class="issue-line">${escapeHtml(t('fix.lineAbbr'))} ${Number(issue.line) || '?'}</span>
        <span class="issue-message">${escapeHtml(issue.message)}</span>
      </button>`;
    }).join('');
  }

  function renderDiff() {
    if (!diffContent) return;
    if (currentOriginal === currentFormatted) {
      diffContent.innerHTML = `<p class="fix-placeholder">${escapeHtml(t('fix.noChanges'))}</p>`;
      if (diffStats) diffStats.textContent = '';
      return;
    }
    const origLines = currentOriginal.split('\n');
    const formLines = currentFormatted.split('\n');
    const ops = diffLines(origLines, formLines);
    const added = ops.filter(o => o.type === 'added').length;
    const removed = ops.filter(o => o.type === 'removed').length;
    if (diffStats) diffStats.innerHTML = `<span class="added">+${added}</span> <span class="removed">−${removed}</span>`;
    diffContent.innerHTML = renderOps(ops);
  }

  /**
   * Zeilen-Diff: gemeinsame Prefix/Suffix abtrennen, Rest per LCS (DP), Fallback naiv.
   * @returns {Array<{type:'unchanged'|'added'|'removed', text:string, o?:number, f?:number}>}
   */
  function diffLines(a, b) {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length, endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

    const ops = [];
    for (let i = 0; i < start; i++) ops.push({ type: 'unchanged', text: a[i], o: i + 1, f: i + 1 });

    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);
    const mid = (midA.length * midB.length <= DIFF_MAX_CELLS) ? lcsDiff(midA, midB) : naiveDiff(midA, midB);
    for (const op of mid) {
      if (op.o !== undefined) op.o += start;
      if (op.f !== undefined) op.f += start;
      ops.push(op);
    }
    for (let i = 0; i < a.length - endA; i++) {
      ops.push({ type: 'unchanged', text: a[endA + i], o: endA + i + 1, f: endB + i + 1 });
    }
    return ops;
  }

  function lcsDiff(a, b) {
    const n = a.length, m = b.length;
    if (n === 0) return b.map((text, j) => ({ type: 'added', text, f: j + 1 }));
    if (m === 0) return a.map((text, i) => ({ type: 'removed', text, o: i + 1 }));
    const width = m + 1;
    const dp = new Uint16Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * width + j] = a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push({ type: 'unchanged', text: a[i], o: i + 1, f: j + 1 });
        i++; j++;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        ops.push({ type: 'removed', text: a[i], o: i + 1 });
        i++;
      } else {
        ops.push({ type: 'added', text: b[j], f: j + 1 });
        j++;
      }
    }
    while (i < n) { ops.push({ type: 'removed', text: a[i], o: i + 1 }); i++; }
    while (j < m) { ops.push({ type: 'added', text: b[j], f: j + 1 }); j++; }
    return ops;
  }

  function naiveDiff(a, b) {
    const ops = [];
    const len = Math.max(a.length, b.length);
    for (let k = 0; k < len; k++) {
      if (k < a.length && k < b.length && a[k] === b[k]) {
        ops.push({ type: 'unchanged', text: a[k], o: k + 1, f: k + 1 });
      } else {
        if (k < a.length) ops.push({ type: 'removed', text: a[k], o: k + 1 });
        if (k < b.length) ops.push({ type: 'added', text: b[k], f: k + 1 });
      }
    }
    return ops;
  }

  /**
   * Nur geänderte Bereiche mit Kontext anzeigen; lange unveränderte Blöcke zusammenfalten.
   */
  function renderOps(ops) {
    const keep = new Array(ops.length).fill(false);
    for (let i = 0; i < ops.length; i++) {
      if (ops[i].type !== 'unchanged') {
        for (let k = Math.max(0, i - CONTEXT_LINES); k <= Math.min(ops.length - 1, i + CONTEXT_LINES); k++) keep[k] = true;
      }
    }
    let html = '';
    let skipped = 0;
    let lastOrigLine = 0;
    const flushSkip = () => {
      if (skipped > 0) {
        html += `<div class="diff-skip">${escapeHtml(I18n.plural(skipped, 'fix.skippedOne', 'fix.skipped'))}</div>`;
        skipped = 0;
      }
    };
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (!keep[i]) { skipped++; continue; }
      flushSkip();
      if (op.o) lastOrigLine = op.o;
      const num = op.type === 'added' ? op.f : op.o;
      const origLine = op.o || lastOrigLine || 1;
      html += `<div class="diff-line ${op.type}" data-orig-line="${origLine}" title="${escapeHtml(t('fix.gotoLineEditor', { line: origLine }))}">
        <span class="diff-line-num">${num ?? ''}</span>
        <span class="diff-line-content">${escapeHtml(op.text || '')}</span>
      </div>`;
    }
    flushSkip();
    return html;
  }

  function applyFix() {
    if (onApplyCallback && currentFormatted) onApplyCallback(currentFormatted);
  }

  function reset() {
    scanSeq++;
    currentOriginal = '';
    currentFormatted = '';
    currentIssues = [];
    if (issuesContent) issuesContent.innerHTML = `<p class="fix-placeholder">${escapeHtml(t('fix.noProblems'))}</p>`;
    if (diffContent) diffContent.innerHTML = `<p class="fix-placeholder">${escapeHtml(t('fix.noDiff'))}</p>`;
    if (diffStats) diffStats.textContent = '';
    if (summaryEl) summaryEl.textContent = '';
    if (issueCountBadge) { issueCountBadge.textContent = '0'; issueCountBadge.classList.add('is-zero'); }
    if (btnApply) btnApply.disabled = true;
    setScanningState(false);
  }

  async function rescan() {
    if (typeof getSourceCallback === 'function') currentOriginal = getSourceCallback();
    if (currentOriginal !== null && currentOriginal !== undefined) {
      await analyze(currentOriginal, lastFilePath);
    }
  }

  /** Texte nach Sprachwechsel neu aufbauen (ohne erneute Analyse). */
  function relabel() {
    if (currentOriginal || currentIssues.length) renderResults();
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
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, analyze, reset, setSource, rescan, relabel, setSaveEnabled, diffLines };
})();
