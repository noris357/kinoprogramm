# Ergaenzt die Regie mit Angaben von TMDB: Foto, Geburtsjahr, Geburtsort und Zahl der Spielfilme als Regie.
# Aufruf aus dem Ordner website:  powershell -ExecutionPolicy Bypass -File tools\personen.ps1
#
# Schluessel wie bei tmdb.ps1: Umgebungsvariable TMDB_API_KEY oder Datei tools/tmdb.key (lokal, nie hochladen).
# Ergebnis: daten/personen.json und Fotos in fotos/ (heruntergeladen, damit beim Seitenaufruf nichts an TMDB geht).
#   filmRegie: je TMDB-Film die Regie mit TMDB-Personennummer
#   personen:  je TMDB-Personennummer die Angaben
# Zahl der Regiearbeiten: nur Filme (keine Serien), veroeffentlicht, mindestens 40 Minuten lang.
# Damit fallen Kurzfilme und Musikvideos heraus, Dokumentarfilme zaehlen mit.
# Personen werden nach 90 Tagen erneut abgefragt, damit neue Filme in der Zahl ankommen.

param([int]$AlterTage = 90, [int]$MindestMinuten = 40)

$tools = $PSScriptRoot
. (Join-Path $tools 'gemeinsam.ps1')
function ConvertTo-IsoText($Wert) { if ($Wert -is [datetime]) { $Wert.ToString('yyyy-MM-dd') } else { [string]$Wert } }
$daten = (Resolve-Path "$tools/../daten").Path
$fotoOrdner = Join-Path (Resolve-Path "$tools/..").Path 'fotos'
$ziel = Join-Path $daten 'personen.json'
$utf8 = New-Object System.Text.UTF8Encoding $false
$heute = (Get-Heute).ToString('yyyy-MM-dd')

$schluessel = $env:TMDB_API_KEY
$keyDatei = Join-Path $tools 'tmdb.key'
if (-not $schluessel -and (Test-Path $keyDatei)) { $schluessel = (Get-Content $keyDatei -Raw).Trim() }
if (-not $schluessel) { 'Kein TMDB-Schluessel gefunden (TMDB_API_KEY oder tools/tmdb.key). Personen werden uebersprungen.'; return }

# Wie in tmdb.ps1: v3-Schluessel als Parameter, v4-Token als Bearer-Kopfzeile
$istToken = $schluessel.Length -gt 40
function Invoke-Tmdb([string]$Pfad, [hashtable]$Parameter = @{}) {
  $p = @{ language = 'de-DE' }
  foreach ($k in $Parameter.Keys) { $p[$k] = $Parameter[$k] }
  if (-not $istToken) { $p.api_key = $schluessel }
  $abfrage = ($p.Keys | ForEach-Object { "$_=" + [uri]::EscapeDataString([string]$p[$_]) }) -join '&'
  $kopf = @{ Accept = 'application/json' }
  if ($istToken) { $kopf.Authorization = "Bearer $schluessel" }
  for ($versuch = 1; $versuch -le 3; $versuch++) {
    try {
      $antwort = Invoke-WebRequest -Uri "https://api.themoviedb.org/3/$Pfad`?$abfrage" -Headers $kopf -UseBasicParsing -TimeoutSec 30
      Start-Sleep -Milliseconds 120
      return ([Text.Encoding]::UTF8.GetString($antwort.RawContentStream.ToArray()) | ConvertFrom-Json)
    } catch {
      $status = 0; if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
      if ($status -eq 401) { throw 'TMDB lehnt den Schluessel ab (401). Ist er richtig eingetragen?' }
      if ($status -eq 404) { return $null }
      if ($versuch -eq 3) { throw }
      Start-Sleep -Seconds (2 * $versuch)
    }
  }
}

# ---------- Vorhandenes laden ----------
$filmRegie = [ordered]@{}
$personen = [ordered]@{}
if (Test-Path $ziel) {
  $alt = Get-Content $ziel -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($alt.filmRegie) { $alt.filmRegie.PSObject.Properties | ForEach-Object { $filmRegie[$_.Name] = @($_.Value) } }
  if ($alt.personen) { $alt.personen.PSObject.Properties | ForEach-Object { $personen[$_.Name] = $_.Value } }
}
if (-not (Test-Path $fotoOrdner)) { New-Item -ItemType Directory $fotoOrdner | Out-Null }

function Save-Personen {
  $fr = [ordered]@{}; foreach ($k in ($filmRegie.Keys | Sort-Object { [int]$_ })) { $fr[$k] = @($filmRegie[$k]) }
  $pe = [ordered]@{}; foreach ($k in ($personen.Keys | Sort-Object { [int]$_ })) { $pe[$k] = $personen[$k] }
  [IO.File]::WriteAllText($ziel, ([ordered]@{ filmRegie = $fr; personen = $pe } | ConvertTo-Json -Depth 5), $utf8)
}

