/**
 * Preview Engine - handles visualization for all formats
 * Markdown → rendered HTML, HTML → iframe, CSS → preview panel,
 * JS/TS → highlighted code or iframe execution, JSON → pretty-printed
 */
const PreviewEngine = (() => {
  let markdownContainer = null;
  let previewIframe = null;
  let consolePanel = null;
  let consoleOutput = null;
  let btnRunCode = null;
  let executionMode = false; // false = highlight, true = execute
  let activeObjectUrl = null;

  function init() {
    markdownContainer = document.getElementById('markdown-content');
    previewIframe = document.getElementById('preview-iframe');
    consolePanel = document.getElementById('console-panel');
    consoleOutput = document.getElementById('console-output');
    btnRunCode = document.getElementById('btn-run-code');

    document.getElementById('btn-console-clear').addEventListener('click', clearConsole);

    // Listen for console messages from iframe
    window.addEventListener('message', (e) => {
      if (!previewIframe || e.source !== previewIframe.contentWindow) {
        return;
      }

      if (e.data && e.data.type === 'console') {
        appendConsole(e.data.level, e.data.args);
      }
    });
  }

  /**
   * Render content in the visualizer based on format
   */
  async function render(source, format, filePath) {
    hideAll();

    switch (format) {
      case 'markdown':
        await renderMarkdown(source);
        break;
      case 'html':
        await renderHtml(source, filePath);
        break;
      case 'css':
        renderCss(source);
        break;
      case 'javascript':
      case 'typescript':
        renderCodeOrExecute(source, format, filePath);
        break;
      case 'json':
        renderJson(source);
        break;
      default:
        renderPlainText(source);
        break;
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
    if (show) {
      btnRunCode.classList.remove('hidden');
    } else {
      btnRunCode.classList.add('hidden');
    }
  }

  /**
   * Markdown: delegate to IPC → markdown-engine
   */
  async function renderMarkdown(source) {
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');

    const { html, headings } = await window.api.renderMarkdown(source);
    markdownContainer.innerHTML = html;
    return headings;
  }

  /**
   * HTML: render in sandboxed iframe with resolved assets
   */
  async function renderHtml(source, filePath) {
    markdownContainer.classList.add('hidden');
    previewIframe.classList.remove('hidden');

    let html = source;
    if (filePath) {
      html = await window.api.resolveHtmlAssets(source, filePath);
    }

    setPreviewContent(html);
  }

  /**
   * CSS: show preview with sample elements + the CSS applied
   */
  function renderCss(source) {
    markdownContainer.classList.add('hidden');
    previewIframe.classList.remove('hidden');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>${escapeForHtml(source)}</style>
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; color: #333; background: #fff; }
  .preview-section { margin-bottom: 2rem; }
  .preview-section h3 { color: #666; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
</style>
</head>
<body>
  <div class="preview-section"><h3>Überschriften</h3><h1>Überschrift 1</h1><h2>Überschrift 2</h2><h3>Überschrift 3</h3></div>
  <div class="preview-section"><h3>Text</h3><p>Dies ist ein <strong>fetter</strong> und <em>kursiver</em> Absatz mit einem <a href="#">Link</a>.</p></div>
  <div class="preview-section"><h3>Liste</h3><ul><li>Element 1</li><li>Element 2</li><li>Element 3</li></ul></div>
  <div class="preview-section"><h3>Buttons</h3><button>Standard</button> <button class="primary">Primär</button> <button disabled>Deaktiviert</button></div>
  <div class="preview-section"><h3>Formular</h3><form><input type="text" placeholder="Texteingabe"><br><br><select><option>Option 1</option><option>Option 2</option></select><br><br><textarea placeholder="Textarea"></textarea></form></div>
  <div class="preview-section"><h3>Tabelle</h3><table><thead><tr><th>Name</th><th>Wert</th></tr></thead><tbody><tr><td>Alpha</td><td>100</td></tr><tr><td>Beta</td><td>200</td></tr></tbody></table></div>
</body>
</html>`;

    setPreviewContent(html);
  }

  /**
   * JS/TS: show highlighted code OR execute in iframe
   */
  function renderCodeOrExecute(source, format, filePath) {
    showRunButton(true);

    if (executionMode) {
      executeCode(source, format);
    } else {
      renderHighlighted(source, format);
    }
  }

  /**
   * Syntax-highlighted code display
   */
  function renderHighlighted(source, format) {
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');
    consolePanel.classList.add('hidden');

    const lang = format === 'typescript' ? 'typescript' :
                 format === 'javascript' ? 'javascript' :
                 format === 'json' ? 'json' :
                 format === 'css' ? 'css' :
                 format === 'html' ? 'html' : 'plaintext';

    markdownContainer.innerHTML = `<pre><code class="language-${lang}">${escapeHtml(source)}</code></pre>`;
  }

  /**
   * Execute JS/TS code in an iframe with console capture
   */
  async function executeCode(source, format) {
    markdownContainer.classList.add('hidden');
    previewIframe.classList.remove('hidden');
    consolePanel.classList.remove('hidden');
    clearConsole();

    let jsCode = source;
    if (format === 'typescript') {
      const result = await window.api.transpileTs(source);
      if (result.error) {
        appendConsole('error', [`TypeScript Fehler: ${result.error}`]);
        return;
      }
      jsCode = result.code;
    }

    const consoleScript = `
<script>
(function() {
  const origConsole = window.console;
  function send(level, args) {
    try {
      parent.postMessage({ type: 'console', level: level, args: args.map(a => {
        if (typeof a === 'object') return JSON.stringify(a, null, 2);
        return String(a);
      })}, '*');
    } catch(e) {}
  }
  console.log = function() { send('log', Array.from(arguments)); };
  console.warn = function() { send('warn', Array.from(arguments)); };
  console.error = function() { send('error', Array.from(arguments)); };
  console.info = function() { send('info', Array.from(arguments)); };
  window.onerror = function(msg, src, line, col, err) {
    send('error', ['Uncaught: ' + msg + ' (Zeile ' + line + ')']);
  };
  window.onunhandledrejection = function(e) {
    send('error', ['Unhandled Promise: ' + (e.reason || e)]);
  };
})();
<\/script>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${consoleScript}</head><body><script>${escapeForScript(jsCode)}<\/script></body></html>`;
    setPreviewContent(html);
  }

  /**
   * JSON: pretty-printed + highlighted
   */
  function renderJson(source) {
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');

    try {
      const parsed = JSON.parse(source);
      const pretty = JSON.stringify(parsed, null, 2);
      markdownContainer.innerHTML = `<pre><code class="language-json">${escapeHtml(pretty)}</code></pre>`;
    } catch {
      markdownContainer.innerHTML = `<pre><code>${escapeHtml(source)}</code></pre>`;
    }
  }

  /**
   * Plain text fallback
   */
  function renderPlainText(source) {
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');
    markdownContainer.innerHTML = `<pre><code>${escapeHtml(source)}</code></pre>`;
  }

  // ---- Console ----

  function appendConsole(level, args) {
    if (!consoleOutput) return;
    const line = document.createElement('div');
    line.className = `console-line ${level}`;
    line.textContent = args.join(' ');
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function clearConsole() {
    if (consoleOutput) consoleOutput.innerHTML = '';
  }

  // ---- Execution Mode Toggle ----

  function toggleExecution() {
    executionMode = !executionMode;
    return executionMode;
  }

  function isExecutionMode() {
    return executionMode;
  }

  function setExecutionMode(mode) {
    executionMode = mode;
  }

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
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeForHtml(str) {
    // For CSS inside <style> — don't escape, but close-tag protection
    return str.replace(/<\/style>/gi, '<\\/style>');
  }

  function escapeForScript(str) {
    return str.replace(/<\/script>/gi, '<\\/script>');
  }

  return {
    init, render, renderMarkdown, renderHtml, renderCss,
    renderHighlighted, executeCode, renderJson, renderPlainText,
    toggleExecution, isExecutionMode, setExecutionMode,
    showRunButton, clearConsole
  };
})();
