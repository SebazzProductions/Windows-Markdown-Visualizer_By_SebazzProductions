/**
 * Preview Engine – Darstellung aller Formate im Visualizer
 *  Markdown → bereinigtes HTML (DOMPurify) im Artikel-Container
 *  HTML     → sandboxed iframe mit eingebetteten lokalen Assets
 *  CSS      → iframe mit Beispiel-Elementen
 *  JS/TS    → Code-Ansicht mit Highlighting ODER Ausführung im iframe + Konsole
 *  JSON     → formatiert + Highlighting
 *  Sonstige → Code-Ansicht mit Zeilennummern
 */
const PreviewEngine = (() => {
  let markdownContainer = null;
  let article = null;
  let previewIframe = null;
  let consolePanel = null;
  let consoleOutput = null;
  let btnRunCode = null;
  let executionMode = false;
  let activeObjectUrl = null;
  let currentView = 'markdown'; // 'markdown' | 'code' | 'iframe'

  const HIGHLIGHT_MAX_CHARS = 1.5 * 1024 * 1024;

  const PURIFY_CONFIG = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_TAGS: ['details', 'summary', 'kbd', 'mark', 'sub', 'sup', 'abbr', 'figure', 'figcaption', 'input', 'label', 'section', 'nav'],
    ADD_ATTR: ['data-source-line', 'data-lang', 'align', 'width', 'height', 'checked', 'disabled', 'type', 'open', 'start', 'colspan', 'rowspan', 'for', 'id', 'class', 'title', 'alt', 'loading'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'style'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: true,
    RETURN_TRUSTED_TYPE: false
  };

  function init() {
    markdownContainer = document.getElementById('markdown-content');
    article = document.getElementById('markdown-article');
    previewIframe = document.getElementById('preview-iframe');
    consolePanel = document.getElementById('console-panel');
    consoleOutput = document.getElementById('console-output');
    btnRunCode = document.getElementById('btn-run-code');

    document.getElementById('btn-console-clear').addEventListener('click', clearConsole);

    window.addEventListener('message', (e) => {
      if (!previewIframe || e.source !== previewIframe.contentWindow) return;
      if (e.data && e.data.type === 'console') appendConsole(e.data.level, e.data.args);
    });
  }

  function sanitize(html) {
    if (typeof DOMPurify === 'undefined') return html;
    return DOMPurify.sanitize(html, PURIFY_CONFIG);
  }

  /**
   * Rendert Inhalte je nach Format. Für Markdown gibt es renderMarkdown() separat,
   * da die App die Überschriften benötigt.
   */
  async function render(source, format, filePath) {
    const id = format && format.id ? format.id : format;
    hideAll();
    switch (id) {
      case 'markdown':
        return renderMarkdown(source);
      case 'html':
        await renderHtml(source, filePath);
        return [];
      case 'css':
        renderCss(source);
        return [];
      case 'javascript':
      case 'typescript':
        showRunButton(true);
        if (executionMode) {
          await executeCode(source, id);
        } else {
          await renderCode(source, format && format.language ? format.language : id);
        }
        return [];
      case 'json':
        await renderJson(source, format);
        return [];
      default:
        await renderCode(source, format && format.language ? format.language : 'plaintext');
        return [];
    }
  }

  function hideAll() {
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');
    consolePanel.classList.add('hidden');
    btnRunCode.classList.add('hidden');
    clearPreviewFrame();
  }

  function showRunButton(show) {
    btnRunCode.classList.toggle('hidden', !show);
  }

  /**
   * Markdown rendern. Liefert die Überschriften (für TOC) zurück.
   */
  async function renderMarkdown(source) {
    currentView = 'markdown';
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');
    consolePanel.classList.add('hidden');

    const { html, headings } = await window.api.renderMarkdown(source);
    article.classList.remove('is-code-view');
    article.innerHTML = sanitize(html);
    decorateCodeBlocks();
    return headings;
  }

  function decorateCodeBlocks() {
    article.querySelectorAll('pre.code-block, pre > code').forEach(node => {
      const pre = node.tagName === 'PRE' ? node : node.parentElement;
      if (!pre || pre.querySelector('.code-copy')) return;
      if (pre.closest('.front-matter')) return;
      const btn = document.createElement('button');
      btn.className = 'code-copy';
      btn.type = 'button';
      btn.title = 'Code kopieren';
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Kopieren</span>';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const code = pre.querySelector('code');
        const text = code ? code.textContent : pre.textContent;
        try {
          await window.api.copyToClipboard(text.replace(/\n$/, ''));
          btn.classList.add('copied');
          btn.querySelector('span').textContent = 'Kopiert';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.querySelector('span').textContent = 'Kopieren';
          }, 1600);
        } catch { /* ignore */ }
      });
      pre.appendChild(btn);
    });
  }

  /**
   * HTML in sandboxed iframe mit eingebetteten lokalen Assets
   */
  async function renderHtml(source, filePath) {
    currentView = 'iframe';
    markdownContainer.classList.add('hidden');
    previewIframe.classList.remove('hidden');
    let html = source;
    if (filePath) {
      try { html = await window.api.resolveHtmlAssets(source, filePath); } catch { html = source; }
    }
    setPreviewContent(html);
  }

  function renderCss(source) {
    currentView = 'iframe';
    markdownContainer.classList.add('hidden');
    previewIframe.classList.remove('hidden');
    const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8">
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; color: #333; background: #fff; }
  .preview-section { margin-bottom: 2rem; }
  .preview-section > h3.__label { color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.6rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; font-weight: 600; }
</style>
<style id="user-css">${escapeForHtml(source)}</style>
</head>
<body>
  <div class="preview-section"><h3 class="__label">Überschriften</h3><h1>Überschrift 1</h1><h2>Überschrift 2</h2><h3>Überschrift 3</h3></div>
  <div class="preview-section"><h3 class="__label">Text</h3><p>Dies ist ein <strong>fetter</strong> und <em>kursiver</em> Absatz mit einem <a href="#">Link</a> und <code>Inline-Code</code>.</p><blockquote>Ein Zitat.</blockquote></div>
  <div class="preview-section"><h3 class="__label">Listen</h3><ul><li>Element 1</li><li>Element 2</li></ul><ol><li>Erstens</li><li>Zweitens</li></ol></div>
  <div class="preview-section"><h3 class="__label">Buttons</h3><button>Standard</button> <button class="primary btn btn-primary">Primär</button> <button class="secondary btn btn-secondary">Sekundär</button> <button disabled>Deaktiviert</button></div>
  <div class="preview-section"><h3 class="__label">Formular</h3><form><label>Text <input type="text" placeholder="Texteingabe"></label><br><br><label>Auswahl <select><option>Option 1</option><option>Option 2</option></select></label><br><br><label><input type="checkbox" checked> Checkbox</label><br><br><textarea placeholder="Textarea"></textarea></form></div>
  <div class="preview-section"><h3 class="__label">Tabelle</h3><table><thead><tr><th>Name</th><th>Wert</th></tr></thead><tbody><tr><td>Alpha</td><td>100</td></tr><tr><td>Beta</td><td>200</td></tr></tbody></table></div>
  <div class="preview-section"><h3 class="__label">Karte / Container</h3><div class="card container"><h3>Card-Titel</h3><p>Inhalt einer Karte (<code>.card</code>, <code>.container</code>).</p></div></div>
</body>
</html>`;
    setPreviewContent(html);
  }

  /**
   * Code-Ansicht mit Zeilennummern und Highlighting
   */
  async function renderCode(source, language) {
    currentView = 'code';
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');
    consolePanel.classList.add('hidden');

    const text = String(source ?? '');
    let html;
    let lang = language || 'plaintext';
    if (text.length <= HIGHLIGHT_MAX_CHARS) {
      try {
        const res = await window.api.highlightCode(text, lang);
        html = res.html;
        lang = res.language || lang;
      } catch {
        html = escapeHtml(text);
      }
    } else {
      html = escapeHtml(text);
    }
    article.classList.add('is-code-view');
    article.innerHTML = buildCodeView(html, text, lang, true);
  }

  function buildCodeView(highlightedHtml, text, lang, withGutter) {
    const lineCount = text.length === 0 ? 1 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    let gutter = '';
    if (withGutter) {
      const nums = [];
      for (let i = 1; i <= Math.max(1, lineCount); i++) nums.push(i);
      gutter = `<div class="code-view-gutter" aria-hidden="true">${nums.join('\n')}</div>`;
    }
    return `<div class="code-view" data-lang="${escapeHtml(lang)}">${gutter}<pre class="hljs"><code class="hljs language-${escapeHtml(lang)}">${highlightedHtml}</code></pre></div>`;
  }

  async function renderJson(source, format) {
    let pretty = source;
    try {
      pretty = JSON.stringify(JSON.parse(source), null, 2);
    } catch {
      // JSONL / ungültiges JSON → Rohtext anzeigen
    }
    await renderCode(pretty, (format && format.language) || 'json');
  }

  /**
   * JS/TS im iframe ausführen, Konsole abfangen
   */
  async function executeCode(source, formatId) {
    currentView = 'iframe';
    markdownContainer.classList.add('hidden');
    previewIframe.classList.remove('hidden');
    consolePanel.classList.remove('hidden');
    clearConsole();

    let jsCode = source;
    if (formatId === 'typescript') {
      const result = await window.api.transpileTs(source);
      if (result.error) {
        appendConsole('error', [`TypeScript-Fehler: ${result.error}`]);
        return;
      }
      jsCode = result.code;
    }

    const consoleScript = `
<script>
(function () {
  function fmt(a) {
    try {
      if (a instanceof Error) return (a.stack || (a.name + ': ' + a.message));
      if (typeof a === 'string') return a;
      if (typeof a === 'function') return a.toString();
      if (a === undefined) return 'undefined';
      if (a instanceof Element) return a.outerHTML.slice(0, 500);
      if (typeof a === 'object' && a !== null) {
        var seen = new WeakSet();
        return JSON.stringify(a, function (k, v) {
          if (typeof v === 'object' && v !== null) { if (seen.has(v)) return '[Circular]'; seen.add(v); }
          if (typeof v === 'bigint') return v.toString() + 'n';
          if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
          return v;
        }, 2);
      }
      return String(a);
    } catch (e) { return String(a); }
  }
  function send(level, args) {
    try { parent.postMessage({ type: 'console', level: level, args: Array.prototype.map.call(args, fmt) }, '*'); } catch (e) {}
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () { send(level, arguments); if (orig) orig.apply(console, arguments); };
  });
  console.table = function (d) { send('log', [d]); };
  window.addEventListener('error', function (e) { send('error', ['Uncaught ' + (e.message || e) + (e.lineno ? ' (Zeile ' + e.lineno + ')' : '')]); });
  window.addEventListener('unhandledrejection', function (e) { send('error', ['Unhandled Promise: ' + fmt(e.reason)]); });
})();
</scr${''}ipt>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${consoleScript}<style>body{font-family:'Segoe UI',sans-serif;padding:1rem;color:#222}</style></head><body><script>${escapeForScript(jsCode)}</scr${''}ipt></body></html>`;
    setPreviewContent(html);
    appendConsole('debug', ['Ausführung gestartet …']);
  }

  // ---- Export ----

  /**
   * Liefert das HTML für den Export (Artikel-Inhalt ohne interaktive Elemente).
   * @param {{lineNumbers?: boolean}} opts
   */
  function getExportHtml(opts = {}) {
    if (currentView === 'iframe') return null;
    const clone = article.cloneNode(true);
    clone.querySelectorAll('.code-copy').forEach(el => el.remove());
    if (currentView === 'code' && opts.lineNumbers === false) {
      clone.querySelectorAll('.code-view-gutter').forEach(el => el.remove());
    }
    return clone.innerHTML;
  }

  function isCodeView() {
    return currentView === 'code';
  }

  // ---- Konsole ----

  function appendConsole(level, args) {
    if (!consoleOutput) return;
    const line = document.createElement('div');
    line.className = `console-line ${level}`;
    line.textContent = (Array.isArray(args) ? args : [args]).join(' ');
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function clearConsole() {
    if (consoleOutput) consoleOutput.innerHTML = '';
  }

  // ---- Ausführungsmodus ----

  function toggleExecution() {
    executionMode = !executionMode;
    return executionMode;
  }
  function isExecutionMode() { return executionMode; }
  function setExecutionMode(mode) { executionMode = Boolean(mode); }

  // ---- iframe ----

  function clearPreviewFrame() {
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    if (previewIframe) {
      previewIframe.onload = null;
      previewIframe.removeAttribute('src');
    }
  }

  function setPreviewContent(html) {
    clearPreviewFrame();
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    activeObjectUrl = url;
    previewIframe.src = url;
    previewIframe.onload = () => {
      if (activeObjectUrl === url) {
        URL.revokeObjectURL(url);
        activeObjectUrl = null;
      }
    };
  }

  // ---- Utilities ----

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeForHtml(str) {
    return String(str).replace(/<\/style/gi, '<\\/style');
  }
  function escapeForScript(str) {
    return String(str).replace(/<\/script/gi, '<\\/script');
  }

  return {
    init, render, renderMarkdown, renderHtml, renderCss, renderCode, executeCode, renderJson,
    toggleExecution, isExecutionMode, setExecutionMode, showRunButton, clearConsole,
    getExportHtml, isCodeView, sanitize
  };
})();
