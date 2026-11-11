# Alle Ausleser in einer Liste, genutzt von aktualisieren.ps1 und beobachten.ps1.
# Ein Kino kann mehrere Ergebnisse liefern (z. B. KommKino aus zwei Quellen), das Zusammenfuehren
# uebernimmt der Aufrufer.

function Get-AlleProgramme {
  Get-CinecittaProgramme
  Get-FilmhausProgramm       # Filmhaus und KommKino
  Get-KommKinoProgramm       # ergaenzt das KommKino fuer den laufenden Monat
  Get-BabylonProgramm
  Get-LammProgramm
  Get-UferpalastProgramm
  Get-CasablancaProgramm     # Sondertermine aus dem eingebetteten Gesamtprogramm
  Get-CasablancaFlyer        # Tagesprogramm aus Wochenflyer und Monatsprogramm (PDF)
  Get-CineStarProgramm
  Get-AdmiralProgramm        # eigene Website des Admiral
  Get-CineplexAusEingang     # Cineplex Fuerth aus gespeicherter Seite in eingang/ (nur lokal)
}
