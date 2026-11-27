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

# -Region hamburg baut die Datendatei einer anderen Region (siehe daten/regionen.json), Standard ist nuernberg.
# Programm, Auslastung, Festivals und Erfassungslücke kommen aus dem Ordner der Region, Filmangaben sind gemeinsam.
param(
  [string]$Region    = 'nuernberg',
  [string]$Quelle    = '',
  [string]$Quellen   = "$PSScriptRoot/../daten/quellen.json",
  [string]$FilmInfos = "$PSScriptRoot/../daten/filminfos.json",
  [string]$Ziel      = ''
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/gemeinsam.ps1"
$regionInfo = Get-Region $Region
$regionOrdner = $regionInfo.pfad
if (-not $Quelle) {
  $Quelle = Join-Path $regionOrdner 'programm.json'
  if (-not (Test-Path $Quelle) -and $Region -eq 'nuernberg') { $Quelle = "$PSScriptRoot/../../Kinoprogramm_entpivotiert.json" }
}
if (-not $Ziel) { $Ziel = $regionInfo.ziel }
$json = if (Test-Path $Quelle) { Get-Content $Quelle -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{ stand = $null; zeilen = @() } }

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
  'Jamaika'='JM'
  'UdSSR'=$null; 'Niederländische Antillen'=$null; 'Jugoslawien'=$null; 'Tschechoslowakei'=$null; 'DDR'=$null
}
# Schreibweisen und Kuerzel aus Bestand und TMDB auf die einheitlichen Namen abbilden
$landAlias = @{
  'Vereinigte Staaten'='USA'; 'Vereinigte Staaten von Amerika'='USA'; 'US'='USA'; 'United States'='USA'
  'Vereinigtes Königreich'='Großbritannien'; 'UK'='Großbritannien'; 'GB'='Großbritannien'; 'England'='Großbritannien'
  'Turkey'='Türkei'; 'It'='Italien'; 'BRD'='Deutschland'; 'IE'='Irland'; 'AF'='Afghanistan'; 'GE'='Georgien'
  'Kap Verde'='Kapverden'; 'Palästinensische Autonomiegebiete'='Palästina'; 'Mazedonien'='Nordmazedonien'
  # Englische Schreibweise wie in filminfos.json; Jamaika fehlte in $landCode
  'Jamaica'='Jamaika'
  # Das typografische Apostroph beendet in PowerShell auch Texte in einfachen Hochkommas, daher als Zeichencode
  ("Côte d$([char]0x2019)Ivoire")='Elfenbeinküste'; "Côte d'Ivoire"='Elfenbeinküste'; 'Volksrepublik China'='China'
  'Russische Föderation'='Russland'; 'Korea'='Südkorea'; 'Republik Korea'='Südkorea'; 'Weißrussland'='Belarus'
  'Tschechische Republik'='Tschechien'; 'Holland'='Niederlande'
  # Kurzform der alten Bundesrepublik und Laenderkuerzel, die im Bestand als Text auftauchen
  'BR Deutschland'='Deutschland'; 'CR'='Costa Rica'
  'East Germany'='DDR'; 'Soviet Union'='UdSSR'
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
# Handliste fuer Regienamen ohne lateinischen Namen bei TMDB: Originalname -> gewuenschter Name
$regieKorrekturen = @{}
$korrekturDatei = "$PSScriptRoot/../daten/titel-korrekturen.json"
if (Test-Path $korrekturDatei) {
  $rk = (Get-Content $korrekturDatei -Raw -Encoding UTF8 | ConvertFrom-Json).regieKorrekturen
  if ($rk) { $rk.PSObject.Properties | ForEach-Object { $regieKorrekturen[$_.Name] = $_.Value } }
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
#    mehr zaehlt als ein IMDb-Wert von 7,5, 3. gewichtet mitteln, 4. zurueck auf eine Skala von 0 bis 100,
# 5. nach oben auf den hoechsten Einzelwert des Films begrenzen.
# Gewichte, Daempfung, Umverteilung und Mindeststreuung stehen in daten/score-gewichte.json. Einzelwerte erscheinen nicht auf der Website.
$scoreDatei = "$PSScriptRoot/../daten/score-gewichte.json"
$wertungsDatei = "$PSScriptRoot/../daten/wertungen.json"
$gewichte = @{}; $daempfung = @{}
$umverteilung = 1.0; $mindestStreuung = 1.0
if (Test-Path $scoreDatei) {
  $sg = Get-Content $scoreDatei -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($null -ne $sg.umverteilung) { $umverteilung = [double]$sg.umverteilung }
  if ($null -ne $sg.mindeststreuung) { $mindestStreuung = [double]$sg.mindeststreuung }
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
function Get-Quellwerte($Info) {
  $q = @{}
  $m = $mdb[[string]$Info.tmdb]
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
  if (-not $q.ContainsKey('tmdb') -and $Info.bewertung) {
    $q['tmdb'] = @{ wert = 10 * [double](([string]$Info.bewertung).Replace(',', '.')); stimmen = $(if ($Info.stimmen) { [double]$Info.stimmen } else { $null }) }
  }
  $q
}
$wertRoh = @{}   # Gruppen-ID -> @{ quelle = @{ wert; stimmen } }
foreach ($g in $gruppen.Values) {
  if (-not $g.Info -or -not $g.Info.tmdb) { continue }
  $q = Get-Quellwerte $g.Info
  if ($q.Count) { $wertRoh[$g.Id] = $q }
}
# Bezugsgruppe fuer Mittelwert und Streuung: alle Filme aller Regionen (filminfos.json, je TMDB-ID einmal).
# So bekommt ein Film in jeder Region denselben Score.
$bezugRoh = @{}
foreach ($i in $infos.Values) {
  if (-not $i -or $i.nichtGefunden -or -not $i.tmdb -or $bezugRoh.ContainsKey([string]$i.tmdb)) { continue }
  $q = Get-Quellwerte $i
  if ($q.Count) { $bezugRoh[[string]$i.tmdb] = $q }
}

# Kennzahlen je Quelle ueber alle Filme der Bezugsgruppe
$statistik = @{}
foreach ($quellName in $gewichte.Keys) {
  $werte = @($bezugRoh.Values | Where-Object { $_.ContainsKey($quellName) } | ForEach-Object { $_[$quellName].wert })
  if ($werte.Count -lt 10) { continue }   # zu wenige Filme fuer eine verlaessliche Verteilung
  $mittel = ($werte | Measure-Object -Average).Average
  # Daempfung: (Stimmen * Wert + k * Mittel) / (Stimmen + k), fuer die Bezugsgruppe und die Filme der Region
  $k = $daempfung[$quellName]
  foreach ($film in @($bezugRoh.Values) + @($wertRoh.Values)) {
    if (-not $film.ContainsKey($quellName)) { continue }
    $e = $film[$quellName]
    $e.angepasst = if ($k -and $null -ne $e.stimmen) { ($e.stimmen * $e.wert + $k * $mittel) / ($e.stimmen + $k) } else { $e.wert }
  }
  $angepasst = @($bezugRoh.Values | Where-Object { $_.ContainsKey($quellName) } | ForEach-Object { $_[$quellName].angepasst })
  $m2 = ($angepasst | Measure-Object -Average).Average
  $sd = [math]::Sqrt((($angepasst | ForEach-Object { ($_ - $m2) * ($_ - $m2) } | Measure-Object -Sum).Sum) / [math]::Max(1, $angepasst.Count - 1))
  # Mindeststreuung: bei eng streuenden Quellen wuerden kleine Unterschiede sonst zu grossen z-Werten
  if ($sd -lt $mindestStreuung) { $sd = $mindestStreuung }
  $statistik[$quellName] = @{ mittel = $m2; sd = $sd }
}
# Bezugsskala: gewichtetes Mittel der Quellen, damit der Score wie eine gewohnte 0-100-Wertung aussieht
$summeG = ($statistik.Keys | ForEach-Object { $gewichte[$_] } | Measure-Object -Sum).Sum
$bezugMittel = if ($summeG) { ($statistik.Keys | ForEach-Object { $gewichte[$_] * $statistik[$_].mittel } | Measure-Object -Sum).Sum / $summeG } else { 0 }
$bezugSd = if ($summeG) { ($statistik.Keys | ForEach-Object { $gewichte[$_] * $statistik[$_].sd } | Measure-Object -Sum).Sum / $summeG } else { 0 }

$scores = @{}
$scoresGenau = @{}
foreach ($id in $wertRoh.Keys) {
  $sz = 0.0; $sw = 0.0; $roh = @()
  foreach ($quellName in $statistik.Keys) {
    if (-not $wertRoh[$id].ContainsKey($quellName)) { continue }
    $z = ($wertRoh[$id][$quellName].angepasst - $statistik[$quellName].mittel) / $statistik[$quellName].sd
    $sz += $gewichte[$quellName] * $z; $sw += $gewichte[$quellName]; $roh += $wertRoh[$id][$quellName].angepasst
  }
  if ($sw -gt 0) {
    # Fehlende Quellen: nur der Anteil $umverteilung ihres Gewichts geht an die uebrigen, der Rest zaehlt wie ein Durchschnittswert (z = 0)
    $nenner = $sw + (1 - $umverteilung) * ($summeG - $sw)
    $wert = $bezugMittel + $bezugSd * $sz / $nenner
    # Nie ueber dem hoechsten Einzelwert des Films (nach Daempfung, sonst wuerden Wertungen mit wenigen Stimmen den Score festlegen).
    # Bewusst keine Untergrenze: bei nur einer Quelle wuerde sie den Score auf deren Rohwert festlegen.
    $wert = [math]::Min($wert, ($roh | Measure-Object -Maximum).Maximum)
    $scores[$id] = [int][math]::Max(1, [math]::Min(99, [math]::Round($wert)))
    # Genauer Wert mit drei Nachkommastellen, nur fuer die Rangfolge (angezeigt wird die ganze Zahl)
    # 1.0 statt 1: sonst waehlt PowerShell Max(int, int) und schneidet die Nachkommastellen ab
    $scoresGenau[$id] = [math]::Round([math]::Max(1.0, [math]::Min(99.499, [double]$wert)), 3)
  }
}

# ---------- Ausgabe aufbauen ----------
$kinos = New-Object System.Collections.Generic.List[string]
$kinoLinks = New-Object System.Collections.Generic.List[object]
$kinoIndex = @{}
$filme = New-Object System.Collections.Generic.List[object]
$filmIndex = @{}
$genutzteLaender = @{}

# Regie-Angaben von TMDB (tools/personen.ps1): Foto, Geburtsjahr, Geburtsort, Zahl der Spielfilme als Regie
$filmRegie = @{}
$personenDaten = @{}
$personenAusgabe = [ordered]@{}
$personenDatei = "$PSScriptRoot/../daten/personen.json"
if (Test-Path $personenDatei) {
  $pj = Get-Content $personenDatei -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($pj.filmRegie) { $pj.filmRegie.PSObject.Properties | ForEach-Object { $filmRegie[$_.Name] = @($_.Value) } }
  if ($pj.personen) { $pj.personen.PSObject.Properties | ForEach-Object { $personenDaten[$_.Name] = $_.Value } }
}
function Get-NamensSchluessel([string]$Name) {
  $t = $Name.Normalize([Text.NormalizationForm]::FormD)
  $t = [regex]::Replace($t, '\p{Mn}', '').ToLowerInvariant().Replace('ß', 'ss').Replace('ø', 'o').Replace('ł', 'l')
  return [regex]::Replace($t, '[^\p{L}\p{Nd}]', '')
}

foreach ($g in $gruppen.Values) {
  # Anzeigetitel: die haeufigste Variante, bei Gleichstand die, die dem deutschen TMDB-Titel entspricht
  $tmdbSchluessel = if ($g.Info -and $g.Info.titel) { Get-TitelSchluessel $g.Info.titel } else { '' }
  $titel = ($g.Varianten.GetEnumerator() | Sort-Object @{ Expression = { $_.Value }; Descending = $true }, @{ Expression = { (Get-TitelSchluessel $_.Key.Split('|')[0]) -ne $tmdbSchluessel } } | Select-Object -First 1).Key.Split('|')[0]
  # Titel in fremder Schrift (z. B. Koreanisch "국제시장"): lateinischen Titel von TMDB nehmen, sofern vorhanden
  if ((Test-FremdeSchrift $titel) -and $g.Info -and $g.Info.titel -and -not (Test-FremdeSchrift $g.Info.titel)) { $titel = [string]$g.Info.titel }
  $i = $g.Info
  $land = Get-EinheitlicheLaender $(if ($g.Land) { $g.Land } elseif ($i) { $i.land } else { $null })
  $regie = if ($g.Regie) { $g.Regie } elseif ($i) { $i.regie } else { $null }
  if ($regie -and $regieKorrekturen.Count) {
    $regie = (@($regie -split '\s*,\s*' | ForEach-Object { if ($regieKorrekturen.ContainsKey($_)) { $regieKorrekturen[$_] } else { $_ } }) | Select-Object -Unique) -join ', '
  }
  # Regie-Personen von TMDB (tools/personen.ps1) dem angezeigten Namen zuordnen:
  # gleicher Name (ohne Akzente und Zeichen) oder, bei genau einer Person auf beiden Seiten, direkt
  if ($regie -and $i -and $i.tmdb -and $filmRegie.ContainsKey([string]$i.tmdb)) {
    $tmdbRegie = @($filmRegie[[string]$i.tmdb])
    $namen = @($regie -split '\s*,\s*' | Where-Object { $_ })
    foreach ($n in $namen) {
      if ($personenAusgabe.Contains($n)) { continue }
      $treffer = @($tmdbRegie | Where-Object { (Get-NamensSchluessel $_.name) -eq (Get-NamensSchluessel $n) })
      if (-not $treffer.Count -and $namen.Count -eq 1 -and $tmdbRegie.Count -eq 1) { $treffer = $tmdbRegie }
      if (-not $treffer.Count) { continue }
      $p = $personenDaten[[string]$treffer[0].id]
      if (-not $p) { continue }
      # Kompakt: [Foto, Geburtsjahr, Todesjahr, Geburtsort, Spielfilme als Regie, Letterboxd-Adresse (leer: Suche)]
      $personenAusgabe[$n] = @($p.foto, $p.geboren, $p.gestorben, $p.ort, $p.regiearbeiten, $p.letterboxd)
    }
  }
  $jahr = if ($g.Jahr) { $g.Jahr } elseif ($i) { $i.jahr } else { $null }
  if ($land) { $land.Split(',') | ForEach-Object { $genutzteLaender[$_.Trim()] = $true } }
  $eintrag = @($titel, $land, $regie, $jahr)
  if ($i) {
    # Nur Plakat, TMDB-ID und eigener Score gehen auf die Website, keine Einzelwertungen
    $zusatz = [ordered]@{}
    foreach ($f in 'poster', 'tmdb', 'kinostart', 'laufzeit') { if ($i.$f) { $zusatz[$f] = $i.$f } }
    if ($i.genres) { $zusatz.genres = @($i.genres) }
    if ($scores.ContainsKey($g.Id)) { $zusatz.score = $scores[$g.Id]; $zusatz.scoreGenau = $scoresGenau[$g.Id] }
    if ($i.tmdb -and $preise.ContainsKey([string]$i.tmdb)) { $zusatz.preise = $preise[[string]$i.tmdb] }
    if ($zusatz.Count) { $eintrag += , $zusatz }
  }
  $filmIndex[$g.Id] = $filme.Count
  $filme.Add($eintrag)
}

$termine = New-Object System.Collections.Generic.List[object]
$reihen = New-Object System.Collections.Generic.List[string]
$reiheIndex = @{}
$filmLinks = New-Object System.Collections.Generic.List[string]
$linkIndex = @{}
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
  # Vierter Wert: Index der Reihe in "reihen" (bisher nur Filmhaus), fuenfter: Index des Links zur Filmseite des Kinos
  # in "filmLinks" (nur kommende Termine). Fehlt beides, entfallen sie, fehlt nur die Reihe, steht dort null.
  $r = $null; $l = $null
  if ($z.PSObject.Properties['Reihe'] -and $z.Reihe) {
    if (-not $reiheIndex.ContainsKey($z.Reihe)) { $reiheIndex[$z.Reihe] = $reihen.Count; $reihen.Add($z.Reihe) }
    $r = $reiheIndex[$z.Reihe]
  }
  if ($z.PSObject.Properties['Link'] -and $z.Link) {
    if (-not $linkIndex.ContainsKey($z.Link)) { $linkIndex[$z.Link] = $filmLinks.Count; $filmLinks.Add($z.Link) }
    $l = $linkIndex[$z.Link]
  }
  if ($null -ne $l) { $termine.Add(@($f, $kinoIndex[$z.Kino], $d, $r, $l)) }
  elseif ($null -ne $r) { $termine.Add(@($f, $kinoIndex[$z.Kino], $d, $r)) }
  else { $termine.Add(@($f, $kinoIndex[$z.Kino], $d)) }
}

# ---------- Festivals aus Reihen erkennen ----------
# Reihen mit Festival-Namen (Filmtage, Festival, Filmwoche ...) werden zu Vorschlägen in daten/festivals-erkannt.json.
# Zeitraum vom ersten bis zum letzten Termin, mehr als 21 Tage Pause trennt zwei Ausgaben.
# Von Hand gepflegte Festivals mit passendem Feld "reihe" haben auf der Website Vorrang.
$erkannt = New-Object System.Collections.Generic.List[object]
$festivalMuster = '(?i)filmtage|musiktage|kinotage|festival|filmfest|filmwoche|filmtag\b|cinema!\s*italia'
foreach ($g in @($termine | Where-Object { $_.Count -gt 3 -and $null -ne $_[3] } | Group-Object { "$($_[1])|$($_[3])" })) {
  $k = [int]$g.Group[0][1]
  foreach ($teil in ($reihen[[int]$g.Group[0][3]] -split '\s*\|\s*')) {
    if ($teil -notmatch $festivalMuster) { continue }
    $tage = @($g.Group | ForEach-Object { $_[2] } | Sort-Object -Unique)
    $abschnitte = New-Object System.Collections.Generic.List[object]
    foreach ($t in $tage) {
      if ($abschnitte.Count -and ([datetime]$t - [datetime]$abschnitte[-1].bis).TotalDays -le 21) { $abschnitte[-1].bis = $t }
      else { $abschnitte.Add([pscustomobject]@{ von = $t; bis = $t }) }
    }
    $art = if ($teil -match '(?i)kinder|jugend') { 'Kinder' } elseif ($teil -match '(?i)stummfilm|klassik') { 'Klassiker' }
      elseif ($teil -match '(?i)griech|türk|tuerk|ital|franz|span|portug|japan|korea|chines|indi|mittelmeer|latein|poln|ukrain|israel|arab|iran|afrika|nordisch|skandinav|österreich|schweiz|kurd|balkan|russ|tschech|ungar') { 'Länderfokus' }
      else { 'Thema' }
    foreach ($a in $abschnitte) {
      $id = ('auto-' + ($teil.ToLowerInvariant() -replace '[^\p{L}\p{N}]+', '-').Trim('-') + '-' + $a.von.Substring(0, 4))
      $erkannt.Add([pscustomobject][ordered]@{ id = $id; name = ($teil -replace '^\d+\.\s*', ''); ausgabe = $teil; art = $art; von = $a.von; bis = $a.bis; sicher = $true; kinos = @([string]$kinos[$k]); reihe = $teil; automatisch = $true })
    }
  }
}
$erkanntText = ([ordered]@{ hinweis = 'Automatisch aus den Reihen des Filmhauses erkannt (tools/build-data.ps1), nicht von Hand bearbeiten. Zum Bestätigen oder Ergänzen einen Eintrag mit gleichem Feld reihe in festivals.json anlegen.'; festivals = $erkannt.ToArray() } | ConvertTo-Json -Depth 4)
[System.IO.File]::WriteAllText((Join-Path $regionOrdner 'festivals-erkannt.json'), $erkanntText, (New-Object System.Text.UTF8Encoding $false))

# ---------- Auslastung (tools/auslastung.ps1, nur Cinecitta-Gruppe) ----------
# Zuordnung zum Film ueber einen Termin desselben Kinos am selben Tag mit gleichem Titelschluessel.
# Vorstellungen ohne passenden Termin (z. B. ausgeschlossene Veranstaltungen) entfallen.
$auslastung = New-Object System.Collections.Generic.List[object]
$auslastungStand = $null
$auslastungDatei = Join-Path $regionOrdner 'auslastung.json'
if (Test-Path $auslastungDatei) {
  $aj = Get-Content $auslastungDatei -Raw -Encoding UTF8 | ConvertFrom-Json
  $auslastungStand = ConvertTo-IsoText $aj.stand
  $terminFilm = @{}
  foreach ($z in $zeilen) { $terminFilm["$($z.Kino)|$(ConvertTo-IsoText $z.Datum)|$(Get-TitelSchluessel $z.Titel)"] = $filmIndex[$rohZuGruppe["$($z.Titel)|$($z.Produktionsjahr)"]] }
  foreach ($v in @($aj.vorstellungen)) {
    $d = ConvertTo-IsoText $v.Datum
    $f = $terminFilm["$($v.Kino)|$d|$(Get-TitelSchluessel $v.Titel)"]
    if ($null -eq $f -or -not $kinoIndex.ContainsKey($v.Kino)) { continue }
    $auslastung.Add(@($f, $kinoIndex[$v.Kino], $d, $v.Zeit, $v.Stufe, $v.Link))
  }
}

# ---------- Festivals (daten/festivals.json) ----------
# Wird unveraendert weitergegeben, die Zuordnung der Vorstellungen geschieht auf der Website (app.js)
$festivals = @()
$festivalDatei = Join-Path $regionOrdner 'festivals.json'
if (Test-Path $festivalDatei) { $festivals = @((Get-Content $festivalDatei -Raw -Encoding UTF8 | ConvertFrom-Json).festivals) }

# ---------- Erfassungsluecke (daten/luecke.json) ----------
# Zeitraum ohne Programmdaten und einzeln gepruefte Filme, deren Serie "Wochen am Stueck" darueber weiterlaeuft
$luecke = $null
$lueckeDatei = Join-Path $regionOrdner 'luecke.json'
if (Test-Path $lueckeDatei) {
  $lj = Get-Content $lueckeDatei -Raw -Encoding UTF8 | ConvertFrom-Json
  $luecke = [ordered]@{
    von         = ConvertTo-IsoText $lj.luecke.von
    bis         = ConvertTo-IsoText $lj.luecke.bis
    durchgehend = @($lj.durchgehend | ForEach-Object { [int]$_.tmdb })
  }
}

$codes = [ordered]@{}
foreach ($l in ($genutzteLaender.Keys | Sort-Object)) { if ($landCode[$l]) { $codes[$l] = $landCode[$l] } }

$daten = [ordered]@{
  # Angaben zur Region fuer die Website (Ortsfilter, Projektstart, Ordner fuer festivals.json)
  region       = [ordered]@{ id = $regionInfo.id; name = $regionInfo.name; kurz = $regionInfo.kurz; orte = @($regionInfo.orte); ortName = $regionInfo.ortName; start = $regionInfo.start; ordner = $regionInfo.ordner; kinoOrte = $regionInfo.kinoOrte }
  stand        = $(if ($json.stand) { ConvertTo-IsoText $json.stand } else { Get-Date -Format 'yyyy-MM-dd' })
  quelle       = (Split-Path $Quelle -Leaf)
  kinos        = $kinos
  kinoLinks    = $kinoLinks
  laenderCodes = $codes
  filme        = $filme
  termine      = $termine
  auslastungStand = $auslastungStand
  auslastung   = $auslastung
  personen     = $personenAusgabe
  luecke       = $luecke
  festivals    = $festivals
  reihen       = $reihen
  filmLinks    = $filmLinks
  festivalsErkannt = $erkannt.ToArray()
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
