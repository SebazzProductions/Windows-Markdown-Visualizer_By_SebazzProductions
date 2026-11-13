/**
 * Export Service – PDF- und HTML-Export.
 *
 * Beide Exporte bauen aus dem bereinigten Vorschau-HTML ein eigenständiges Dokument
 * (Themes + Markdown-Styles inline). Der PDF-Export rendert über eine temporäre
 * HTML-Datei (file://), damit lokale Bilder geladen werden und keine Längenbegrenzung
 * für data:-URLs greift. Chromium erzeugt dabei klickbare Anker-Links und – wenn
 * aktiviert – eine PDF-Gliederung (Lesezeichen) aus den Überschriften.
 */
const { BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { escapeHtml } = require('./highlighter');

const RENDERER_CSS_DIR = path.join(__dirname, '..', 'renderer', 'css');
const CSS_FILES = ['themes.css', 'markdown.css', 'export.css'];
const MAX_EMBED_TOTAL = 40 * 1024 * 1024;
const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif'
};

let cssCache = null;

function loadCss() {
  if (cssCache && !process.env.MV_DEV_NO_CACHE) return cssCache;
  cssCache = CSS_FILES.map(f => {
    try { return `/* ${f} */\n${fs.readFileSync(path.join(RENDERER_CSS_DIR, f), 'utf-8')}`; } catch { return ''; }
  }).join('\n');
  return cssCache;
}

function buildTocHtml(headings, tocTitle) {
  if (!Array.isArray(headings) || headings.length === 0) return '';
  const minLevel = Math.min(...headings.map(h => h.level));
  const items = headings.map(h => {
    const depth = h.level - minLevel;
    return `<li class="pdf-toc-item pdf-toc-level-${h.level}" style="--toc-depth:${depth}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`;
  }).join('\n');
  const title = escapeHtml(tocTitle || 'Inhaltsverzeichnis');
  return `<nav class="pdf-toc" aria-label="${title}"><h1 class="pdf-toc-title">${title}</h1><ul>${items}</ul></nav>
<div class="page-break"></div>
`;
}

/**
 * @param {object} p
 * @param {string} p.bodyHtml      bereinigtes HTML (aus dem Renderer)
 * @param {string} p.title
 * @param {'light'|'dark'} p.theme
 * @param {Array}  [p.headings]    für das Inhaltsverzeichnis
 * @param {boolean}[p.includeToc]
 * @param {string} [p.baseHref]    file://-URL des Dokumentordners (für relative Ressourcen)
 * @param {boolean}[p.print]       Druck-Layout (PDF)
 * @param {string} [p.lang]        Sprache des Dokuments (html lang)
 * @param {string} [p.tocTitle]    Überschrift des Inhaltsverzeichnisses
 */
function buildDocumentHtml(p) {
  const theme = p.theme === 'dark' ? 'dark' : 'light';
  const toc = p.includeToc ? buildTocHtml(p.headings, p.tocTitle) : '';
  const lang = p.lang === 'en' ? 'en' : 'de';
  const base = p.baseHref ? `<base href="${escapeHtml(p.baseHref)}">\n` : '';
  const bodyClass = ['export-body', p.print ? 'export-print' : 'export-screen', p.codeView ? 'export-code' : ''].filter(Boolean).join(' ');
  return `<!DOCTYPE html>
<html lang="${lang}" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Mermaid & Markdown Visualizer ${app.getVersion()}">
<title>${escapeHtml(p.title || 'Dokument')}</title>
${base}<style>
${loadCss()}
</style>
</head>
<body class="${bodyClass}">
<main class="markdown-body export">
<article class="markdown-article">
${toc}${p.bodyHtml || ''}
</article>
</main>
</body>
</html>
`;
}

/**
 * Lokale Bilder (file://-URLs oder relative Pfade) als data:-URIs einbetten.
 */
