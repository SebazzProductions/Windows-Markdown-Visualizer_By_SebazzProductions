# Mermaid & Markdown Visualizer

Eine schlanke Desktop-Anwendung für Windows, um Markdown-Dokumente, Mermaid-Diagramme und Code-Dateien anzusehen, zu bearbeiten und als PDF, HTML oder SVG zu exportieren. Gebaut mit Electron. Oberfläche auf Deutsch und Englisch.

![Windows](https://img.shields.io/badge/platform-Windows-blue?logo=windows)
![Electron](https://img.shields.io/badge/Electron-45-47848F?logo=electron)
![Mermaid](https://img.shields.io/badge/Mermaid-11-FF3670?logo=mermaid)
![License](https://img.shields.io/badge/license-MIT-green)
![Build](https://github.com/SebazzProductions/Windows-Markdown-Visualizer_By_SebazzProductions/actions/workflows/build.yml/badge.svg)

---

## Funktionen

### Visualizer
- **Live-Rendering** mit GitHub-inspiriertem Styling, Tabellen, Task-Listen, Fußnoten, Markierungen, Hoch-/Tiefstellung, Definitionslisten, YAML-Front-Matter
- **Mermaid-Diagramme** in ```` ```mermaid ````-Blöcken direkt im Dokument – auch im HTML- und PDF-Export
- **Syntax-Highlighting** für Codeblöcke in über 45 Sprachen, Kopieren-Button und Sprach-Label
- **Inhaltsverzeichnis** mit Scroll-Spy, Filter, Ein-/Ausklappen und einstellbarer Breite – navigiert auch im Editor
- **Code-Dateien** (JS, TS, Python, Go, Rust, YAML, JSON, SQL, Shell, …) mit Highlighting und Zeilennummern
- **HTML/CSS-Vorschau** in einer isolierten Sandbox, **JS/TS ausführen** mit eingebauter Konsole
- **Suche** (`Strg+F`) mit Hervorhebung aller Treffer
- Relative Links zu anderen Markdown-Dateien öffnen direkt in der App

### Mermaid
- `.mmd`- und `.mermaid`-Dateien werden als Diagramm dargestellt (Flowchart, Sequenz, Zustand, Klassen, ER, Gantt, Pie, Mindmap, Timeline, Git-Graph, …)
- **Zoom und Verschieben**: Mausrad, Ziehen, Doppelklick zum Einpassen, Tasten `+`/`−`/`0`
- **Live-Vorschau neben dem Editor**, Fehlermeldungen mit Zeilenangabe – das letzte gültige Diagramm bleibt sichtbar
- **Vorlagen** für zehn Diagrammtypen, **Neues Diagramm** mit `Strg+Shift+N`
- **Export** als SVG, PDF oder HTML, SVG in die Zwischenablage kopieren
- Fix Syntax prüft die Mermaid-Syntax

### Editor
- **Live-Vorschau neben dem Editor** (`Strg+\`) mit Scroll-Synchronisation
- Suchen & Ersetzen, Gehe zu Zeile, Auto-Einrückung, Listen-/Zitat-Fortführung
- Zeilen verschieben, duplizieren, löschen; Fett/Kursiv per Tastenkürzel
- Rechtschreibprüfung (Deutsch/Englisch) mit Vorschlägen im Kontextmenü
- Zeilenende (LF/CRLF) und BOM bleiben beim Speichern erhalten; atomares Schreiben
- **Speichern-Button** (aktiv sobald es Änderungen gibt), optionales automatisches Speichern
- Schutz vor Datenverlust: Dialog „Sie haben Änderungen vorgenommen. Möchten Sie diese speichern?“ beim Schließen
- Externe Änderungen werden erkannt und neu geladen

### Fix Syntax
- Markdown-Korrekturen im Stil von markdownlint (Leerzeilen um Blöcke, Überschriften, Listen-Marker, Tabellen-Ausrichtung, nachgestellte Leerzeichen) – Codeblöcke bleiben unangetastet
- Analyse der Überschriften-Hierarchie für ein sauberes Inhaltsverzeichnis
- **Prettier** für JavaScript, TypeScript, CSS, HTML, JSON und YAML (respektiert `.prettierrc` und `.editorconfig`), Syntaxfehler mit Zeilenangabe
- Vorschau als Zeilen-Diff, Klick springt zur betroffenen Zeile, Speichern direkt aus der Leiste

### Export
- **PDF** mit klickbarem Inhaltsverzeichnis, PDF-Lesezeichen aus den Überschriften, Seitenzahlen, Hoch-/Querformat, A3–A5/Letter/Legal
- **HTML** als eigenständige Datei mit eingebetteten Styles, Bildern und Diagrammen
- **SVG** für Mermaid-Diagramme
- Code-Dateien optional mit Zeilennummern

### Oberfläche
- **Deutsch / Englisch** per Umschalter in der Titelleiste (Standard: Systemsprache)
- Design **System / Hell / Dunkel** (folgt dem Windows-Design, inklusive Titelleiste und Diagrammen)
- Moderne Titelleiste mit nativen Fensterschaltflächen, Menü über `Alt` oder das ☰-Symbol
- Zoom (`Strg+Mausrad`, `Strg++/−`), Lesebreite umschaltbar, zuletzt geöffnete Dateien
- Drag & Drop, Dateiassoziation („Öffnen mit“ für `.md`, `.mmd`, …), Einzelinstanz
- Sicherheit: Sandbox, Context Isolation, kein Node-Zugriff im Renderer, HTML und SVG werden mit DOMPurify bereinigt

## Installation

### Option 1: Windows-Installer (empfohlen)

1. Neuesten **Mermaid-Markdown-Visualizer-Setup** aus den [Releases](../../releases) herunterladen
2. Installer ausführen – die App erscheint anschließend bei „Öffnen mit“ für `.md`, `.markdown`, `.mmd`, `.mermaid`, `.html`, `.css`, `.js`, `.ts`, `.json`, `.yaml` und `.txt`

Eine portable Variante (ohne Installation) liegt den Releases ebenfalls bei.

### Option 2: Aus dem Quellcode

**Voraussetzungen:** [Node.js](https://nodejs.org/) 20 oder neuer

```bash
git clone https://github.com/SebazzProductions/Windows-Markdown-Visualizer_By_SebazzProductions.git
cd Windows-Markdown-Visualizer_By_SebazzProductions
npm install

npm run dev             # App starten
npm run dev:example     # App mit Beispieldokument starten
npm run dev:diagram     # App mit Beispiel-Diagramm starten
npm test                # ESLint + E2E-Tests (Playwright)
npm run build           # Windows-Installer (NSIS) nach dist/
npm run build:portable  # Portable EXE nach dist/
npm run vendor          # Mermaid-Bundle nach einem Update neu kopieren
```

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| `Strg+N` / `Strg+Shift+N` | Neues Dokument / Neues Mermaid-Diagramm |
| `Strg+O` | Datei öffnen |
| `Strg+S` / `Strg+Shift+S` | Speichern / Speichern unter |
| `Strg+Shift+E` / `Strg+Shift+H` | Als PDF / als HTML exportieren |
| `Strg+1` / `Strg+2` / `Strg+3` | Visualizer / Editor / Fix Syntax |
| `Strg+E` | Editor ein/aus |
| `Strg+\` | Live-Vorschau neben dem Editor |
| `Strg+F` / `Strg+H` / `Strg+G` | Suchen / Ersetzen / Gehe zu Zeile |
| `Strg+Shift+F` | Fix Syntax |
| `Strg+R` | JS/TS-Code ausführen |
| `Strg+B` | Inhaltsverzeichnis ein-/ausblenden |
| `Strg+T` | Hell/Dunkel wechseln |
| `Strg++` / `Strg+−` / `Strg+0` | Zoom |
| `Rad` / `Ziehen` / `Doppelklick` | Diagramm zoomen / verschieben / einpassen |
| `Tab` / `Shift+Tab` | Einrücken / Ausrücken (Editor) |
| `Alt+↑` / `Alt+↓` | Zeile verschieben (Editor) |
| `Strg+D` / `Strg+Shift+K` | Zeile duplizieren / löschen (Editor) |
| `Strg+Shift+B` / `Strg+Shift+I` | Fett / Kursiv (Editor) |
| `F1` | Alle Tastenkürzel anzeigen |
| `F11` / `F12` | Vollbild / Entwicklertools |

## Projektstruktur

```
src/
├── main/                      # Electron Main-Prozess
│   ├── main.js                # Einstieg, Fenster, Theme, Einzelinstanz
│   ├── menu.js                # Dynamisches Anwendungsmenü (zweisprachig)
│   ├── i18n.js                # Übersetzungen im Main-Prozess
│   ├── ipc-handlers.js        # IPC-Schnittstelle (Dateien, Rendering, Export, Dialoge)
│   ├── settings.js            # Persistente Einstellungen (settings.json)
│   ├── file-service.js        # Lesen/Schreiben (BOM, EOL, atomar), Datei-Watcher
│   ├── markdown-engine.js     # markdown-it + Plugins, Überschriften aus dem Token-Stream
│   ├── highlighter.js         # highlight.js-Sprachen und Aliase
│   ├── export-service.js      # PDF-, HTML- und SVG-Export
│   ├── context-menu.js        # Kontextmenü inkl. Rechtschreibvorschläge
│   ├── format-registry.js     # Format-Handler-Registry
│   └── formats/               # Markdown-Formatter, Prettier-Anbindung, Mermaid- und Code-Handler
├── preload/
│   └── preload.js             # Sichere IPC-Brücke (contextBridge)
├── shared/
│   └── locales.js             # Deutsch/Englisch für Main und Renderer
└── renderer/                  # Oberfläche
    ├── index.html
    ├── css/                   # Themes, Layout, TOC, Markdown, Editor/Diagramm, Export
    ├── js/                    # App, Editor, Vorschau, Mermaid-Engine, TOC, Suche, Fix Syntax, Export, Dialoge
    └── vendor/                # Mermaid-Bundle (per `npm run vendor` aktualisiert)
e2e/                           # Playwright-Tests (Electron)
scripts/                       # Icon-Generator, Mermaid-Vendoring
```

## Technologien

- [Electron](https://www.electronjs.org/) · [markdown-it](https://github.com/markdown-it/markdown-it) mit Anchor-, Task-List-, Footnote-, Mark-, Deflist-, Sub/Sup-Plugins
- [Mermaid](https://mermaid.js.org/) · [highlight.js](https://highlightjs.org/) · [Prettier](https://prettier.io/) · [js-beautify](https://github.com/beautifier/js-beautify) · [Sucrase](https://sucrase.io/) · [DOMPurify](https://github.com/cure53/DOMPurify)
- [electron-builder](https://www.electron.build/) · [Playwright](https://playwright.dev/) · [ESLint](https://eslint.org/)

## Lizenz

MIT – siehe [LICENSE](LICENSE).

---

*Entwickelt von [SebazzProductions](https://github.com/SebazzProductions)*
