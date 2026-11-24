# Woechentliche Aktualisierung: Kinoseiten auslesen, mit dem Bestand abgleichen, data.js neu erzeugen.
# Aufruf aus dem Projektordner:
#   powershell -ExecutionPolicy Bypass -File website\tools\aktualisieren.ps1            (speichert)
#   powershell -ExecutionPolicy Bypass -File website\tools\aktualisieren.ps1 -Probelauf (zeigt nur an)
#
# Regeln aus der Projektuebergabe:
# - Eine Zeile je Film, Kino und Tag. Historische Zeilen bis einschliesslich Abfragetag bleiben erhalten.
# - Zukuenftige Zeilen eines Kinos werden nur im tatsaechlich ausgelesenen Zeitfenster ersetzt
#   und nur, wenn das Auslesen dieses Kinos geklappt hat. Ein Abruffehler loescht nichts.
# - Konzerte und Opern werden ausgeschlossen (Muster in daten\ausschluss.txt).
# - Fehlende Angaben zu Land, Regie und Jahr bleiben leer und werden im Bericht genannt.

#   -Region hamburg liest die Kinos einer anderen Region (siehe daten/regionen.json), Standard ist nuernberg.

#   -Ausleser Get-HamburgLokal liest nur die Kinos dieser Funktion (z. B. die lokal abgerufenen), die uebrigen Kinos bleiben unveraendert.
param([switch]$Probelauf, [string]$Region = 'nuernberg', [string]$Ausleser = '')

$tools = $PSScriptRoot
. (Join-Path $tools 'gemeinsam.ps1')
# Ausleser aller Regionen laden (tools/quellen und Unterordner je Region)
Get-ChildItem (Join-Path $tools 'quellen') -Filter *.ps1 -Recurse | ForEach-Object { . $_.FullName }
$regionInfo = Get-Region $Region

# Pfade mit "/" funktionieren unter Windows und unter Linux (GitHub Actions)
$datenOrdner = $regionInfo.pfad
$bestandDatei = Join-Path $datenOrdner 'programm.json'
$ausschlussDatei = Join-Path (Resolve-Path "$tools/../daten").Path 'ausschluss.txt'
$utf8 = New-Object System.Text.UTF8Encoding $false

# PowerShell 7 wandelt Datumstexte beim Einlesen teils in DateTime um. Hier immer JJJJ-MM-TT als Text.
function ConvertTo-IsoText($Wert) { if ($Wert -is [datetime]) { $Wert.ToString('yyyy-MM-dd') } else { [string]$Wert } }

# ---------- Bestand laden (beim ersten Mal aus dem ChatGPT-Export, ohne persoenliche Spalte) ----------
# Eine neue Region beginnt mit leerem Bestand
$quelleBestand = if (Test-Path $bestandDatei) { $bestandDatei } elseif ($Region -eq 'nuernberg') { "$tools/../../Kinoprogramm_entpivotiert.json" } else { $null }
$bestandRoh = if ($quelleBestand) { (Get-Content $quelleBestand -Raw -Encoding UTF8 | ConvertFrom-Json).zeilen } else { @() }
$bestand = @($bestandRoh | Where-Object { $_.Datum } | ForEach-Object {
  $z = [pscustomobject][ordered]@{ Titel = $_.Titel; Kino = $_.Kino; Land = $_.Land; 'Regisseur:in' = $_.'Regisseur:in'; Produktionsjahr = $_.Produktionsjahr; Datum = (ConvertTo-IsoText $_.Datum) }
  # Reihe (bisher nur Filmhaus) nur dort führen, wo sie bekannt ist, damit programm.json nicht anschwillt
  if ($_.PSObject.Properties['Reihe'] -and $_.Reihe) { $z | Add-Member Reihe $_.Reihe }
  $z
})
$heute = (Get-Heute).ToString('yyyy-MM-dd')

# Bekannte Filme nach Titelschluessel, fuer die Uebernahme von Land, Regie und Jahr.
# Bei gleichem Schluessel gewinnt der zuletzt gespielte Eintrag.
# Filme anderer Regionen zählen mit (gleicher Titel und gleiches Jahr, damit TMDB und Wertungen geteilt werden),
# der eigene Bestand hat Vorrang.
$bekannt = @{}
foreach ($r in Get-Regionen | Where-Object { $_.id -ne $Region }) {
  $andere = Join-Path $r.pfad 'programm.json'
  if (Test-Path $andere) { foreach ($z in ((Get-Content $andere -Raw -Encoding UTF8 | ConvertFrom-Json).zeilen | Sort-Object Datum)) { $bekannt[(Get-TitelSchluessel $z.Titel)] = $z } }
}
foreach ($z in ($bestand | Sort-Object Datum)) { $bekannt[(Get-TitelSchluessel $z.Titel)] = $z }
# Haupttitel ohne Untertitel ("Heimsuchung - Eine Jahrhundertgeschichte" -> "Heimsuchung"), nur wenn eindeutig
$haupttitel = @{}
foreach ($film in $bekannt.Values) {
  $teile = $film.Titel -split '\s+[-–]\s+|:\s+'
  if ($teile.Count -lt 2) { continue }
  $s = Get-TitelSchluessel $teile[0]
  if ($s.Length -lt 4) { continue }
  if ($haupttitel.ContainsKey($s) -and $haupttitel[$s].Titel -ne $film.Titel) { $haupttitel[$s] = $null } else { $haupttitel[$s] = $film }
}

