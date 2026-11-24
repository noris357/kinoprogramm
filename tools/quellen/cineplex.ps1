# Ausleser fuer Cineplex Fuerth aus einer im Browser gespeicherten Seite.
# cineplex.de sperrt automatische Abrufe. Deshalb speicherst du die Seite https://www.cineplex.de/fuerth
# im Browser (Strg+S, "Webseite, nur HTML") und legst sie in den Ordner eingang/.
# Die Seite enthaelt die Programmdaten als maskiertes JSON: "movieTitle", darunter "performances" mit
# "performanceDateAndTime" (deutsche Zeit) und "centerName".
# Eine gespeicherte Seite kann veraltet sein. Deshalb werden Termine nur ergaenzt, nie entfernt.
# Vergangene Tage uebernimmt der Abgleich ohnehin nicht.

# Das regulaere Programm kommt automatisch ueber Cineamo (cineamo.ps1). Liegt keine gespeicherte Seite vor,
# liefert diese Quelle gar nichts (kein Fehler), damit Cineamo allein das Zeitfenster bestimmt.
# Quellen: der Ordner eingang/ (am Rechner gespeichert) und ein per Link freigegebener Google-Drive-Ordner,
# in den du die Seite vom iPhone aus ablegst (Safari > Teilen > Optionen > Webarchiv > In "Dateien" sichern).
# Die Kennung des Drive-Ordners steht im GitHub-Secret CINEPLEX_DRIVE_ORDNER (Umgebungsvariable), nicht im Code.
# Dateien: gespeicherte Seiten (.htm, .html) und Safari-Webarchive (.webarchive, die Seite steht darin
# unverschluesselt). Nur Dateien der letzten 14 Tage, aeltere Staende koennten abgesagte Vorstellungen enthalten.

# Liste des freigegebenen Drive-Ordners ueber die oeffentliche Ordneransicht, Download ohne Anmeldung.
# Aenderungsdatum dort: Uhrzeit ("11:14 pm") fuer heute, "Nov 21" in diesem Jahr, "11/21/25" frueher.
function Get-CineplexDriveDateien([string]$Ordner, [datetime]$Grenze) {
  $liste = Get-Seite "https://drive.google.com/embeddedfolderview?id=$Ordner"
  $ziel = Join-Path ([IO.Path]::GetTempPath()) 'kinoprogramm-drive'
  if (-not (Test-Path $ziel)) { New-Item -ItemType Directory $ziel | Out-Null }
  $kultur = [Globalization.CultureInfo]::InvariantCulture
  foreach ($m in [regex]::Matches($liste, '(?s)id="entry-([A-Za-z0-9_-]+)".*?flip-entry-title">([^<]+)<.*?flip-entry-last-modified"><div>([^<]+)<')) {
    $id = $m.Groups[1].Value; $name = [System.Net.WebUtility]::HtmlDecode($m.Groups[2].Value); $stand = $m.Groups[3].Value.Trim()
    if ($name -notmatch '\.(html?|webarchive)$') { continue }
    $datum = $null
    if ($stand -match '^\d{1,2}:\d{2}\s*[ap]m$') { $datum = (Get-Date).Date }
    elseif ([datetime]::TryParseExact($stand, 'MMM d', $kultur, 'None', [ref]$datum)) { $datum = $datum.AddYears((Get-Date).Year - $datum.Year); if ($datum -gt (Get-Date)) { $datum = $datum.AddYears(-1) } }
    elseif (-not [datetime]::TryParseExact($stand, 'M/d/yy', $kultur, 'None', [ref]$datum)) { $datum = $null }
    if (-not $datum -or $datum -lt $Grenze.Date) { continue }
    $datei = Join-Path $ziel ($id + [IO.Path]::GetExtension($name))
    Invoke-WebRequest -Uri "https://drive.usercontent.google.com/download?id=$id&export=download" -OutFile $datei -UseBasicParsing -TimeoutSec 120 -UserAgent $script:UserAgent
    Start-Sleep -Milliseconds 800
    Get-Item $datei
  }
}
function Get-CineplexDateien {
  $grenze = (Get-Date).AddDays(-14)
  $eingang = Join-Path (Resolve-Path "$PSScriptRoot/../..").Path 'eingang'
  if (Test-Path $eingang) {
    Get-ChildItem -LiteralPath $eingang -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '^\.(html?|webarchive)$' -and $_.LastWriteTime -ge $grenze }
  }
  if ($env:CINEPLEX_DRIVE_ORDNER) {
    try { Get-CineplexDriveDateien $env:CINEPLEX_DRIVE_ORDNER $grenze } catch { Write-Warning "Drive-Ordner nicht lesbar: $($_.Exception.Message)" }
  }
}
function Get-CineplexAusEingang {
  $dateien = @(Get-CineplexDateien)
  if (-not $dateien.Count) { return }
  $zuordnung = [ordered]@{ 'Cineplex Fürth' = 'Cineplex Fürth' }
  foreach ($center in $zuordnung.Keys) {
    $erg = New-KinoErgebnis $zuordnung[$center] 'gespeicherte Seite von cineplex.de (eingang/ oder Drive-Ordner)'
    try {
      foreach ($d in $dateien) {
        $roh = [IO.File]::ReadAllText($d.FullName, [Text.Encoding]::UTF8)
        if ($roh -notmatch 'performanceDateAndTime') { continue }
        $text = $roh.Replace('\"', '"')
        # Filmseiten stehen in der Seite als cineplex.de/fuerth/film/<name>-<Filmkennung>, die Kennung auch je Film
        # als "movieWinTicketFilmId". Daraus wird der Link je Film.
        $seiten = @{}
        foreach ($s in [regex]::Matches($text, '(https://www\.cineplex\.de/fuerth/film/[a-z0-9-]+-([A-Z0-9]{18}))')) { $seiten[$s.Groups[2].Value] = $s.Groups[1].Value }
        # Vorstellungen der Reihe nach dem zuletzt genannten Film zuordnen
        $titel = $null; $link = $null
        foreach ($m in [regex]::Matches($text, '"movieTitle":"((?:[^"\\]|\\.)*)"|"movieWinTicketFilmId":"([A-Z0-9]+)"|"performanceDateAndTime":"(\d{4}-\d\d-\d\d)T[^"]*","auditoriumName":"[^"]*","centerName":"([^"]*)"')) {
          if ($m.Groups[1].Success) { $titel = [System.Net.WebUtility]::HtmlDecode(($m.Groups[1].Value -replace '\\u0026', '&')); $link = $null; continue }
          if ($m.Groups[2].Success) { $link = $seiten[$m.Groups[2].Value]; continue }
          # Im Webarchiv kann der Name anders kodiert sein, deshalb "F.rth"
          if ($titel -and ($m.Groups[4].Value -replace 'F.{1,2}rth', 'Fürth') -eq $center) { $erg.Termine.Add([pscustomobject]@{ Titel = $titel; Datum = $m.Groups[3].Value; Link = $link }) }
        }
      }
      if (-not $erg.Termine.Count) { throw "Keine Vorstellungen fuer $center in den gespeicherten Seiten." }
      $eindeutig = @($erg.Termine | Sort-Object Titel, Datum -Unique)
      $erg.Termine.Clear(); $eindeutig | ForEach-Object { $erg.Termine.Add($_) }
      # Nur ergaenzen: Fenster nur ueber den Abfragetag
      $heute = (Get-Heute).ToString('yyyy-MM-dd')
      $erg.Von = $heute; $erg.Bis = $heute; $erg.Ok = $true
    } catch { $erg.Fehler = $_.Exception.Message }
    $erg
  }
}
