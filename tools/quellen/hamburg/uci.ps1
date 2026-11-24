# Ausleser fuer die UCI-Kinos in Hamburg (Mundsburg, Wandsbek).
# Die Posteransicht /kinoprogramm/<kennung>/<id>/poster enthaelt alle Vorstellungen im HTML:
# je Vorstellung ein Link mit data-tracking-date="JJJJ-MM-TT" und data-tracking-film-id, den Titel liefert
# der Filmlink /film/<name>/<film-id>/<kennung>/<id>. robots.txt erlaubt alles.

$script:UciKinos = @(
  @{ Kino = 'UCI Hamburg-Mundsburg'; Kennung = 'hh-mundsburg'; Id = 52 }
  @{ Kino = 'UCI Hamburg-Wandsbek'; Kennung = 'hh-wandsbek-smart-city'; Id = 54 }
)

function Get-UciProgramme {
  foreach ($k in $script:UciKinos) {
    $url = "https://www.uci-kinowelt.de/kinoprogramm/$($k.Kennung)/$($k.Id)/poster"
    $erg = New-KinoErgebnis $k.Kino $url
    try {
      $html = Get-Seite $url
      $titel = @{}
      foreach ($m in [regex]::Matches($html, 'href="/film/[^/"]+/(\d+)/[^"]*">([^<]+)</a>')) {
        if (-not $titel.ContainsKey($m.Groups[1].Value)) { $titel[$m.Groups[1].Value] = [System.Net.WebUtility]::HtmlDecode($m.Groups[2].Value).Trim() }
      }
      $einmal = @{}
      foreach ($m in [regex]::Matches($html, '(?s)data-tracking-date="(\d{4}-\d\d-\d\d)".{0,400}?data-tracking-film-id="(\d+)"')) {
        $t = $titel[$m.Groups[2].Value]
        if (-not $t) { continue }
        $s = "$t|$($m.Groups[1].Value)"
        if ($einmal.ContainsKey($s)) { continue }
        $einmal[$s] = $true
        $erg.Termine.Add([pscustomobject]@{ Titel = $t; Datum = $m.Groups[1].Value })
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
