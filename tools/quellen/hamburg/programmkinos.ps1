# Ausleser fuer Hamburger Programmkinos mit eigener Website: Abaton, Zeise, 3001, B-Movie, Metropolis, Lichtmess.
# Buchungen laufen dort teils ueber kinoheld. Die kinoheld-Seiten lesen wir nicht, nur die Seiten der Kinos selbst.

# Gemeinsamer Abschluss: Zeitraum setzen und Erfolg pruefen
function Complete-KinoErgebnis($Erg) {
  $alle = @($Erg.Termine | ForEach-Object Datum | Sort-Object)
  $Erg.Von = (Get-Heute).ToString('yyyy-MM-dd')
  $Erg.Bis = if ($alle.Count) { $alle[-1] } else { $Erg.Von }
  $Erg.Ok = $alle.Count -gt 0
  if (-not $Erg.Ok -and -not $Erg.Fehler) { $Erg.Fehler = 'Keine Vorstellungen gefunden' }
  $Erg
}
# Termin nur einmal je Titel und Tag aufnehmen
function Add-Termin($Erg, $Einmal, [string]$Titel, [string]$Datum, $Extra = @{}) {
  $Titel = ConvertFrom-Grossschrift ($Titel.Trim() -replace '\s+', ' ')
  if (-not $Titel -or -not $Datum) { return }
  $s = "$Titel|$Datum"
  if ($Einmal.ContainsKey($s)) { return }
  $Einmal[$s] = $true
  $t = [ordered]@{ Titel = $Titel; Datum = $Datum }
  foreach ($k in $Extra.Keys) { if ($Extra[$k]) { $t[$k] = $Extra[$k] } }
  $Erg.Termine.Add([pscustomobject]$t)
}

# Abaton: Startseite page.pl?index, je Vorstellung versteckte Felder VTitel ('Titel') und VTag (TT.MM.JJJJ). Latin-1.
function Get-AbatonProgramm {
  $url = 'https://www.abaton.de/page.pl?index'
  $erg = New-KinoErgebnis 'Abaton Hamburg' 'https://www.abaton.de/'
  $einmal = @{}
  try {
    $html = Get-SeiteLatin1 $url
    foreach ($m in [regex]::Matches($html, '(?s)name="VTitel" value="''?([^"]*?)''?".{0,200}?name="VTag" value="(\d\d)\.(\d\d)\.(\d{4})"')) {
      $titel = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
      Add-Termin $erg $einmal $titel ('{0}-{1}-{2}' -f $m.Groups[4].Value, $m.Groups[3].Value, $m.Groups[2].Value)
    }
  } catch { $erg.Fehler = $_.Exception.Message }
  Complete-KinoErgebnis $erg
}

# Zeise: Filmseiten /film/<id> mit "Alle Spielzeiten" (<div class='date'>Samstag, 28.11.</div>).
# Die Filme stehen auf der Startseite und den Seiten Kinderprogramm und Demnaechst.
function Get-ZeiseProgramm {
  $basis = 'https://www.zeise.de'
  $erg = New-KinoErgebnis 'Zeise Kinos' "$basis/"
  $einmal = @{}
  try {
    $ids = @{}
    foreach ($seite in '/', '/kinderprogramm', '/demnaechst') {
      try { foreach ($m in [regex]::Matches((Get-Seite "$basis$seite"), 'href="/film/(\d+)"')) { $ids[$m.Groups[1].Value] = $true } } catch { }
    }
    foreach ($id in $ids.Keys) {
      $html = Get-Seite "$basis/film/$id"
      $titel = [regex]::Match($html, '<div class="heading-c">([^<]+)</div>').Groups[1].Value
      if (-not $titel) { $titel = ([regex]::Match($html, '<title>([^<|]+)').Groups[1].Value) }
      $titel = [System.Net.WebUtility]::HtmlDecode($titel)
      foreach ($d in [regex]::Matches($html, "<div class='date'>\s*\p{L}+,\s*(\d{1,2})\.(\d{1,2})\.")) {
        Add-Termin $erg $einmal $titel (ConvertTo-IsoDatum ([int]$d.Groups[1].Value) ([int]$d.Groups[2].Value))
      }
    }
  } catch { $erg.Fehler = $_.Exception.Message }
  Complete-KinoErgebnis $erg
}

# 3001: Spielplan mit Tagesueberschriften <h2 class="header day">Montag, 23.11.</h2>, darunter je Film
# Titel vor </h2><p class="info"> mit "Regie: ...".
function Get-DreitausendeinsProgramm {
  $url = 'https://www.3001-kino.de/spielplan/'
  $erg = New-KinoErgebnis '3001 Kino' $url
  $einmal = @{}
  try {
    $html = Get-Seite $url
    $teile = [regex]::Split($html, '<h2 class="header day">')
    foreach ($teil in $teile | Select-Object -Skip 1) {
      $k = [regex]::Match($teil, '^\s*\p{L}+,\s*(\d{1,2})\.(\d{1,2})\.')
      if (-not $k.Success) { continue }
      $datum = ConvertTo-IsoDatum ([int]$k.Groups[1].Value) ([int]$k.Groups[2].Value)
      foreach ($m in [regex]::Matches($teil, '(?s)>\s*([^<>]+?)\s*</h2>\s*<p class="info">\s*([^<]*)')) {
        $regie = [regex]::Match($m.Groups[2].Value, 'Regie:\s*([^;]+)').Groups[1].Value.Trim()
        Add-Termin $erg $einmal ([System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)) $datum @{ Regie = $regie }
      }
    }
  } catch { $erg.Fehler = $_.Exception.Message }
  Complete-KinoErgebnis $erg
}