# ---------- 1. Regie je Film ----------
$filmIds = @((Get-Content (Join-Path $daten 'filminfos.json') -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties |
  ForEach-Object { $_.Value.tmdb } | Where-Object { $_ } | ForEach-Object { [string]$_ } | Sort-Object -Unique)
$offeneFilme = @($filmIds | Where-Object { -not $filmRegie.Contains($_) })
"Personen: $($filmIds.Count) Filme mit TMDB-ID, $($offeneFilme.Count) ohne Regie-Zuordnung"
$n = 0
foreach ($id in $offeneFilme) {
  $c = Invoke-Tmdb "movie/$id/credits"
  $filmRegie[$id] = @(if ($c) { $c.crew | Where-Object { $_.job -eq 'Director' } | ForEach-Object { [ordered]@{ id = [int]$_.id; name = [string]$_.name } } })
  $n++; if ($n % 50 -eq 0) { "  $n von $($offeneFilme.Count) Filmen"; Save-Personen }
}

# ---------- 2. Angaben je Person ----------
$alle = @($filmRegie.Values | ForEach-Object { $_ } | ForEach-Object { [string]$_.id } | Sort-Object -Unique)
$offen = @($alle | Where-Object {
  -not $personen.Contains($_) -or ((Get-Date) - [datetime]::ParseExact((ConvertTo-IsoText $personen[$_].geprueft), 'yyyy-MM-dd', $null)).TotalDays -gt $AlterTage
})
"Personen: $($alle.Count) Regie-Personen, $($offen.Count) abzufragen"
$n = 0
foreach ($pnr in $offen) {
  $p = Invoke-Tmdb "person/$pnr" @{ append_to_response = 'movie_credits' }
  if (-not $p) { $personen[$pnr] = [ordered]@{ geprueft = $heute }; continue }
  $eintrag = [ordered]@{ name = [string]$p.name; geprueft = $heute }
  $geburt = ConvertTo-IsoText $p.birthday
  if ($geburt -match '^\d{4}') { $eintrag.geboren = [int]$geburt.Substring(0, 4) }
  $tod = ConvertTo-IsoText $p.deathday
  if ($tod -match '^\d{4}') { $eintrag.gestorben = [int]$tod.Substring(0, 4) }
  if ($p.place_of_birth) { $eintrag.ort = ([regex]::Replace([string]$p.place_of_birth, '\s+', ' ')).Trim() }
  if ($p.profile_path) {
    $datei = "$pnr.jpg"
    $pfad = Join-Path $fotoOrdner $datei
    if (-not (Test-Path $pfad)) { Invoke-WebRequest "https://image.tmdb.org/t/p/w185$($p.profile_path)" -OutFile $pfad -UseBasicParsing -TimeoutSec 30 }
    $eintrag.foto = "fotos/$datei"
  }
  # Regie bei Filmen (keine Serien), ohne Videoveroeffentlichungen, schon erschienen
  $regie = @($p.movie_credits.crew | Where-Object { $_.job -eq 'Director' -and -not $_.video -and (ConvertTo-IsoText $_.release_date) -match '^\d{4}' -and (ConvertTo-IsoText $_.release_date) -le $heute } |
    ForEach-Object { [int]$_.id } | Sort-Object -Unique)
  if ($regie.Count) {
    # Laufzeit pruefen ueber die Filmsuche: alle Filme mit dieser Person im Team und mindestens 40 Minuten
    $lang = @{}
    $seite = 1
    do {
      $d = Invoke-Tmdb 'discover/movie' @{ with_crew = $pnr; 'with_runtime.gte' = $MindestMinuten; page = $seite; include_adult = 'false' }
      if (-not $d) { break }
      foreach ($r in @($d.results)) { $lang[[int]$r.id] = $true }
      $seite++
    } while ($seite -le [int]$d.total_pages -and $seite -le 10)
    $eintrag.regiearbeiten = @($regie | Where-Object { $lang.ContainsKey($_) }).Count
  } else { $eintrag.regiearbeiten = 0 }
  $personen[$pnr] = $eintrag
  $n++; if ($n % 25 -eq 0) { "  $n von $($offen.Count) Personen"; Save-Personen }
}
Save-Personen

# ---------- 3. Letterboxd-Seite ----------
# Letterboxd findet Personen nicht ueber die TMDB-Nummer. Die Adresse wird aus dem Namen gebildet
# (letterboxd.com/director/denis-villeneuve/) und einmal geprueft. Gibt es sie nicht, bleibt das Feld leer
# und die Website verlinkt die Letterboxd-Suche. Hoeflich: eine Abfrage pro Person und Sekunde, nur einmal.
function Get-LetterboxdSlug([string]$Name) {
  $t = $Name.Normalize([Text.NormalizationForm]::FormD)
  $t = [regex]::Replace($t, '\p{Mn}', '').ToLowerInvariant().Replace('ß', 'ss').Replace('ø', 'o').Replace('ł', 'l').Replace('&', 'and')
  return ([regex]::Replace($t, '[^a-z0-9]+', '-')).Trim('-')
}
$ohneLb = @($personen.Keys | Where-Object { $personen[$_].name -and $null -eq $personen[$_].letterboxd })
"Personen: $($ohneLb.Count) ohne geprueften Letterboxd-Link"
$n = 0
foreach ($pnr in $ohneLb) {
  $e = $personen[$pnr]
  $slug = Get-LetterboxdSlug $e.name
  $ok = $false
  if ($slug) {
    try {
      $r = Invoke-WebRequest -Uri "https://letterboxd.com/director/$slug/" -Method Head -UseBasicParsing -TimeoutSec 20 -UserAgent $script:UserAgent -MaximumRedirection 0
      $ok = [int]$r.StatusCode -eq 200
    } catch { $ok = $false }
    Start-Sleep -Milliseconds 1000
  }
  # Eingelesene Eintraege sind Objekte, neue Woerterbuecher
  $wert = if ($ok) { $slug } else { '' }
  if ($e -is [System.Collections.IDictionary]) { $e.letterboxd = $wert } else { $e | Add-Member -NotePropertyName letterboxd -NotePropertyValue $wert -Force }
  $n++; if ($n % 50 -eq 0) { "  $n von $($ohneLb.Count) Letterboxd-Links"; Save-Personen }
}
Save-Personen
"Personen: fertig, $(@($personen.Values | Where-Object { $_.foto }).Count) mit Foto"
