/**
 * Mermaid Engine – lädt das Mermaid-Bundle bei Bedarf, rendert Diagramme als SVG
 * (bereinigt durch DOMPurify), validiert Quelltext und liefert Vorlagen.
 *
 * Mermaid läuft im Renderer (benötigt ein DOM). securityLevel 'strict' + SVG-Textlabels
 * (keine foreignObject-HTML-Labels), damit die SVGs auch in PDF/SVG-Exporten sauber sind.
 */
const MermaidEngine = (() => {
  const SCRIPT_SRC = 'vendor/mermaid.min.js';
  const FONT = "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";

  let loadPromise = null;
  let theme = 'light';        // gewünschtes App-Theme
  let appliedTheme = null;    // zuletzt an mermaid.initialize übergeben
  let seq = 0;

  const SVG_PURIFY_CONFIG = {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['style'],
    ADD_ATTR: ['dominant-baseline', 'marker-end', 'marker-start', 'marker-mid', 'text-anchor', 'xml:space', 'transform-origin', 'tabindex', 'role'],
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick'],
    ALLOW_DATA_ATTR: false
  };

  // Vorlagen – pro Sprache, damit Beschriftungen zur Oberfläche passen
  const PRESETS = [
    {
      id: 'flowchart',
      de: 'flowchart LR\n  A[Idee] --> B{Machbar?}\n  B -- Ja --> C[Umsetzen]\n  B -- Nein --> D[Verwerfen]\n  C --> E((Fertig))\n',
      en: 'flowchart LR\n  A[Idea] --> B{Feasible?}\n  B -- Yes --> C[Build]\n  B -- No --> D[Drop]\n  C --> E((Done))\n'
    },
    {
      id: 'sequence',
      de: 'sequenceDiagram\n  participant N as Nutzer\n  participant A as App\n  participant S as Server\n  N->>A: Datei öffnen\n  A->>S: Inhalt laden\n  S-->>A: Daten\n  A-->>N: Vorschau anzeigen\n',
      en: 'sequenceDiagram\n  participant U as User\n  participant A as App\n  participant S as Server\n  U->>A: Open file\n  A->>S: Load content\n  S-->>A: Data\n  A-->>U: Show preview\n'
    },
    {
      id: 'state',
      de: 'stateDiagram-v2\n  [*] --> Leer\n  Leer --> Bearbeiten : Eingabe\n  Bearbeiten --> Vorschau : Rendern\n  Vorschau --> Bearbeiten : Ändern\n  Vorschau --> [*] : Speichern\n',
      en: 'stateDiagram-v2\n  [*] --> Empty\n  Empty --> Editing : Input\n  Editing --> Preview : Render\n  Preview --> Editing : Change\n  Preview --> [*] : Save\n'
    },
    {
      id: 'class',
      de: 'classDiagram\n  class Dokument {\n    +String titel\n    +speichern()\n  }\n  class Markdown\n  class Diagramm\n  Dokument <|-- Markdown\n  Dokument <|-- Diagramm\n',
      en: 'classDiagram\n  class Document {\n    +String title\n    +save()\n  }\n  class Markdown\n  class Diagram\n  Document <|-- Markdown\n  Document <|-- Diagram\n'
    },
    {
      id: 'er',
      de: 'erDiagram\n  KUNDE ||--o{ BESTELLUNG : gibt_auf\n  BESTELLUNG ||--|{ POSITION : enthaelt\n  PRODUKT ||--o{ POSITION : wird_bestellt\n',
      en: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  PRODUCT ||--o{ LINE_ITEM : ordered_in\n'
    },
    {
      id: 'gantt',
      de: 'gantt\n  title Projektplan\n  dateFormat YYYY-MM-DD\n  section Konzept\n    Anforderungen   :a1, 2026-01-06, 7d\n    Entwurf         :after a1, 5d\n  section Umsetzung\n    Implementierung :2026-01-20, 14d\n    Test            :5d\n',
      en: 'gantt\n  title Project plan\n  dateFormat YYYY-MM-DD\n  section Concept\n    Requirements    :a1, 2026-01-06, 7d\n    Design          :after a1, 5d\n  section Delivery\n    Implementation  :2026-01-20, 14d\n    Testing         :5d\n'
    },
    {
      id: 'pie',
      de: 'pie showData\n  title Zeitverteilung\n  "Entwicklung" : 55\n  "Tests" : 25\n  "Dokumentation" : 20\n',
      en: 'pie showData\n  title Time split\n  "Development" : 55\n  "Testing" : 25\n  "Documentation" : 20\n'
    },
    {
      id: 'mindmap',
      de: 'mindmap\n  root((Projekt))\n    Planung\n      Ziele\n      Zeitplan\n    Umsetzung\n      Code\n      Tests\n    Abschluss\n',
      en: 'mindmap\n  root((Project))\n    Planning\n      Goals\n      Schedule\n    Delivery\n      Code\n      Tests\n    Wrap-up\n'
    },
    {
      id: 'timeline',
      de: 'timeline\n  title Meilensteine\n  2024 : Idee\n  2025 : Prototyp : Erste Nutzer\n  2026 : Version 2\n',
      en: 'timeline\n  title Milestones\n  2024 : Idea\n  2025 : Prototype : First users\n  2026 : Version 2\n'
    },
    {
      id: 'git',
      de: 'gitGraph\n  commit\n  branch feature\n  checkout feature\n  commit\n  commit\n  checkout main\n  merge feature\n  commit\n',
      en: 'gitGraph\n  commit\n  branch feature\n  checkout feature\n  commit\n  commit\n  checkout main\n  merge feature\n  commit\n'
    }
  ];

  function load() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        if (!window.mermaid) { loadPromise = null; reject(new Error(I18n.t('mermaid.loadFailed'))); return; }
        resolve(window.mermaid);
      };
      script.onerror = () => { loadPromise = null; reject(new Error(I18n.t('mermaid.loadFailed'))); };
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  function configFor(themeName) {
    return {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: themeName === 'dark' ? 'dark' : 'default',
      fontFamily: FONT,
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true, curve: 'basis' },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
      class: { htmlLabels: false, useMaxWidth: true },
      state: { useMaxWidth: true },
      er: { useMaxWidth: true },
      pie: { useMaxWidth: true },
      journey: { useMaxWidth: true },
      suppressErrorRendering: true,
      logLevel: 'fatal'
    };
  }

  function ensureConfigured(mermaid, themeName) {
    if (appliedTheme === themeName) return;
    mermaid.initialize(configFor(themeName));
    appliedTheme = themeName;
  }

  function setTheme(next) {
    theme = next === 'dark' ? 'dark' : 'light';
  }

  function sanitizeSvg(svg) {
    if (typeof DOMPurify === 'undefined') return svg;
    return DOMPurify.sanitize(svg, SVG_PURIFY_CONFIG);
  }

  function removeLeftovers(id) {
    for (const el of [document.getElementById(`d${id}`), document.getElementById(id)]) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }

  /**
   * Fehlerobjekt von Mermaid (jison) in Meldung + Zeile übersetzen.
   */
  function describeError(err) {
    const raw = err && err.message ? String(err.message) : String(err || '');
    let line = null;
    const m = raw.match(/Parse error on line (\d+)/i);
    if (m) line = Number(m[1]);
    else if (err && err.hash && Number.isFinite(err.hash.line)) line = Number(err.hash.line) + 1;
    const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
    let message = (lines[0] || I18n.t('export.unknownError')).replace(/:$/, '');
    const expecting = lines.find(l => /^Expecting/i.test(l));
    if (expecting) {
      // "Expecting 'A', 'B', …, got 'X'" → Erwartungsliste kürzen, "got" behalten
      const got = expecting.match(/,?\s*got\s+(.+)$/i);
      let head = got ? expecting.slice(0, expecting.length - got[0].length) : expecting;
      if (head.length > 90) head = `${head.slice(0, 87)}…`;
      message = `${message} – ${head}${got ? `, got ${got[1]}` : ''}`;
    }
    return { message, line, raw };
  }

  /**
   * @param {string} code
   * @param {{theme?: 'light'|'dark'}} [opts]
   * @returns {Promise<{svg?: string, error?: {message: string, line: number|null, raw: string}}>}
   */
  async function render(code, opts = {}) {
    let mermaid;
    try {
      mermaid = await load();
    } catch (err) {
      return { error: { message: err.message, line: null, raw: err.message } };
    }
    ensureConfigured(mermaid, opts.theme || theme);
    const id = `mv-mermaid-${++seq}`;
    try {
      const { svg } = await mermaid.render(id, String(code || ''));
      return { svg: sanitizeSvg(svg) };
    } catch (err) {
      removeLeftovers(id);
      return { error: describeError(err) };
    }
  }

  /**
   * Syntaxprüfung ohne Rendering → Liste von Problemen (für Fix Syntax).
   */
  async function validate(code) {
    if (!String(code || '').trim()) return [];
    let mermaid;
    try {
      mermaid = await load();
    } catch (err) {
      return [{ line: 1, message: err.message, severity: 'error' }];
    }
    ensureConfigured(mermaid, theme);
    try {
      await mermaid.parse(String(code), { suppressErrors: false });
      return [];
    } catch (err) {
      const e = describeError(err);
      return [{ line: e.line || 1, message: I18n.t('mermaid.syntaxError', { message: e.message }), severity: 'error' }];
    }
  }

  function getPresets(lang) {
    const l = lang === 'en' ? 'en' : 'de';
    return PRESETS.map(p => ({ id: p.id, label: I18n.t(`mermaid.preset.${p.id}`), code: p[l] }));
  }

  function getPreset(id, lang) {
    return getPresets(lang).find(p => p.id === id) || null;
  }

  return { load, render, validate, setTheme, getPresets, getPreset, describeError, isLoaded: () => Boolean(window.mermaid) };
})();
