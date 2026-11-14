# Liest die Auslastung einzelner Vorstellungen der Cinecitta-Gruppe (Cinecitta, Meisengeige, Metropolis, Manhattan).
# Andere Kinos geben die Auslastung nicht oeffentlich an.
# Aufruf aus dem Ordner website:  powershell -ExecutionPolicy Bypass -File tools\auslastung.ps1
#
# Ergebnis: daten/auslastung.json mit allen kommenden Vorstellungen ab "hohe Auslastung".
# Die Seiten nennen vier Stufen: mittlere Auslastung, hohe Auslastung, nur wenige Plaetze uebrig, ausverkauft.
# Gedacht fuer einen taeglichen Lauf. build-data.ps1 uebernimmt die Daten in data.js.

$tools = $PSScriptRoot
. (Join-Path $tools 'gemeinsam.ps1')
. (Join-Path $tools 'quellen/cinecitta.ps1')
$ziel = Join-Path (Resolve-Path "$tools/../daten").Path 'auslastung.json'
$heute = (Get-Heute).ToString('yyyy-MM-dd')

$vorstellungen = New-Object System.Collections.Generic.List[object]
$fehler = @()
foreach ($erg in @(Get-CinecittaProgramme)) {
  if (-not $erg.Ok) { $fehler += "$($erg.Kino): $($erg.Fehler)"; continue }
  foreach ($v in $erg.Vorstellungen) {
    if ($v.Datum -lt $heute -or $v.Stufe -notin @('hoch', 'wenige', 'ausverkauft')) { continue }
    $link = if ($v.Performance -and $v.Center) { "https://iframe.cineorder.cinecitta.de/landingpage?center=$($v.Center)&page=seatingplan&performance=$($v.Performance)&language=de" } else { $erg.Url }
    $vorstellungen.Add([ordered]@{ Kino = $erg.Kino; Titel = Get-BereinigterTitel $v.Titel; Datum = $v.Datum; Zeit = $v.Zeit; Stufe = $v.Stufe; Link = $link })
  }
}
if ($fehler.Count -eq 4) { throw "Auslastung: keine Seite lesbar. $($fehler -join ' | ')" }

$sortiert = @($vorstellungen | Sort-Object { $_.Datum }, { $_.Zeit }, { $_.Kino }, { $_.Titel })
$inhalt = [ordered]@{ stand = $heute; vorstellungen = $sortiert }
[IO.File]::WriteAllText($ziel, ($inhalt | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding $false))
"Auslastung: $($sortiert.Count) Vorstellungen ab hoher Auslastung" + $(if ($fehler) { ", Fehler: $($fehler -join ' | ')" } else { '' })
$sortiert | Group-Object { $_.Stufe } | ForEach-Object { "  $($_.Name): $($_.Count)" }