# B-Movie: Monatsprogramm als Tabelle, Zeilen <tr id="tagTTMM"> mit Datum und Titeln (oft in Grossbuchstaben,
# teils mit Reihenname davor wie "Midnight Movie:").
function Get-BMovieProgramm {
  $url = 'https://www.b-movie.de/programm/'
  $erg = New-KinoErgebnis 'B-Movie' $url
  $einmal = @{}
  try {
    $html = Get-Seite $url
    foreach ($zeile in [regex]::Split($html, '<tr id="tag') | Select-Object -Skip 1) {
      $k = [regex]::Match($zeile, 'tm-programm-datum">(\d{1,2})\.(\d{1,2})\.')
      if (-not $k.Success) { continue }
      $datum = ConvertTo-IsoDatum ([int]$k.Groups[1].Value) ([int]$k.Groups[2].Value)
      foreach ($m in [regex]::Matches($zeile, '(?s)tm-programm-titel">\s*<a[^>]*>([^<]+)</a>.*?tm-programm-typ">([^<]*)')) {
        if ($m.Groups[2].Value.Trim() -ne 'Film') { continue }
        $titel = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value).Trim()
        $titel = $titel -replace '^(Der Aktuelle|Midnight Movie|Dokumentarfilmsalon|Q-Movie-Bar|Unerhört! Musikfilmfestival Hamburg)\s*:\s*', ''
        Add-Termin $erg $einmal (ConvertFrom-Grossschrift ($titel -replace '\s+', ' ')) $datum
      }
    }
  } catch { $erg.Fehler = $_.Exception.Message }
  Complete-KinoErgebnis $erg
}

# Metropolis: Kalender per Ajax ?eID=lsAjax&type=listFilmDays&data=<Millisekunden>, liefert JSON fuer etwa zehn Tage
# ab dem angegebenen Tag: day[].data "JJJJ|MM|TT", film[].title, text " FR 2026, Regie, 134 Min.", theme (Reihe).
# Die Laender stehen dort als Kuerzel (FR), die uebernehmen wir nicht, das Land kommt von TMDB.
function Get-MetropolisHamburgProgramm {
  $erg = New-KinoErgebnis 'Metropolis Hamburg' 'https://www.metropoliskino.de/kalender'
  $einmal = @{}
  try {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById($(if ($IsLinux -or $IsMacOS) { 'Europe/Berlin' } else { 'W. Europe Standard Time' }))
    $tag = Get-Heute
    for ($runde = 0; $runde -lt 8; $runde++) {
      $ms = ([DateTimeOffset]::new($tag, $tz.GetUtcOffset($tag))).ToUnixTimeMilliseconds() + 1
      $j = Get-Seite "https://www.metropoliskino.de/?eID=lsAjax&type=listFilmDays&data=$ms&first=1" | ConvertFrom-Json
      $tage = @($j.day)
      if (-not $tage.Count) { break }
      $letzter = $null
      foreach ($d in $tage) {
        $p = ([string]$d.data).Split('|')
        if ($p.Count -lt 3) { continue }
        $datum = '{0}-{1:00}-{2:00}' -f $p[0], [int]$p[1], [int]$p[2]
        $letzter = $datum
        foreach ($f in @($d.film)) {
          $info = ([string]$f.text).Trim()
          $mi = [regex]::Match($info, '^([A-Z]{2}(?:[/, ]+[A-Z]{2})*)\s+(\d{4}),\s*([^,]+),')
          Add-Termin $erg $einmal ([string]$f.title) $datum @{
            Jahr = $(if ($mi.Success) { $mi.Groups[2].Value }); Regie = $(if ($mi.Success) { $mi.Groups[3].Value.Trim() })
            Reihe = $(if ($f.theme) { [string]$f.theme })
          }
        }
      }
      if (-not $letzter) { break }
      $naechster = ([datetime]$letzter).AddDays(1)
      if ($naechster -le $tag) { break }
      $tag = $naechster
    }
  } catch { $erg.Fehler = $_.Exception.Message }
  Complete-KinoErgebnis $erg
}

# Lichtmess: Programmseite mit Eintraegen <time datetime="JJJJ-MM-TT HH:MM"> und <div class="program-list__title">
function Get-LichtmessProgramm {
  $url = 'https://lichtmess-kino.de/programm/'
  $erg = New-KinoErgebnis 'Lichtmeß Kino' $url
  $einmal = @{}
  try {
    $html = Get-Seite $url
    foreach ($m in [regex]::Matches($html, '(?s)<time datetime="(\d{4}-\d\d-\d\d)[^"]*">.*?program-list__title[^"]*">([^<]+)<')) {
      Add-Termin $erg $einmal ([System.Net.WebUtility]::HtmlDecode($m.Groups[2].Value)) $m.Groups[1].Value
    }
  } catch { $erg.Fehler = $_.Exception.Message }
  Complete-KinoErgebnis $erg
}
