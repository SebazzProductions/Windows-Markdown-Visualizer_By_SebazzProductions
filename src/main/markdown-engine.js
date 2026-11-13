/**
 * Markdown Engine – markdown-it mit Plugins, Syntax-Highlighting (highlight.js)
 * und Überschriften-Extraktion direkt aus dem Token-Stream (identisch zu den
 * gerenderten Anker-IDs, kein separates Regex-Parsing mehr).
 */
const markdownIt = require('markdown-it');
const markdownItAnchor = require('markdown-it-anchor');
const markdownItTaskLists = require('markdown-it-task-lists');
const markdownItFootnote = require('markdown-it-footnote');
const markdownItMark = require('markdown-it-mark');
const markdownItDeflist = require('markdown-it-deflist');
const markdownItSub = require('markdown-it-sub');
const markdownItSup = require('markdown-it-sup');
const { highlightCode, hasLanguage } = require('./highlighter');

const AUTO_DETECT_MAX_CHARS = 20000;

/**
 * GitHub-kompatible Slugs: Kleinschreibung, Unicode-Buchstaben bleiben erhalten,
 * Satzzeichen entfernt, Leerzeichen → Bindestrich.
 */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'abschnitt';
}

let collectedHeadings = [];

const md = markdownIt({
  html: true,          // Roh-HTML erlaubt – wird im Renderer per DOMPurify bereinigt
  xhtmlOut: false,
  linkify: true,
  typographer: true,
  quotes: '„“‚‘',
  highlight: (str, lang) => {
    const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
    let result;
    if (language && hasLanguage(language)) {
      result = highlightCode(str, language);
    } else if (!language && str.length <= AUTO_DETECT_MAX_CHARS) {
      result = highlightCode(str, null);
    } else {
      result = { html: md.utils.escapeHtml(str), language: language || 'plaintext' };
    }
    const langLabel = md.utils.escapeHtml(result.language || language || 'text');
    return `<pre class="hljs code-block" data-lang="${langLabel}"><code class="hljs language-${langLabel}">${result.html}</code></pre>`;
  }
});

md.use(markdownItAnchor, {
  slugify,
  permalink: false,
  tabIndex: false,
  uniqueSlugStartIndex: 1,
  level: [1, 2, 3, 4, 5, 6],
  callback: (token, info) => {
    collectedHeadings.push({
      level: Number(token.tag.slice(1)),
      text: info.title,
      id: info.slug,
      line: Array.isArray(token.map) ? token.map[0] + 1 : null
    });
  }
});
md.use(markdownItTaskLists, { enabled: false, label: true });
md.use(markdownItFootnote);
md.use(markdownItMark);
md.use(markdownItDeflist);
md.use(markdownItSub);
md.use(markdownItSup);

// Quellzeilen-Mapping für Scroll-Sync zwischen Editor und Vorschau
md.core.ruler.push('source_line_map', (state) => {
  for (const token of state.tokens) {
    if (!token.map || token.nesting !== 1 && !['fence', 'code_block', 'hr', 'html_block'].includes(token.type)) continue;
    if (token.type === 'footnote_block_open') continue;
    token.attrSet('data-source-line', String(token.map[0] + 1));
  }
});

// Fence-Renderer: Highlight-HTML enthält bereits <pre>, Attribute (data-source-line) übernehmen
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const html = defaultFence(tokens, idx, options, env, self);
  const sourceLine = token.attrGet('data-source-line');
  if (sourceLine && html.startsWith('<pre')) {
    return html.replace('<pre', `<pre data-source-line="${sourceLine}"`);
  }
  return html;
};

// Externe Links bekommen rel/title; interne Anker bleiben unberührt
const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || '';
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    tokens[idx].attrSet('title', href);
    tokens[idx].attrJoin('class', 'external-link');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/**
 * YAML-Front-Matter am Dateianfang abtrennen.
 */
function splitFrontMatter(source) {
  const match = source.match(/^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { body: source, frontMatter: null, offsetLines: 0 };
  const offsetLines = match[0].split('\n').length - 1;
  return { body: source.slice(match[0].length), frontMatter: match[1], offsetLines };
}

function renderFrontMatter(yaml) {
  if (!yaml || !yaml.trim()) return '';
  return `<details class="front-matter"><summary>Metadaten (Front Matter)</summary><pre><code class="hljs language-yaml">${highlightCode(yaml, 'yaml').html}</code></pre></details>\n`;
}

function renderMarkdown(source) {
  const normalized = String(source || '').replace(/\r\n?/g, '\n');
  const { body, frontMatter, offsetLines } = splitFrontMatter(normalized);

  collectedHeadings = [];
  let html = md.render(body);
  const headings = collectedHeadings.map(h => ({
    ...h,
    line: h.line === null ? null : h.line + offsetLines
  }));
  collectedHeadings = [];

  if (offsetLines > 0) {
    html = html.replace(/data-source-line="(\d+)"/g, (_m, n) => `data-source-line="${Number(n) + offsetLines}"`);
  }

  return { html: renderFrontMatter(frontMatter) + html, headings };
}

function renderMarkdownToHtml(source) {
  return renderMarkdown(source).html;
}

function extractHeadings(source) {
  return renderMarkdown(source).headings;
}

module.exports = { renderMarkdown, renderMarkdownToHtml, extractHeadings, slugify };
