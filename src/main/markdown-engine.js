const markdownIt = require('markdown-it');
const markdownItAnchor = require('markdown-it-anchor');
const hljs = require('highlight.js/lib/core');

// Register commonly used languages
const languages = {
  javascript: require('highlight.js/lib/languages/javascript'),
  typescript: require('highlight.js/lib/languages/typescript'),
  python: require('highlight.js/lib/languages/python'),
  java: require('highlight.js/lib/languages/java'),
  csharp: require('highlight.js/lib/languages/csharp'),
  cpp: require('highlight.js/lib/languages/cpp'),
  c: require('highlight.js/lib/languages/c'),
  go: require('highlight.js/lib/languages/go'),
  rust: require('highlight.js/lib/languages/rust'),
  ruby: require('highlight.js/lib/languages/ruby'),
  php: require('highlight.js/lib/languages/php'),
  swift: require('highlight.js/lib/languages/swift'),
  kotlin: require('highlight.js/lib/languages/kotlin'),
  sql: require('highlight.js/lib/languages/sql'),
  bash: require('highlight.js/lib/languages/bash'),
  shell: require('highlight.js/lib/languages/shell'),
  powershell: require('highlight.js/lib/languages/powershell'),
  json: require('highlight.js/lib/languages/json'),
  xml: require('highlight.js/lib/languages/xml'),
  css: require('highlight.js/lib/languages/css'),
  scss: require('highlight.js/lib/languages/scss'),
  yaml: require('highlight.js/lib/languages/yaml'),
  markdown: require('highlight.js/lib/languages/markdown'),
  dockerfile: require('highlight.js/lib/languages/dockerfile'),
  ini: require('highlight.js/lib/languages/ini'),
  diff: require('highlight.js/lib/languages/diff'),
  plaintext: require('highlight.js/lib/languages/plaintext'),
};
for (const [name, lang] of Object.entries(languages)) {
  hljs.registerLanguage(name, lang);
}
hljs.registerAliases('js', { languageName: 'javascript' });
hljs.registerAliases('ts', { languageName: 'typescript' });
hljs.registerAliases('py', { languageName: 'python' });
hljs.registerAliases('rb', { languageName: 'ruby' });
hljs.registerAliases('cs', { languageName: 'csharp' });
hljs.registerAliases('sh', { languageName: 'bash' });
hljs.registerAliases('yml', { languageName: 'yaml' });
hljs.registerAliases('html', { languageName: 'xml' });

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\-\u00e4\u00f6\u00fc\u00df]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/\u00e4/g, 'ae').replace(/\u00f6/g, 'oe').replace(/\u00fc/g, 'ue').replace(/\u00df/g, 'ss')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const md = markdownIt({
  html: false,
  xhtmlOut: true,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(str, { language: lang }).value; } catch (_) {}
    }
    try { return hljs.highlightAuto(str).value; } catch (_) {}
    return '';
  }
});
md.use(markdownItAnchor, { slugify, permalink: false, level: [1, 2, 3, 4, 5, 6] });

function extractHeadings(source) {
  const normalizedSource = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const headings = [];
  const usedSlugs = new Map();
  for (const line of normalizedSource.split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2]
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .trim();
      let slug = slugify(text);
      if (usedSlugs.has(slug)) {
        const count = usedSlugs.get(slug) + 1;
        usedSlugs.set(slug, count);
        slug = `${slug}-${count}`;
      } else {
        usedSlugs.set(slug, 0);
      }
      headings.push({ level, text, id: slug });
    }
  }
  return headings;
}

function renderMarkdown(source) {
  const html = md.render(source);
  const headings = extractHeadings(source);
  return { html, headings };
}

function renderMarkdownToHtml(source) {
  return md.render(source);
}

module.exports = { renderMarkdown, renderMarkdownToHtml, extractHeadings };
