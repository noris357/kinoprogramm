# Ausleser fuer Cineplex Fuerth aus einer im Browser gespeicherten Seite.
# cineplex.de sperrt automatische Abrufe. Deshalb speicherst du die Seite https://www.cineplex.de/fuerth
# im Browser (Strg+S, "Webseite, nur HTML") und legst sie in den Ordner eingang/.
# Die Seite enthaelt die Programmdaten als maskiertes JSON: "movieTitle", darunter "performances" mit
# "performanceDateAndTime" (deutsche Zeit) und "centerName".
# Eine gespeicherte Seite kann veraltet sein. Deshalb werden Termine nur ergaenzt, nie entfernt.
# Vergangene Tage uebernimmt der Abgleich ohnehin nicht.

function Get-CineplexAusEingang {
  $eingang = Join-Path (Resolve-Path "$PSScriptRoot/../..").Path 'eingang'
  $zuordnung = [ordered]@{ 'Cineplex Fürth' = 'Cineplex Fürth' }
  foreach ($center in $zuordnung.Keys) {
    $erg = New-KinoErgebnis $zuordnung[$center] 'eingang/ (gespeicherte Seite von cineplex.de)'
    try {
      $dateien = @(Get-ChildItem $eingang -Filter '*.htm*' -File -ErrorAction SilentlyContinue)
      if (-not $dateien.Count) { throw 'Keine gespeicherte Seite im Ordner eingang/.' }
      foreach ($d in $dateien) {
        $roh = [IO.File]::ReadAllText($d.FullName, [Text.Encoding]::UTF8)
        if ($roh -notmatch 'performanceDateAndTime') { continue }
        $text = $roh.Replace('\"', '"')
        # Vorstellungen der Reihe nach dem zuletzt genannten Film zuordnen
        $titel = $null
        foreach ($m in [regex]::Matches($text, '"movieTitle":"((?:[^"\\]|\\.)*)"|"performanceDateAndTime":"(\d{4}-\d\d-\d\d)T[^"]*","auditoriumName":"[^"]*","centerName":"([^"]*)"')) {
          if ($m.Groups[1].Success) { $titel = [System.Net.WebUtility]::HtmlDecode(($m.Groups[1].Value -replace '\\u0026', '&')); continue }
          if ($titel -and $m.Groups[3].Value -eq $center) { $erg.Termine.Add([pscustomobject]@{ Titel = $titel; Datum = $m.Groups[2].Value }) }
        }
      }
      if (-not $erg.Termine.Count) { throw "Keine Vorstellungen fuer $center in den gespeicherten Seiten." }
      $eindeutig = @($erg.Termine | Sort-Object Titel, Datum -Unique)
      $erg.Termine.Clear(); $eindeutig | ForEach-Object { $erg.Termine.Add($_) }
      # Nur ergaenzen: Fenster nur ueber den Abfragetag
      $heute = (Get-Heute).ToString('yyyy-MM-dd')
      $erg.Von = $heute; $erg.Bis = $heute; $erg.Ok = $true
    } catch { $erg.Fehler = $_.Exception.Message }
    $erg
  }
}
