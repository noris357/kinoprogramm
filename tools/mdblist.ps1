# Holt Wertungen mehrerer Quellen ueber MDBList (mdblist.com): IMDb, Letterboxd, Metacritic (Kritik und Publikum),
# Rotten Tomatoes (Tomatometer und Popcornmeter), TMDB, Trakt. Grundlage ist die TMDB-ID aus daten/filminfos.json.
# Aufruf aus dem Ordner website:  powershell -ExecutionPolicy Bypass -File tools\mdblist.ps1
#
# Schluessel: Umgebungsvariable MDBLIST_API_KEY (GitHub Actions) oder Datei tools/mdblist.key (lokal, nie hochladen).
# Ergebnis: daten/wertungen.json je TMDB-ID. Die Einzelwerte erscheinen nicht auf der Website,
# build-data.ps1 berechnet daraus den eigenen Score.
# Das kostenlose Kontingent liegt bei etwa 1000 Abfragen pro Tag. Neue Filme zuerst, dann die aeltesten Eintraege
# von Filmen mit kommenden Terminen (Wertungen aendern sich bei neuen Filmen noch).

# Wertungen laufender Filme werden jede Woche aufgefrischt: 6 statt 7 Tage, damit ein etwas frueherer Lauf
# (z. B. von Hand am Dienstag oder ein spaet gestarteter Lauf in der Vorwoche) keine Woche auslaesst.
param([int]$Hoechstens = 800, [int]$AlterTage = 6)

$tools = $PSScriptRoot
. (Join-Path $tools 'gemeinsam.ps1')
function ConvertTo-IsoText($Wert) { if ($Wert -is [datetime]) { $Wert.ToString('yyyy-MM-dd') } else { [string]$Wert } }
$daten = (Resolve-Path "$tools/../daten").Path
$ziel = Join-Path $daten 'wertungen.json'
$utf8 = New-Object System.Text.UTF8Encoding $false

$schluessel = $env:MDBLIST_API_KEY
$keyDatei = Join-Path $tools 'mdblist.key'
if (-not $schluessel -and (Test-Path $keyDatei)) { $schluessel = (Get-Content $keyDatei -Raw).Trim() }
if (-not $schluessel) { 'Kein MDBList-Schluessel gefunden (MDBLIST_API_KEY oder tools/mdblist.key). Wertungen werden uebersprungen.'; return }

# Die API gibt es unter zwei Adressen. Die erste, die antwortet, wird fuer den ganzen Lauf verwendet.
$script:adresse = $null
function Get-MdbList([int]$TmdbId) {
  $kandidaten = if ($script:adresse) { @($script:adresse) } else { @('neu', 'alt') }
  foreach ($k in $kandidaten) {
    $url = if ($k -eq 'neu') { "https://api.mdblist.com/tmdb/movie/$TmdbId`?apikey=$schluessel" } else { "https://mdblist.com/api/?apikey=$schluessel&tm=$TmdbId&m=movie" }
    try {
      $antwort = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -UserAgent $script:UserAgent
      Start-Sleep -Milliseconds 250
      $obj = [Text.Encoding]::UTF8.GetString($antwort.RawContentStream.ToArray()) | ConvertFrom-Json
      if ($obj.error) { throw "MDBList: $($obj.error)" }
      $script:adresse = $k
      return $obj
    } catch {
      $status = 0; if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
      if ($status -eq 401 -or $status -eq 403) { throw 'MDBList lehnt den Schluessel ab. Ist er richtig eingetragen?' }
      if ($status -eq 429) { throw 'MDBList: Tageskontingent erschoepft. Der naechste Lauf macht weiter.' }
      if ($status -eq 404) { return $null }
      if ($k -eq $kandidaten[-1]) { throw }
    }
  }
}

