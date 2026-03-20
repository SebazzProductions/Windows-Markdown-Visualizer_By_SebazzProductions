# Markdown Visualizer – Testdokument

Dies ist ein umfassendes Testdokument, um alle Funktionen des Markdown Visualizers zu prüfen.

## 1. Grundlegende Formatierung

Normaler Text mit **fetter Formatierung**, *kursiver Text* und `Inline-Code`. Hier kommt auch ein [externer Link](https://example.com) vor.

### 1.1 Listen

#### Ungeordnete Liste
- Erster Punkt
- Zweiter Punkt
  - Unterpunkt A
  - Unterpunkt B
    - Tieferer Unterpunkt
- Dritter Punkt

#### Geordnete Liste
1. Schritt eins
2. Schritt zwei
3. Schritt drei
   1. Teilschritt 3a
   2. Teilschritt 3b

### 1.2 Aufgabenliste
- [x] Architektur planen
- [x] UI-Design erstellen
- [ ] Implementierung abschließen
- [ ] Tests schreiben

## 2. Code-Beispiele

### JavaScript
```javascript
function greet(name) {
  const greeting = `Hallo, ${name}!`;
  console.log(greeting);
  return greeting;
}

// Arrow function
const multiply = (a, b) => a * b;
```

### Python
```python
def fibonacci(n):
    """Generate Fibonacci sequence up to n"""
    a, b = 0, 1
    while a < n:
        yield a
        a, b = b, a + b

for num in fibonacci(100):
    print(num)
```

### SQL
```sql
SELECT u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.active = true
GROUP BY u.name
HAVING COUNT(o.id) > 5
ORDER BY order_count DESC;
```

## 3. Zitate und Hervorhebungen

> Dies ist ein Blockzitat. Es kann mehrere Absätze enthalten
> und wird besonders hervorgehoben dargestellt.
>
> > Verschachtelte Zitate sind ebenfalls möglich.

## 4. Tabellen

| Funktion | Tastenkürzel | Beschreibung |
|----------|-------------|---------------|
| Öffnen | Ctrl+O | Datei öffnen |
| TOC Toggle | Ctrl+B | Seitenleiste ein/ausblenden |
| Theme | Ctrl+T | Hell/Dunkel wechseln |
| PDF Export | Ctrl+Shift+E | Als PDF exportieren |
| Zoom+ | Ctrl+= | Vergrößern |
| Zoom- | Ctrl+- | Verkleinern |

## 5. Horizontale Linie

Oben

---

Unten

## 6. Verschachtelte Überschriften

### 6.1 Ebene 3

#### 6.1.1 Ebene 4

##### 6.1.1.1 Ebene 5

###### 6.1.1.1.1 Ebene 6

Tiefer geht es nicht – h6 ist die kleinste Überschrift.

## 7. Typografie

Typografische Zeichen werden automatisch konvertiert: "Anführungszeichen", 'einfache Anführungszeichen', Gedankenstrich -- und Ellipse...

## 8. Langer Abschnitt (Scroll-Test)

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.

## 9. Zusammenfassung

Dieses Dokument testet:
1. **Typografie** – Headings, Fett, Kursiv, Inline-Code
2. **Listen** – Geordnet, ungeordnet, verschachtelt, Aufgaben
3. **Code-Blöcke** – Syntax-Highlighting für verschiedene Sprachen
4. **Blockzitate** – Einfach und verschachtelt
5. **Tabellen** – Mit Header und Ausrichtung
6. **Navigation** – Alle Heading-Ebenen (h1 bis h6)
7. **Typografie** – Automatische Zeichenkonvertierung
8. **Scrolling** – Langer Text für Scroll-Spy-Test
