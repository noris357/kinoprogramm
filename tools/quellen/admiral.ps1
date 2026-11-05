# Ausleser fuer das Admiral Kino Nuernberg ueber seine eigene Website (nicht cineplex.de, das blockt Abrufe).
# Die Startseite enthaelt einen JSON-LD-Block mit allen Vorstellungen als schema.org "ScreeningEvent".
# startDate steht in UTC und wird fuer den Spieltag in deutsche Zeit umgerechnet.
# Zu den Filmen ("Movie") stehen dort oft auch Regie und Jahr.

function Get-AdmiralProgramm {
  $erg = New-KinoErgebnis 'Admiral Kino Nürnberg' 'https://admiral-kino-nuernberg.de/'
  try {
    $html = Get-Seite $erg.Url
    $berlin = [TimeZoneInfo]::FindSystemTimeZoneById($(if ($IsLinux -or $IsMacOS) { 'Europe/Berlin' } else { 'W. Europe Standard Time' }))
    $json = [regex]::Match($html, '(?s)<script type="application/ld\+json">(.*?)</script>').Groups[1].Value
    if (-not $json) { throw 'Kein JSON-LD-Block gefunden. Hat sich der Aufbau der Seite geaendert?' }

    # Regie und Jahr je Film (Movie mit "director" und "dateCreated")
    $filmInfo = @{}
    foreach ($m in [regex]::Matches($json, '\{"@type":"Movie","@id":"([^"]+)","name":"((?:[^"\\]|\\.)*)"(.*?)"dateCreated":"(\d{4})')) {
      $regie = @([regex]::Matches(([regex]::Match($m.Groups[3].Value, '"director":\[(.*?)\]').Groups[1].Value), '"name":"((?:[^"\\]|\\.)*)"') | ForEach-Object { $_.Groups[1].Value }) -join ', '
      $filmInfo[$m.Groups[1].Value] = @{ Regie = $regie; Jahr = $m.Groups[4].Value }
    }

    foreach ($m in [regex]::Matches($json, '\{"@type":"ScreeningEvent".*?"startDate":"([^"]+)".*?"workPresented":\{"@type":"Movie","@id":"([^"]+)","name":"((?:[^"\\]|\\.)*)"')) {
      $beginn = [DateTimeOffset]::Parse($m.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
      $titel = ('"' + $m.Groups[3].Value + '"' | ConvertFrom-Json)
      $info = $filmInfo[$m.Groups[2].Value]
      $erg.Termine.Add([pscustomobject]@{
        Titel = $titel
        Datum = [TimeZoneInfo]::ConvertTime($beginn, $berlin).ToString('yyyy-MM-dd')
        Regie = $(if ($info -and $info.Regie) { $info.Regie } else { $null })
        Jahr  = $(if ($info) { $info.Jahr } else { $null })
      })
    }
    if (-not $erg.Termine.Count) { throw 'Keine Vorstellungen gefunden. Hat sich der Aufbau der Seite geaendert?' }
    $eindeutig = @($erg.Termine | Sort-Object Titel, Datum -Unique)
    $erg.Termine.Clear(); $eindeutig | ForEach-Object { $erg.Termine.Add($_) }
    $daten = $eindeutig | ForEach-Object Datum | Sort-Object
    $erg.Von = (Get-Heute).ToString('yyyy-MM-dd'); $erg.Bis = $daten[-1]; $erg.Ok = $true
  } catch { $erg.Fehler = $_.Exception.Message }
  $erg
}
