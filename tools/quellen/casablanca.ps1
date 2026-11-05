# Ausleser fuer das Casablanca Nuernberg.
# Die Seite /gesamtprogramm bettet alle Termine als JSON ein (WordPress-Kalender): "title", "start" (UTC) und
# unter "wcs_instructor" eine Zeile wie "ES/FR 2026 | R: Javier Ambrossi & Javier Calvo | 159 Min. | OmU".
# Den Ticketdienst kinoheld lesen wir bewusst nicht aus, dessen robots.txt sperrt automatische Abrufe.

function ConvertFrom-JsonText([string]$Roh) { return ('"' + $Roh + '"' | ConvertFrom-Json) }

# ---------- Programmflyer als PDF (brauchen pdftotext aus Poppler) ----------
# Der Wochenflyer enthaelt das komplette Tagesprogramm einer Woche als Tabelle. Mit "pdftotext -layout"
# bleiben die Spalten erhalten. Die Uhrzeiten stehen nicht genau unter den Tageskoepfen, ihre Spalten sind
# aber bei allen Filmen gleich. Deshalb werden die Spalten aus Filmen abgeleitet, die an allen 7 Tagen laufen.
# Der Block "Sonderprogramm" wird nicht ausgewertet, dort passen die Positionen nicht zuverlaessig.
# Das Monatsprogramm hat eine Liste "Do, 5.11., 19:00 [Reihe] Titel 28" mit ausgeschriebenem Datum.

function Get-PdfToText {
  $befehl = Get-Command pdftotext -ErrorAction SilentlyContinue
  if ($befehl) { return $befehl.Source }
  if ($env:LOCALAPPDATA) {
    $f = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Microsoft/WinGet/Packages') -Recurse -Filter pdftotext.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f) { return $f.FullName }
  }
  return $null
}

function ConvertFrom-Pdf([string]$Url, [string[]]$Optionen) {
  $exe = Get-PdfToText
  if (-not $exe) { throw 'pdftotext ist nicht installiert (Paket Poppler bzw. poppler-utils).' }
  $pdf = [IO.Path]::GetTempFileName(); $txt = "$pdf.txt"
  try {
    Invoke-WebRequest -Uri $Url -OutFile $pdf -UseBasicParsing -UserAgent $script:UserAgent -TimeoutSec 60
    & $exe @Optionen -enc UTF-8 $pdf $txt 2>$null
    if (-not (Test-Path $txt)) { throw "pdftotext konnte $Url nicht lesen." }
    return @(Get-Content $txt -Encoding UTF8)
  } finally { Remove-Item $pdf, $txt -ErrorAction SilentlyContinue }
}

function Read-CasablancaWochenflyer([string[]]$Zeilen) {
  # Jahr und Tage aus dem Kopf: "5. bis 11. November 2026" und "Do 5.11. Fr 6.11. ..."
  $jahr = [int]([regex]::Match(($Zeilen -join ' '), '\b(20\d{2})\b').Groups[1].Value)
  $kopf = $Zeilen | Where-Object { ([regex]::Matches($_, '\b\p{L}{2}\s+\d{1,2}\.\d{1,2}\.')).Count -ge 7 } | Select-Object -First 1
  if (-not $kopf) { throw 'Kopfzeile mit den Tagen nicht gefunden.' }
  $tage = @([regex]::Matches($kopf, '\b\p{L}{2}\s+(\d{1,2})\.(\d{1,2})\.') | ForEach-Object { ConvertTo-IsoDatum ([int]$_.Groups[1].Value) ([int]$_.Groups[2].Value) $jahr })
  $start = [array]::IndexOf($Zeilen, $kopf) + 1

  # Tabelle endet vor dem Sonderprogramm (erste Zeile mit "[Reihe]") bzw. der Saal-Legende
  $tabelle = New-Object System.Collections.Generic.List[string]
  for ($i = $start; $i -lt $Zeilen.Count; $i++) {
    if ($Zeilen[$i] -match '\[[^\]]+\]|Kino ?1 \(|Sonderprogramm') { break }
    $tabelle.Add($Zeilen[$i])
  }
  $zeitMuster = '\b\d{1,2}:\d{2}\b'
  $randLinks = 48   # Uhrzeiten stehen rechts davon (ab etwa Zeichen 50), Titel, Woche, Laenge und FSK links

  # Spaltenpositionen aus Zeilen mit genau so vielen Uhrzeiten wie Tagen
  $voll = @($tabelle | ForEach-Object { , @([regex]::Matches($_, $zeitMuster) | Where-Object { $_.Index -ge $randLinks } | ForEach-Object Index) } | Where-Object { $_.Count -eq $tage.Count })
  if (-not $voll.Count) { throw 'Keine Zeile mit Vorstellungen an allen Tagen gefunden, Spalten nicht bestimmbar.' }
  $spalten = for ($j = 0; $j -lt $tage.Count; $j++) { $werte = @($voll | ForEach-Object { $_[$j] } | Sort-Object); $werte[[int]($werte.Count / 2)] }

  # Filmbloecke enden mit der FSK-Zeile ("ab 12", "ab 0", "ab")
  $termine = New-Object System.Collections.Generic.List[object]
  $block = New-Object System.Collections.Generic.List[string]
  foreach ($z in $tabelle) {
    $block.Add($z)
    $links = if ($z.Length -gt $randLinks) { $z.Substring(0, $randLinks) } else { $z }
    if ($links -notmatch '\bab\s*\d*\s*$') { continue }
    $titel = (($block | ForEach-Object {
      $l = if ($_.Length -gt $randLinks) { $_.Substring(0, $randLinks) } else { $_ }
      $l = [regex]::Replace($l, '\b(NEU|\d+\.\s*W\.|\d*\s*Min\.|ab\s*\d*)\s*', ' ')
      $l.Trim()
    } | Where-Object { $_ }) -join ' ')
    $titel = ([regex]::Replace($titel, '\s+(K|Ü|3D|OV|OmU)(?=\s|$)', '')).Trim() -replace '\s+', ' '
    $tageMitVorstellung = @{}
    foreach ($b in $block) {
      foreach ($m in [regex]::Matches($b, $zeitMuster) | Where-Object { $_.Index -ge $randLinks }) {
        $naechste = 0
        for ($j = 1; $j -lt $spalten.Count; $j++) { if ([math]::Abs($m.Index - $spalten[$j]) -lt [math]::Abs($m.Index - $spalten[$naechste])) { $naechste = $j } }
        $tageMitVorstellung[$tage[$naechste]] = $true
      }
    }
    if ($titel) { foreach ($d in $tageMitVorstellung.Keys) { $termine.Add([pscustomobject]@{ Titel = $titel; Datum = $d }) } }
    $block.Clear()
  }
  return [pscustomobject]@{ Tage = $tage; Termine = $termine }
}

