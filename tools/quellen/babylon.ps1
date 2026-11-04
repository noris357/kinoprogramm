# Ausleser fuer das Babylon Fuerth.
# Jede Tagesseite /de/schedule/day/<JJJJ-MM-TT> enthaelt die Vorstellungen als schema.org "ScreeningEvent" (JSON-LD).

function Read-ScreeningEvents([string]$Html) {
  foreach ($block in [regex]::Matches($Html, '(?s)<script type="application/ld\+json">(.*?)</script>')) {
    try { $obj = $block.Groups[1].Value | ConvertFrom-Json } catch { continue }
    if ($obj.'@type' -ne 'ScreeningEvent') { continue }
    # Datum direkt aus dem Text lesen: PowerShell 7 wuerde startDate sonst in UTC-Zeit umrechnen
    $datum = [regex]::Match($block.Groups[1].Value, '"startDate"\s*:\s*"(\d{4}-\d\d-\d\d)')
    if (-not $datum.Success) { continue }
    $titel = if ($obj.workPresented.name) { $obj.workPresented.name } else { $obj.name }
    [pscustomobject]@{ Titel = [System.Net.WebUtility]::HtmlDecode($titel).Trim(); Datum = $datum.Groups[1].Value }
  }
}

function Get-BabylonProgramm {
  $basis = 'https://www.babylon-kino-fuerth.de'
  $erg = New-KinoErgebnis 'Babylon Fürth' "$basis/de"
  try {
    $start = Get-Seite $erg.Url
    $heute = (Get-Heute).ToString('yyyy-MM-dd')
    $tage = @([regex]::Matches($start, 'href="/de/schedule/day/(\d{4}-\d\d-\d\d)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -ge $heute } | Sort-Object -Unique)
    if (-not $tage.Count) { throw 'Keine Tagesnavigation gefunden.' }
    $alle = foreach ($d in $tage) { Read-ScreeningEvents (Get-Seite "$basis/de/schedule/day/$d") | Where-Object { $_.Datum -eq $d } }
    $echt = @($alle | Sort-Object Titel, Datum -Unique)
    if (-not $echt.Count) { throw 'Keine Vorstellungen gefunden. Hat sich der Aufbau der Seite geaendert?' }
    $echt | ForEach-Object { $erg.Termine.Add($_) }
    $erg.Von = $tage[0]; $erg.Bis = $tage[-1]; $erg.Ok = $true
  } catch { $erg.Fehler = $_.Exception.Message }
  $erg
}
