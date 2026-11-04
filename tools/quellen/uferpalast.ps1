# Ausleser fuer den Uferpalast Fuerth (Joomla-Blog).
# Je Film ein "blog-item" mit Titel und Tabelle: erste Zeile Tage ("Do 05.11."), darunter Uhrzeiten oder "--".

function Get-UferpalastProgramm {
  $erg = New-KinoErgebnis 'Uferpalast Fürth' 'https://www.uferpalast.de/'
  try {
    $html = Get-Seite $erg.Url
    $fenster = New-Object System.Collections.Generic.List[string]
    $teile = [regex]::Split($html, '<div class="blog-item">') | Select-Object -Skip 1
    foreach ($teil in $teile) {
      $kopf = [regex]::Match($teil, '(?s)<h2 class="item-title">(.*?)</h2>')
      if (-not $kopf.Success) { continue }
      $titel = ConvertFrom-Html $kopf.Groups[1].Value
      foreach ($tab in [regex]::Matches($teil, '(?s)<table.*?</table>')) {
        $zeilen = @([regex]::Matches($tab.Value, '(?s)<tr.*?</tr>') | ForEach-Object { , @([regex]::Matches($_.Value, '(?s)<td[^>]*>(.*?)</td>') | ForEach-Object { ConvertFrom-Html $_.Groups[1].Value }) })
        if ($zeilen.Count -lt 2) { continue }
        $tage = @($zeilen[0] | ForEach-Object { $m = [regex]::Match($_, '(\d{1,2})\.(\d{1,2})\.'); if ($m.Success) { ConvertTo-IsoDatum ([int]$m.Groups[1].Value) ([int]$m.Groups[2].Value) } else { $null } })
        for ($j = 0; $j -lt $tage.Count; $j++) {
          if (-not $tage[$j]) { continue }
          $fenster.Add($tage[$j])
          $spielt = $zeilen | Select-Object -Skip 1 | Where-Object { $j -lt $_.Count -and $_[$j] -match '\d{1,2}[:.]\d{2}' }
          if ($spielt) { $erg.Termine.Add([pscustomobject]@{ Titel = $titel; Datum = $tage[$j] }) }
        }
      }
    }
    if (-not $erg.Termine.Count) { throw 'Keine Vorstellungen gefunden. Hat sich der Aufbau der Seite geaendert?' }
    # Die Startseite zeigt nicht alle Filme des Monatsprogramms. Deshalb nur ergaenzen, nichts entfernen:
    # Ein Fenster, das nur den Abfragetag umfasst, schuetzt alle spaeteren Bestandstermine.
    $heute = (Get-Heute).ToString('yyyy-MM-dd')
    $erg.Von = $heute; $erg.Bis = $heute; $erg.Ok = $true
  } catch { $erg.Fehler = $_.Exception.Message }
  $erg
}
