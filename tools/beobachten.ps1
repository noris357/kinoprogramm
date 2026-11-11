# Beobachtet, wann die Kinos ihr Programm veroeffentlichen. Liest alle Kinoseiten aus, aendert den Bestand nicht,
# und haengt je Kino eine Zeile an daten/beobachtung.csv an:
#   zeitpunkt   Abrufzeit in deutscher Zeit
#   kino, ok    Kino und ob das Auslesen geklappt hat
#   termine     Anzahl Film-Tag-Termine ab heute
#   dicht_bis   letzter Tag mit regulaerem Programm (mindestens halb so viele Filme wie an einem ueblichen Tag
#               der naechsten Woche). Einzelne Sondertermine weit voraus zaehlen nicht.
#   letzter     letzter Tag mit irgendeinem Termin
#   kennung     Pruefsumme ueber alle Termine. Aendert sie sich, hat das Kino sein Programm geaendert.
# Aufruf aus dem Ordner website:  pwsh -File tools/beobachten.ps1

$tools = $PSScriptRoot
. (Join-Path $tools 'gemeinsam.ps1')
Get-ChildItem (Join-Path $tools 'quellen') -Filter *.ps1 | ForEach-Object { . $_.FullName }
$datei = Join-Path (Resolve-Path "$tools/../daten").Path 'beobachtung.csv'

$tz = [TimeZoneInfo]::FindSystemTimeZoneById($(if ($IsLinux -or $IsMacOS) { 'Europe/Berlin' } else { 'W. Europe Standard Time' }))
$jetzt = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
$heute = $jetzt.ToString('yyyy-MM-dd')

$zeilen = New-Object System.Collections.Generic.List[string]
foreach ($g in @(Get-AlleProgramme) | Group-Object Kino) {
  $ok = @($g.Group | Where-Object Ok)
  $termine = @($ok | ForEach-Object { $_.Termine } | Where-Object { $_.Datum -ge $heute } | ForEach-Object { "$(Get-TitelSchluessel $_.Titel)|$($_.Datum)" } | Sort-Object -Unique)
  $dichtBis = ''; $letzter = ''; $kennung = ''
  if ($termine.Count) {
    $proTag = $termine | Group-Object { $_.Split('|')[1] } | Sort-Object Name
    $letzter = $proTag[-1].Name
    # Ueblicher Tag: Median der Filmanzahl in den naechsten 7 Tagen
    $woche = @($proTag | Where-Object { $_.Name -le (Get-Date $heute).AddDays(6).ToString('yyyy-MM-dd') } | ForEach-Object Count | Sort-Object)
    $ueblich = if ($woche.Count) { $woche[[int]($woche.Count / 2)] } else { 1 }
    $schwelle = [math]::Max(1, [math]::Ceiling($ueblich / 2))
    # Ab heute Tag fuer Tag weiter, bis ein Tag deutlich duenner besetzt ist
    $tag = Get-Date $heute
    $zaehler = @{}; $proTag | ForEach-Object { $zaehler[$_.Name] = $_.Count }
    for ($i = 0; $i -lt 120; $i++) {
      $d = $tag.AddDays($i).ToString('yyyy-MM-dd')
      if ([int]$zaehler[$d] -ge $schwelle) { $dichtBis = $d } elseif ($i -gt 0) { break }
    }
    $sha = [System.Security.Cryptography.SHA1]::Create()
    $kennung = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($termine -join "`n")))) -replace '-', '').Substring(0, 10)
  }
  $zeilen.Add(('{0},"{1}",{2},{3},{4},{5},{6}' -f $jetzt.ToString('yyyy-MM-dd HH:mm'), $g.Name, [int]($ok.Count -gt 0), $termine.Count, $dichtBis, $letzter, $kennung))
  '{0,-26} ok={1} termine={2,4} dicht_bis={3} letzter={4} kennung={5}' -f $g.Name, [int]($ok.Count -gt 0), $termine.Count, $dichtBis, $letzter, $kennung
}

if (-not (Test-Path $datei)) { [IO.File]::WriteAllText($datei, "zeitpunkt,kino,ok,termine,dicht_bis,letzter,kennung`n", (New-Object System.Text.UTF8Encoding $false)) }
[IO.File]::AppendAllText($datei, (($zeilen -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))
