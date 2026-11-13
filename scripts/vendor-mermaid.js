/**
 * Kopiert das Mermaid-Browser-Bundle aus node_modules nach src/renderer/vendor.
 *
 * Mermaid ist nur eine Dev-Dependency: Der Renderer lädt das fertige IIFE-Bundle
 * (eine Datei, ~3,5 MB) statt des kompletten Paketbaums (d3, cytoscape, katex, …),
 * der sonst in die Installation gepackt würde. Nach einem Mermaid-Update einmal
 * `npm run vendor` ausführen und die Datei mit einchecken.
 */
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const targetDir = path.join(__dirname, '..', 'src', 'renderer', 'vendor');
const target = path.join(targetDir, 'mermaid.min.js');
const version = require(path.join(__dirname, '..', 'node_modules', 'mermaid', 'package.json')).version;

fs.mkdirSync(targetDir, { recursive: true });
let bundle = fs.readFileSync(source, 'utf-8');
// Source-Map-Verweis entfernen (Map wird nicht mitgeliefert)
bundle = bundle.replace(/\n?\/\/# sourceMappingURL=.*$/m, '');
fs.writeFileSync(target, `/*! mermaid ${version} – https://mermaid.js.org – MIT License */\n${bundle}\n`, 'utf-8');
fs.writeFileSync(path.join(targetDir, 'VERSION'), `mermaid ${version}\n`, 'utf-8');
console.log(`mermaid ${version} → ${path.relative(process.cwd(), target)} (${(fs.statSync(target).size / 1024 / 1024).toFixed(2)} MB)`);
