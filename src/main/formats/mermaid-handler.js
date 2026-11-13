/**
 * Mermaid Format Handler – Diagrammdateien (.mmd / .mermaid).
 *
 * Das Rendering passiert im Renderer (Mermaid benötigt ein DOM); hier liegen nur
 * Erkennung und die generischen Textkorrekturen. Syntaxfehler ermittelt der Renderer
 * über mermaid.parse() und ergänzt sie in Fix Syntax.
 */
const { registerFormat } = require('../format-registry');
const { collectGenericIssues } = require('./code-formatter');

const DIAGRAM_KEYWORDS = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2', 'erDiagram',
  'gantt', 'pie', 'journey', 'gitGraph', 'mindmap', 'timeline', 'quadrantChart', 'requirementDiagram',
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment', 'sankey-beta', 'xychart-beta',
  'block-beta', 'packet-beta', 'kanban', 'architecture-beta', 'radar-beta', 'treemap-beta', 'zenuml'
];

const START_RE = new RegExp(
  `^\\s*(?:%%\\{[\\s\\S]*?\\}%%\\s*)?(?:${DIAGRAM_KEYWORDS.map(k => k.replace(/[-]/g, '\\-')).join('|')})(?:\\s|$|-)`,
  'm'
);

/**
 * Erkennt Mermaid-Quelltext: erste nicht-leere, nicht-Kommentar-Zeile (oder YAML-Front-Matter
 * überspringend) beginnt mit einem Diagramm-Schlüsselwort.
 */
function looksLikeMermaid(content) {
  if (typeof content !== 'string') return false;
  let text = content.replace(/^\uFEFF/, '');
  text = text.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '');
  const firstLine = text.split(/\r?\n/).find(line => line.trim() && !line.trim().startsWith('%%'));
  return Boolean(firstLine) && START_RE.test(firstLine);
}

registerFormat({
  id: 'mermaid',
  kind: 'mermaid',
  label: 'Mermaid',
  extensions: ['.mmd', '.mermaid'],
  language: 'plaintext',
  detect: (_filePath, content) => looksLikeMermaid(content),
  format: (source) => {
    const issues = [];
    let formatted = String(source ?? '').replace(/\r\n?/g, '\n');
    collectGenericIssues(formatted, issues);
    formatted = formatted.replace(/[ \t]+$/gm, '');
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    if (formatted.length > 0 && !formatted.endsWith('\n')) formatted += '\n';
    return { formatted, issues };
  }
});

module.exports = { looksLikeMermaid, DIAGRAM_KEYWORDS };
