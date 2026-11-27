# Hinweise für Claude

Private, nicht kommerzielle Website zum Kinoprogramm in Nürnberg, Fürth und Erlangen.
Live unter https://noris357.github.io/kinoprogramm/ (GitHub Pages, öffentlich). Sprache überall Deutsch.

## Aufbau

Regionen (`daten/regionen.json`): Nürnberg/Fürth/Erlangen (Daten in `daten/`, Website-Daten `data.js`) und Hamburg
(Daten in `daten/hamburg/`, Website-Daten `data-hamburg.js`, Ausleser in `tools/quellen/hamburg/`).
`aktualisieren.ps1` und `build-data.ps1` nehmen `-Region hamburg`, Standard ist Nürnberg. Filmangaben
(filminfos, wertungen, preise, personen, titel-korrekturen, ausschluss) sind für alle Regionen gemeinsam.
Die Website wählt die Region über `?region=` oder die zuletzt gewählte (index.html).
CinemaxX und UCI (Hamburg) sperren Abrufe aus der Cloud. Sie laufen nur lokal über `tools/lokal.ps1`
(Windows-Aufgabe „Kinoprogramm lokal“, täglich 12:30, Protokoll `tools/lokal.log`), nicht im Workflow.
Cineplex Fürth und CinemaxX Hamburg kommen über cineamo.com. Cineplex Fürth ergänzend aus gespeicherten Seiten:
`eingang/` (lokal) und ein per Link freigegebener Google-Drive-Ordner (Secret `CINEPLEX_DRIVE_ORDNER`, täglich geprüft).

- `index.html`, `style.css`, `app.js`: die Website, reines HTML/CSS/JavaScript ohne Build-Schritt
- `data.js`: erzeugt von `tools/build-data.ps1`, nie von Hand bearbeiten
- `daten/programm.json`: Bestand, eine Zeile je Film, Kino und Tag
- `daten/filminfos.json` (TMDB), `daten/wertungen.json` (MDBList), `daten/preise.json` (Wikidata): Zwischenspeicher der Abrufe
- `daten/score-gewichte.json`, `daten/titel-korrekturen.json`, `daten/ausschluss.txt`, `daten/preise-manuell.json`, `daten/luecke.json`: von Hand gepflegte Einstellungen
  (`luecke.json`: Erfassungslücke 20.08. bis 18.10.2026 und einzeln geprüfte Filme, deren „Wochen am Stück“ darüber weiterzählen)
- `daten/festivals.json`: Festivalkalender, von Hand und von der Routine „Festivalseiten prüfen“ (1. und 15. im Monat, Pull Request) gepflegt.
  Die Website lädt die Datei direkt, nach Änderungen daran ist kein Neubau von `data.js` nötig.
  Felder und Zuordnungsregeln stehen im Feld `hinweis` der Datei.
- `daten/festivals-erkannt.json`: von `build-data.ps1` aus den Filmhaus-Reihen erkannte Festivals (Feld `Reihe` in `programm.json`), nicht von Hand bearbeiten.
- `tools/aktualisieren.ps1`: liest die Kinoseiten aus (`tools/quellen/*.ps1`) und gleicht mit dem Bestand ab
- `tools/tmdb.ps1`, `tools/mdblist.ps1`, `tools/preise.ps1`: Zusatzdaten
- `tools/auslastung.ps1`: Auslastungsstufen der Cinecitta-Gruppe nach `daten/auslastung.json` (Rubrik „Schnell vergriffen“)
- `.github/workflows/aktualisieren.yml`: Programmlauf täglich morgens, zusätzlich dienstags abends und donnerstags nachmittags, Veröffentlichung

## Regeln

- Termine bis einschließlich zum Abfragetag nie entfernen oder ändern. Spätere Termine eines Kinos nur im tatsächlich gelesenen Zeitraum ersetzen.
- Keine API-Schlüssel ins Repository. Schlüssel liegen nur als GitHub-Secrets (`TMDB_API_KEY`, `MDBL_API_KEY`).
- Keine fremden Seiten mit Bot-Schutz umgehen (Cineplex, kinoheld). Keine Plakate von Kinoseiten übernehmen.
- PowerShell-Skripte müssen unter Windows PowerShell 5.1 und PowerShell 7 laufen. `.ps1`-Dateien als UTF-8 mit BOM speichern, sonst liest Windows PowerShell Umlaute falsch.
  Bekannte Fallen: `-and`/`-or` haben gleichen Rang (klammern), Variablennamen sind nicht nach Groß-/Kleinschreibung getrennt, PowerShell 7 wandelt Datumstexte beim JSON-Einlesen in DateTime um (`ConvertTo-IsoText` verwenden), Pfade mit `/` schreiben.
- Nach Änderungen an Daten oder `build-data.ps1`: `pwsh -File tools/build-data.ps1` ausführen und `data.js` mit committen.
- Texte auf der Website: klar, knapp, ohne Gedankenstriche und Semikolons in Fließtext.
- Kommentare im Code auf Deutsch, im Stil des bestehenden Codes.

## Aufgaben aus GitHub Issues

Offene Issues mit dem Label `claude` sind Aufträge. Je Issue ein eigener Branch `claude/issue-<nummer>` und ein Pull Request mit `Closes #<nummer>`.
Nie direkt auf `main` pushen und nie selbst mergen. Die Besitzerin oder der Besitzer prüft und merged.

Ein Lauf auf dem Server (Claude Code, Kostenbremse 1,50 USD je Issue) bearbeitet offene Issues mit Label `claude` täglich um 20 Uhr.
Ergebnis ist immer ein Pull Request gegen `main` mit `Closes #<nummer>` auf dem Branch `claude/issue-<nummer>`.
Braucht der Lauf eine Entscheidung, ändert er nichts, kommentiert das Issue und setzt das Label `claude-frage`.
Gemerged wird nie automatisch.