function Read-CasablancaMonatsprogramm([string[]]$Zeilen) {
  $jahr = [int]([regex]::Match(($Zeilen -join ' '), '\b(20\d{2})\b').Groups[1].Value)
  $muster = '^\s*\p{L}{2},\s*(\d{1,2})\.(\d{1,2})\.,\s*\d{1,2}:\d{2}\s*(?:\[[^\]]*\])?\s*(.*?)\s*(\d{1,3})?\s*$'
  for ($i = 0; $i -lt $Zeilen.Count; $i++) {
    $m = [regex]::Match($Zeilen[$i], $muster)
    if (-not $m.Success) { continue }
    $titel = $m.Groups[3].Value
    # Steht nur die Reihe in der Zeile, folgt der Titel in der naechsten
    if (-not $titel -and $i + 1 -lt $Zeilen.Count) { $titel = ($Zeilen[$i + 1] -replace '\s+\d{1,3}\s*$', '').Trim() }
    if ($titel) { [pscustomobject]@{ Titel = $titel; Datum = ConvertTo-IsoDatum ([int]$m.Groups[1].Value) ([int]$m.Groups[2].Value) $jahr } }
  }
}

function Get-CasablancaFlyer {
  $erg = New-KinoErgebnis 'Casablanca Nürnberg' 'https://www.casablanca-nuernberg.de/infos/programmflyer'
  try {
    $html = Get-Seite $erg.Url
    $pdfs = @([regex]::Matches($html, 'href="([^"]+\.pdf)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    $heute = (Get-Heute).ToString('yyyy-MM-dd')
    $fenster = New-Object System.Collections.Generic.List[string]
    foreach ($url in $pdfs | Where-Object { $_ -match 'Wochenflyer' }) {
      $w = Read-CasablancaWochenflyer (ConvertFrom-Pdf $url @('-layout'))
      if ($w.Tage[-1] -lt $heute) { continue }   # vergangene Wochen
      $w.Tage | ForEach-Object { $fenster.Add($_) }
      $w.Termine | ForEach-Object { $erg.Termine.Add($_) }
    }
    foreach ($url in $pdfs | Where-Object { $_ -match 'Monatsprogramm' }) {
      Read-CasablancaMonatsprogramm (ConvertFrom-Pdf $url @('-f', '1', '-l', '6')) | ForEach-Object { $erg.Termine.Add($_) }
    }
    if (-not $fenster.Count) { throw 'Kein aktueller Wochenflyer gefunden.' }
    $sortiert = $fenster | Sort-Object
    # Vollstaendig abgeglichen wird nur die Woche, die der Flyer abdeckt
    $erg.Von = $sortiert[0]; $erg.Bis = $sortiert[-1]; $erg.Ok = $true
  } catch { $erg.Fehler = $_.Exception.Message }
  $erg
}

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
