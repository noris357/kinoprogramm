# Alle Ausleser der Region Hamburg, genutzt von aktualisieren.ps1 -Region hamburg (siehe daten/regionen.json).
# CinemaxX (cinemaxx.ps1) und UCI (uci.ps1) sperren Abrufe aus Rechenzentren wie GitHub (401/403).
# Sie laufen deshalb nicht im automatischen Lauf. Die Ausleser bleiben fuer einen spaeteren lokalen Abruf erhalten.

function Get-HamburgProgramme {
  Get-CineamoProgramme hamburg     # CinemaxX Dammtor, Wandsbek, Harburg ueber cineamo.com (die eigene Schnittstelle ist gesperrt)
  Get-PremiumkinoProgramme         # Astor Film Lounge HafenCity und Savoy
  Get-KinopolisProgramm            # Kinopolis HafenCity
  Get-JansenProgramme              # Studio, Elbe, Blankeneser Kino, Koralle
  Get-AbatonProgramm
  Get-ZeiseProgramm
  Get-DreitausendeinsProgramm      # 3001
  Get-BMovieProgramm
  Get-MetropolisHamburgProgramm
  Get-LichtmessProgramm
}

# Lokal auf dem eigenen Rechner (tools/lokal.ps1), weil die Seiten Abrufe aus der Cloud sperren
function Get-HamburgLokal {
  Get-CinemaxxProgramme            # CinemaxX Dammtor, Wandsbek, Harburg und Holi
  Get-UciProgramme                 # UCI Mundsburg und Wandsbek
}
