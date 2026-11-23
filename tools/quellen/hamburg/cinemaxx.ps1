# Ausleser fuer die CinemaxX-Kinos in Hamburg (Dammtor, Wandsbek, Harburg und das Holi, das zu CinemaxX gehoert).
# Die Website laedt das Programm aus einer JSON-Schnittstelle:
#   /api/microservice/showings/showingDates?cinemaId=<id>&minEmbargoLevel=2&forNextWeek=true   -> Spieltage
#   /api/microservice/showings/cinemas/<id>/films?showingDate=<JJJJ-MM-TT>T00:00:00&...        -> Filme mit Vorstellungen
# Je Film: filmTitle, originalTitle, director, releaseDate, runningTime, showingGroups[].sessions[].startTime (Ortszeit).
# robots.txt sperrt nur Buchung und Konto, nicht die Schnittstelle.

$script:CinemaxxBasis = 'https://www.cinemaxx.de'
$script:CinemaxxKinos = [ordered]@{
  '1206' = 'CinemaxX Hamburg-Dammtor'
  '1208' = 'CinemaxX Hamburg-Wandsbek'
  '1207' = 'CinemaxX Hamburg-Harburg'
  '1203' = 'Holi Hamburg'
}

function Get-CinemaxxProgramme {
  foreach ($id in $script:CinemaxxKinos.Keys) {
    $erg = New-KinoErgebnis $script:CinemaxxKinos[$id] "$script:CinemaxxBasis/kinoprogramm/"
    try {
      $tage = @((Get-Seite "$script:CinemaxxBasis/api/microservice/showings/showingDates?cinemaId=$id&minEmbargoLevel=2&forNextWeek=true" | ConvertFrom-Json).result |
        Where-Object { $_.hasShowings } | ForEach-Object { ConvertTo-IsoTag $_.showingDate })
      foreach ($tag in $tage) {
        $antwort = Get-Seite "$script:CinemaxxBasis/api/microservice/showings/cinemas/$id/films?showingDate=${tag}T00:00:00&minEmbargoLevel=3&includesSession=true&includeSessionAttributes=true" | ConvertFrom-Json
        foreach ($f in @($antwort.result)) {
          $sitzungen = @($f.showingGroups | ForEach-Object { $_.sessions } | Where-Object { $_ })
          if (-not $sitzungen.Count) { continue }
          # Spieltag aus der Startzeit (Ortszeit), Spaetvorstellungen nach Mitternacht zaehlen zum Kalendertag
          $daten = @($sitzungen | ForEach-Object { ConvertTo-IsoTag $_.startTime } | Sort-Object -Unique)
          $jahr = $null
          foreach ($datum in $daten) {
            $erg.Termine.Add([pscustomobject]@{ Titel = [string]$f.filmTitle; Datum = $datum; Regie = [string]$f.director; Jahr = $jahr })
          }
        }
      }
      $alle = @($erg.Termine | ForEach-Object Datum | Sort-Object)
      $erg.Von = (Get-Heute).ToString('yyyy-MM-dd')
      $erg.Bis = if ($alle.Count) { $alle[-1] } else { $erg.Von }
      $erg.Ok = $alle.Count -gt 0
      if (-not $erg.Ok) { $erg.Fehler = 'Keine Vorstellungen gefunden' }
    } catch { $erg.Fehler = $_.Exception.Message }
    $erg
  }
}
