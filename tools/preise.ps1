# Holt gewonnene Hauptpreise aus Wikidata (frei nutzbar, CC0) ueber die IMDb-Nummer der Filme:
# Oscar (Film, Regie, Drehbuch original und adaptiert, Hauptdarsteller, Hauptdarstellerin, Kamera),
# Goldene Palme, Goldener Baer, Goldener Loewe, Tokyo Grand Prix.
# Darsteller- und Regie-Oscars haengen in Wikidata an der Person mit Verweis auf den Film ("fuer Werk").
# Tokyo Grand Prix ist in Wikidata kaum gepflegt, dafuer gibt es daten/preise-manuell.json.
# Aufruf aus dem Ordner website:  powershell -ExecutionPolicy Bypass -File tools\preise.ps1
# Ergebnis: daten/preise.json je TMDB-ID. Nur Gewinne, keine Nominierungen.
# Neue Filme werden sofort geprueft, alle Filme einmal jaehrlich ab 15. April (daten/preise-geprueft.json).
# -Vollstaendig erzwingt eine Pruefung aller Filme.

param([switch]$Vollstaendig)

$tools = $PSScriptRoot
. (Join-Path $tools 'gemeinsam.ps1')
$daten = (Resolve-Path "$tools/../daten").Path
$utf8 = New-Object System.Text.UTF8Encoding $false
# Wikidata bittet um eine aussagekraeftige Kennung mit Kontakt
$ua = 'KinoprogrammNuernberg/1.0 (privates Hobbyprojekt; https://noris357.github.io/kinoprogramm/)'

$preise = [ordered]@{
  'Q102427' = @{ preis = 'oscar'; kategorie = 'Bester Film' }
  'Q103360' = @{ preis = 'oscar'; kategorie = 'Beste Regie' }
  'Q41417'  = @{ preis = 'oscar'; kategorie = 'Bestes Originaldrehbuch' }
  'Q107258' = @{ preis = 'oscar'; kategorie = 'Bestes adaptiertes Drehbuch' }
  'Q103916' = @{ preis = 'oscar'; kategorie = 'Bester Hauptdarsteller' }
  'Q103618' = @{ preis = 'oscar'; kategorie = 'Beste Hauptdarstellerin' }
  'Q131520' = @{ preis = 'oscar'; kategorie = 'Beste Kamera' }
  'Q179808' = @{ preis = 'palme'; kategorie = 'Goldene Palme' }
  'Q154590' = @{ preis = 'baer'; kategorie = 'Goldener Bär' }
  'Q209459' = @{ preis = 'loewe'; kategorie = 'Goldener Löwe' }
  'Q136471547' = @{ preis = 'tokio'; kategorie = 'Tokyo Grand Prix' }
}

