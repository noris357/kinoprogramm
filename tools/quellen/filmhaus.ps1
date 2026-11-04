# Ausleser fuer Filmhaus Nuernberg und KommKino Nuernberg (beide im KunstKulturQuartier, gemeinsame Programmseite).
# Die Uebersicht zeigt jede Veranstaltung einmal mit ihrem naechsten Termin. Weitere Karten laedt der Knopf
# "Weitere Veranstaltungen" per POST nach. Die Detailseite nennt alle weiteren Termine, den Spielort
# (Veranstaltungen des KommKino tragen "Kommkino e. V. praesentiert") und meist Land, Jahr und Regie.

$script:KkqBasis = 'https://www.kunstkulturquartier.de'

function Read-FilmhausKarten([string]$Html) {
  foreach ($m in [regex]::Matches($Html, '<a class="detailLink[^"]*"\s+href="([^"]*fh-programm-detail/\d+/\d{4}-\d\d-\d\d/[^"]*)"\s*>(.*?)</a>', 'Singleline')) {
    [pscustomobject]@{ Url = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value); Titel = ConvertFrom-Html $m.Groups[2].Value }
  }
}

function Read-FilmhausDetail([string]$Html) {
  $start = $Html.IndexOf('id="page-content"')
  if ($start -lt 0) { $start = 0 }
  $text = ConvertFrom-Html ([regex]::Replace($Html.Substring($start), '(?s)<(script|style|svg).*?</\1>', ' '))
  $ende = $text.IndexOf('Mehr in dieser Reihe')
  $kern = if ($ende -gt 0) { $text.Substring(0, $ende) } else { $text }
  $daten = @([regex]::Matches($kern, '\b\p{L}{2} / (\d{2})\.(\d{2})\.(\d{4}) / \d{1,2}:\d{2}') | ForEach-Object { ConvertTo-IsoDatum ([int]$_.Groups[1].Value) ([int]$_.Groups[2].Value) ([int]$_.Groups[3].Value) } | Sort-Object -Unique)
  $feld = { param($n) $m = [regex]::Match($kern, "\b${n}:\s*(.+?)\s*(?=\b(Land|Jahr|Regie|mit|Länge|Sprache|FSK|Eintritt|Hinweise|Links):|$)"); if ($m.Success) { $m.Groups[1].Value.Trim(' ,') } }
  [pscustomobject]@{
    Daten    = $daten
    # Der Saal "kommkino" wird auch vom Filmhaus bespielt. Veranstalter KommKino erkennt man an "Kommkino e. V."
    KommKino = $kern -match '(?i)Kommkino e\.\s?V\.'
    Land     = & $feld 'Land'
    Jahr     = & $feld 'Jahr'
    Regie    = & $feld 'Regie'
  }
}

function Get-FilmhausProgramm {
  $url = "$script:KkqBasis/filmhaus/programm/programmuebersicht"
  $fh = New-KinoErgebnis 'Filmhaus Nürnberg' $url
  $kk = New-KinoErgebnis 'KommKino Nürnberg' $url
  try {
    $html = Get-Seite $url
    $karten = New-Object System.Collections.Generic.List[object]
    Read-FilmhausKarten $html | ForEach-Object { $karten.Add($_) }

    $knopf = [regex]::Match($html, '<button data-uri="[^"]+"[^>]*class="ajax-button"[^>]*>')
    if ($knopf.Success) {
      $tag = $knopf.Value
      $wert = { param($n) [System.Net.WebUtility]::HtmlDecode([regex]::Match($tag, "data-$n=""([^""]*)""").Groups[1].Value) }
      $uri = $script:KkqBasis + (& $wert 'uri')
      $schritt = [int](& $wert 'addtolimit')
      $limit = [int](& $wert 'limit')
      for ($runde = 0; $runde -lt 40; $runde++) {
        $limit += $schritt
        $felder = [ordered]@{
          'tx_vkevents_pi1ajaxgetnextevents[start_limit]'   = $limit
          'tx_vkevents_pi1ajaxgetnextevents[addtolimit]'    = $schritt
          'tx_vkevents_pi1ajaxgetnextevents[ceUid]'         = (& $wert 'ceuid')
          'tx_vkevents_pi1ajaxgetnextevents[cUid]'          = (& $wert 'cuid')
          'tx_vkevents_pi1ajaxgetnextevents[showpid]'       = (& $wert 'showpid')
          'tx_vkevents_pi1ajaxgetnextevents[startzeitraum]' = (& $wert 'startzeitraum')
          'tx_vkevents_pi1ajaxgetnextevents[username]'      = (& $wert 'username')
        }
        $neu = @(Read-FilmhausKarten (Send-Formular $uri $felder))
        if (-not $neu.Count) { break }
        $neu | ForEach-Object { $karten.Add($_) }
      }
    }
    if (-not $karten.Count) { throw 'Keine Veranstaltungen gefunden. Hat sich der Aufbau der Seite geaendert?' }

    # Jede Veranstaltung nur einmal abrufen, auch wenn sie mehrfach in der Liste steht
    $bekannt = @{}
    foreach ($k in $karten) {
      $id = [regex]::Match($k.Url, 'fh-programm-detail/(\d+)/').Groups[1].Value
      if ($bekannt.ContainsKey($id)) { continue }
      $bekannt[$id] = $true
      $d = Read-FilmhausDetail (Get-Seite ($script:KkqBasis + $k.Url))
      $ziel = if ($d.KommKino) { $kk } else { $fh }
      foreach ($tag in $d.Daten) {
        $ziel.Termine.Add([pscustomobject]@{ Titel = $k.Titel; Datum = $tag; Land = $d.Land; Jahr = $d.Jahr; Regie = $d.Regie })
      }
    }

    $heute = (Get-Heute).ToString('yyyy-MM-dd')
    foreach ($e in $fh, $kk) {
      $daten = @($e.Termine | ForEach-Object Datum | Sort-Object)
      $e.Von = $heute
      $e.Bis = if ($daten.Count) { $daten[-1] } else { $heute }
      # Ein leeres KommKino-Ergebnis ist moeglich, wenn dort gerade nichts laeuft. Dann nichts loeschen.
      $e.Ok = $daten.Count -gt 0
      if (-not $e.Ok) { $e.Fehler = 'Keine Termine gefunden' }
    }
  } catch { $fh.Fehler = $_.Exception.Message; $kk.Fehler = $_.Exception.Message }
  $fh
  $kk
}
