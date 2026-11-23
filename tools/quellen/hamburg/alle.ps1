# Alle Ausleser der Region Hamburg, genutzt von aktualisieren.ps1 -Region hamburg (siehe daten/regionen.json).

function Get-HamburgProgramme {
  Get-CinemaxxProgramme      # CinemaxX Dammtor, Wandsbek, Harburg und Holi
  Get-PremiumkinoProgramme   # Astor Film Lounge HafenCity und Savoy
}
