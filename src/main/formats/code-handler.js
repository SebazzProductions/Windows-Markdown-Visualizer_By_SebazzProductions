/**
 * Generischer Code-Handler – Syntax-Highlighting für viele Sprachen,
 * Formatierung via Prettier, wo verfügbar (YAML, GraphQL, Vue, …).
 */
const { registerFormat } = require('../format-registry');
const { formatCode } = require('./code-formatter');
const { languageForExtension } = require('../highlighter');

const PRETTIER_SUPPORTED = new Set(['.yaml', '.yml', '.graphql', '.gql', '.vue', '.hbs', '.handlebars']);

const CODE_EXTENSIONS = [
  '.yaml', '.yml', '.xml', '.svg', '.xsl', '.plist', '.toml',
  '.py', '.pyw', '.rb', '.php', '.java', '.kt', '.kts', '.scala', '.go', '.rs', '.swift', '.dart',
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.cs', '.m', '.mm',
  '.lua', '.pl', '.pm', '.r', '.hs', '.ex', '.exs', '.vb',
  '.sql', '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd',
  '.dockerfile', '.makefile', '.mk', '.cmake', '.graphql', '.gql', '.proto', '.tex', '.diff', '.patch',
  '.vue', '.hbs', '.handlebars', '.properties', '.conf', '.nginx', '.http'
];

registerFormat({
  id: 'code',
  kind: 'code',
  label: 'Code',
  extensions: CODE_EXTENSIONS,
  filenames: ['dockerfile', 'makefile', 'gnumakefile', 'cmakelists.txt', '.bashrc', '.zshrc', '.gitconfig'],
  language: null, // wird pro Datei aus der Endung ermittelt
  languageFor: (filePath) => {
    const base = (filePath || '').split(/[\\/]/).pop().toLowerCase();
    if (base === 'dockerfile') return 'dockerfile';
    if (base === 'makefile' || base === 'gnumakefile') return 'makefile';
    if (base === 'cmakelists.txt') return 'cmake';
    const ext = base.includes('.') ? '.' + base.split('.').pop() : '';
    return languageForExtension(ext) || 'plaintext';
  },
  detect: () => false,
  format: async (source, filePath) => {
    const ext = ('.' + (filePath || '').split('.').pop()).toLowerCase();
    if (PRETTIER_SUPPORTED.has(ext)) {
      return formatCode(source, filePath || ext);
    }
    return formatCode(source, filePath || '.txt', { parser: null });
  }
});