function Find-Film([string]$Titel) {
  $kandidaten = New-Object System.Collections.Generic.List[string]
  $kandidaten.Add($Titel)
  # Zusaetze wie "(35-jaehriges Jubilaeum)" oder " - Studio Ghibli (2024)" abtrennen
  $kurz = [regex]::Replace((Get-BereinigterTitel $Titel), '\s*\([^)]*\)\s*$', '')
  $kandidaten.Add($kurz)
  $kandidaten.Add(($kurz -split '\s+[-–]\s+')[0])
  # Reihenname davor, z. B. "Jonathans Retroflimmern: Hard Boiled" oder "Stummfilmmatinee: Nosferatu"
  if ($kurz -match '^[^:]{3,40}:\s+(.+)$') { $kandidaten.Add($Matches[1]); $kandidaten.Add(($Matches[1] -split '\s+[-–]\s+')[0]) }
  foreach ($k in $kandidaten) {
    $s = Get-TitelSchluessel $k
    if ($s -and $bekannt.ContainsKey($s)) { return $bekannt[$s] }
  }
  foreach ($k in $kandidaten) {
    $s = Get-TitelSchluessel $k
    if ($s -and $haupttitel.ContainsKey($s) -and $haupttitel[$s]) { return $haupttitel[$s] }
  }
  return $null
}

$ausschluss = @()
if (Test-Path $ausschlussDatei) { $ausschluss = @(Get-Content $ausschlussDatei -Encoding UTF8 | Where-Object { $_ -and -not $_.StartsWith('#') }) }
function Test-Ausgeschlossen([string]$Titel) { foreach ($m in $ausschluss) { if ($Titel -match $m) { return $true } }; return $false }

# Die Ausschlussliste gilt auch fuer den Bestand: so verschwinden nachtraeglich eingetragene Muster ueberall
$vorherBestand = $bestand.Count
$bestand = @($bestand | Where-Object { -not (Test-Ausgeschlossen $_.Titel) })
$ausDemBestand = $vorherBestand - $bestand.Count

# ---------- Kinoseiten auslesen ----------
$roh = @(& $(if ($Ausleser) { $Ausleser } else { $regionInfo.ausleser }))   # Liste der Ausleser der Region, z. B. Get-AlleProgramme in tools/quellen/alle.ps1

# Mehrere Quellen fuer dasselbe Kino zusammenfuehren
$ergebnisse = foreach ($g in $roh | Group-Object Kino) {
  if ($g.Count -eq 1) { $g.Group[0]; continue }
  $ok = @($g.Group | Where-Object Ok)
  $e = New-KinoErgebnis $g.Name (($g.Group | ForEach-Object Url) -join ' + ')
  $e.Fehler = (@($g.Group | Where-Object { -not $_.Ok } | ForEach-Object Fehler) -join '; ')
  if ($ok.Count) {
    $ok | ForEach-Object { $_.Termine } | ForEach-Object { $e.Termine.Add($_) }
    $e.Von = ($ok | ForEach-Object Von | Sort-Object)[0]
    $e.Bis = ($ok | ForEach-Object Bis | Sort-Object)[-1]
    # Ist eine der Quellen ausgefallen, nur ergaenzen: sonst fielen deren Termine im Zeitfenster weg
    if ($ok.Count -lt $g.Count) { $e.Von = (Get-Heute).ToString('yyyy-MM-dd'); $e.Bis = $e.Von }
    $e.Ok = $true
  }
  $e
}

# ---------- Abgleich ----------
$okKinos = @{}
foreach ($e in $ergebnisse | Where-Object Ok) { $okKinos[$e.Kino] = $e }

$neu = New-Object System.Collections.Generic.List[object]
$entfernt = @{}
foreach ($z in $bestand) {
  $e = $okKinos[$z.Kino]
  # Der Abfragetag selbst bleibt geschuetzt: Kinoseiten zeigen fuer heute nur noch kommende Uhrzeiten
  $ersetzen = $e -and $z.Datum -gt $heute -and $z.Datum -ge $e.Von -and $z.Datum -le $e.Bis
  if ($ersetzen) { $entfernt["$(Get-TitelSchluessel $z.Titel)|$($z.Kino)|$($z.Datum)"] = $z } else { $neu.Add($z) }
}

