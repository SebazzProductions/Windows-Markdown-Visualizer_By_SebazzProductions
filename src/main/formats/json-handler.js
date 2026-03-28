/**
 * JSON / JSONL Format Handler
 */
const { registerFormat } = require('../format-registry');

registerFormat({
  id: 'json',
  extensions: ['.json', '.jsonl'],
  label: 'JSON',
  detect: (filePath, content) => {
    const trimmed = content.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  },
  format: (source) => {
    const ext = ''; // extension is checked in the handler call
    const issues = [];

    // Check if JSONL (one JSON object per line)
    const lines = source.split('\n').filter(l => l.trim());
    const isJsonl = lines.length > 1 && lines.every(l => {
      const t = l.trim();
      return t.startsWith('{') || t.startsWith('[') || t === '';
    });

    if (isJsonl) {
      const formattedLines = [];
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) { formattedLines.push(''); return; }
        try {
          const parsed = JSON.parse(trimmed);
          formattedLines.push(JSON.stringify(parsed));
        } catch (err) {
          issues.push({ line: i + 1, message: `Ungültiges JSON: ${err.message}`, severity: 'error' });
          formattedLines.push(trimmed);
        }
      });
      return { formatted: formattedLines.join('\n') + '\n', issues };
    }

    // Regular JSON
    try {
      const parsed = JSON.parse(source);
      const formatted = JSON.stringify(parsed, null, 2) + '\n';
      return { formatted, issues };
    } catch (err) {
      issues.push({ line: 1, message: `JSON Parse-Fehler: ${err.message}`, severity: 'error' });
      return { formatted: source, issues };
    }
  }
});