# IMDb-Nummer -> TMDB-ID aus den TMDB-Angaben
$imdbZuTmdb = @{}
(Get-Content (Join-Path $daten 'filminfos.json') -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties |
  Where-Object { $_.Value.imdb -and $_.Value.tmdb } | ForEach-Object { $imdbZuTmdb[$_.Value.imdb] = [string]$_.Value.tmdb }
"Preise: $($imdbZuTmdb.Count) Filme mit IMDb-Nummer"

# Wann wurde was geprueft? Neue Filme sofort, alle Filme einmal im Jahr ab Mitte April
# (nach Berlinale und Oscars, mit etwas Vorlauf fuer die Eintraege in Wikidata).
$geprueftDatei = Join-Path $daten 'preise-geprueft.json'
$geprueft = @{}; $letzteVolle = ''
if (Test-Path $geprueftDatei) {
  $g = Get-Content $geprueftDatei -Raw -Encoding UTF8 | ConvertFrom-Json
  $letzteVolle = [string]$g.vollstaendig
  $g.filme | ForEach-Object { $geprueft[[string]$_] = $true }
}
$heute = Get-Heute
$stichtag = (New-Object DateTime $heute.Year, 4, 15).ToString('yyyy-MM-dd')
$voll = $Vollstaendig -or ($heute.ToString('yyyy-MM-dd') -ge $stichtag -and $letzteVolle -lt $stichtag)

$ergebnis = @{}
function Add-Preis([string]$Tmdb, $Eintrag) {
  if (-not $ergebnis.ContainsKey($Tmdb)) { $ergebnis[$Tmdb] = New-Object System.Collections.Generic.List[object] }
  if (-not ($ergebnis[$Tmdb] | Where-Object { $_.preis -eq $Eintrag.preis -and $_.kategorie -eq $Eintrag.kategorie })) { $ergebnis[$Tmdb].Add($Eintrag) }
}
# Bei einer Teilpruefung bleiben die bekannten Preise erhalten, nur neue Filme kommen dazu
$preisDatei = Join-Path $daten 'preise.json'
if (-not $voll -and (Test-Path $preisDatei)) {
  (Get-Content $preisDatei -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object {
    foreach ($e in $_.Value) { Add-Preis $_.Name ([ordered]@{ preis = $e.preis; kategorie = $e.kategorie; jahr = $e.jahr }) }
  }
}

$auszeichnungen = ($preise.Keys | ForEach-Object { "wd:$_" }) -join ' '
$ids = if ($voll) { @($imdbZuTmdb.Keys) } else { @($imdbZuTmdb.Keys | Where-Object { -not $geprueft.ContainsKey($_) }) }
"Preise: " + $(if ($voll) { "jaehrliche Pruefung aller $($ids.Count) Filme" } else { "$($ids.Count) neue Filme zu pruefen" })
$fehler = $null
for ($i = 0; $i -lt $ids.Count; $i += 80) {
  $teil = $ids[$i..([math]::Min($i + 79, $ids.Count - 1))]
  $werte = ($teil | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $abfrage = @"
SELECT ?imdb ?award (MIN(YEAR(?zeit)) AS ?jahr) WHERE {
  VALUES ?imdb { $werte }
  VALUES ?award { $auszeichnungen }
  ?film wdt:P345 ?imdb .
  { ?film p:P166 ?st . ?st ps:P166 ?award . }
  UNION
  { ?wer p:P166 ?st . ?st ps:P166 ?award ; pq:P1686 ?film . }
  OPTIONAL { ?st pq:P585 ?zeit . }
} GROUP BY ?imdb ?award
"@
  try {
    $antwort = Invoke-RestMethod -Uri 'https://query.wikidata.org/sparql' -Method Post -Body @{ query = $abfrage; format = 'json' } -UserAgent $ua -TimeoutSec 90
    foreach ($b in $antwort.results.bindings) {
      $q = $b.award.value -replace '.*/'
      $p = $preise[$q]
      $jahr = if ($b.jahr) { [int]$b.jahr.value } else { $null }
      Add-Preis $imdbZuTmdb[$b.imdb.value] ([ordered]@{ preis = $p.preis; kategorie = $p.kategorie; jahr = $jahr })
    }
  } catch { $fehler = $_.Exception.Message; break }
  Start-Sleep -Seconds 1
}

# Handliste ergaenzen (Tokyo Grand Prix)
$manuell = Join-Path $daten 'preise-manuell.json'
if (Test-Path $manuell) {
  (Get-Content $manuell -Raw -Encoding UTF8 | ConvertFrom-Json).preise.PSObject.Properties | ForEach-Object {
    foreach ($e in $_.Value) { Add-Preis $_.Name ([ordered]@{ preis = $e.preis; kategorie = $e.kategorie; jahr = $e.jahr }) }
  }
}

if ($fehler) {
  # Bei einem Abbruch die bisherige Datei behalten, damit keine Preise verschwinden
  "Preise: Wikidata nicht erreichbar ($fehler). Bisherige Preise bleiben erhalten."
  return
}
$sortiert = [ordered]@{}
foreach ($k in (@($ergebnis.Keys) | Where-Object { $_ } | Sort-Object { [int]$_ })) { $sortiert.Add([string]$k, $ergebnis[$k].ToArray()) }
[IO.File]::WriteAllText($preisDatei, ($sortiert | ConvertTo-Json -Depth 4), $utf8)
foreach ($id in $ids) { $geprueft[$id] = $true }
$stand = [ordered]@{
  vollstaendig = $(if ($voll) { $heute.ToString('yyyy-MM-dd') } else { $letzteVolle })
  filme = @($geprueft.Keys | Sort-Object)
}
[IO.File]::WriteAllText($geprueftDatei, ($stand | ConvertTo-Json -Depth 3), $utf8)
"Preise: $($ergebnis.Count) Filme mit mindestens einem Hauptpreis"
