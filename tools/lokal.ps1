# Lokaler Lauf fuer Kinos, die Abrufe aus der Cloud (GitHub) sperren: CinemaxX und UCI in Hamburg.
# Ablauf: neuesten Stand holen, nur diese Kinos auslesen und abgleichen, TMDB ergaenzen, Datendatei bauen,
# Aenderungen committen und hochladen. Die uebrigen Kinos aktualisiert weiter der Workflow auf GitHub.
# Hat der Workflow in der Zwischenzeit etwas gespeichert, beginnt der Lauf einmal neu auf dem neuen Stand.
# Laeuft als Windows-Aufgabe "Kinoprogramm lokal" (taeglich), Protokoll in tools/lokal.log.
# Aufruf von Hand aus dem Ordner website:  powershell -ExecutionPolicy Bypass -File tools\lokal.ps1

$ErrorActionPreference = 'Stop'
$wurzel = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $wurzel
$log = Join-Path $PSScriptRoot 'lokal.log'
function Write-Log([string]$Text) { $z = "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $Text"; $z; Add-Content -Path $log -Value $z -Encoding UTF8 }

try {
  Write-Log 'Start'
  # Nur mit sauberem Arbeitsstand, damit nichts Fremdes mit hochgeladen oder verworfen wird
  $offen = @(git status --porcelain --untracked-files=no)
  if ($offen.Count) { Write-Log "Abbruch: nicht gespeicherte Aenderungen im Repository ($($offen.Count) Dateien)"; exit 1 }

  for ($versuch = 1; $versuch -le 2; $versuch++) {
    git pull --rebase --quiet
    if ($LASTEXITCODE) { Write-Log 'Abbruch: git pull fehlgeschlagen'; exit 1 }

    & "$PSScriptRoot/aktualisieren.ps1" -Region hamburg -Ausleser Get-HamburgLokal | ForEach-Object { Write-Log "  $_" }
    & "$PSScriptRoot/tmdb.ps1" | Select-Object -First 2 | ForEach-Object { Write-Log "  $_" }
    & "$PSScriptRoot/build-data.ps1" -Region hamburg | Select-Object -First 1 | ForEach-Object { Write-Log "  $_" }

    git add data-hamburg.js daten/hamburg daten/filminfos.json plakate
    git diff --cached --quiet
    if (-not $LASTEXITCODE) { Write-Log 'Keine Aenderungen'; exit 0 }
    git commit --quiet -m "Hamburg lokal aktualisiert (CinemaxX, UCI) $(Get-Date -Format 'yyyy-MM-dd')"
    git push --quiet
    if (-not $LASTEXITCODE) { Write-Log 'Fertig, hochgeladen'; exit 0 }

    # Push abgelehnt, weil der Workflow inzwischen gespeichert hat: eigenen Commit verwerfen, neu beginnen
    Write-Log "Push abgelehnt (Versuch $versuch), neuer Anlauf auf dem aktuellen Stand"
    git fetch --quiet
    git reset --hard --quiet origin/main
  }
  Write-Log 'Abbruch: auch der zweite Versuch wurde abgelehnt'
  exit 1
} catch {
  Write-Log "Fehler: $($_.Exception.Message)"
  exit 1
}
