# Markdown Visualizer

Eine schlanke Desktop-Anwendung für Windows, um Markdown- und Code-Dateien anzusehen, zu bearbeiten und als PDF oder HTML zu exportieren. Gebaut mit Electron.

![Windows](https://img.shields.io/badge/platform-Windows-blue?logo=windows)
![Electron](https://img.shields.io/badge/Electron-45-47848F?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)
![Build](https://github.com/SebazzProductions/Windows-Markdown-Visualizer_By_SebazzProductions/actions/workflows/build.yml/badge.svg)

---

## Funktionen

### Visualizer
- **Live-Rendering** mit GitHub-inspiriertem Styling, Tabellen, Task-Listen, Fußnoten, Markierungen, Hoch-/Tiefstellung, Definitionslisten, YAML-Front-Matter
- **Syntax-Highlighting** für Codeblöcke in über 45 Sprachen, Kopieren-Button und Sprach-Label
- **Inhaltsverzeichnis** mit Scroll-Spy, Filter, Ein-/Ausklappen und einstellbarer Breite
- **Code-Dateien** (JS, TS, Python, Go, Rust, YAML, JSON, SQL, Shell, …) mit Highlighting und Zeilennummern
- **HTML/CSS-Vorschau** in einer isolierten Sandbox, **JS/TS ausführen** mit eingebauter Konsole
- **Suche** (`Strg+F`) mit Hervorhebung aller Treffer
- Relative Links zu anderen Markdown-Dateien öffnen direkt in der App

### Editor
- **Live-Vorschau neben dem Editor** (`Strg+\`) mit Scroll-Synchronisation
- Suchen & Ersetzen, Gehe zu Zeile, Auto-Einrückung, Listen-/Zitat-Fortführung
- Zeilen verschieben, duplizieren, löschen; Fett/Kursiv per Tastenkürzel
- Rechtschreibprüfung (Deutsch/Englisch) mit Vorschlägen im Kontextmenü
- Zeilenende (LF/CRLF) und BOM bleiben beim Speichern erhalten; atomares Schreiben
- Optionales automatisches Speichern; Schutz vor Datenverlust beim Schließen
- Externe Änderungen werden erkannt und neu geladen

### Fix Syntax
- Markdown-Korrekturen im Stil von markdownlint (Leerzeilen um Blöcke, Überschriften, Listen-Marker, Tabellen-Ausrichtung, nachgestellte Leerzeichen) – Codeblöcke bleiben unangetastet
- Analyse der Überschriften-Hierarchie für ein sauberes Inhaltsverzeichnis
- **Prettier** für JavaScript, TypeScript, CSS, HTML, JSON und YAML (respektiert `.prettierrc` und `.editorconfig`), Syntaxfehler mit Zeilenangabe
- Vorschau als Zeilen-Diff, Klick springt zur betroffenen Zeile

### Export
- **PDF** mit klickbarem Inhaltsverzeichnis, PDF-Lesezeichen aus den Überschriften, Seitenzahlen, Hoch-/Querformat, A3–A5/Letter/Legal
- **HTML** als eigenständige Datei mit eingebetteten Styles und Bildern
- Code-Dateien optional mit Zeilennummern

### Oberfläche
- Design **System / Hell / Dunkel** (folgt dem Windows-Design, inklusive Titelleiste)
- Moderne Titelleiste mit nativen Fensterschaltflächen, Menü über `Alt` oder das ☰-Symbol
- Zoom (`Strg+Mausrad`, `Strg++/−`), Lesebreite umschaltbar, zuletzt geöffnete Dateien
- Drag & Drop, Dateiassoziation („Öffnen mit“), Einzelinstanz
- Sicherheit: Sandbox, Context Isolation, kein Node-Zugriff im Renderer, HTML wird mit DOMPurify bereinigt

## Installation

### Option 1: Windows-Installer (empfohlen)

1. Neuesten **Markdown Visualizer Setup** aus den [Releases](../../releases) herunterladen
2. Installer ausführen – die App erscheint anschließend bei „Öffnen mit“ für `.md`, `.markdown`, `.html`, `.css`, `.js`, `.ts`, `.json`, `.yaml` und `.txt`

Eine portable Variante (ohne Installation) liegt den Releases ebenfalls bei.

### Option 2: Aus dem Quellcode

**Voraussetzungen:** [Node.js](https://nodejs.org/) 20 oder neuer

```bash
git clone https://github.com/SebazzProductions/Windows-Markdown-Visualizer_By_SebazzProductions.git
cd Windows-Markdown-Visualizer_By_SebazzProductions
npm install

npm run dev             # App starten
npm run dev:example     # App mit Beispieldokument starten
npm test                # ESLint + E2E-Tests (Playwright)
npm run build           # Windows-Installer (NSIS) nach dist/
npm run build:portable  # Portable EXE nach dist/
```

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| `Strg+N` / `Strg+O` | Neues Dokument / Datei öffnen |
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
│   ├── menu.js                # Dynamisches Anwendungsmenü
│   ├── ipc-handlers.js        # IPC-Schnittstelle (Dateien, Rendering, Export, Dialoge)
│   ├── settings.js            # Persistente Einstellungen (settings.json)
│   ├── file-service.js        # Lesen/Schreiben (BOM, EOL, atomar), Datei-Watcher
│   ├── markdown-engine.js     # markdown-it + Plugins, Überschriften aus dem Token-Stream
│   ├── highlighter.js         # highlight.js-Sprachen und Aliase
│   ├── export-service.js      # PDF- und HTML-Export
│   ├── context-menu.js        # Kontextmenü inkl. Rechtschreibvorschläge
│   ├── format-registry.js     # Format-Handler-Registry
│   └── formats/               # Markdown-Formatter, Prettier-Anbindung, Format-Handler
├── preload/
│   └── preload.js             # Sichere IPC-Brücke (contextBridge)
└── renderer/                  # Oberfläche
    ├── index.html
    ├── css/                   # Themes, Layout, TOC, Markdown, Editor, Export
    └── js/                    # App, Editor, Vorschau, TOC, Scroll-Spy, Suche, Fix Syntax, Export, Toasts
e2e/                           # Playwright-Tests (Electron)
scripts/generate-icon.js       # Erzeugt build/icon.ico (16–256 px)
```

## Technologien

- [Electron](https://www.electronjs.org/) · [markdown-it](https://github.com/markdown-it/markdown-it) mit Anchor-, Task-List-, Footnote-, Mark-, Deflist-, Sub/Sup-Plugins
- [highlight.js](https://highlightjs.org/) · [Prettier](https://prettier.io/) · [js-beautify](https://github.com/beautifier/js-beautify) · [Sucrase](https://sucrase.io/) · [DOMPurify](https://github.com/cure53/DOMPurify)
- [electron-builder](https://www.electron.build/) · [Playwright](https://playwright.dev/) · [ESLint](https://eslint.org/)

## Lizenz

MIT – siehe [LICENSE](LICENSE).

---

*Entwickelt von [SebazzProductions](https://github.com/SebazzProductions)*
