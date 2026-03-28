/**
 * Markdown Format Handler - delegates to existing markdown-engine.js
 */
const { registerFormat } = require('../format-registry');
const { renderMarkdown, renderMarkdownToHtml, extractHeadings } = require('../markdown-engine');

registerFormat({
  id: 'markdown',
  extensions: ['.md', '.markdown'],
  label: 'Markdown',
  detect: (filePath, content) => {
    // Heuristic: contains common markdown patterns
    return /^#{1,6}\s|^\*\s|^-\s|^>\s|```/.test(content);
  },
  render: (source) => renderMarkdown(source),
  renderHtml: (source) => renderMarkdownToHtml(source),
  extractHeadings: (source) => extractHeadings(source),
  format: (source) => {
    const issues = [];
    let formatted = source;

    // Identify code block ranges so we don't touch them
    function getCodeBlockRanges(text) {
      const lines = text.split('\n');
      const ranges = []; // [{start, end}]
      let inBlock = false, start = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*```/.test(lines[i])) {
          if (!inBlock) { inBlock = true; start = i; }
          else { ranges.push({ start, end: i }); inBlock = false; }
        }
      }
      if (inBlock) ranges.push({ start, end: lines.length - 1 });
      return ranges;
    }
    function isInCodeBlock(lineIndex, ranges) {
      return ranges.some(r => lineIndex >= r.start && lineIndex <= r.end);
    }

    // Pass 1: line-level fixes (outside code blocks)
    let lines = formatted.split('\n');
    let codeRanges = getCodeBlockRanges(formatted);

    for (let i = 0; i < lines.length; i++) {
      if (isInCodeBlock(i, codeRanges)) continue;
      const line = lines[i];

      // Fix: missing space after # in headings
      const headingNoSpace = line.match(/^(#{1,6})([^\s#])/);
      if (headingNoSpace) {
        issues.push({ line: i + 1, message: 'Leerzeichen nach # fehlt', severity: 'warning' });
        lines[i] = line.replace(/^(#{1,6})([^\s#])/, '$1 $2');
      }

      // Fix: multiple spaces after # in headings → single space
      const headingMultiSpace = lines[i].match(/^(#{1,6})\s{2,}/);
      if (headingMultiSpace) {
        issues.push({ line: i + 1, message: 'Mehrfache Leerzeichen nach # korrigiert', severity: 'info' });
        lines[i] = lines[i].replace(/^(#{1,6})\s{2,}/, '$1 ');
      }

      // Fix: trailing whitespace (outside code blocks)
      if (/[ \t]+$/.test(lines[i])) {
        issues.push({ line: i + 1, message: 'Trailing Whitespace', severity: 'info' });
        lines[i] = lines[i].replace(/[ \t]+$/, '');
      }
    }
    formatted = lines.join('\n');

    // Pass 2: structural fixes
    // Multiple blank lines → single blank line (outside code blocks)
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    // Ensure blank line before headings
    formatted = formatted.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

    // Ensure blank line after headings
    formatted = formatted.replace(/(#{1,6}\s[^\n]+)\n([^\n#>*\-\s])/g, '$1\n\n$2');

    // Ensure blank line before code blocks
    formatted = formatted.replace(/([^\n])\n(\s*```)/g, '$1\n\n$2');

    // Ensure blank line after code blocks (closing ```)
    formatted = formatted.replace(/(^\s*```)\n([^\n\s])/gm, '$1\n\n$2');

    // Ensure blank line before lists (unordered: - * +, ordered: 1.)
    formatted = formatted.replace(/([^\n])\n(\s*[-*+]\s)/g, (m, p1, p2) => {
      // Only if previous line isn't already a list item or blank
      if (/^\s*[-*+]\s/.test(p1) || /^\s*\d+\.\s/.test(p1)) return m;
      return `${p1}\n\n${p2}`;
    });
    formatted = formatted.replace(/([^\n])\n(\s*\d+\.\s)/g, (m, p1, p2) => {
      if (/^\s*[-*+]\s/.test(p1) || /^\s*\d+\.\s/.test(p1)) return m;
      return `${p1}\n\n${p2}`;
    });

    // Normalize inconsistent list markers within a block (mix of - * +) → all -
    lines = formatted.split('\n');
    codeRanges = getCodeBlockRanges(formatted);
    let listBlock = [];
    const flushList = () => {
      if (listBlock.length < 2) { listBlock = []; return; }
      const markers = listBlock.map(idx => {
        const m = lines[idx].match(/^(\s*)([-*+])\s/);
        return m ? m[2] : null;
      }).filter(Boolean);
      const unique = [...new Set(markers)];
      if (unique.length > 1) {
        // Mixed markers found – normalize to -
        for (const idx of listBlock) {
          if (!isInCodeBlock(idx, codeRanges)) {
            lines[idx] = lines[idx].replace(/^(\s*)([-*+])(\s)/, '$1-$3');
            issues.push({ line: idx + 1, message: 'Inkonsistenter Listen-Marker vereinheitlicht (-)', severity: 'info' });
          }
        }
      }
      listBlock = [];
    };
    for (let i = 0; i < lines.length; i++) {
      if (isInCodeBlock(i, codeRanges)) { flushList(); continue; }
      if (/^\s*[-*+]\s/.test(lines[i])) {
        listBlock.push(i);
      } else {
        flushList();
      }
    }
    flushList();
    formatted = lines.join('\n');

    // Pass 3: heading hierarchy analysis for TOC
    const finalLines = formatted.split('\n');
    const headingStack = []; // track seen heading levels in order
    const codeRangesFinal = getCodeBlockRanges(formatted);
    for (let i = 0; i < finalLines.length; i++) {
      if (isInCodeBlock(i, codeRangesFinal)) continue;
      const hmatch = finalLines[i].match(/^(#{1,6})\s+(.+)$/);
      if (hmatch) {
        const level = hmatch[1].length;

        // Check for skipped levels (e.g. H1 → H3)
        if (headingStack.length > 0) {
          const prevLevel = headingStack[headingStack.length - 1];
          if (level > prevLevel + 1) {
            issues.push({
              line: i + 1,
              message: `Überschrift springt von Ebene ${prevLevel} auf ${level} – Ebene ${prevLevel + 1} fehlt (TOC-Hierarchie)`,
              severity: 'warning'
            });
          }
        } else if (level > 1) {
          issues.push({
            line: i + 1,
            message: `Dokument beginnt mit Ebene ${level} statt 1 – Inhaltsverzeichnis-Struktur prüfen`,
            severity: 'warning'
          });
        }

        // Maintain stack
        while (headingStack.length > 0 && headingStack[headingStack.length - 1] >= level) {
          headingStack.pop();
        }
        headingStack.push(level);

        // Check for duplicate headings at same level (exact same text)
        const text = hmatch[2].trim();
        for (let j = i - 1; j >= 0; j--) {
          if (isInCodeBlock(j, codeRangesFinal)) continue;
          const pm = finalLines[j].match(/^(#{1,6})\s+(.+)$/);
          if (pm && pm[1].length === level && pm[2].trim() === text) {
            issues.push({
              line: i + 1,
              message: `Doppelte Überschrift "${text}" – kann TOC-Anker-Konflikte verursachen`,
              severity: 'info'
            });
            break;
          }
          if (pm && pm[1].length < level) break;
        }
      }
    }

    // Ensure trailing newline
    if (formatted.length > 0 && !formatted.endsWith('\n')) {
      formatted += '\n';
    }

    return { formatted, issues };
  }
});
