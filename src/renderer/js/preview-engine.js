/**
 * Preview Engine – Darstellung aller Formate im Visualizer
 *  Markdown → bereinigtes HTML (DOMPurify) im Artikel-Container, ```mermaid-Blöcke als Diagramme
 *  Mermaid  → Diagramm-Bühne mit Zoom/Verschieben (Mausrad, Ziehen, Einpassen)
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
  let currentView = 'markdown'; // 'markdown' | 'code' | 'iframe' | 'mermaid'
  let currentTheme = 'light';
  let hasInlineDiagrams = false;
  let onInsertTemplate = null;

  const HIGHLIGHT_MAX_CHARS = 1.5 * 1024 * 1024;
  const t = (key, params) => I18n.t(key, params);

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

  // ---- Diagramm-Bühne (Mermaid-Dokumente) ----
  const diagram = {
    source: '',
    svg: '',           // zuletzt erfolgreich gerendertes SVG
    stage: null, canvas: null, viewport: null, emptyEl: null, errorEl: null, errorText: null, zoomLabel: null,
    scale: 1, tx: 0, ty: 0,
    fresh: true,       // nächstes Rendering: Ansicht einpassen
    natural: { w: 0, h: 0 },
    drag: null,
    resizeObserver: null,
    stageLang: null
  };
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 8;

  function init(options = {}) {
    markdownContainer = document.getElementById('markdown-content');
    article = document.getElementById('markdown-article');
    previewIframe = document.getElementById('preview-iframe');
    consolePanel = document.getElementById('console-panel');
    consoleOutput = document.getElementById('console-output');
    btnRunCode = document.getElementById('btn-run-code');
    onInsertTemplate = options.onInsertTemplate || null;

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

  function setTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    MermaidEngine.setTheme(currentTheme);
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
      case 'mermaid':
        await renderMermaidDocument(source);
        return [];
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

  function leaveDiagramMode() {
    if (currentView === 'mermaid') {
      markdownContainer.classList.remove('is-diagram');
      article.classList.remove('is-diagram-view');
      if (diagram.resizeObserver) { diagram.resizeObserver.disconnect(); diagram.resizeObserver = null; }
      diagram.stage = null;
    }
  }

  function showRunButton(show) {
    btnRunCode.classList.toggle('hidden', !show);
  }

  // =====================================================================
  // Markdown
  // =====================================================================

  /**
   * Markdown rendern. Liefert die Überschriften (für TOC) zurück.
   */
  async function renderMarkdown(source) {
    leaveDiagramMode();
    currentView = 'markdown';
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');
    consolePanel.classList.add('hidden');

    const { html, headings } = await window.api.renderMarkdown(source);
    article.classList.remove('is-code-view');
    article.innerHTML = sanitize(html);
    await renderInlineDiagrams();
    decorateCodeBlocks();
    return headings;
  }

  /**
   * ```mermaid-Blöcke durch gerenderte Diagramme ersetzen (Fehler: Codeblock + Meldung bleiben).
   */
  async function renderInlineDiagrams() {
    const blocks = Array.from(article.querySelectorAll('pre.code-block[data-lang="mermaid"]'));
    hasInlineDiagrams = blocks.length > 0;
    if (blocks.length === 0) return;
    await Promise.all(blocks.map(async (pre) => {
      const codeEl = pre.querySelector('code') || pre;
      const code = codeEl.textContent.replace(/\n$/, '');
      const figure = document.createElement('figure');
      figure.className = 'mermaid-diagram';
      if (pre.dataset.sourceLine) figure.dataset.sourceLine = pre.dataset.sourceLine;
      figure.dataset.source = code;
      const result = await MermaidEngine.render(code);
      if (result.svg) {
        figure.innerHTML = result.svg;
        attachDiagramActions(figure, code);
      } else {
        figure.classList.add('has-error');
        figure.appendChild(pre.cloneNode(true));
        figure.appendChild(buildErrorBanner(result.error));
      }
      if (pre.parentNode) pre.replaceWith(figure);
    }));
  }

  function buildErrorBanner(error) {
    const banner = document.createElement('div');
    banner.className = 'mermaid-error';
    const where = error && error.line ? ` (${t('mermaid.errorLine', { line: error.line })})` : '';
    banner.innerHTML = '<svg width="16" height="16"><use href="#i-error"/></svg><span></span>';
    banner.querySelector('span').textContent = `${t('mermaid.error')}${where}: ${error ? error.message : ''}`;
    return banner;
  }

  function attachDiagramActions(figure, code) {
    const actions = document.createElement('div');
    actions.className = 'diagram-actions';
    const copySvg = document.createElement('button');
    copySvg.type = 'button';
    copySvg.className = 'code-copy diagram-action';
    copySvg.title = t('mermaid.copySvg');
    copySvg.innerHTML = '<svg width="12" height="12"><use href="#i-copy"/></svg><span>SVG</span>';
    copySvg.addEventListener('click', async (e) => {
      e.stopPropagation();
      const svg = figure.querySelector('svg');
      if (!svg) return;
      try {
        await window.api.copyToClipboard(svg.outerHTML);
        Toast.success(t('mermaid.svgCopied'), { duration: 1800 });
      } catch { /* ignore */ }
    });
    const copySrc = document.createElement('button');
    copySrc.type = 'button';
    copySrc.className = 'code-copy diagram-action';
    copySrc.title = t('mermaid.copySource');
    copySrc.innerHTML = `<svg width="12" height="12"><use href="#i-copy"/></svg><span>${escapeHtml(t('code.copy'))}</span>`;
    copySrc.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await window.api.copyToClipboard(code);
        copySrc.classList.add('copied');
        copySrc.querySelector('span').textContent = t('code.copied');
        setTimeout(() => { copySrc.classList.remove('copied'); copySrc.querySelector('span').textContent = t('code.copy'); }, 1600);
      } catch { /* ignore */ }
    });
    actions.append(copySvg, copySrc);
    figure.appendChild(actions);
  }

  function decorateCodeBlocks() {
    article.querySelectorAll('pre.code-block, pre > code').forEach(node => {
      const pre = node.tagName === 'PRE' ? node : node.parentElement;
      if (!pre || pre.querySelector('.code-copy')) return;
      if (pre.closest('.front-matter')) return;
      const btn = document.createElement('button');
      btn.className = 'code-copy';
      btn.type = 'button';
      btn.title = t('code.copyTitle');
      btn.innerHTML = `<svg width="12" height="12"><use href="#i-copy"/></svg><span>${escapeHtml(t('code.copy'))}</span>`;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const code = pre.querySelector('code');
        const text = code ? code.textContent : pre.textContent;
        try {
          await window.api.copyToClipboard(text.replace(/\n$/, ''));
          btn.classList.add('copied');
          btn.querySelector('span').textContent = t('code.copied');
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.querySelector('span').textContent = t('code.copy');
          }, 1600);
        } catch { /* ignore */ }
      });
      pre.appendChild(btn);
    });
  }

  // =====================================================================
  // Mermaid-Dokument (Diagramm-Bühne)
  // =====================================================================

  function buildStage() {
    article.classList.remove('is-code-view');
    article.classList.add('is-diagram-view');
    markdownContainer.classList.add('is-diagram');
    article.innerHTML = `
      <div class="mermaid-stage">
        <div class="diagram-toolbar">
          <button type="button" class="btn-icon-sm" data-action="zoom-out" title="${escapeHtml(t('mermaid.zoomOut'))}"><svg width="14" height="14"><use href="#i-zoom-out"/></svg></button>
          <button type="button" class="diagram-zoom-label" data-action="reset" title="${escapeHtml(t('mermaid.reset'))}">100 %</button>
          <button type="button" class="btn-icon-sm" data-action="zoom-in" title="${escapeHtml(t('mermaid.zoomIn'))}"><svg width="14" height="14"><use href="#i-zoom-in"/></svg></button>
          <button type="button" class="btn-icon-sm" data-action="fit" title="${escapeHtml(t('mermaid.fit'))}"><svg width="14" height="14"><use href="#i-fit"/></svg></button>
          <span class="diagram-hint">${escapeHtml(t('mermaid.hint'))}</span>
          <span class="spacer"></span>
          <select class="select select-sm diagram-presets" aria-label="${escapeHtml(t('mermaid.templates'))}"></select>
          <button type="button" class="btn-icon-sm" data-action="copy-svg" title="${escapeHtml(t('mermaid.copySvg'))}"><svg width="14" height="14"><use href="#i-copy"/></svg></button>
        </div>
        <div class="diagram-canvas" tabindex="0">
          <div class="diagram-viewport"></div>
          <div class="diagram-empty hidden">${escapeHtml(t('mermaid.empty'))}</div>
        </div>
        <div class="diagram-error hidden"><svg width="16" height="16"><use href="#i-error"/></svg><span class="diagram-error-text"></span></div>
      </div>`;

    diagram.stage = article.querySelector('.mermaid-stage');
    diagram.canvas = diagram.stage.querySelector('.diagram-canvas');
    diagram.viewport = diagram.stage.querySelector('.diagram-viewport');
    diagram.emptyEl = diagram.stage.querySelector('.diagram-empty');
    diagram.errorEl = diagram.stage.querySelector('.diagram-error');
    diagram.errorText = diagram.stage.querySelector('.diagram-error-text');
    diagram.zoomLabel = diagram.stage.querySelector('.diagram-zoom-label');

    const presets = diagram.stage.querySelector('.diagram-presets');
    presets.innerHTML = `<option value="">${escapeHtml(t('mermaid.templates'))}</option>` +
      MermaidEngine.getPresets(I18n.getLanguage()).map(p => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join('');
    presets.addEventListener('change', () => {
      const preset = MermaidEngine.getPreset(presets.value, I18n.getLanguage());
      presets.value = '';
      if (preset && onInsertTemplate) onInsertTemplate(preset.code);
    });

    diagram.stage.querySelector('.diagram-toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'zoom-in': zoomAround(1.25); break;
        case 'zoom-out': zoomAround(1 / 1.25); break;
        case 'fit': fitDiagram(); break;
        case 'reset': resetViewTransform(); break;
        case 'copy-svg':
          if (diagram.svg) {
            window.api.copyToClipboard(getDiagramSvg()).then(() => Toast.success(t('mermaid.svgCopied'), { duration: 1800 })).catch(() => {});
          }
          break;
        default: break;
      }
    });

    const canvas = diagram.canvas;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!diagram.svg) return;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, clampScale(diagram.scale * factor));
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !diagram.svg) return;
      diagram.drag = { x: e.clientX, y: e.clientY, tx: diagram.tx, ty: diagram.ty };
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!diagram.drag) return;
      diagram.tx = diagram.drag.tx + (e.clientX - diagram.drag.x);
      diagram.ty = diagram.drag.ty + (e.clientY - diagram.drag.y);
      applyTransform();
    });
    const stopDrag = (e) => {
      if (!diagram.drag) return;
      diagram.drag = null;
      canvas.classList.remove('is-dragging');
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('dblclick', () => fitDiagram());
    canvas.addEventListener('keydown', (e) => {
      if (!diagram.svg) return;
      const step = 40;
      if (e.key === '+' || e.key === '=') { zoomAround(1.25); e.preventDefault(); }
      else if (e.key === '-') { zoomAround(1 / 1.25); e.preventDefault(); }
      else if (e.key === '0') { resetViewTransform(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { diagram.tx += step; applyTransform(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { diagram.tx -= step; applyTransform(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { diagram.ty += step; applyTransform(); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { diagram.ty -= step; applyTransform(); e.preventDefault(); }
    });

    if (typeof ResizeObserver === 'function') {
      diagram.resizeObserver = new ResizeObserver(() => {
        if (diagram.fresh && diagram.svg) fitDiagram();
      });
      diagram.resizeObserver.observe(canvas);
    }
  }

  async function renderMermaidDocument(source) {
    if (currentView !== 'mermaid' || !diagram.stage || !diagram.stage.isConnected || diagram.stageLang !== I18n.getLanguage()) {
      currentView = 'mermaid';
      buildStage();
      diagram.stageLang = I18n.getLanguage();
    }
    markdownContainer.classList.remove('hidden');
    previewIframe.classList.add('hidden');
    consolePanel.classList.add('hidden');

    diagram.source = String(source || '');
    if (!diagram.source.trim()) {
      diagram.svg = '';
      diagram.viewport.innerHTML = '';
      diagram.emptyEl.classList.remove('hidden');
      diagram.errorEl.classList.add('hidden');
      diagram.canvas.classList.remove('has-error');
      return;
    }
    diagram.emptyEl.classList.add('hidden');

    const result = await MermaidEngine.render(diagram.source);
    if (result.svg) {
      diagram.svg = result.svg;
      diagram.viewport.innerHTML = result.svg;
      diagram.errorEl.classList.add('hidden');
      diagram.canvas.classList.remove('has-error');
      const svg = diagram.viewport.querySelector('svg');
      if (svg) {
        diagram.natural = naturalSize(svg);
        svg.setAttribute('width', String(diagram.natural.w));
        svg.setAttribute('height', String(diagram.natural.h));
        svg.style.maxWidth = 'none';
      }
      if (diagram.fresh) fitDiagram();
      else applyTransform();
    } else {
      // Letztes gültiges Diagramm (abgedunkelt) behalten, Fehler anzeigen
      const where = result.error.line ? ` (${t('mermaid.errorLine', { line: result.error.line })})` : '';
      diagram.errorText.textContent = `${t('mermaid.error')}${where}: ${result.error.message}`;
      diagram.errorEl.classList.remove('hidden');
      diagram.canvas.classList.add('has-error');
    }
  }

  function naturalSize(svg) {
    let w = 0, h = 0;
    try {
      const vb = svg.viewBox && svg.viewBox.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) { w = vb.width; h = vb.height; }
    } catch { /* ignore */ }
    if (!w || !h) {
      try {
        const box = svg.getBBox();
        w = box.width + 20; h = box.height + 20;
      } catch { /* ignore */ }
    }
    if (!w || !h) { w = 600; h = 400; }
    return { w, h };
  }

  function clampScale(s) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));
  }

  function applyTransform() {
    if (!diagram.viewport) return;
    diagram.viewport.style.transform = `translate(${diagram.tx}px, ${diagram.ty}px) scale(${diagram.scale})`;
    if (diagram.zoomLabel) diagram.zoomLabel.textContent = `${Math.round(diagram.scale * 100)} %`;
  }

  function zoomAt(px, py, nextScale) {
    const contentX = (px - diagram.tx) / diagram.scale;
    const contentY = (py - diagram.ty) / diagram.scale;
    diagram.scale = nextScale;
    diagram.tx = px - contentX * nextScale;
    diagram.ty = py - contentY * nextScale;
    diagram.fresh = false;
    applyTransform();
  }

  function zoomAround(factor) {
    if (!diagram.canvas) return;
    const rect = diagram.canvas.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, clampScale(diagram.scale * factor));
  }

  function fitDiagram() {
    if (!diagram.canvas || !diagram.svg) return;
    const rect = diagram.canvas.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) { diagram.fresh = true; return; }
    const pad = 32;
    const { w, h } = diagram.natural;
    const scale = clampScale(Math.min((rect.width - pad) / w, (rect.height - pad) / h, 2));
    diagram.scale = scale;
    diagram.tx = (rect.width - w * scale) / 2;
    diagram.ty = (rect.height - h * scale) / 2;
    diagram.fresh = false;
    applyTransform();
  }

  function resetViewTransform() {
    if (!diagram.canvas) return;
    const rect = diagram.canvas.getBoundingClientRect();
    diagram.scale = 1;
    diagram.tx = Math.max(16, (rect.width - diagram.natural.w) / 2);
    diagram.ty = Math.max(16, (rect.height - diagram.natural.h) / 2);
    diagram.fresh = false;
    applyTransform();
  }

  /** Beim nächsten Rendern Ansicht neu einpassen (neues Dokument). */
  function resetDiagramView() {
    diagram.fresh = true;
    diagram.svg = '';
  }

  function getDiagramSvg() {
    if (currentView !== 'mermaid' || !diagram.svg) return null;
    const svg = diagram.viewport ? diagram.viewport.querySelector('svg') : null;
    if (!svg) return diagram.svg;
    const clone = svg.cloneNode(true);
    clone.style.maxWidth = '';
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return clone.outerHTML;
  }

  // =====================================================================
  // HTML / CSS / Code / JSON
  // =====================================================================

  async function renderHtml(source, filePath) {
    leaveDiagramMode();
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
    leaveDiagramMode();
    currentView = 'iframe';
    markdownContainer.classList.add('hidden');
    previewIframe.classList.remove('hidden');
    const L = (key) => escapeHtml(t(`cssPreview.${key}`));
    const html = `<!DOCTYPE html>
<html lang="${I18n.getLanguage()}">
<head><meta charset="UTF-8">
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; color: #333; background: #fff; }
  .preview-section { margin-bottom: 2rem; }
  .preview-section > h3.__label { color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.6rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; font-weight: 600; }
</style>
<style id="user-css">${escapeForHtml(source)}</style>
</head>
<body>
  <div class="preview-section"><h3 class="__label">${L('headings')}</h3><h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3></div>
  <div class="preview-section"><h3 class="__label">${L('text')}</h3><p>Lorem <strong>ipsum</strong> dolor <em>sit amet</em>, <a href="#">consectetur</a> <code>adipiscing</code> elit.</p><blockquote>Blockquote</blockquote></div>
  <div class="preview-section"><h3 class="__label">${L('lists')}</h3><ul><li>Item 1</li><li>Item 2</li></ul><ol><li>First</li><li>Second</li></ol></div>
  <div class="preview-section"><h3 class="__label">${L('buttons')}</h3><button>Default</button> <button class="primary btn btn-primary">Primary</button> <button class="secondary btn btn-secondary">Secondary</button> <button disabled>Disabled</button></div>
  <div class="preview-section"><h3 class="__label">${L('form')}</h3><form><label>Text <input type="text" placeholder="Input"></label><br><br><label>Select <select><option>Option 1</option><option>Option 2</option></select></label><br><br><label><input type="checkbox" checked> Checkbox</label><br><br><textarea placeholder="Textarea"></textarea></form></div>
  <div class="preview-section"><h3 class="__label">${L('table')}</h3><table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>Alpha</td><td>100</td></tr><tr><td>Beta</td><td>200</td></tr></tbody></table></div>
  <div class="preview-section"><h3 class="__label">${L('card')}</h3><div class="card container"><h3>Card</h3><p>.card / .container</p></div></div>
</body>
</html>`;
    setPreviewContent(html);
  }

  async function renderCode(source, language) {
    leaveDiagramMode();
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
    leaveDiagramMode();
    currentView = 'iframe';
    markdownContainer.classList.add('hidden');
    previewIframe.classList.remove('hidden');
    consolePanel.classList.remove('hidden');
    clearConsole();

    let jsCode = source;
    if (formatId === 'typescript') {
      const result = await window.api.transpileTs(source);
      if (result.error) {
        appendConsole('error', [t('console.tsError', { error: result.error })]);
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
  window.addEventListener('error', function (e) { send('error', ['Uncaught ' + (e.message || e) + (e.lineno ? ' (line ' + e.lineno + ')' : '')]); });
  window.addEventListener('unhandledrejection', function (e) { send('error', ['Unhandled Promise: ' + fmt(e.reason)]); });
})();
</scr${''}ipt>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${consoleScript}<style>body{font-family:'Segoe UI',sans-serif;padding:1rem;color:#222}</style></head><body><script>${escapeForScript(jsCode)}</scr${''}ipt></body></html>`;
    setPreviewContent(html);
    appendConsole('debug', [t('console.started')]);
  }

  // =====================================================================
  // Export
  // =====================================================================

  /**
   * HTML für den Export (Artikel-Inhalt ohne interaktive Elemente).
   * Diagramme werden bei abweichendem Theme (PDF = hell) neu gerendert.
   * @param {{lineNumbers?: boolean, theme?: 'light'|'dark'}} opts
   */
  async function getExportHtml(opts = {}) {
    if (currentView === 'iframe') return null;
    const exportTheme = opts.theme === 'dark' ? 'dark' : opts.theme === 'light' ? 'light' : currentTheme;

    if (currentView === 'mermaid') {
      if (!diagram.source.trim()) return null;
      let svg = exportTheme === currentTheme ? getDiagramSvg() : null;
      if (!svg) {
        const result = await MermaidEngine.render(diagram.source, { theme: exportTheme });
        if (!result.svg) return null;
        svg = result.svg;
      }
      return `<figure class="mermaid-diagram mermaid-export">${svg}</figure>`;
    }

    const clone = article.cloneNode(true);
    clone.querySelectorAll('.code-copy, .diagram-actions').forEach(el => el.remove());
    if (currentView === 'code' && opts.lineNumbers === false) {
      clone.querySelectorAll('.code-view-gutter').forEach(el => el.remove());
    }
    if (exportTheme !== currentTheme) {
      const figures = Array.from(clone.querySelectorAll('figure.mermaid-diagram:not(.has-error)'));
      await Promise.all(figures.map(async (figure) => {
        const code = figure.dataset.source;
        if (!code) return;
        const result = await MermaidEngine.render(code, { theme: exportTheme });
        if (result.svg) figure.innerHTML = result.svg;
      }));
    }
    return clone.innerHTML;
  }

  function isCodeView() {
    return currentView === 'code';
  }

  function isDiagramView() {
    return currentView === 'mermaid';
  }

  function hasDiagrams() {
    return currentView === 'mermaid' || (currentView === 'markdown' && hasInlineDiagrams);
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
    init, render, renderMarkdown, renderMermaidDocument, renderHtml, renderCss, renderCode, executeCode, renderJson,
    toggleExecution, isExecutionMode, setExecutionMode, showRunButton, clearConsole,
    getExportHtml, getDiagramSvg, isCodeView, isDiagramView, hasDiagrams, resetDiagramView, fitDiagram, setTheme, sanitize
  };
})();
