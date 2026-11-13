/**
 * Highlighter – zentrale highlight.js-Instanz für Markdown-Codeblöcke,
 * Code-Dateien im Visualizer und PDF/HTML-Export.
 */
const hljs = require('highlight.js/lib/core');

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c', 'go', 'rust', 'ruby', 'php',
  'swift', 'kotlin', 'dart', 'scala', 'lua', 'perl', 'r', 'objectivec', 'haskell', 'elixir', 'vbnet',
  'sql', 'bash', 'shell', 'powershell', 'dos', 'json', 'xml', 'css', 'scss', 'less', 'yaml',
  'markdown', 'dockerfile', 'ini', 'properties', 'diff', 'makefile', 'cmake', 'nginx', 'apache',
  'graphql', 'protobuf', 'latex', 'matlab', 'plaintext', 'http'
];

for (const name of LANGUAGES) {
  try {
    hljs.registerLanguage(name, require(`highlight.js/lib/languages/${name}`));
  } catch {
    // Sprache in dieser highlight.js-Version nicht enthalten → überspringen
  }
}

const ALIASES = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', cs: 'csharp', 'c++': 'cpp', h: 'c', hpp: 'cpp', cc: 'cpp',
  sh: 'bash', zsh: 'bash', ps1: 'powershell', bat: 'dos', cmd: 'dos',
  yml: 'yaml', html: 'xml', htm: 'xml', svg: 'xml', xhtml: 'xml', xsl: 'xml', plist: 'xml',
  md: 'markdown', toml: 'ini', cfg: 'ini', conf: 'ini', env: 'properties', text: 'plaintext', txt: 'plaintext',
  mk: 'makefile', docker: 'dockerfile', tex: 'latex', m: 'objectivec', kt: 'kotlin', rs: 'rust',
  gql: 'graphql', proto: 'protobuf', patch: 'diff', jsonl: 'json', jsonc: 'json', json5: 'json', webmanifest: 'json'
};

for (const [alias, languageName] of Object.entries(ALIASES)) {
  if (hljs.getLanguage(languageName) && !hljs.getLanguage(alias)) {
    hljs.registerAliases(alias, { languageName });
  }
}

function hasLanguage(lang) {
  return Boolean(lang && hljs.getLanguage(lang));
}

function resolveLanguage(lang) {
  if (!lang) return null;
  const l = String(lang).toLowerCase();
  const def = hljs.getLanguage(l);
  if (!def) return null;
  // Alias auf kanonischen Namen abbilden (für CSS-Klasse/Label)
  return ALIASES[l] || l;
}

/**
 * @returns {{ html: string, language: string }}
 */
function highlightCode(source, lang) {
  const text = String(source ?? '');
  const language = resolveLanguage(lang);
  if (language) {
    try {
      const res = hljs.highlight(text, { language, ignoreIllegals: true });
      return { html: res.value, language: res.language || language };
    } catch {
      return { html: escapeHtml(text), language };
    }
  }
  try {
    const res = hljs.highlightAuto(text);
    return { html: res.value, language: res.language || 'plaintext' };
  } catch {
    return { html: escapeHtml(text), language: 'plaintext' };
  }
}

/**
 * Sprache anhand der Dateiendung ermitteln (ohne Punkt, z. B. "py").
 */
function languageForExtension(ext) {
  if (!ext) return null;
  const e = String(ext).replace(/^\./, '').toLowerCase();
  return resolveLanguage(e);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { highlightCode, hasLanguage, resolveLanguage, languageForExtension, escapeHtml };
