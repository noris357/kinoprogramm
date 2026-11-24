# Ausleser fuer die vier Hamburger Kinos der Filmtheaterbetriebe Jansen (gleiche Website-Plattform):
# Studio-Kino, Elbe-Kino, Blankeneser Kino, Koralle-Kino.
# Die Startseite enthaelt je Film einen Block <div class="ftbj-schedule-teaser" data-play-dates="[...]"> mit
# allen Spieltagen und dem Titel als Link "ftbj-schedule-teaser-title". robots.txt sperrt nur /api/ und /show/,
# die Startseite ist erlaubt.

$script:JansenKinos = @(
  @{ Kino = 'Studio-Kino Hamburg'; Url = 'https://www.studio-kino.de/' }
  @{ Kino = 'Elbe-Kino Hamburg'; Url = 'https://www.elbe-kino.de/' }
  @{ Kino = 'Blankeneser Kino'; Url = 'https://www.blankeneserkino.de/' }
  @{ Kino = 'Koralle-Kino Hamburg'; Url = 'https://www.korallekino.de/' }
)

function Get-JansenProgramme {
  foreach ($k in $script:JansenKinos) {
    $erg = New-KinoErgebnis $k.Kino $k.Url
    try {
      $html = Get-Seite $k.Url
      $einmal = @{}
      # Titel steht im Link, teils noch in einer Ueberschrift darin: <a class="ftbj-schedule-teaser-title" ...><h2 ...>Titel</h2>
      foreach ($m in [regex]::Matches($html, '(?s)data-play-dates="([^"]*)"[^>]*>.*?ftbj-schedule-teaser-title"[^>]*>(?:\s*<[^>]+>)*\s*([^<]+)<')) {
        $tage = $m.Groups[1].Value
        $titel = [System.Net.WebUtility]::HtmlDecode($m.Groups[2].Value).Trim()
        foreach ($d in [regex]::Matches([System.Net.WebUtility]::HtmlDecode($tage), '\d{4}-\d\d-\d\d')) {
          $s = "$titel|$($d.Value)"
          if ($einmal.ContainsKey($s)) { continue }
          $einmal[$s] = $true
          $erg.Termine.Add([pscustomobject]@{ Titel = $titel; Datum = $d.Value })
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
