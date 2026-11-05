# Erzeugt website/data.js aus dem Bestand website/daten/programm.json
# (falls noch nicht vorhanden, aus Kinoprogramm_entpivotiert.json im Projektordner).
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File website\tools\build-data.ps1
# Die Spalte "Im Kino gesehen?" wird bewusst nicht veroeffentlicht.
# "Laeuft der Film gerade?" wird nicht uebernommen, die Website berechnet den Status selbst.
# Optional: website/daten/filminfos.json mit Plakat, IMDb-Link und Bewertung je "Titel|Produktionsjahr".
# Pfade mit "/" funktionieren unter Windows und unter Linux (GitHub Actions).

param(
  [string]$Quelle    = $(if (Test-Path "$PSScriptRoot/../daten/programm.json") { "$PSScriptRoot/../daten/programm.json" } else { "$PSScriptRoot/../../Kinoprogramm_entpivotiert.json" }),
  [string]$Quellen   = "$PSScriptRoot/../daten/quellen.json",
  [string]$FilmInfos = "$PSScriptRoot/../daten/filminfos.json",
  [string]$Ziel      = "$PSScriptRoot/../data.js"
)

$ErrorActionPreference = 'Stop'
$json = Get-Content $Quelle -Raw -Encoding UTF8 | ConvertFrom-Json

# PowerShell 7 wandelt Datumstexte beim Einlesen teils in DateTime um. Hier immer JJJJ-MM-TT als Text.
function ConvertTo-IsoText($Wert) { if ($Wert -is [datetime]) { $Wert.ToString('yyyy-MM-dd') } else { [string]$Wert } }

$links = @{}
if (Test-Path $Quellen) {
  (Get-Content $Quellen -Raw -Encoding UTF8 | ConvertFrom-Json).kinos | ForEach-Object { $links[$_.bezeichnung_in_excel] = $_.programm_url }
}

$infos = @{}
if (Test-Path $FilmInfos) {
  (Get-Content $FilmInfos -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $infos[$_.Name] = $_.Value }
}

$kinos = New-Object System.Collections.Generic.List[string]
$kinoLinks = New-Object System.Collections.Generic.List[object]
$kinoIndex = @{}
$filme = New-Object System.Collections.Generic.List[object]
$filmIndex = @{}
$termine = New-Object System.Collections.Generic.List[object]

foreach ($z in $json.zeilen) {
  if (-not $z.Datum) { continue }

  if (-not $kinoIndex.ContainsKey($z.Kino)) {
    $kinoIndex[$z.Kino] = $kinos.Count
    $kinos.Add($z.Kino)
    $kinoLinks.Add($links[$z.Kino])
  }

  # Filmidentitaet: Titel plus Produktionsjahr, damit gleichnamige Werke getrennt bleiben
  $schluessel = "$($z.Titel)|$($z.Produktionsjahr)"
  if (-not $filmIndex.ContainsKey($schluessel)) {
    $filmIndex[$schluessel] = $filme.Count
    # Produktionsjahr bleibt Text, es kommen auch Angaben wie 1974/1975 vor
    $jahr = $null
    if ($z.Produktionsjahr) { $jahr = [string]$z.Produktionsjahr }
    $land = $z.Land; $regie = $z.'Regisseur:in'
    $info = $infos[$schluessel]
    $zusatz = $null
    if ($info -and -not $info.nichtGefunden) {
      # Eigene Angaben haben Vorrang. TMDB fuellt nur Luecken.
      if (-not $land -or $land -eq '?') { $land = $info.land }
      if (-not $regie -or $regie -eq '?') { $regie = $info.regie }
      if (-not $jahr) { $jahr = $info.jahr }
      $zusatz = [ordered]@{}
      # Die IMDb-Nummer bleibt in filminfos.json, wird aber vorerst nicht auf der Website genutzt
      foreach ($f in 'poster', 'bewertung', 'tmdb') { if ($info.$f) { $zusatz[$f] = $info.$f } }
    }
    $eintrag = @($z.Titel, $land, $regie, $jahr)
    if ($zusatz) { $eintrag += , $zusatz }
    $filme.Add($eintrag)
  }

  $termine.Add(@($filmIndex[$schluessel], $kinoIndex[$z.Kino], (ConvertTo-IsoText $z.Datum)))
}

$daten = [ordered]@{
  stand     = $(if ($json.stand) { ConvertTo-IsoText $json.stand } else { Get-Date -Format 'yyyy-MM-dd' })
  quelle    = (Split-Path $Quelle -Leaf)
  kinos     = $kinos
  kinoLinks = $kinoLinks
  filme     = $filme
  termine   = $termine
}

$inhalt = "window.KINO_DATA = " + ($daten | ConvertTo-Json -Depth 5 -Compress) + ";"
$zielPfad = Join-Path (Resolve-Path (Split-Path $Ziel)).Path (Split-Path $Ziel -Leaf)
[System.IO.File]::WriteAllText($zielPfad, $inhalt, (New-Object System.Text.UTF8Encoding $false))

$mitInfo = @($filme | Where-Object { $_.Count -gt 4 }).Count
"$($termine.Count) Termine, $($filme.Count) Filme ($mitInfo mit TMDB-Angaben), $($kinos.Count) Kinos -> $zielPfad"