# Nur Quellen, die in den Score eingehen. Wert immer auf 0-100 umgerechnet.
$umrechnung = @{ imdb = 10; tmdb = 10; letterboxd = 20; metacritic = 1; metacriticuser = 10; tomatoes = 1; popcorn = 1; trakt = 1 }
function ConvertFrom-Wertungen($Obj) {
  $quellen = [ordered]@{}
  foreach ($r in @($Obj.ratings)) {
    $q = ([string]$r.source).ToLowerInvariant()
    if (-not $umrechnung.ContainsKey($q)) { continue }
    $wert = $null
    if ($null -ne $r.value -and "$($r.value)" -ne '') {
      $wert = [double]$r.value
      # Nur hochrechnen, wenn der Wert noch auf der Ursprungsskala liegt (MDBList liefert TMDB z. B. schon als 0-100)
      if ($wert -le (100 / $umrechnung[$q])) { $wert *= $umrechnung[$q] }
    }
    elseif ($null -ne $r.score -and "$($r.score)" -ne '') { $wert = [double]$r.score }
    if ($null -eq $wert -or $wert -le 0) { continue }
    $eintrag = [ordered]@{ wert = [math]::Round($wert, 1) }
    if ($r.votes) { $eintrag.stimmen = [int]$r.votes }
    $quellen[$q] = $eintrag
  }
  return $quellen
}

# ---------- Welche Filme? ----------
$infos = (Get-Content (Join-Path $daten 'filminfos.json') -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties
$programm = (Get-Content (Join-Path $daten 'programm.json') -Raw -Encoding UTF8 | ConvertFrom-Json).zeilen
$heute = (Get-Heute).ToString('yyyy-MM-dd')
$kommend = @{}
foreach ($z in $programm) { if ((ConvertTo-IsoText $z.Datum) -ge $heute) { $kommend["$($z.Titel)|$($z.Produktionsjahr)"] = $true } }
$ids = @{}   # TMDB-ID -> laeuft noch?
foreach ($p in $infos) { if ($p.Value.tmdb) { $id = [string]$p.Value.tmdb; $ids[$id] = $ids[$id] -or [bool]$kommend[$p.Name] } }

$wertungen = [ordered]@{}
if (Test-Path $ziel) { (Get-Content $ziel -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $wertungen[$_.Name] = $_.Value } }

$neu = @($ids.Keys | Where-Object { -not $wertungen.Contains($_) })
$alt = @($ids.Keys | Where-Object { $wertungen.Contains($_) -and $ids[$_] -and ((Get-Date) - [datetime]::ParseExact((ConvertTo-IsoText $wertungen[$_].geprueft), 'yyyy-MM-dd', $null)).TotalDays -gt $AlterTage } |
  Sort-Object { ConvertTo-IsoText $wertungen[$_].geprueft })
$offen = @($neu + $alt | Select-Object -First $Hoechstens)
"MDBList: $($ids.Count) Filme mit TMDB-ID, $($neu.Count) neu, $($alt.Count) zu aktualisieren, $($offen.Count) in diesem Lauf"

function Save-Wertungen {
  $s = [ordered]@{}
  foreach ($k in ($wertungen.Keys | Sort-Object { [int]$_ })) { $s[$k] = $wertungen[$k] }
  [IO.File]::WriteAllText($ziel, ($s | ConvertTo-Json -Depth 5), $utf8)
}

$n = 0; $mitWerten = 0
try {
  foreach ($id in $offen) {
    $obj = Get-MdbList ([int]$id)
    if ($obj -and $n -eq 0) {
      # Einmal pro Lauf zeigen, was MDBList liefert, damit Aenderungen am Antwortformat auffallen
      "  Adresse: $script:adresse | Felder: $((@($obj.PSObject.Properties.Name) | Select-Object -First 15) -join ', ') | Wertungsquellen: $((@($obj.ratings) | ForEach-Object { "$($_.source)=$($_.value)" }) -join ', ')"
    }
    $quellen = if ($obj) { ConvertFrom-Wertungen $obj } else { [ordered]@{} }
    $wertungen[$id] = [ordered]@{ geprueft = $heute; quellen = $quellen }
    $n++; if ($quellen.Count) { $mitWerten++ }
    if ($n % 50 -eq 0) { "  $n von $($offen.Count) abgerufen"; Save-Wertungen }
  }
} catch { "MDBList abgebrochen: $($_.Exception.Message)" }
Save-Wertungen

$zaehl = @{}
foreach ($w in $wertungen.Values) {
  # Neu abgerufene Eintraege sind Woerterbuecher, eingelesene sind Objekte
  $namen = if ($w.quellen -is [System.Collections.IDictionary]) { @($w.quellen.Keys) } else { @($w.quellen.PSObject.Properties.Name) }
  foreach ($q in $namen) { $zaehl[$q] = 1 + [int]$zaehl[$q] }
}
"MDBList: $n abgerufen, $mitWerten mit Wertungen. Abdeckung je Quelle: " + (($zaehl.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { "$($_.Key) $($_.Value)" }) -join ', ')
