# Ausleser fuer die Lamm-Lichtspiele Erlangen.
# Jeder Film steht in <article class="movie" data-play-dates="[...]"> mit den Spieltagen als Liste.

function Get-LammProgramm {
  $erg = New-KinoErgebnis 'Lamm-Lichtspiele Erlangen' 'https://www.lamm-lichtspiele.de/'
  try {
    $html = Get-Seite $erg.Url
    $alleTage = New-Object System.Collections.Generic.List[string]
    foreach ($art in [regex]::Matches($html, '(?s)<article class="movie"[^>]*data-play-dates="([^"]*)"[^>]*>(.*?)</article>')) {
      $tage = @([regex]::Matches([System.Net.WebUtility]::HtmlDecode($art.Groups[1].Value), '\d{4}-\d\d-\d\d') | ForEach-Object Value)
      $kopf = [regex]::Match($art.Groups[2].Value, '(?s)<h[1-4][^>]*>(.*?)</h[1-4]>')
      if (-not $kopf.Success) { continue }
      $titel = ConvertFrom-Html $kopf.Groups[1].Value
      foreach ($d in $tage) { $erg.Termine.Add([pscustomobject]@{ Titel = $titel; Datum = $d }); $alleTage.Add($d) }
    }
    if (-not $erg.Termine.Count) { throw 'Keine Vorstellungen gefunden. Hat sich der Aufbau der Seite geaendert?' }
    $sortiert = $alleTage | Sort-Object
    $erg.Von = $sortiert[0]; $erg.Bis = $sortiert[-1]; $erg.Ok = $true
  } catch { $erg.Fehler = $_.Exception.Message }
  $erg
}
