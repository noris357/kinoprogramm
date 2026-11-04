# Ausleser fuer die eigene Seite des KommKino Nuernberg (Joomla mit iCagenda).
# Der Monatskalender verlinkt jede Vorstellung als /spielzeiten/<id>-<name>/<JJJJ-MM-TT-HH-MM>.
# Er zeigt nur den laufenden Monat. Spaetere Termine kommen ueber die Filmhaus-Seite (filmhaus.ps1).

function Get-KommKinoProgramm {
  $erg = New-KinoErgebnis 'KommKino Nürnberg' 'https://www.kommkino.de/spielzeiten'
  try {
    $html = Get-Seite $erg.Url
    $termine = [regex]::Matches($html, '(?s)<a href="/spielzeiten/\d+-[^/"]+/(\d{4}-\d\d-\d\d)-\d\d-\d\d">.*?titletip">\s*(.*?)\s*</div>') |
      ForEach-Object { [pscustomobject]@{ Titel = ConvertFrom-Html $_.Groups[2].Value; Datum = $_.Groups[1].Value } } |
      Sort-Object Titel, Datum -Unique
    if (-not $termine) { throw 'Keine Vorstellungen gefunden. Hat sich der Aufbau der Seite geaendert?' }
    $termine | ForEach-Object { $erg.Termine.Add($_) }
    $heute = Get-Heute
    $erg.Von = $heute.ToString('yyyy-MM-dd')
    # Der Kalender deckt den ganzen laufenden Monat ab
    $erg.Bis = (New-Object DateTime $heute.Year, $heute.Month, 1).AddMonths(1).AddDays(-1).ToString('yyyy-MM-dd')
    $erg.Ok = $true
  } catch { $erg.Fehler = $_.Exception.Message }
  $erg
}
