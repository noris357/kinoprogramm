# Hinweise für Claude

Private, nicht kommerzielle Website zum Kinoprogramm in Nürnberg, Fürth und Erlangen.
Live unter https://noris357.github.io/kinoprogramm/ (GitHub Pages, öffentlich). Sprache überall Deutsch.

## Aufbau

- `index.html`, `style.css`, `app.js`: die Website, reines HTML/CSS/JavaScript ohne Build-Schritt
- `data.js`: erzeugt von `tools/build-data.ps1`, nie von Hand bearbeiten
- `daten/programm.json`: Bestand, eine Zeile je Film, Kino und Tag
- `daten/filminfos.json` (TMDB), `daten/wertungen.json` (MDBList), `daten/preise.json` (Wikidata): Zwischenspeicher der Abrufe
- `daten/score-gewichte.json`, `daten/titel-korrekturen.json`, `daten/ausschluss.txt`, `daten/preise-manuell.json`: von Hand gepflegte Einstellungen
- `tools/aktualisieren.ps1`: liest die Kinoseiten aus (`tools/quellen/*.ps1`) und gleicht mit dem Bestand ab
- `tools/tmdb.ps1`, `tools/mdblist.ps1`, `tools/preise.ps1`: Zusatzdaten
- `.github/workflows/aktualisieren.yml`: wöchentlicher Lauf mittwochs am Abend und Veröffentlichung

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
