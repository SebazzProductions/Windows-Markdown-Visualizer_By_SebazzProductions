/**
 * Gemeinsame Formatierungslogik für Code-Formate.
 *
 * Primär: Prettier (respektiert .prettierrc / .editorconfig im Projekt der Datei).
 * Fallback: js-beautify, wenn Prettier das Format nicht kennt oder die Datei
 * Syntaxfehler enthält – der Syntaxfehler wird dann als Problem gemeldet.
 */
const path = require('path');
const prettier = require('prettier');
const beautify = require('js-beautify');

const PRETTIER_DEFAULTS = {
  printWidth: 100,
  tabWidth: 2,
  endOfLine: 'lf'
};

const BEAUTIFY_COMMON = {
  indent_size: 2,
  indent_char: ' ',
  end_with_newline: true,
  preserve_newlines: true,
  max_preserve_newlines: 2
};

const BEAUTIFIERS = {
  script: (src) => beautify.js(src, { ...BEAUTIFY_COMMON, brace_style: 'collapse', space_before_conditional: true }),
  css: (src) => beautify.css(src, { ...BEAUTIFY_COMMON, newline_between_rules: true }),
  html: (src) => beautify.html(src, { ...BEAUTIFY_COMMON, wrap_line_length: 120, indent_inner_html: true })
};

/**
 * @param {string} source
 * @param {string} filePath  Pfad (für Parser-Erkennung und Config-Auflösung); kann auch nur ".ts" sein
 * @param {object} opts
 * @param {string} [opts.parser]       Prettier-Parser erzwingen
 * @param {string} [opts.fallback]     'script' | 'css' | 'html' – js-beautify-Fallback
 * @returns {Promise<{formatted: string, issues: Array}>}
 */
async function formatCode(source, filePath, opts = {}) {
  const issues = [];
  const normalized = String(source ?? '').replace(/\r\n?/g, '\n');
  const virtualPath = resolveVirtualPath(filePath);

  let config = {};
  if (filePath && path.isAbsolute(filePath)) {
    try {
      config = (await prettier.resolveConfig(filePath, { editorconfig: true })) || {};
    } catch {
      config = {};
    }
  }

  let parser = opts.parser || null;
  if (!parser) {
    try {
      const info = await prettier.getFileInfo(virtualPath, { ignorePath: null });
      parser = info.inferredParser || null;
    } catch {
      parser = null;
    }
  }

  if (parser) {
    try {
      const formatted = await prettier.format(normalized, {
        ...PRETTIER_DEFAULTS,
        ...config,
        parser,
        filepath: virtualPath
      });
      collectGenericIssues(normalized, issues);
      return { formatted, issues };
    } catch (err) {
      const loc = err && err.loc && err.loc.start ? err.loc.start : null;
      issues.push({
        line: loc ? loc.line : 1,
        column: loc ? loc.column : undefined,
        message: `Syntaxfehler: ${cleanPrettierMessage(err.message)}`,
        severity: 'error'
      });
    }
  }

  // Fallback: js-beautify (toleriert Syntaxfehler)
  const beautifier = opts.fallback ? BEAUTIFIERS[opts.fallback] : null;
  if (beautifier) {
    try {
      const formatted = beautifier(normalized);
      collectGenericIssues(normalized, issues);
      return { formatted, issues };
    } catch (err) {
      issues.push({ line: 1, message: `Formatierung fehlgeschlagen: ${err.message}`, severity: 'error' });
    }
  }

  collectGenericIssues(normalized, issues);
  return { formatted: normalized, issues };
}

function resolveVirtualPath(filePath) {
  if (!filePath) return 'file.txt';
  if (filePath.startsWith('.') && !filePath.includes('/') && !filePath.includes('\\')) {
    return `file${filePath}`;
  }
  return filePath;
}

function cleanPrettierMessage(message) {
  // Prettier hängt einen Code-Frame an – nur die erste Zeile ist für die Problemliste relevant
  return String(message || '').split('\n')[0].replace(/\s*\(\d+:\d+\)\s*$/, '').trim();
}

function collectGenericIssues(source, issues) {
  const lines = source.split('\n');
  let trailing = 0;
  let firstTrailing = null;
  lines.forEach((line, i) => {
    if (/[ \t]+$/.test(line)) {
      trailing++;
      if (firstTrailing === null) firstTrailing = i + 1;
    }
  });
  if (trailing > 0) {
    issues.push({
      line: firstTrailing,
      message: trailing === 1 ? 'Nachgestellte Leerzeichen' : `Nachgestellte Leerzeichen in ${trailing} Zeilen`,
      severity: 'info'
    });
  }
  if (source.length > 0 && !source.endsWith('\n')) {
    issues.push({ line: lines.length, message: 'Kein Zeilenumbruch am Dateiende', severity: 'info' });
  }
}

module.exports = { formatCode, collectGenericIssues };
