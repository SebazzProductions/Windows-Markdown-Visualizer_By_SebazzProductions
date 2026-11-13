# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

## [2.0.0] – 2026-11-13

### Behobene Fehler

- **Fix Syntax fügte zwischen jedem Listenpunkt eine Leerzeile ein** – Leerzeilen werden jetzt nur noch zwischen unterschiedlichen Blocktypen eingefügt (Überschrift, Liste, Codeblock, Tabelle, Trennlinie).
- **Harte Zeilenumbrüche (zwei Leerzeichen am Zeilenende) wurden entfernt** – bleiben jetzt erhalten.
- **Task-Listen (`- [x]`) wurden als Text angezeigt** – werden jetzt als Checkboxen gerendert.
- **Code-Dateien (JS, TS, JSON, …) hatten im Visualizer kein Syntax-Highlighting** – jetzt mit Highlighting und Zeilennummern.
- **PDF-Export von Code-Dateien exportierte den vorher geöffneten Markdown-Inhalt** – jede Ansicht exportiert jetzt ihren eigenen Inhalt.
- **Bilder fehlten im PDF** – der Export läuft über eine temporäre Datei, lokale Bilder werden geladen.
- **Scrollbar saß bei breiten Fenstern mitten im Fenster** – der Inhalt ist jetzt zentriert, die Scrollbar liegt am Fensterrand.
- **Inhaltsverzeichnis wurde bei vielen Unterpunkten abgeschnitten** (max-height 2000px).
- **Größenänderungs-Griff der Seitenleiste lag am rechten Fensterrand** und hatte keine Funktion.
- **Ungespeicherte Änderungen gingen beim Schließen verloren** – es erscheint jetzt ein Dialog (Speichern / Verwerfen / Abbrechen).
- **Eigene Speichervorgänge lösten ein Neuladen aus** (Cursor sprang) – der Watcher erkennt eigene Änderungen am Inhalt.
- **Überschriften in Codeblöcken landeten im Inhaltsverzeichnis** – Überschriften kommen jetzt direkt aus dem Parser.
- **CRLF-Dateien wurden beim Speichern auf LF umgestellt, BOM ging verloren** – beide werden erkannt und beibehalten.
- **Zeilennummern-Option im PDF-Dialog war ohne Funktion.**
- Startmodus `electron .` öffnete die eigene `main.js` als Dokument.

### Neue Funktionen

- **Editor:** Live-Vorschau neben dem Editor (Split-View, `Strg+\`) mit Scroll-Synchronisation, Suchen/Ersetzen (`Strg+F` / `Strg+H`), Auto-Einrückung, Listen- und Zitat-Fortführung, Zeilen verschieben (`Alt+↑/↓`), duplizieren (`Strg+D`), löschen (`Strg+Shift+K`), Fett/Kursiv (`Strg+Shift+B/I`), Undo-erhaltende Einfügungen, Wort-/Zeichenzähler, Zeilenende-Umschalter (LF/CRLF), Rechtschreibprüfung mit Vorschlägen im Kontextmenü, Doppelklick in der Vorschau springt zur Quellzeile.
- **Neues Dokument** (`Strg+N`), **Automatisches Speichern** (Menü), atomares Schreiben (Temp-Datei + Umbenennen).
- **Zuletzt geöffnete Dateien** im Menü und auf dem Startbildschirm.
- **PDF-Export:** Lesezeichen (PDF-Gliederung) aus Überschriften, Seitenzahlen und Titel in Kopf-/Fußzeile, Querformat, weitere Seitenformate, barrierefreies (tagged) PDF.
- **HTML-Export:** eigenständige HTML-Datei mit eingebetteten Styles und Bildern.
- **Markdown:** Fußnoten, `==Markierung==`, Hoch-/Tiefstellung, Definitionslisten, YAML-Front-Matter (eingeklappt), Roh-HTML (bereinigt durch DOMPurify), GitHub-kompatible Anker (Umlaute bleiben erhalten), deutsche Anführungszeichen, Kopieren-Button und Sprach-Label an Codeblöcken, relative Links zu anderen Markdown-Dateien öffnen in der App.
- **Fix Syntax:** Tabellen-Ausrichtung, echter Zeilen-Diff (LCS) mit Kontext, Klick auf Problem/Diff-Zeile springt zur Zeile im Editor, Prettier für JS/TS/CSS/HTML/JSON/YAML (respektiert `.prettierrc`/`.editorconfig`), Syntaxfehler mit Zeilenangabe, striktes-JSON-Prüfung.
- **Inhaltsverzeichnis:** Filter, Alle ein-/ausklappen, Breite per Drag, Zustand bleibt bei Live-Vorschau erhalten.
- **Oberfläche:** moderne Titelleiste mit nativen Fensterschaltflächen (Window Controls Overlay), Hamburger-Menü, Design „System/Hell/Dunkel“ (folgt dem Windows-Design, inkl. Titelleiste), Zoom mit `Strg+Mausrad` und Zoom-Anzeige, Lesebreite umschaltbar, Toast-Benachrichtigungen mit „Öffnen“-Aktion, Kontextmenü (Kopieren/Einfügen/Link/Bild), Fensterposition und -größe werden gemerkt.
- **Formate:** über 90 Dateiendungen (Python, Go, Rust, YAML, XML, SQL, Shell, Dockerfile, …) mit Highlighting; unbekannte Textdateien werden per Inhaltserkennung geöffnet, Binärdateien abgelehnt.
- **HTML-Vorschau:** lokale Bilder werden eingebettet.
- **Konsole (JS/TS):** Fehlerobjekte, zirkuläre Strukturen, `console.debug/table`.

### Technik

- Electron 33 → 45, electron-builder 26, markdown-it 15, Playwright 1.65, Prettier 3, DOMPurify 3.
- Einstellungen zentral im Main-Prozess (`settings.json` in `%APPDATA%`), Menü wird dynamisch daraus gebaut.
- Tastenkürzel laufen über Menü-Accelerators mit Renderer-Fallback (entprellt).
- ESLint 9, 20 E2E-Tests, GitHub-Actions-Workflow (Lint, Tests, Installer-Build, Release bei Tag).
- Mehrstufiges Anwendungs-Icon (16–256 px).

## [1.0.0] – 2026-03-20

- Erste Veröffentlichung: Markdown-Viewer mit Inhaltsverzeichnis, PDF-Export, Syntax-Highlighting, Hell/Dunkel-Design, Dateiassoziationen.
- 1.1: Multi-Format-Editor (Visualizer / Editor / Fix Syntax), Format-Registry, HTML/CSS/JS/TS-Vorschau, Drag & Drop.