$bericht = New-Object System.Collections.Generic.List[object]
$neueFilme = @{}
$ausgeschlossen = @{}
foreach ($e in $ergebnisse) {
  $hinzu = 0; $bestaetigt = 0
  if ($e.Ok) {
    foreach ($t in $e.Termine | Where-Object { $_.Datum -ge $heute }) {
      if (Test-Ausgeschlossen $t.Titel) { $ausgeschlossen[$t.Titel] = $true; continue }
      $film = Find-Film $t.Titel
      if ($film) {
        $zeile = [pscustomobject][ordered]@{ Titel = $film.Titel; Kino = $e.Kino; Land = $film.Land; 'Regisseur:in' = $film.'Regisseur:in'; Produktionsjahr = $film.Produktionsjahr; Datum = $t.Datum }
      } else {
        $titel = Get-BereinigterTitel $t.Titel
        # Manche Kinoseiten nennen Land, Jahr und Regie (z. B. das Filmhaus). Sonst bleibt es leer.
        $land = if ($t.PSObject.Properties['Land'] -and $t.Land) { $t.Land -replace '\s*/\s*', ', ' } else { $null }
        $regie = if ($t.PSObject.Properties['Regie'] -and $t.Regie) { $t.Regie } else { $null }
        $jahr = if ($t.PSObject.Properties['Jahr'] -and $t.Jahr -match '^\d{4}') { $t.Jahr } else { $null }
        if (-not ($land -and $regie -and $jahr)) { $neueFilme[$titel] = $true }
        $zeile = [pscustomobject][ordered]@{ Titel = $titel; Kino = $e.Kino; Land = $land; 'Regisseur:in' = $regie; Produktionsjahr = $jahr; Datum = $t.Datum }
        # Sofort merken, damit andere Kinos denselben neuen Film unter demselben Titel fuehren
        $bekannt[(Get-TitelSchluessel $titel)] = $zeile
      }
      if ($t.PSObject.Properties['Reihe'] -and $t.Reihe) { $zeile = $zeile.PSObject.Copy(); $zeile | Add-Member Reihe $t.Reihe -Force }
      $s = "$(Get-TitelSchluessel $zeile.Titel)|$($e.Kino)|$($t.Datum)"
      if ($entfernt.ContainsKey($s)) { $entfernt.Remove($s); $bestaetigt++ } else { $hinzu++ }
      $neu.Add($zeile)
    }
  }
  $bericht.Add([ordered]@{
    kino = $e.Kino; ok = $e.Ok; fehler = $e.Fehler; von = $e.Von; bis = $e.Bis
    bestaetigt = $bestaetigt; neu = $hinzu
    entfernt = @($entfernt.Keys | Where-Object { $_.Split('|')[1] -eq $e.Kino }).Count
  })
}

# Doppelte Zeilen (gleicher Film, gleiches Kino, gleicher Tag) entfernen
$gesehen = @{}
$ergebnis = foreach ($z in $neu) {
  $s = "$($z.Titel)|$($z.Produktionsjahr)|$($z.Kino)|$($z.Datum)"
  if (-not $gesehen.ContainsKey($s)) { $gesehen[$s] = $true; $z }
}
$ergebnis = @($ergebnis | Sort-Object Datum, Kino, Titel)

# ---------- Ausgabe ----------
"Abfragetag $heute"
foreach ($b in $bericht) {
  if ($b.ok) { "{0,-26} ok    {1} bis {2}  bestaetigt {3,4}  neu {4,4}  entfernt {5,3}" -f $b.kino, $b.von, $b.bis, $b.bestaetigt, $b.neu, $b.entfernt }
  else { "{0,-26} FEHLER {1}  (bestehende Termine bleiben erhalten)" -f $b.kino, $b.fehler }
}
"Nicht abgefragt: " + ((@($bestand | ForEach-Object Kino | Sort-Object -Unique) | Where-Object { $_ -notin $ergebnisse.Kino }) -join ', ')
"Zeilen vorher $($bestand.Count), nachher $($ergebnis.Count)"
if ($ausDemBestand) { "Aus dem Bestand entfernt (Ausschlussliste): $ausDemBestand Zeilen" }
if ($neueFilme.Count) { "Neue Filme ohne Land, Regie und Jahr ($($neueFilme.Count)): " + (($neueFilme.Keys | Sort-Object) -join ' | ') }
if ($ausgeschlossen.Count) { "Ausgeschlossen als Konzert oder Oper: " + (($ausgeschlossen.Keys | Sort-Object) -join ' | ') }

if ($Probelauf) { 'Probelauf: nichts gespeichert.'; return }

$json = [ordered]@{ stand = $heute; zeilen = $ergebnis } | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($bestandDatei, $json, $utf8)
$lauf = [ordered]@{ abfragetag = $heute; kinos = $bericht; neueFilme = @($neueFilme.Keys | Sort-Object); ausgeschlossen = @($ausgeschlossen.Keys | Sort-Object) } | ConvertTo-Json -Depth 4
# Der Bericht gilt dem vollstaendigen Lauf. Ein Lauf nur mit einzelnen Kinos (-Ausleser) ueberschreibt ihn nicht.
if (-not $Ausleser) { [IO.File]::WriteAllText((Join-Path $datenOrdner 'letzter-lauf.json'), $lauf, $utf8) }

& (Join-Path $tools 'build-data.ps1') -Region $Region
