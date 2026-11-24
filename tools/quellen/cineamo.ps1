# Ausleser fuer Kinos ueber die Plattform cineamo.com (robots.txt erlaubt alle Abrufe).
# Genutzt fuer Kinos, deren eigene Seiten automatische Abrufe sperren: Cineplex Fuerth und CinemaxX Hamburg.
# Die Kinoseite /de-DE/kinos/<kennung> enthaelt das Programm der naechsten etwa sieben Tage im eingebetteten
# Seitenzustand: je Film ein Link /de-DE/filme/<name> (Titel dort oft englisch), darunter Listeneintraege je Tag
# ("li","JJJJ-MM-TT"). Den deutschen Titel und das Jahr liefert die Filmseite: <title>Titel (2026) – ...</title>.
# Sondervorstellungen und weiter entfernter Vorverkauf fehlen bei Cineamo. Fuer Cineplex Fuerth ergaenzt deshalb
# eine im Browser gespeicherte Seite in eingang/ (cineplex.ps1).

$script:CineamoKinos = @(
  @{ Kino = 'Cineplex Fürth'; Kennung = 'cineplex-fuerth'; Region = 'nuernberg' }
  @{ Kino = 'CinemaxX Hamburg-Dammtor'; Kennung = 'cinemaxx-hamburg-dammtor'; Region = 'hamburg' }
  @{ Kino = 'CinemaxX Hamburg-Wandsbek'; Kennung = 'cinemaxx-hamburg-wandsbek'; Region = 'hamburg' }
  @{ Kino = 'CinemaxX Hamburg-Harburg'; Kennung = 'cinemaxx-hamburg-harburg'; Region = 'hamburg' }
)
$script:CineamoTitel = @{}   # Filmseite -> deutscher Titel und Jahr, einmal je Lauf abrufen

function Get-CineamoProgramme([string]$Region) {
  foreach ($k in $script:CineamoKinos | Where-Object { $_.Region -eq $Region }) {
    $url = "https://www.cineamo.com/de-DE/kinos/$($k.Kennung)"
    $erg = New-KinoErgebnis $k.Kino $url
    try {
      $html = (Get-Seite $url).Replace('\"', '"')
      $einmal = @{}
      $kennTitel = '","className":"text-body-bold-14 text-cyan hover:underline self-start","children":"'
      foreach ($b in [regex]::Split($html, '"href":"/de-DE/filme/') | Select-Object -Skip 1) {
        $m = [regex]::Match($b, '^([^"]+)' + [regex]::Escape($kennTitel) + '([^"]+)"')
        if (-not $m.Success) { continue }
        $name = $m.Groups[1].Value
        # Nur die Tage dieses Films, bis zum naechsten Filmtitel
        $ende = $b.IndexOf('text-body-bold-14 text-cyan', $m.Length); if ($ende -lt 0) { $ende = $b.Length }
        $tage = @([regex]::Matches($b.Substring(0, $ende), '"li","(\d{4}-\d\d-\d\d)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
        if (-not $tage.Count) { continue }
        if (-not $script:CineamoTitel.ContainsKey($name)) {
          $info = @{ Titel = ($m.Groups[2].Value -replace '\\u0026', '&'); Jahr = $null }
          try {
            $t = [regex]::Match((Get-Seite "https://www.cineamo.com/de-DE/filme/$name"), '<title>([^<]+?) \((\d{4})\) ')
            if ($t.Success) { $info.Titel = [System.Net.WebUtility]::HtmlDecode($t.Groups[1].Value); $info.Jahr = $t.Groups[2].Value }
          } catch { }
          $script:CineamoTitel[$name] = $info
        }
        $info = $script:CineamoTitel[$name]
        foreach ($d in $tage) {
          $s = "$($info.Titel)|$d"
          if ($einmal.ContainsKey($s)) { continue }
          $einmal[$s] = $true
          $erg.Termine.Add([pscustomobject]@{ Titel = $info.Titel; Datum = $d; Jahr = $info.Jahr })
        }
      }
      $alle = @($erg.Termine | ForEach-Object Datum | Sort-Object)
      $erg.Von = (Get-Heute).ToString('yyyy-MM-dd')
      $erg.Bis = if ($alle.Count) { $alle[-1] } else { $erg.Von }
      $erg.Ok = $alle.Count -gt 0
      if (-not $erg.Ok) { $erg.Fehler = 'Keine Vorstellungen gefunden' }
    } catch { $erg.Fehler = $_.Exception.Message }
    $erg
  }
}
