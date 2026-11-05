# Ausleser fuer das Casablanca Nuernberg.
# Die Seite /gesamtprogramm bettet alle Termine als JSON ein (WordPress-Kalender): "title", "start" (UTC) und
# unter "wcs_instructor" eine Zeile wie "ES/FR 2026 | R: Javier Ambrossi & Javier Calvo | 159 Min. | OmU".
# Den Ticketdienst kinoheld lesen wir bewusst nicht aus, dessen robots.txt sperrt automatische Abrufe.

function ConvertFrom-JsonText([string]$Roh) { return ('"' + $Roh + '"' | ConvertFrom-Json) }

function Get-CasablancaProgramm {
  $erg = New-KinoErgebnis 'Casablanca Nürnberg' 'https://www.casablanca-nuernberg.de/gesamtprogramm'
  try {
    $html = Get-Seite $erg.Url
    $berlin = [TimeZoneInfo]::FindSystemTimeZoneById($(if ($IsLinux -or $IsMacOS) { 'Europe/Berlin' } else { 'W. Europe Standard Time' }))
    foreach ($m in [regex]::Matches($html, '(?s)\{"title":"((?:[^"\\]|\\.)*)","id":\d+,(.*?)"start":"([^"]+)"')) {
      $titel = [System.Net.WebUtility]::HtmlDecode((ConvertFrom-JsonText $m.Groups[1].Value))
      # Reihen-Vorsatz wie "[Special]" oder "[Preview]" abtrennen
      $titel = ([regex]::Replace($titel, '^\s*\[[^\]]*\]\s*', '')).Trim()
      $beginn = [DateTimeOffset]::Parse($m.Groups[3].Value, [Globalization.CultureInfo]::InvariantCulture)
      $datum = [TimeZoneInfo]::ConvertTime($beginn, $berlin).ToString('yyyy-MM-dd')
      $jahr = $null; $regie = $null
      $info = [regex]::Match($m.Groups[2].Value, '"wcs_instructor":\[\{[^\]]*?"name":"((?:[^"\\]|\\.)*)"')
      if ($info.Success) {
        $zeile = [System.Net.WebUtility]::HtmlDecode((ConvertFrom-JsonText $info.Groups[1].Value))
        $j = [regex]::Match($zeile, '\b(19|20)\d{2}\b'); if ($j.Success) { $jahr = $j.Value }
        $r = [regex]::Match($zeile, '\bR:\s*([^|]+)'); if ($r.Success) { $regie = ($r.Groups[1].Value.Trim() -replace '\s*&\s*', ', ') }
      }
      if ($titel) { $erg.Termine.Add([pscustomobject]@{ Titel = $titel; Datum = $datum; Jahr = $jahr; Regie = $regie }) }
    }
    if (-not $erg.Termine.Count) {
      $seitentitel = ConvertFrom-Html ([regex]::Match($html, '(?s)<title>(.*?)</title>').Groups[1].Value)
      throw "Keine Vorstellungen gefunden (Seite: $($html.Length) Zeichen, Titel: '$seitentitel'). Hat sich der Aufbau der Seite geaendert?"
    }
    # Das Gesamtprogramm fuehrt nicht jede Vorstellung der laufenden Filme. Deshalb nur ergaenzen, nichts entfernen:
    # Ein Fenster, das nur den Abfragetag umfasst, schuetzt alle spaeteren Bestandstermine.
    $heute = (Get-Heute).ToString('yyyy-MM-dd')
    $erg.Von = $heute; $erg.Bis = $heute; $erg.Ok = $true
  } catch { $erg.Fehler = $_.Exception.Message }
  $erg
}
