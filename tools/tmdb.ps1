# Ergaenzt Filme mit Angaben von TMDB (The Movie Database): Plakat, Bewertung, IMDb-Nummer,
# und fuer Filme ohne eigene Angaben auch Land, Regie und Produktionsjahr.
# Aufruf aus dem Ordner website:  powershell -ExecutionPolicy Bypass -File tools\tmdb.ps1
#
# Schluessel: Umgebungsvariable TMDB_API_KEY (GitHub Actions) oder Datei tools/tmdb.key (lokal, nie hochladen).
# Ergebnisse: daten/filminfos.json (Zwischenspeicher je "Titel|Produktionsjahr") und Plakate in plakate/.
# Plakate werden heruntergeladen statt direkt von TMDB eingebunden, damit beim Seitenaufruf
# keine Besucherdaten an TMDB gehen.
# Bereits gepruefte Filme werden nicht erneut abgefragt. Nicht gefundene Filme erst nach 30 Tagen wieder.
# Manuelle Zuordnung: daten/tmdb-zuordnung.json, z. B. { "Titel|2024": 12345 } oder { "Titel|": null } zum Unterdruecken.

# -Alle prueft alle Filme erneut, auch bereits gefundene (z. B. nach Verbesserungen an der Suche).
param([int]$Hoechstens = 0, [switch]$Alle)

$tools = $PSScriptRoot
. (Join-Path $tools 'gemeinsam.ps1')
# PowerShell 7 wandelt Datumstexte beim Einlesen teils in DateTime um. Hier immer JJJJ-MM-TT als Text.
function ConvertTo-IsoText($Wert) { if ($Wert -is [datetime]) { $Wert.ToString('yyyy-MM-dd') } else { [string]$Wert } }
$daten = (Resolve-Path "$tools/../daten").Path
$plakatOrdner = Join-Path (Resolve-Path "$tools/..").Path 'plakate'
$infoDatei = Join-Path $daten 'filminfos.json'
$zuordnungDatei = Join-Path $daten 'tmdb-zuordnung.json'
$utf8 = New-Object System.Text.UTF8Encoding $false

$schluessel = $env:TMDB_API_KEY
$keyDatei = Join-Path $tools 'tmdb.key'
if (-not $schluessel -and (Test-Path $keyDatei)) { $schluessel = (Get-Content $keyDatei -Raw).Trim() }
if (-not $schluessel) { 'Kein TMDB-Schluessel gefunden (TMDB_API_KEY oder tools/tmdb.key). TMDB wird uebersprungen.'; return }

# v3-Schluessel (32 Zeichen) als Parameter, v4-Lesezugriffstoken (lang) als Bearer-Kopfzeile
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
$infos = [ordered]@{}
if (Test-Path $infoDatei) { (Get-Content $infoDatei -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $infos[$_.Name] = $_.Value } }
$zuordnung = @{}
if (Test-Path $zuordnungDatei) { (Get-Content $zuordnungDatei -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $zuordnung[$_.Name] = $_.Value } }
if (-not (Test-Path $plakatOrdner)) { New-Item -ItemType Directory $plakatOrdner | Out-Null }

$filme = [ordered]@{}
foreach ($z in (Get-Content (Join-Path $daten 'programm.json') -Raw -Encoding UTF8 | ConvertFrom-Json).zeilen) {
  $k = "$($z.Titel)|$($z.Produktionsjahr)"
  if (-not $filme.Contains($k)) { $filme[$k] = $z }
}

$laender = @{}
foreach ($l in @(Invoke-Tmdb 'configuration/countries' | ForEach-Object { $_ })) { $laender[$l.iso_3166_1] = $l.native_name }

