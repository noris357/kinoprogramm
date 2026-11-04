# Gemeinsame Hilfsfunktionen fuer die Ausleser der Kinoseiten.
# Laeuft mit Windows PowerShell 5.1 und mit PowerShell 7 (z. B. in GitHub Actions).

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:UserAgent = 'Mozilla/5.0 (compatible; KinoprogrammNuernberg/1.0; privates Hobbyprojekt, woechentlicher Abruf)'

function Get-Seite([string]$Url) {
  # Hoeflich abrufen: ein Abruf pro Seite, kurze Pause danach
  $antwort = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 40 -UserAgent $script:UserAgent
  Start-Sleep -Milliseconds 800
  # Inhalt als UTF-8 lesen, unabhaengig davon, was der Server angibt
  $bytes = $antwort.RawContentStream.ToArray()
  return [Text.Encoding]::UTF8.GetString($bytes)
}

function ConvertFrom-Html([string]$Text) {
  $t = [regex]::Replace($Text, '<[^>]+>', ' ')
  $t = [System.Net.WebUtility]::HtmlDecode($t)
  return ([regex]::Replace($t, '\s+', ' ')).Trim()
}

function Get-Heute {
  # Abfragetag in deutscher Zeit, auch wenn das Skript in UTC laeuft
  $tz = [TimeZoneInfo]::FindSystemTimeZoneById($(if ($IsLinux -or $IsMacOS) { 'Europe/Berlin' } else { 'W. Europe Standard Time' }))
  return [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).Date
}

# "05.11" ohne Jahr: liegt das Datum mehr als 60 Tage zurueck, gehoert es ins naechste Jahr
function ConvertTo-IsoDatum([int]$Tag, [int]$Monat, [Nullable[int]]$Jahr = $null) {
  $heute = Get-Heute
  if (-not $Jahr) {
    $Jahr = $heute.Year
    $d = New-Object DateTime $Jahr, $Monat, $Tag
    if ($d -lt $heute.AddDays(-60)) { $Jahr++ }
  }
  return (New-Object DateTime $Jahr, $Monat, $Tag).ToString('yyyy-MM-dd')
}

# Fassungen und Formate gehoeren nicht zum Filmtitel (Vorgabe: keine eigenen Termine je Fassung)
function Get-BereinigterTitel([string]$Titel) {
  $t = $Titel.Trim()
  # Fassungen am Ende, z. B. "(OV)", " - OmU", "(jap.OmU)", "(Hindi OmU/OmeU)", "(Extended)"
  # Reihenfolge wichtig: zuerst ganze Klammern mit Sprachangabe, sonst bleibt "(jap." stehen
  $hinten = @(
    '\s*\([^)]*\b(?:OmU|OmdU|OmeU|OV)\b[^)]*\)\s*$'
    '\s*(?:[-–|:]\s*)?[\(\[]?\s*(?:OmU|OmdU|OmeU|OmenglU|OV|OF|O\.V\.|engl\.?\s*OV|Original\s*(?:Version|Fassung)|3D|2D|IMAX|Dolby\s*Atmos|D-BOX|4DX|ScreenX|Deutsche\s*Fassung|DF)\s*[\)\]]?\s*$'
    '\s*\((?:Extended|Extended Edition|Director.s Cut)\)\s*$'
    # Reihenzusaetze der Kinos am Ende
    '\s+[-–]\s*(?:Best of Cinema|Seniorenkino|CineSpecial|Anime Nights(?: \d{4})?|Das Kinoerlebnis)\s*$'
  )
  # Reihen und Sonderformate davor, z. B. "CineSpecial: ", "Preview: ", "Mein erster Kinobesuch: "
  $vorne = '^\s*(?:CineSpecial|CineLady(?: Preview| Special)?|Happy Family[- ]Preview|Preview|Vorpremiere|Premiere|Mein erster Kinobesuch|Sneak Preview|Stummfilmmatinee|Jonathans Retroflimmern)\s*:\s+'
  do {
    $vorher = $t
    foreach ($m in $hinten) { $t = [regex]::Replace($t, $m, '', 'IgnoreCase').Trim() }
    $t = [regex]::Replace($t, $vorne, '', 'IgnoreCase').Trim()
  } while ($t -ne $vorher -and $t)
  return $t
}

# Vergleichsschluessel: Kleinbuchstaben, nur Buchstaben und Ziffern
function Get-TitelSchluessel([string]$Titel) {
  $t = (Get-BereinigterTitel $Titel).ToLowerInvariant()
  $t = $t.Replace('ß', 'ss').Replace('&', 'und')
  return [regex]::Replace($t, '[^\p{L}\p{Nd}]', '')
}

# Felder eines HTML-Formulars mit ihren Vorgabewerten (Eingabefelder und ausgewaehlte Optionen)
function Get-FormularFelder([string]$FormHtml) {
  $felder = [ordered]@{}
  foreach ($inp in [regex]::Matches($FormHtml, '<input[^>]*>')) {
    $n = [regex]::Match($inp.Value, 'name="([^"]+)"')
    if (-not $n.Success) { continue }
    $v = [regex]::Match($inp.Value, 'value="([^"]*)"')
    $felder[[System.Net.WebUtility]::HtmlDecode($n.Groups[1].Value)] = if ($v.Success) { [System.Net.WebUtility]::HtmlDecode($v.Groups[1].Value) } else { '' }
  }
  foreach ($sel in [regex]::Matches($FormHtml, '(?s)<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>')) {
    $opt = [regex]::Match($sel.Groups[2].Value, '<option value="([^"]*)"[^>]*selected')
    $felder[[System.Net.WebUtility]::HtmlDecode($sel.Groups[1].Value)] = if ($opt.Success) { [System.Net.WebUtility]::HtmlDecode($opt.Groups[1].Value) } else { '' }
  }
  return $felder
}

function Send-Formular([string]$Url, $Felder, $Sitzung = $null) {
  $koerper = ($Felder.Keys | ForEach-Object { [uri]::EscapeDataString($_) + '=' + [uri]::EscapeDataString([string]$Felder[$_]) }) -join '&'
  $p = @{ Uri = $Url; Method = 'Post'; Body = $koerper; ContentType = 'application/x-www-form-urlencoded; charset=utf-8'; UserAgent = $script:UserAgent; TimeoutSec = 60; UseBasicParsing = $true }
  if ($Sitzung) { $p.WebSession = $Sitzung }
  $antwort = Invoke-WebRequest @p
  Start-Sleep -Milliseconds 800
  return [Text.Encoding]::UTF8.GetString($antwort.RawContentStream.ToArray())
}

# Ergebnis eines Auslesers fuer ein Kino
function New-KinoErgebnis([string]$Kino, [string]$Url) {
  return [pscustomobject]@{ Kino = $Kino; Url = $Url; Ok = $false; Fehler = $null; Von = $null; Bis = $null; Termine = New-Object System.Collections.Generic.List[object] }
}
