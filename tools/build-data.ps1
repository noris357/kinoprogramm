# Erzeugt website/data.js aus dem Bestand website/daten/programm.json
# (falls noch nicht vorhanden, aus Kinoprogramm_entpivotiert.json im Projektordner).
# Aufruf aus dem Ordner website:  powershell -ExecutionPolicy Bypass -File tools\build-data.ps1
#
# Fuer die Anzeige wird geglaettet, der Bestand selbst bleibt unveraendert:
# - Titel ohne Zusaetze wie "(Eroeffnungsfilm)" oder Fassungsangaben
# - Filme mit gleicher TMDB-ID oder gleichem Titel (bei passendem Jahr) werden zu einem Film zusammengefuehrt,
#   z. B. "Der Herr der Ringe - Die zwei Tuerme" und "The Lord of the Rings: The Two Towers"
# - Laender einheitlich auf Deutsch, Kuerzel aufgeloest, dazu ISO-Codes fuer die Flaggen
# - TMDB fuellt nur Luecken bei Land, Regie und Jahr
# Die Spalte "Im Kino gesehen?" wird bewusst nicht veroeffentlicht.

param(
  [string]$Quelle    = $(if (Test-Path "$PSScriptRoot/../daten/programm.json") { "$PSScriptRoot/../daten/programm.json" } else { "$PSScriptRoot/../../Kinoprogramm_entpivotiert.json" }),
  [string]$Quellen   = "$PSScriptRoot/../daten/quellen.json",
  [string]$FilmInfos = "$PSScriptRoot/../daten/filminfos.json",
  [string]$Ziel      = "$PSScriptRoot/../data.js"
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/gemeinsam.ps1"
$json = Get-Content $Quelle -Raw -Encoding UTF8 | ConvertFrom-Json

# PowerShell 7 wandelt Datumstexte beim Einlesen teils in DateTime um. Hier immer JJJJ-MM-TT als Text.
function ConvertTo-IsoText($Wert) { if ($Wert -is [datetime]) { $Wert.ToString('yyyy-MM-dd') } else { [string]$Wert } }

# ---------- Laender ----------
# Einheitliche deutsche Namen mit ISO-Code (fuer die Flagge). Ohne Code: keine Flagge.
$landCode = @{
  'Deutschland'='DE'; 'USA'='US'; 'Großbritannien'='GB'; 'Frankreich'='FR'; 'Spanien'='ES'; 'Belgien'='BE'; 'Österreich'='AT'
  'Japan'='JP'; 'Schweiz'='CH'; 'Polen'='PL'; 'Mexiko'='MX'; 'Italien'='IT'; 'Finnland'='FI'; 'Indien'='IN'; 'Kanada'='CA'
  'Südkorea'='KR'; 'Luxemburg'='LU'; 'Hongkong'='HK'; 'Griechenland'='GR'; 'Slowakei'='SK'; 'Dänemark'='DK'; 'Kenia'='KE'
  'Tschechien'='CZ'; 'Türkei'='TR'; 'Portugal'='PT'; 'Schweden'='SE'; 'Kapverden'='CV'; 'Irland'='IE'; 'Neuseeland'='NZ'
  'Slowenien'='SI'; 'Libanon'='LB'; 'Estland'='EE'; 'Tunesien'='TN'; 'Albanien'='AL'; 'Lettland'='LV'; 'Israel'='IL'
  'Ukraine'='UA'; 'Rumänien'='RO'; 'Bulgarien'='BG'; 'Norwegen'='NO'; 'Brasilien'='BR'; 'Niederlande'='NL'; 'Nigeria'='NG'
  'Argentinien'='AR'; 'Tschad'='TD'; 'Afghanistan'='AF'; 'Australien'='AU'; 'Ägypten'='EG'; 'Taiwan'='TW'; 'Bhutan'='BT'
  'Ruanda'='RW'; 'Kolumbien'='CO'; 'Georgien'='GE'; 'Demokratische Republik Kongo'='CD'; 'Palästina'='PS'
  'Saudi-Arabien'='SA'; 'Ungarn'='HU'; 'Singapur'='SG'; 'Litauen'='LT'; 'Katar'='QA'; 'Zypern'='CY'; 'Nordmazedonien'='MK'
  'Iran'='IR'; 'Marokko'='MA'; 'Kosovo'='XK'; 'China'='CN'; 'Vereinigte Arabische Emirate'='AE'; 'Elfenbeinküste'='CI'
  'Russland'='RU'; 'Färöer'='FO'; 'Island'='IS'; 'Kroatien'='HR'; 'Serbien'='RS'; 'Chile'='CL'; 'Peru'='PE'; 'Kuba'='CU'
  'Südafrika'='ZA'; 'Thailand'='TH'; 'Philippinen'='PH'; 'Indonesien'='ID'; 'Vietnam'='VN'; 'Algerien'='DZ'; 'Senegal'='SN'
  'Jordanien'='JO'; 'Irak'='IQ'; 'Syrien'='SY'; 'Armenien'='AM'; 'Aserbaidschan'='AZ'; 'Kasachstan'='KZ'; 'Belarus'='BY'
  'Bosnien und Herzegowina'='BA'; 'Montenegro'='ME'; 'Malta'='MT'; 'Pakistan'='PK'; 'Bangladesch'='BD'; 'Nepal'='NP'
  'Mongolei'='MN'; 'Uruguay'='UY'; 'Venezuela'='VE'; 'Bolivien'='BO'; 'Ecuador'='EC'; 'Paraguay'='PY'; 'Costa Rica'='CR'
  'UdSSR'=$null; 'Niederländische Antillen'=$null; 'Jugoslawien'=$null; 'Tschechoslowakei'=$null; 'DDR'=$null
}
# Schreibweisen und Kuerzel aus Bestand und TMDB auf die einheitlichen Namen abbilden
$landAlias = @{
  'Vereinigte Staaten'='USA'; 'Vereinigte Staaten von Amerika'='USA'; 'US'='USA'; 'United States'='USA'
  'Vereinigtes Königreich'='Großbritannien'; 'UK'='Großbritannien'; 'GB'='Großbritannien'; 'England'='Großbritannien'
  'Turkey'='Türkei'; 'It'='Italien'; 'BRD'='Deutschland'; 'IE'='Irland'; 'AF'='Afghanistan'; 'GE'='Georgien'
  'Kap Verde'='Kapverden'; 'Palästinensische Autonomiegebiete'='Palästina'; 'Mazedonien'='Nordmazedonien'
  # Das typografische Apostroph beendet in PowerShell auch Texte in einfachen Hochkommas, daher als Zeichencode
  ("Côte d$([char]0x2019)Ivoire")='Elfenbeinküste'; "Côte d'Ivoire"='Elfenbeinküste'; 'Volksrepublik China'='China'
  'Russische Föderation'='Russland'; 'Korea'='Südkorea'; 'Republik Korea'='Südkorea'; 'Weißrussland'='Belarus'
  'Tschechische Republik'='Tschechien'; 'Holland'='Niederlande'
}
$unbekannteLaender = @{}
function Get-EinheitlicheLaender([string]$Text) {
  if (-not $Text) { return $null }
  $liste = foreach ($teil in ($Text -split '\s*[,/;]\s*')) {
    $t = $teil.Trim()
    if (-not $t -or $t -eq '?' -or $t -match '^(?i)verschiedene') { continue }
    if ($landAlias.ContainsKey($t)) { $t = $landAlias[$t] }
    if ($landCode.ContainsKey($t)) { $t; continue }
    # Unbekannte Kuerzel wie "CR" weglassen, unbekannte Namen behalten und melden
    if ($t -cmatch '^[A-Z][A-Za-z]?$') { $unbekannteLaender[$t] = $true; continue }
    $unbekannteLaender[$t] = $true
    $t
  }
  $ergebnis = @($liste | Select-Object -Unique)
  if ($ergebnis.Count) { return ($ergebnis -join ', ') } else { return $null }
}

# ---------- Eingaben laden ----------
$links = @{}
if (Test-Path $Quellen) {
  (Get-Content $Quellen -Raw -Encoding UTF8 | ConvertFrom-Json).kinos | ForEach-Object { $links[$_.bezeichnung_in_excel] = $_.programm_url }
}
$infos = @{}
if (Test-Path $FilmInfos) {
  (Get-Content $FilmInfos -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $infos[$_.Name] = $_.Value }
}
$zeilen = @($json.zeilen | Where-Object { $_.Datum })

# ---------- Filme zusammenfuehren ----------
function Get-Jahr4($Wert) { if ("$Wert" -match '^(\d{4})') { $Matches[1] } else { '' } }

$gruppen = [ordered]@{}      # Gruppen-ID -> Film
$schluesselIndex = @{}       # bereinigter Titelschluessel -> Liste von Gruppen-IDs
$rohZuGruppe = @{}           # "Titel|Produktionsjahr" -> Gruppen-ID

function Get-Gruppe([string]$Id) {
  if (-not $gruppen.Contains($Id)) {
    $gruppen[$Id] = [pscustomobject]@{ Id = $Id; Varianten = @{}; Land = $null; Regie = $null; Jahr = $null; Info = $null }
  }
  return $gruppen[$Id]
}
function Add-Schluessel([string]$Schluessel, [string]$Id) {
  if (-not $schluesselIndex.ContainsKey($Schluessel)) { $schluesselIndex[$Schluessel] = New-Object System.Collections.Generic.List[string] }
  if (-not $schluesselIndex[$Schluessel].Contains($Id)) { $schluesselIndex[$Schluessel].Add($Id) }
}

# Erst alle Filme mit TMDB-ID, damit Varianten ohne Treffer sich danach anschliessen koennen
$roh = $zeilen | ForEach-Object { "$($_.Titel)|$($_.Produktionsjahr)" } | Select-Object -Unique
foreach ($r in $roh) {
  $i = $infos[$r]
  if (-not $i -or $i.nichtGefunden -or -not $i.tmdb) { continue }
  $id = "t:$($i.tmdb)"
  $g = Get-Gruppe $id
  $g.Info = $i
  $rohZuGruppe[$r] = $id
  $titel = $r.Substring(0, $r.LastIndexOf('|'))
  Add-Schluessel (Get-TitelSchluessel $titel) $id
  if ($i.titel) { Add-Schluessel (Get-TitelSchluessel $i.titel) $id }
}
foreach ($r in $roh) {
  if ($rohZuGruppe.ContainsKey($r)) { continue }
  $teile = $r.Substring(0, $r.LastIndexOf('|')), $r.Substring($r.LastIndexOf('|') + 1)
  $schluessel = Get-TitelSchluessel $teile[0]
  $jahr = Get-Jahr4 $teile[1]
  # Gleicher Titel und passendes Jahr (gleich oder eines fehlt) gilt als derselbe Film
  $id = $null
  if ($schluesselIndex.ContainsKey($schluessel)) {
    foreach ($kandidat in $schluesselIndex[$schluessel]) {
      $g = $gruppen[$kandidat]
      $gJahr = if ($g.Info -and $g.Info.jahr) { $g.Info.jahr } else { ($g.Varianten.Keys | ForEach-Object { $_.Split('|')[1] } | Where-Object { $_ } | Select-Object -First 1) }
      if (-not $jahr -or -not $gJahr -or [math]::Abs([int]$jahr - [int]$gJahr) -le 1) { $id = $kandidat; break }
    }
  }
  if (-not $id) { $id = "k:$schluessel|$jahr" }
  $null = Get-Gruppe $id
  $rohZuGruppe[$r] = $id
  Add-Schluessel $schluessel $id
}

# Varianten zaehlen und Angaben sammeln (Angaben aus dem Bestand haben Vorrang vor TMDB)
foreach ($z in $zeilen) {
  $g = $gruppen[$rohZuGruppe["$($z.Titel)|$($z.Produktionsjahr)"]]
  $v = "$(Get-BereinigterTitel $z.Titel)|$(Get-Jahr4 $z.Produktionsjahr)"
  $g.Varianten[$v] = 1 + [int]$g.Varianten[$v]
  if (-not $g.Land -and $z.Land -and $z.Land -ne '?') { $g.Land = $z.Land }
  if (-not $g.Regie -and $z.'Regisseur:in' -and $z.'Regisseur:in' -ne '?') { $g.Regie = $z.'Regisseur:in' }
  if (-not $g.Jahr -and $z.Produktionsjahr) { $g.Jahr = [string]$z.Produktionsjahr }
  if (-not $g.Info) { $i = $infos["$($z.Titel)|$($z.Produktionsjahr)"]; if ($i -and -not $i.nichtGefunden) { $g.Info = $i } }
}

# ---------- Eigener Score ----------
# Je Quelle (0-100): 1. wenige Stimmen zum Durchschnitt der Quelle ziehen (Daempfung),
# 2. auf Abstand vom Mittelwert umrechnen (z-Wert), damit z. B. ein Tomatometer von 95 % nicht automatisch
#    mehr zaehlt als ein IMDb-Wert von 7,5, 3. gewichtet mitteln, 4. zurueck auf eine Skala von 0 bis 100.
# Gewichte und Daempfung stehen in daten/score-gewichte.json. Einzelwerte erscheinen nicht auf der Website.
$scoreDatei = "$PSScriptRoot/../daten/score-gewichte.json"
$wertungsDatei = "$PSScriptRoot/../daten/wertungen.json"
$gewichte = @{}; $daempfung = @{}
if (Test-Path $scoreDatei) {
  $sg = Get-Content $scoreDatei -Raw -Encoding UTF8 | ConvertFrom-Json
  $sg.gewichte.PSObject.Properties | ForEach-Object { $gewichte[$_.Name] = [double]$_.Value }
  $sg.daempfung.PSObject.Properties | ForEach-Object { $daempfung[$_.Name] = [double]$_.Value }
}
# Gewonnene Hauptpreise je TMDB-ID (tools/preise.ps1), in fester Reihenfolge fuer die Anzeige
$preisDatei = "$PSScriptRoot/../daten/preise.json"
$preisReihenfolge = @{ oscar = 1; palme = 2; baer = 3; loewe = 4; tokio = 5 }
$preise = @{}
if (Test-Path $preisDatei) {
  (Get-Content $preisDatei -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object {
    # Als Objekte, nicht als verschachtelte Listen: Windows PowerShell 5.1 schreibt diese sonst mit "value"/"Count" ins JSON
    $preise[$_.Name] = @($_.Value | Sort-Object { $preisReihenfolge[$_.preis] }, jahr | ForEach-Object { [pscustomobject][ordered]@{ p = $_.preis; k = $_.kategorie; j = $_.jahr } })
  }
}
$mdb = @{}
if (Test-Path $wertungsDatei) { (Get-Content $wertungsDatei -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $mdb[$_.Name] = $_.Value } }

# Rohwerte je Film sammeln
$wertRoh = @{}   # Gruppen-ID -> @{ quelle = @{ wert; stimmen } }
foreach ($g in $gruppen.Values) {
  if (-not $g.Info -or -not $g.Info.tmdb) { continue }
  $q = @{}
  $m = $mdb[[string]$g.Info.tmdb]
  if ($m -and $m.quellen) {
    foreach ($p in $m.quellen.PSObject.Properties) {
      if (-not $gewichte.ContainsKey($p.Name)) { continue }
      $wert = [double]$p.Value.wert
      # Absicherung: Werte ausserhalb von 0-100 (z. B. doppelt umgerechnet) nicht verwenden
      if ($wert -le 0 -or $wert -gt 100) { continue }
      $q[$p.Name] = @{ wert = $wert; stimmen = $(if ($p.Value.stimmen) { [double]$p.Value.stimmen } else { $null }) }
    }
  }
  # TMDB-Wertung aus filminfos.json, falls MDBList sie nicht liefert
  if (-not $q.ContainsKey('tmdb') -and $g.Info.bewertung) {
    $q['tmdb'] = @{ wert = 10 * [double](([string]$g.Info.bewertung).Replace(',', '.')); stimmen = $(if ($g.Info.stimmen) { [double]$g.Info.stimmen } else { $null }) }
  }
  if ($q.Count) { $wertRoh[$g.Id] = $q }
}

# Kennzahlen je Quelle ueber alle Filme
$statistik = @{}
foreach ($quelle in $gewichte.Keys) {
  $werte = @($wertRoh.Values | Where-Object { $_.ContainsKey($quelle) } | ForEach-Object { $_[$quelle].wert })
  if ($werte.Count -lt 10) { continue }   # zu wenige Filme fuer eine verlaessliche Verteilung
  $mittel = ($werte | Measure-Object -Average).Average
  # Daempfung: (Stimmen * Wert + k * Mittel) / (Stimmen + k)
  $k = $daempfung[$quelle]
  foreach ($film in $wertRoh.Values) {
    if (-not $film.ContainsKey($quelle)) { continue }
    $e = $film[$quelle]
    $e.angepasst = if ($k -and $null -ne $e.stimmen) { ($e.stimmen * $e.wert + $k * $mittel) / ($e.stimmen + $k) } else { $e.wert }
  }
  $angepasst = @($wertRoh.Values | Where-Object { $_.ContainsKey($quelle) } | ForEach-Object { $_[$quelle].angepasst })
  $m2 = ($angepasst | Measure-Object -Average).Average
  $sd = [math]::Sqrt((($angepasst | ForEach-Object { ($_ - $m2) * ($_ - $m2) } | Measure-Object -Sum).Sum) / [math]::Max(1, $angepasst.Count - 1))
  if ($sd -lt 1) { $sd = 1 }
  $statistik[$quelle] = @{ mittel = $m2; sd = $sd }
}
# Bezugsskala: gewichtetes Mittel der Quellen, damit der Score wie eine gewohnte 0-100-Wertung aussieht
$summeG = ($statistik.Keys | ForEach-Object { $gewichte[$_] } | Measure-Object -Sum).Sum
$bezugMittel = if ($summeG) { ($statistik.Keys | ForEach-Object { $gewichte[$_] * $statistik[$_].mittel } | Measure-Object -Sum).Sum / $summeG } else { 0 }
$bezugSd = if ($summeG) { ($statistik.Keys | ForEach-Object { $gewichte[$_] * $statistik[$_].sd } | Measure-Object -Sum).Sum / $summeG } else { 0 }

$scores = @{}
foreach ($id in $wertRoh.Keys) {
  $sz = 0.0; $sw = 0.0
  foreach ($quelle in $statistik.Keys) {
    if (-not $wertRoh[$id].ContainsKey($quelle)) { continue }
    $z = ($wertRoh[$id][$quelle].angepasst - $statistik[$quelle].mittel) / $statistik[$quelle].sd
    $sz += $gewichte[$quelle] * $z; $sw += $gewichte[$quelle]
  }
  if ($sw -gt 0) { $scores[$id] = [int][math]::Max(1, [math]::Min(99, [math]::Round($bezugMittel + $bezugSd * $sz / $sw))) }
}

# ---------- Ausgabe aufbauen ----------
$kinos = New-Object System.Collections.Generic.List[string]
$kinoLinks = New-Object System.Collections.Generic.List[object]
$kinoIndex = @{}
$filme = New-Object System.Collections.Generic.List[object]
$filmIndex = @{}
$genutzteLaender = @{}

foreach ($g in $gruppen.Values) {
  # Anzeigetitel: die haeufigste Variante, bei Gleichstand die, die dem deutschen TMDB-Titel entspricht
  $tmdbSchluessel = if ($g.Info -and $g.Info.titel) { Get-TitelSchluessel $g.Info.titel } else { '' }
  $titel = ($g.Varianten.GetEnumerator() | Sort-Object @{ Expression = { $_.Value }; Descending = $true }, @{ Expression = { (Get-TitelSchluessel $_.Key.Split('|')[0]) -ne $tmdbSchluessel } } | Select-Object -First 1).Key.Split('|')[0]
  $i = $g.Info
  $land = Get-EinheitlicheLaender $(if ($g.Land) { $g.Land } elseif ($i) { $i.land } else { $null })
  $regie = if ($g.Regie) { $g.Regie } elseif ($i) { $i.regie } else { $null }
  $jahr = if ($g.Jahr) { $g.Jahr } elseif ($i) { $i.jahr } else { $null }
  if ($land) { $land.Split(',') | ForEach-Object { $genutzteLaender[$_.Trim()] = $true } }
  $eintrag = @($titel, $land, $regie, $jahr)
  if ($i) {
    # Nur Plakat, TMDB-ID und eigener Score gehen auf die Website, keine Einzelwertungen
    $zusatz = [ordered]@{}
    foreach ($f in 'poster', 'tmdb') { if ($i.$f) { $zusatz[$f] = $i.$f } }
    if ($scores.ContainsKey($g.Id)) { $zusatz.score = $scores[$g.Id] }
    if ($i.tmdb -and $preise.ContainsKey([string]$i.tmdb)) { $zusatz.preise = $preise[[string]$i.tmdb] }
    if ($zusatz.Count) { $eintrag += , $zusatz }
  }
  $filmIndex[$g.Id] = $filme.Count
  $filme.Add($eintrag)
}

$termine = New-Object System.Collections.Generic.List[object]
$doppelt = @{}
foreach ($z in $zeilen) {
  if (-not $kinoIndex.ContainsKey($z.Kino)) {
    $kinoIndex[$z.Kino] = $kinos.Count
    $kinos.Add($z.Kino)
    $kinoLinks.Add($links[$z.Kino])
  }
  $f = $filmIndex[$rohZuGruppe["$($z.Titel)|$($z.Produktionsjahr)"]]
  $d = ConvertTo-IsoText $z.Datum
  $s = "$f|$($kinoIndex[$z.Kino])|$d"
  if ($doppelt.ContainsKey($s)) { continue }
  $doppelt[$s] = $true
  $termine.Add(@($f, $kinoIndex[$z.Kino], $d))
}

$codes = [ordered]@{}
foreach ($l in ($genutzteLaender.Keys | Sort-Object)) { if ($landCode[$l]) { $codes[$l] = $landCode[$l] } }

$daten = [ordered]@{
  stand        = $(if ($json.stand) { ConvertTo-IsoText $json.stand } else { Get-Date -Format 'yyyy-MM-dd' })
  quelle       = (Split-Path $Quelle -Leaf)
  kinos        = $kinos
  kinoLinks    = $kinoLinks
  laenderCodes = $codes
  filme        = $filme
  termine      = $termine
}

$inhalt = "window.KINO_DATA = " + ($daten | ConvertTo-Json -Depth 5 -Compress) + ";"
$zielPfad = Join-Path (Resolve-Path (Split-Path $Ziel)).Path (Split-Path $Ziel -Leaf)
[System.IO.File]::WriteAllText($zielPfad, $inhalt, (New-Object System.Text.UTF8Encoding $false))

$mitInfo = @($filme | Where-Object { $_.Count -gt 4 }).Count
$zusammen = @($roh).Count - $filme.Count
"$($termine.Count) Termine, $($filme.Count) Filme ($mitInfo mit TMDB-Angaben, $zusammen Varianten zusammengefuehrt), $($kinos.Count) Kinos -> $zielPfad"
"Score: $($scores.Count) Filme, Quellen im Score: " + (($statistik.Keys | Sort-Object | ForEach-Object { "$_ (Mittel $([math]::Round($statistik[$_].mittel)), Streuung $([math]::Round($statistik[$_].sd)))" }) -join ', ')
$ohneFlagge = @($unbekannteLaender.Keys | Sort-Object)
if ($ohneFlagge.Count) { "Unbekannte Laenderangaben (bitte in build-data.ps1 ergaenzen): " + ($ohneFlagge -join ', ') }