$heute = (Get-Heute).ToString('yyyy-MM-dd')
$offen = @($filme.Keys | Where-Object {
  $i = $infos[$_]
  if ($Alle) { return $true }
  if ($zuordnung.ContainsKey($_)) { return -not $i -or $i.tmdb -ne $zuordnung[$_] }
  if (-not $i) { return $true }
  if ($i.nichtGefunden) { return ((Get-Date) - [datetime]::ParseExact((ConvertTo-IsoText $i.geprueft), 'yyyy-MM-dd', $null)).TotalDays -gt 30 }
  return $false
})
if ($Hoechstens -gt 0) { $offen = @($offen | Select-Object -First $Hoechstens) }
"TMDB: $($filme.Count) Filme, davon $($offen.Count) neu zu pruefen"

# Lockerer Vergleichsschluessel: "&", "and" und "und" zaehlen nicht ("Mandalorian & Grogu" = "Mandalorian and Grogu")
function Get-LockererSchluessel([string]$Text) { Get-TitelSchluessel ([regex]::Replace($Text, '(?i)\s*&\s*|\b(and|und)\b', ' ')) }

# Passt ein Suchtreffer zum Titel? Vergleich der Titelschluessel, bei bekanntem Jahr +-1 Jahr Toleranz.
function Test-Treffer($Treffer, [string]$Titel, [int]$Jahr) {
  $soll = Get-LockererSchluessel $Titel
  $namen = @($Treffer.title, $Treffer.original_title) | Where-Object { $_ } | ForEach-Object { Get-LockererSchluessel $_ }
  $haupt = Get-LockererSchluessel (($Titel -split '\s+[-–]\s+|:\s+')[0])
  # In PowerShell haben -and und -or den gleichen Rang, daher ausdruecklich geklammert
  $titelPasst = $namen -contains $soll
  if (-not $titelPasst) {
    foreach ($n in $namen) {
      if ($n.Length -ge 6 -and (($n -eq $haupt) -or $n.StartsWith($soll) -or $soll.StartsWith($n))) { $titelPasst = $true }
    }
  }
  if (-not $titelPasst) { return $false }
  $start = ConvertTo-IsoText $Treffer.release_date
  if ($Jahr -and $start -match '^\d{4}') { return [math]::Abs([int]$start.Substring(0, 4) - $Jahr) -le 1 }
  return $true
}

# Zwischendurch speichern, damit ein Abbruch (z. B. Ruhezustand) nicht alles verwirft.
# Eintraege fuer Filme, die nicht mehr im Bestand sind, bleiben erhalten: sie sparen spaetere Abfragen.
function Save-Infos {
  $sortiert = [ordered]@{}
  foreach ($k in ($infos.Keys | Sort-Object)) { $sortiert[$k] = $infos[$k] }
  [IO.File]::WriteAllText($infoDatei, ($sortiert | ConvertTo-Json -Depth 4), $utf8)
}