async function embedLocalImages(html, baseDir) {
  let total = 0;
  const cache = new Map();
  const re = /(<img\b[^>]*?\bsrc=")([^"]+)(")/gi;
  const matches = [...html.matchAll(re)];
  for (const m of matches) {
    const src = m[2];
    if (/^(data:|https?:|blob:)/i.test(src)) continue;
    let filePath = null;
    try {
      if (/^file:/i.test(src)) {
        filePath = decodeURIComponent(new URL(src).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
      } else if (baseDir) {
        filePath = path.resolve(baseDir, decodeURIComponent(src.replace(/[?#].*$/, '')));
      }
    } catch { filePath = null; }
    if (!filePath) continue;

    let dataUri = cache.get(filePath);
    if (!dataUri) {
      try {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile() || total + stat.size > MAX_EMBED_TOTAL) continue;
        const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
        if (!mime) continue;
        const buf = await fs.promises.readFile(filePath);
        total += buf.length;
        dataUri = `data:${mime};base64,${buf.toString('base64')}`;
        cache.set(filePath, dataUri);
      } catch { continue; }
    }
    html = html.replace(m[0], `${m[1]}${dataUri}${m[3]}`);
  }
  return html;
}

async function writeTempHtml(html) {
  const dir = path.join(app.getPath('temp'), 'markdown-visualizer');
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `export-${crypto.randomBytes(6).toString('hex')}.html`);
  await fs.promises.writeFile(file, html, 'utf-8');
  return file;
}

const WAIT_FOR_ASSETS_SCRIPT = `
(async () => {
  const imgs = Array.from(document.images);
  await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = img.onerror = res; })));
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
  return true;
})()`;

function headerFooterTemplates(title) {
  const style = 'font-family:\'Segoe UI\',Arial,sans-serif;font-size:8px;color:#8b8fa8;width:100%;padding:0 0.6in;box-sizing:border-box;';
  return {
    headerTemplate: `<div style="${style}text-align:left;"><span>${escapeHtml(title || '')}</span></div>`,
    footerTemplate: `<div style="${style}text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`
  };
}

/**
 * @param {object} payload
 * @param {string} payload.bodyHtml
 * @param {string} payload.title
 * @param {Array}  payload.headings
 * @param {string} [payload.baseDir]
 * @param {boolean}[payload.codeView]
 * @param {object} payload.options  { includeToc, pageSize, landscape, pageNumbers, outline }
 * @param {string} payload.outputPath
 */
async function exportPdf(payload) {
  const options = payload.options || {};
  const html = buildDocumentHtml({
    bodyHtml: payload.bodyHtml,
    title: payload.title,
    theme: 'light',
    headings: payload.headings,
    includeToc: Boolean(options.includeToc) && !payload.codeView,
    baseHref: payload.baseDir ? pathToFileURL(payload.baseDir + path.sep).href : null,
    print: true,
    codeView: Boolean(payload.codeView),
    lang: payload.lang,
    tocTitle: payload.tocTitle
  });

  const tempFile = await writeTempHtml(html);
  const pdfWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  try {
    await pdfWindow.loadFile(tempFile);
    try {
      await Promise.race([
        pdfWindow.webContents.executeJavaScript(WAIT_FOR_ASSETS_SCRIPT, true),
        new Promise(resolve => setTimeout(resolve, 8000))
      ]);
    } catch { /* weiter mit dem, was geladen ist */ }

    const pageSize = ['A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid'].includes(options.pageSize) ? options.pageSize : 'A4';
    const printOptions = {
      printBackground: true,
      pageSize,
      landscape: Boolean(options.landscape),
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      preferCSSPageSize: false,
      generateTaggedPDF: true,
      generateDocumentOutline: options.outline !== false
    };
    if (options.pageNumbers) {
      Object.assign(printOptions, { displayHeaderFooter: true }, headerFooterTemplates(payload.title));
      printOptions.margins = { top: 0.75, bottom: 0.75, left: 0.6, right: 0.6 };
    }

    const buffer = await pdfWindow.webContents.printToPDF(printOptions);
    await fs.promises.writeFile(payload.outputPath, buffer);
    return { success: true, filePath: payload.outputPath, bytes: buffer.length };
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
    fs.promises.rm(tempFile, { force: true }).catch(() => {});
  }
}

/**
 * @param {object} payload { bodyHtml, title, headings, baseDir, theme, options: { includeToc, embedImages }, outputPath, codeView }
 */
async function exportHtml(payload) {
  const options = payload.options || {};
  let bodyHtml = payload.bodyHtml || '';
  if (options.embedImages !== false) {
    bodyHtml = await embedLocalImages(bodyHtml, payload.baseDir);
  }
  const html = buildDocumentHtml({
    bodyHtml,
    title: payload.title,
    theme: payload.theme === 'dark' ? 'dark' : 'light',
    headings: payload.headings,
    includeToc: Boolean(options.includeToc) && !payload.codeView,
    baseHref: options.embedImages === false && payload.baseDir ? pathToFileURL(payload.baseDir + path.sep).href : null,
    print: false,
    codeView: Boolean(payload.codeView),
    lang: payload.lang,
    tocTitle: payload.tocTitle
  });
  await fs.promises.writeFile(payload.outputPath, html, 'utf-8');
  return { success: true, filePath: payload.outputPath, bytes: Buffer.byteLength(html, 'utf-8') };
}

/**
 * Diagramm als eigenständige SVG-Datei speichern.
 * @param {{svg: string, outputPath: string}} payload
 */
async function exportSvg(payload) {
  let svg = String(payload.svg || '').trim();
  if (!/^<svg[\s>]/i.test(svg)) throw new Error('Kein gültiges SVG');
  if (!/\sxmlns=/.test(svg.slice(0, 300))) svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const out = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${svg}\n`;
  await fs.promises.writeFile(payload.outputPath, out, 'utf-8');
  return { success: true, filePath: payload.outputPath, bytes: Buffer.byteLength(out, 'utf-8') };
}

module.exports = { exportPdf, exportHtml, exportSvg, buildDocumentHtml, buildTocHtml, embedLocalImages };
