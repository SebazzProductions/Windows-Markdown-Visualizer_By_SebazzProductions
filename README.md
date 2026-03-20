# Markdown Visualizer

Eine elegante, ressourcenschonende Desktop-Anwendung zur Visualisierung von Markdown-Dateien unter Windows. Gebaut mit Electron.

![Windows](https://img.shields.io/badge/platform-Windows-blue?logo=windows)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Live-Rendering** – Hochwertige Darstellung von Markdown mit GitHub-inspiriertem Styling
- **Inhaltsverzeichnis (TOC)** – Automatisch generierte, klappbare Seitennavigation mit Scroll-Spy
- **PDF-Export** – Export als PDF, optional mit klickbarem Inhaltsverzeichnis
- **Syntax-Highlighting** – Unterstützung für 27+ Programmiersprachen (JavaScript, Python, C++, SQL, Rust, Go, u.v.m.)
- **Hell/Dunkel-Modus** – Umschaltbares Theme mit `Strg+T`
- **Dateiassoziation** – `.md` und `.markdown` Dateien direkt per Doppelklick öffnen
- **Drag & Drop** – Markdown-Dateien einfach in das Fenster ziehen
- **Dateiüberwachung** – Automatisches Neu-Rendern bei externen Änderungen
- **Zoom** – Stufenloses Zoomen von 60 % bis 200 % (`Strg++` / `Strg+-`)
- **Tastaturkürzel** – Schneller Zugriff auf alle Funktionen
- **Einzelinstanz** – Mehrfaches Öffnen wird verhindert, neue Dateien im bestehenden Fenster geöffnet
- **Sicher** – Sandbox-Modus, Context Isolation, kein Node-Zugriff im Renderer

## Screenshots

> *Starte die App mit der mitgelieferten Testdatei, um die Oberfläche zu sehen:*
> ```
> npx electron . test/example.md
> ```

## Installation

### Option 1: Windows Installer (empfohlen)

1. Lade den neuesten **Markdown Visualizer Setup x.x.x.exe** aus den [Releases](../../releases) herunter
2. Führe den Installer aus und folge den Anweisungen
3. Nach der Installation werden `.md`-Dateien automatisch mit dem Markdown Visualizer verknüpft

### Option 2: Aus dem Quellcode bauen

**Voraussetzungen:** [Node.js](https://nodejs.org/) (v18 oder höher)

```bash
# Repository klonen
git clone https://github.com/SebazzProductions/Windows-Markdown-Visualizer_By_SebazzProductions.git
cd Windows-Markdown-Visualizer_By_SebazzProductions

# Abhängigkeiten installieren
npm install

# App im Entwicklungsmodus starten
npm run dev

# Windows Installer erstellen
npm run build

# Oder als portable Version
npm run build:portable
```

Der fertige Installer liegt anschließend im Ordner `dist/`.

## Tastaturkürzel

| Kürzel | Aktion |
|---|---|
| `Strg+O` | Datei öffnen |
| `Strg+Shift+E` | PDF exportieren |
| `Strg+B` | Inhaltsverzeichnis ein-/ausblenden |
| `Strg+T` | Theme wechseln (Hell/Dunkel) |
| `Strg++` / `Strg+-` | Zoom vergrößern / verkleinern |
| `Strg+0` | Zoom zurücksetzen |
| `F12` | Entwicklertools öffnen |

## Projektstruktur

```
src/
├── main/                  # Electron Main Process
│   ├── main.js            # App-Einstiegspunkt, BrowserWindow
│   ├── menu.js            # Anwendungsmenü
│   ├── ipc-handlers.js    # IPC-Kommunikation (Dateien, PDF, Rendering)
│   └── markdown-engine.js # markdown-it + highlight.js Konfiguration
├── preload/
│   └── preload.js         # Sichere IPC-Bridge (contextBridge)
└── renderer/              # Frontend
    ├── index.html
    ├── css/               # Themes, Layout, TOC, Markdown-Styles
    └── js/                # App-Logik, TOC-Manager, Scroll-Spy, PDF-Export
```

## Technologien

- **[Electron](https://www.electronjs.org/)** – Desktop-Runtime
- **[markdown-it](https://github.com/markdown-it/markdown-it)** – Markdown-Parser
- **[markdown-it-anchor](https://github.com/valeriangalliat/markdown-it-anchor)** – Heading-Anker
- **[highlight.js](https://highlightjs.org/)** – Syntax-Highlighting
- **[electron-builder](https://www.electron.build/)** – Packaging & Installer

## Lizenz

MIT – siehe [LICENSE](LICENSE) für Details.

---

*Entwickelt von [SebazzProductions](https://github.com/SebazzProductions)*
