# Ausleser fuer die Programmseiten der Cinecitta-Gruppe.
# Cinecitta, Meisengeige, Metropolis und Manhattan teilen die Betreiberseite, sind aber getrennte Kinos.
# Aufbau je Film: Link "Filminfos zu <Titel>", darunter Tabellen mit Tagen als Spalten und Saelen als Zeilen.

$script:CinecittaKinos = [ordered]@{
  'Cinecitta Nürnberg'        = 'https://www.cinecitta.de/programm/'
  'Meisengeige Nürnberg'      = 'https://www.cinecitta.de/programm/meisengeige/'
  'Metropolis Nürnberg'       = 'https://www.cinecitta.de/programm/metropolis/'
  'Manhatten Deluxe Erlangen' = 'https://www.cinecitta.de/programm/manhattan/'
}

function Read-CinecittaSeite([string]$Html) {
  $termine = New-Object System.Collections.Generic.List[object]
  $titelTreffer = [regex]::Matches($Html, 'aria-label="Filminfos zu ([^"]+)"')
  for ($i = 0; $i -lt $titelTreffer.Count; $i++) {
    $start = $titelTreffer[$i].Index
    $ende = if ($i + 1 -lt $titelTreffer.Count) { $titelTreffer[$i + 1].Index } else { $Html.Length }
    $block = $Html.Substring($start, $ende - $start)
    $titel = [System.Net.WebUtility]::HtmlDecode($titelTreffer[$i].Groups[1].Value).Trim()

    foreach ($tab in [regex]::Matches($block, '(?s)<table[^>]*film-list-table.*?</table>')) {
      $t = $tab.Value
      $kopf = [regex]::Match($t, '(?s)<thead.*?</thead>').Value
      $tage = @([regex]::Matches($kopf, '<span class="font-normal">\s*(\d{1,2})\.(\d{1,2})\.?\s*</span>') | ForEach-Object { ConvertTo-IsoDatum ([int]$_.Groups[1].Value) ([int]$_.Groups[2].Value) })
      if (-not $tage.Count) { continue }
      $koerper = [regex]::Match($t, '(?s)<tbody.*?</tbody>').Value
      foreach ($zeile in [regex]::Matches($koerper, '(?s)<tr.*?</tr>')) {
        $zellen = [regex]::Split($zeile.Value, '<td[\s>]') | Select-Object -Skip 1
        for ($j = 0; $j -lt $zellen.Count -and $j -lt $tage.Count; $j++) {
          if ($zellen[$j] -match 'performance-link') { $termine.Add([pscustomobject]@{ Titel = $titel; Datum = $tage[$j] }) }
        }
      }
      foreach ($d in $tage) { $termine.Add([pscustomobject]@{ Titel = $null; Datum = $d }) } # nur fuer das Abfragefenster
    }
  }
  return $termine
}

# Die Seite zeigt zuerst 6 Filme und laedt den Rest ueber das Formular "loadMoreFilms" in Paketen nach
function Get-CinecittaVollstaendig([string]$Url) {
  $html = Get-Seite $Url
  $form = [regex]::Match($html, '(?s)<form id="loadMoreFilms"[^>]*action="([^"]+)".*?</form>')
  if (-not $form.Success) { return $html }

  $felder = [ordered]@{}
  foreach ($inp in [regex]::Matches($form.Value, '<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"')) {
    $felder[[System.Net.WebUtility]::HtmlDecode($inp.Groups[1].Value)] = [System.Net.WebUtility]::HtmlDecode($inp.Groups[2].Value)
  }
  $limit = [int]$felder['tx_filmapi_list[limit]']
  $offset = [int]$felder['tx_filmapi_list[offset]']
  $gesamt = [int]$felder['tx_filmapi_list[allFilmss]']
  $ziel = 'https://www.cinecitta.de' + [System.Net.WebUtility]::HtmlDecode($form.Groups[1].Value)

  $teile = New-Object System.Text.StringBuilder
  [void]$teile.Append($html)
  while ($limit -gt 0 -and $offset -lt $gesamt -and $offset -lt 1000) {
    $felder['tx_filmapi_list[offset]'] = "$offset"
    $koerper = ($felder.Keys | ForEach-Object { [uri]::EscapeDataString($_) + '=' + [uri]::EscapeDataString($felder[$_]) }) -join '&'
    $antwort = Invoke-RestMethod -Uri $ziel -Method Post -Body $koerper -ContentType 'application/x-www-form-urlencoded; charset=utf-8' -UserAgent $script:UserAgent -TimeoutSec 40
    if (-not $antwort.content) { break }
    [void]$teile.Append($antwort.content)
    $offset += $limit
    Start-Sleep -Milliseconds 500
  }
  return $teile.ToString()
}

function Get-CinecittaProgramme {
  foreach ($kino in $script:CinecittaKinos.Keys) {
    $erg = New-KinoErgebnis $kino $script:CinecittaKinos[$kino]
    try {
      $alle = Read-CinecittaSeite (Get-CinecittaVollstaendig $erg.Url)
      $fenster = $alle | ForEach-Object { $_.Datum } | Sort-Object -Unique
      $echt = $alle | Where-Object { $_.Titel } | Sort-Object Titel, Datum -Unique
      if (-not $echt) { throw 'Keine Vorstellungen gefunden. Hat sich der Aufbau der Seite geaendert?' }
      foreach ($e in $echt) { $erg.Termine.Add($e) }
      $erg.Von = $fenster | Select-Object -First 1
      $erg.Bis = $fenster | Select-Object -Last 1
      $erg.Ok = $true
    } catch { $erg.Fehler = $_.Exception.Message }
    $erg
  }
}
