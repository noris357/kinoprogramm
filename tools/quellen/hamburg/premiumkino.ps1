# Ausleser fuer die Kinos der Plattform premiumkino.de in Hamburg (Astor Film Lounge HafenCity, Savoy).
# Die Website laedt das ganze Programm aus https://backend.premiumkino.de/v1/de/<kennung>/program:
#   movies[]       id, name, year, country, minutes
#   performances[] movieId, cinemaDay (Spieltag), begin
# Die Schnittstelle ist ohne Anmeldung erreichbar, robots.txt sperrt nur Konto und Verwaltung.

$script:PremiumKinos = [ordered]@{
  'hamburg' = 'Astor Film Lounge HafenCity'
  'savoy'   = 'Savoy Filmtheater Hamburg'
}

function Get-PremiumkinoProgramme {
  foreach ($kennung in $script:PremiumKinos.Keys) {
    $erg = New-KinoErgebnis $script:PremiumKinos[$kennung] "https://$kennung.premiumkino.de/"
    try {
      $p = Get-Seite "https://backend.premiumkino.de/v1/de/$kennung/program" | ConvertFrom-Json
      $filme = @{}
      foreach ($m in @($p.movies)) { $filme[[string]$m.id] = $m }
      foreach ($v in @($p.performances)) {
        $m = $filme[[string]$v.movieId]
        if (-not $m) { continue }
        $tag = ConvertTo-IsoTag $v.cinemaDay
        $jahr = if ("$($m.year)" -match '^\d{4}$') { [string]$m.year } else { $null }
        $land = if ($m.country -is [string] -and $m.country.Length -le 80) { $m.country } else { $null }
        $erg.Termine.Add([pscustomobject]@{ Titel = [string]$m.name; Datum = $tag; Jahr = $jahr; Land = $land })
      }
      # Gleicher Film am gleichen Tag mehrfach (mehrere Vorstellungen): einmal reicht
      $einmal = @{}
      $termine = @($erg.Termine | Where-Object { $s = "$($_.Titel)|$($_.Datum)"; if ($einmal.ContainsKey($s)) { $false } else { $einmal[$s] = $true; $true } })
      $erg.Termine.Clear(); $termine | ForEach-Object { $erg.Termine.Add($_) }
      $alle = @($termine | ForEach-Object Datum | Sort-Object)
      $erg.Von = (Get-Heute).ToString('yyyy-MM-dd')
      $erg.Bis = if ($alle.Count) { $alle[-1] } else { $erg.Von }
      $erg.Ok = $alle.Count -gt 0
      if (-not $erg.Ok) { $erg.Fehler = 'Keine Vorstellungen gefunden' }
    } catch { $erg.Fehler = $_.Exception.Message }
    $erg
  }
}
