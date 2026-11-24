# Ausleser fuer das Kinopolis HafenCity Hamburg.
# Die Seite /hh/programm zeigt je Film einen Block mit Titel (h2 "hl--1 hidden-max-xs"), Angaben wie
# "Produktionsjahr: 2026" und darunter die Spieltage als "prog-nav__day" ("So.  29.11."). robots.txt erlaubt alles.

function Get-KinopolisProgramm {
  $url = 'https://www.kinopolis.de/hh/programm'
  $erg = New-KinoErgebnis 'Kinopolis HafenCity' $url
  try {
    $html = Get-Seite $url
    $bloecke = $html -split '<h2 class="hl--1 hidden-max-xs">'
    $einmal = @{}
    foreach ($b in $bloecke | Select-Object -Skip 1) {
      $m = [regex]::Match($b, 'class="hl-link">([^<]+)</a>')
      if (-not $m.Success) { continue }
      $titel = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value).Trim()
      $jahr = [regex]::Match($b, 'Produktionsjahr:</span>\s*(\d{4})').Groups[1].Value
      # Tage als "So.  29.11." oder als "Heute" und "Morgen"
      foreach ($t in [regex]::Matches($b, 'prog-nav__day">\s*(?:(Heute|Morgen)|\p{L}+\.?\s+(\d{1,2})\.(\d{1,2})\.)')) {
        $datum = if ($t.Groups[1].Value -eq 'Heute') { (Get-Heute).ToString('yyyy-MM-dd') }
          elseif ($t.Groups[1].Value -eq 'Morgen') { (Get-Heute).AddDays(1).ToString('yyyy-MM-dd') }
          else { ConvertTo-IsoDatum ([int]$t.Groups[2].Value) ([int]$t.Groups[3].Value) }
        $s = "$titel|$datum"
        if ($einmal.ContainsKey($s)) { continue }
        $einmal[$s] = $true
        $erg.Termine.Add([pscustomobject]@{ Titel = $titel; Datum = $datum; Jahr = $(if ($jahr) { $jahr } else { $null }) })
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