$neu = 0; $gefunden = 0
foreach ($k in $offen) {
  $z = $filme[$k]
  $titel = Get-BereinigterTitel $z.Titel
  $jahr = 0; if ("$($z.Produktionsjahr)" -match '^(\d{4})') { $jahr = [int]$Matches[1] }
  $id = $null
  if ($zuordnung.ContainsKey($k)) { $id = $zuordnung[$k] }
  else {
    # Suchvarianten: mit Jahr, ohne Jahr, ohne Doppelpunkt ("Der Herr der Ringe: ..." heisst bei TMDB "... - ..."),
    # nur Haupttitel, und auf Englisch (manche Filme kennt TMDB auf Deutsch nur unter dem Originaltitel)
    $versuche = @()
    if ($jahr) { $versuche += , @{ query = $titel; year = $jahr } }
    $versuche += , @{ query = $titel }
    $ohneDoppelpunkt = ($titel -replace ':\s+', ' ')
    if ($ohneDoppelpunkt -ne $titel) { $versuche += , @{ query = $ohneDoppelpunkt } }
    $kurz = ($titel -split '\s+[-–]\s+')[0]
    if ($kurz -ne $titel) { $versuche += , @{ query = $kurz } }
    $versuche += , @{ query = $titel; language = 'en-US' }
    $alleTreffer = New-Object System.Collections.Generic.List[object]
    foreach ($v in $versuche) {
      $suche = Invoke-Tmdb 'search/movie' $v
      @($suche.results) | Where-Object { $_ } | ForEach-Object { $alleTreffer.Add($_) }
      $treffer = @($suche.results) | Where-Object { Test-Treffer $_ $titel $jahr } | Select-Object -First 1
      if ($treffer) { $id = $treffer.id; break }
    }
    # Gleicher Titel, aber anderes Jahr (z. B. falsches Jahr im Bestand): nur wenn genau ein solcher Film existiert
    if (-not $id) {
      $exakt = @($alleTreffer | Where-Object { Test-Treffer $_ $titel 0 } | Where-Object { (Get-LockererSchluessel $_.title) -eq (Get-LockererSchluessel $titel) -or (Get-LockererSchluessel $_.original_title) -eq (Get-LockererSchluessel $titel) } | ForEach-Object id | Select-Object -Unique)
      if ($exakt.Count -eq 1) { $id = $exakt[0] }
    }
  }

  if (-not $id) {
    $infos[$k] = [ordered]@{ nichtGefunden = $true; geprueft = $heute }
    $neu++; continue
  }

  $f = Invoke-Tmdb "movie/$id" @{ append_to_response = 'credits,external_ids' }
  if (-not $f) { $infos[$k] = [ordered]@{ nichtGefunden = $true; geprueft = $heute }; $neu++; continue }

  $eintrag = [ordered]@{ tmdb = $f.id; titel = $f.title; geprueft = $heute; stimmen = [int]$f.vote_count }
  if ($f.poster_path) {
    $datei = "$($f.id).jpg"
    $ziel = Join-Path $plakatOrdner $datei
    if (-not (Test-Path $ziel)) { Invoke-WebRequest "https://image.tmdb.org/t/p/w185$($f.poster_path)" -OutFile $ziel -UseBasicParsing -TimeoutSec 30 }
    $eintrag.poster = "plakate/$datei"
  }
  # Ab 5 Stimmen anzeigen. Bei sehr wenigen Stimmen ist der Wert zu zufaellig.
  if ($f.vote_count -ge 5) { $eintrag.bewertung = ([math]::Round([double]$f.vote_average, 1)).ToString('0.0', [Globalization.CultureInfo]::GetCultureInfo('de-DE')) }
  if ($f.external_ids.imdb_id) { $eintrag.imdb = $f.external_ids.imdb_id }
  # Angaben von TMDB als Ersatz, falls im Bestand nichts steht
  $l = @($f.production_countries | ForEach-Object { if ($laender[$_.iso_3166_1]) { $laender[$_.iso_3166_1] } else { $_.name } })
  if ($l.Count) { $eintrag.land = $l -join ', ' }
  $r = @($f.credits.crew | Where-Object { $_.job -eq 'Director' } | ForEach-Object name | Select-Object -Unique)
  if ($r.Count) { $eintrag.regie = $r -join ', ' }
  $start = ConvertTo-IsoText $f.release_date
  if ($start -match '^\d{4}') { $eintrag.jahr = $start.Substring(0, 4) }
  $infos[$k] = $eintrag
  $neu++; $gefunden++
  if ($neu % 25 -eq 0) { "  $neu von $($offen.Count) geprueft"; Save-Infos }
}
Save-Infos

# Nicht $alle nennen: PowerShell unterscheidet nicht nach Gross- und Kleinschreibung, das waere der Schalter -Alle
$mitAngaben = @($filme.Keys | Where-Object { $infos[$_] -and -not $infos[$_].nichtGefunden }).Count
"TMDB: $gefunden von $neu neu gepruefte Filme gefunden. Insgesamt $mitAngaben von $($filme.Count) Filmen mit TMDB-Angaben."
$fehlend = @($filme.Keys | Where-Object { $infos[$_].nichtGefunden })
if ($fehlend.Count) { "Ohne TMDB-Treffer ($($fehlend.Count)): " + (($fehlend | ForEach-Object { $_.TrimEnd('|') }) -join ' | ') }
