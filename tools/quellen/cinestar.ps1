# Ausleser fuer das CineStar Erlangen.
# Die Website laedt das Programm aus /api/cinema/<id>/show/: je Film "title" und "showtimes" mit "datetime"
# in Ortszeit, z. B. "2026-11-05 17:00 CET". Erlangen hat die Kino-ID 19.

function Get-CineStarProgramm {
  $erg = New-KinoErgebnis 'CineStar Erlangen' 'https://www.cinestar.de/api/cinema/19/show/'
  try {
    # Windows PowerShell 5.1 gibt ein JSON-Array als ein einzelnes Objekt zurueck, daher ausrollen
    $filme = @(Invoke-RestMethod -Uri $erg.Url -UserAgent $script:UserAgent -TimeoutSec 40 | ForEach-Object { $_ })
    foreach ($f in $filme) {
      if (-not $f.title) { continue }
      foreach ($s in @($f.showtimes)) {
        $d = [regex]::Match([string]$s.datetime, '^\d{4}-\d\d-\d\d')
        if ($d.Success) { $erg.Termine.Add([pscustomobject]@{ Titel = [string]$f.title; Datum = $d.Value }) }
      }
    }
    if (-not $erg.Termine.Count) { throw 'Keine Vorstellungen gefunden. Hat sich die Schnittstelle geaendert?' }
    $eindeutig = @($erg.Termine | Sort-Object Titel, Datum -Unique)
    $erg.Termine.Clear(); $eindeutig | ForEach-Object { $erg.Termine.Add($_) }
    $daten = $eindeutig | ForEach-Object Datum | Sort-Object
    $erg.Von = (Get-Heute).ToString('yyyy-MM-dd'); $erg.Bis = $daten[-1]; $erg.Ok = $true
  } catch { $erg.Fehler = $_.Exception.Message }
  $erg
}
