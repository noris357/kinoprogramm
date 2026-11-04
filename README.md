# Kinoprogramm Nürnberg · Fürth · Erlangen

Privates, nicht kommerzielles Hobbyprojekt. Die Website zeigt, welche Filme an welchen Tagen in Kinos in Nürnberg, Fürth und Erlangen laufen.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `index.html`, `style.css`, `app.js` | Die Website |
| `data.js` | Daten für die Website, wird automatisch erzeugt |
| `daten/programm.json` | Bestand: eine Zeile je Film, Kino und Tag |
| `daten/letzter-lauf.json` | Bericht der letzten Aktualisierung je Kino |
| `daten/ausschluss.txt` | Muster für Konzerte und Opern, die nicht übernommen werden |
| `daten/quellen.json` | Offizielle Programmseiten der Kinos |
| `tools/aktualisieren.ps1` | Liest die Kinoseiten aus und gleicht sie mit dem Bestand ab |
| `tools/quellen/` | Ein Ausleser je Kinoseite |
| `.github/workflows/aktualisieren.yml` | Wöchentlicher Lauf mittwochs am Abend und Veröffentlichung |

## Lokal ausführen (Windows)

```
powershell -ExecutionPolicy Bypass -File tools\aktualisieren.ps1 -Probelauf
powershell -ExecutionPolicy Bypass -File tools\aktualisieren.ps1
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Der Probelauf zeigt nur an, was sich ändern würde. Der Testserver läuft unter http://localhost:8080.

## Regeln beim Abgleich

- Termine bis einschließlich zum Abfragetag bleiben immer erhalten.
- Spätere Termine eines Kinos werden nur ersetzt, wenn dessen Seite erfolgreich und vollständig gelesen wurde, und nur im gelesenen Zeitraum.
- Casablanca und Uferpalast zeigen online nicht ihr ganzes Programm. Dort werden Termine nur ergänzt.
- Cineplex Fürth und Admiral sperren automatische Abrufe und werden nicht ausgelesen.
