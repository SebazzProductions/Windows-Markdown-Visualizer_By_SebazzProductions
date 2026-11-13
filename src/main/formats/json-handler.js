/**
 * JSON / JSONC / JSONL Format Handler
 */
const { registerFormat } = require('../format-registry');
const { formatCode, collectGenericIssues } = require('./code-formatter');

function jsonErrorLine(source, err) {
  const pos = /position (\d+)/.exec(err.message);
  if (!pos) return 1;
  return source.slice(0, Number(pos[1])).split('\n').length;
}

function formatJsonLines(source) {
  const issues = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch (err) {
      issues.push({ line: i + 1, message: `Ungültiges JSON: ${err.message}`, severity: 'error' });
      return trimmed;
    }
  });
  let formatted = out.join('\n');
  if (formatted.length > 0 && !formatted.endsWith('\n')) formatted += '\n';
  return { formatted, issues };
}

registerFormat({
  id: 'json',
  kind: 'json',
  label: 'JSON',
  extensions: ['.json', '.jsonc', '.json5', '.jsonl', '.webmanifest'],
  language: 'json',
  detect: (_filePath, content) => {
    const trimmed = content.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
    try { JSON.parse(trimmed); return true; } catch { return false; }
  },
  format: async (source, filePath) => {
    const ext = (filePath || '').toLowerCase();
    if (ext.endsWith('.jsonl')) {
      return formatJsonLines(source);
    }
    // Erkennung: mehrere Zeilen, jede ein JSON-Objekt → JSON Lines
    const nonEmpty = source.split(/\r?\n/).filter(l => l.trim());
    if (nonEmpty.length > 1 && nonEmpty.every(l => /^\s*[{[]/.test(l) && /[}\]]\s*,?\s*$/.test(l))) {
      let valid = 0;
      for (const l of nonEmpty) { try { JSON.parse(l); valid++; } catch { /* kein JSONL */ } }
      if (valid === nonEmpty.length) return formatJsonLines(source);
    }

    const result = await formatCode(source, filePath || '.json', { parser: ext.endsWith('.json5') ? 'json5' : 'json' });
    const strict = ext.endsWith('.json') || ext.endsWith('.webmanifest');
    if (strict && !result.issues.some(i => i.severity === 'error')) {
      // Prettier ist tolerant (Kommentare, abschließende Kommas) – striktes JSON zusätzlich prüfen
      try {
        JSON.parse(source);
      } catch (err) {
        result.issues.unshift({ line: jsonErrorLine(source, err), message: `Kein striktes JSON: ${err.message}`, severity: 'warning' });
      }
    }
    if (result.issues.some(i => i.severity === 'error')) {
      // Prettier scheiterte → genaue Fehlerposition via JSON.parse versuchen
      try {
        JSON.parse(source);
      } catch (err) {
        const pos = /position (\d+)/.exec(err.message);
        if (pos) {
          const upTo = source.slice(0, Number(pos[1]));
          const line = upTo.split('\n').length;
          const issues = result.issues.filter(i => i.severity !== 'error');
          issues.unshift({ line, message: `JSON-Fehler: ${err.message}`, severity: 'error' });
          collectGenericIssues(source, []);
          return { formatted: source, issues };
        }
      }
    }
    return result;
  }
});
