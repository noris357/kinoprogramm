(function () {
  'use strict';

  // ---------- Schwellen der Highlights (hier anpassen) ----------
  const KLASSIKER_ALTER = 20;        // Jahre seit der Produktion
  const KLASSIKER_SCORE = 75;        // Score ab dem ein älterer Film als Klassiker gilt (oder Hauptpreis)
  const GEHEIMTIPP_SCORE = 80;       // Mindest-Score für den Geheimtipp
  const GEHEIMTIPP_MAX_TAGE = 3;     // höchstens so viele Spieltage in der Woche, in nur einem Kino
  const NUR_EINMAL_SCORE = 70;       // Mindest-Score für "Nur einmal"
  const DAUERBRENNER_WOCHEN = 6;     // mindestens so viele Kinowochen am Stück
  const FILME_JE_RUBRIK = 3;         // höchstens so viele Filme je Rubrik
  const NEU_WOCHE_BEGINNT = 2;       // "neu": Woche läuft ab diesem Wochentag sieben Tage (0 = Montag, 2 = Mittwoch, also Mittwoch bis Dienstag)
  const NEU_KINOSTART_TOLERANZ = 14; // "neu": Kinostart liegt mehr Tage vor Wochenbeginn, dann nicht mehr neu
  const NEU_HOECHSTALTER = 1;        // "neu": Produktionsjahr höchstens so viele Jahre zurück, damit Wiederaufführungen nicht als Neustart zählen
  const OHNE_HIGHLIGHT = /^(Sneak Preview|Kult Sneak|Kurzfilmprogramm)$/;

  const D = window.KINO_DATA;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zahl = (n) => n.toLocaleString('de-DE');

  // Score-Stufen für die farbige Hinterlegung der Score-Zahl (ab diesem Score)
  const SCORE_GOLD = 90;
  const SCORE_SILBER = 85;
  const SCORE_BRONZE = 80;

  // ---------- Datumshilfen (alle Daten als ISO-Text JJJJ-MM-TT in lokaler Zeit) ----------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const plusTage = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const tageZwischen = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const wochentag = (s) => (parse(s).getDay() + 6) % 7; // Montag = 0
  const montagVon = (s) => plusTage(s, -wochentag(s));
  const fmt = (o) => new Intl.DateTimeFormat('de-DE', o);
  const fmtKurz = fmt({ day: '2-digit', month: '2-digit', year: '2-digit' });
  const fmtLang = fmt({ weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtVoll = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtWt = fmt({ weekday: 'short' });
  const fmtMonat = fmt({ month: 'short' });
  const fmtMonatLang = fmt({ month: 'long', year: 'numeric' });
  const datum = (s) => fmtLang.format(parse(s));
  const datumKurz = (s) => fmtKurz.format(parse(s));
  function kalenderwoche(s) {
    const d = parse(s);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  }

  const HEUTE = iso(new Date());

  // Status wie in der Excel: Ja = heute bis heute+7, Soon = heute+8 bis heute+99
  function statusVon(d) {
    const t = tageZwischen(HEUTE, d);
    if (t >= 0 && t <= 7) return 'ja';
    if (t > 7 && t <= 99) return 'soon';
    return 'nein';
  }
  const STATUS_TEXT = { ja: 'Diese Woche', soon: 'Demnächst', nein: 'Vorbei', chance: 'Letzte Chance' };

  // ---------- Daten aufbereiten ----------
  function stadtVon(name) {
    if (/Nürnberg/.test(name)) return 'Nürnberg';
    if (/Fürth/.test(name)) return 'Fürth';
    if (/Erlangen/.test(name)) return 'Erlangen';
    return 'Diverse Orte';
  }
  function monogrammVon(name) {
    const kern = name.replace(/\s*(Nürnberg|Fürth|Erlangen)$/, '').replace(/\b(Kino|Deluxe)\b/g, '').trim();
    const teile = kern.split(/[\s-]+/).filter(Boolean);
    if (teile.length === 1) {
      const gross = kern.match(/[A-ZÄÖÜ]/g) || [];
      return gross.length > 1 ? gross.slice(0, 3).join('') : kern.slice(0, 2).toUpperCase();
    }
    return teile.slice(0, 2).map((t) => t[0].toUpperCase()).join('');
  }
  const kinos = D.kinos.map((roh, id) => {
    // Anzeige mit offizieller Schreibweise, der Datenschlüssel bleibt unverändert
    const name = roh.replace('Manhatten', 'Manhattan');
    return { id, roh, name, stadt: stadtVon(roh), mono: monogrammVon(name), link: (D.kinoLinks || [])[id] };
  });

  // Länder sind in build-data.ps1 schon vereinheitlicht. Die ISO-Codes liefern die Flaggen.
  const LAND_CODE = D.laenderCodes || {};
  const flagge = (land) => {
    const c = LAND_CODE[land];
    return c ? String.fromCodePoint(...[...c].map((z) => 0x1F1E6 + z.charCodeAt(0) - 65)) : '';
  };
  const mitFlagge = (land) => `${flagge(land) ? `<span class="flagge" aria-hidden="true">${flagge(land)}</span>` : ''}${esc(land)}`;
  const leerWert = (v) => (v == null || v === '' || v === '?' ? null : v);
  const filme = D.filme.map(([titel, land, regie, jahr, info], id) => {
    // Überraschungsfilme: Regie, Land und Jahr sind unbekannt, auch für Filter und Statistik
    // Kurzfilmprogramme bestehen aus mehreren Filmen, auch dort gibt es keine einheitlichen Angaben
    if (/^(Sneak Preview|Kult Sneak|Kurzfilmprogramm)$/.test(titel)) { land = null; regie = null; jahr = null; info = {}; }
    const laender = (leerWert(land) || '').split(/\s*,\s*/).filter(Boolean);
    const j = parseInt(String(jahr || '').slice(0, 4), 10);
    // Eigener Score 0-100 aus mehreren Wertungsquellen (siehe tools/build-data.ps1 und Impressum)
    const b = info && info.score != null ? Number(info.score) : NaN;
    return {
      id, titel, regie: leerWert(regie), jahr: leerWert(jahr), info: info || {},
      laender: [...new Set(laender)],
      bewertung: Number.isFinite(b) ? b : null,
      // Genauer Score mit drei Nachkommastellen, nur für Rang und Reihenfolge. Angezeigt wird immer die ganze Zahl.
      genau: Number.isFinite(b) ? (info.scoreGenau != null ? Number(info.scoreGenau) : b) : null,
      jahrzehnt: j > 1880 && j <= new Date().getFullYear() + 1 ? `${Math.floor(j / 10) * 10}er` : null,
    };
  });
  // r: Index der Reihe in D.reihen (bisher nur Filmhaus), sonst undefined
  const termine = D.termine.map(([f, k, d, r]) => ({ f, k, d, r }));

  const alleDaten = termine.map((t) => t.d).sort();
  const ERSTER = alleDaten[0];
  // Start des Projekts mit automatischer Erfassung (erster Commit). Die Tagesverläufe der Statistik beginnen hier.
  const PROJEKT_START = '2026-11-04';
  const LETZTER = alleDaten[alleDaten.length - 1];

  // Wie weit reicht das veröffentlichte Programm je Kino?
  const horizont = kinos.map(() => '');
  const filmeProKinoTag = new Map(); // "k|d" -> Anzahl Filme
  termine.forEach((t) => {
    if (t.d > horizont[t.k]) horizont[t.k] = t.d;
    const s = `${t.k}|${t.d}`;
    filmeProKinoTag.set(s, (filmeProKinoTag.get(s) || 0) + 1);
  });
  // Ein Film ist in einem Kino sicher beendet, wenn das Kino an einem der drei Folgetage
  // ein normales Programm veröffentlicht hat. Einzelne Sondertermine weit voraus zählen nicht.
  function programmDanach(k, d) {
    const amTag = filmeProKinoTag.get(`${k}|${d}`) || 0;
    const noetig = Math.max(2, Math.ceil(amTag * 0.5));
    return [1, 2, 3].some((j) => (filmeProKinoTag.get(`${k}|${plusTage(d, j)}`) || 0) >= noetig);
  }

  // ---------- Zustand und Filter ----------
  const zustand = {
    stadt: '', kino: '', land: '', jahrzehnt: '', suche: '',
    ansicht: 'highlights', tag: 'woche', gruppe: 'film',
    sort: { feld: 'bewertung', auf: false }, nurKommend: false, nurNeu: false,
    regieSort: { feld: 'schnitt', auf: false }, regieOffen: '', allePreviews: false,
    kinoSort: { feld: 'score', auf: false },
    kalModus: 'monat', kalMonat: HEUTE.slice(0, 7), matrixStart: montagVon(HEUTE),
  };

  function filmPasst(f) {
    if (zustand.land && !f.laender.includes(zustand.land)) return false;
    if (zustand.jahrzehnt && (f.jahrzehnt || 'unbekannt') !== zustand.jahrzehnt) return false;
    const q = zustand.suche.trim().toLowerCase();
    if (q && !f.titel.toLowerCase().includes(q) && !(f.regie || '').toLowerCase().includes(q)) return false;
    return true;
  }
  function gefiltert() {
    return termine.filter((t) => {
      const k = kinos[t.k];
      if (zustand.stadt && k.stadt !== zustand.stadt) return false;
      if (zustand.kino !== '' && String(t.k) !== zustand.kino) return false;
      return filmPasst(filme[t.f]);
    });
  }
  const filterAktiv = () => Boolean(zustand.stadt || zustand.kino || zustand.land || zustand.jahrzehnt || zustand.suche);

  // ---------- Bausteine ----------
  function filmMeta(f, mitRegieLinks = false) {
    if (istSneak(f)) return '? · ? · ?';   // Regie, Land, Jahr sind bei Überraschungsfilmen unbekannt
    if (istKurzfilm(f)) return '– · – · –';   // mehrere Filme, keine einheitlichen Angaben
    const teile = [f.regie && (mitRegieLinks ? regieLinks(f) : esc(f.regie)), f.laender.length && f.laender.map(mitFlagge).join(', '), f.jahr && esc(f.jahr)].filter(Boolean);
    return teile.join(' · ') || 'Keine Angaben';
  }
  const filmLink = (f) => `<button class="film-link" data-film="${f.id}">${esc(f.titel)}</button>`;
  // Gewonnene Hauptpreise als kleine goldene Symbole, selbst gezeichnet (keine Original-Logos)
  const PREISE = {
    oscar: { name: 'Oscar', svg: '<circle cx="12" cy="3.4" r="2.5"/><path d="M8.6 6.6h6.8l-1 4 .8 1.6-1.4 6H10.2l-1.4-6 .8-1.6z"/><rect x="7.4" y="18.6" width="9.2" height="1.8" rx=".4"/><rect x="6" y="20.8" width="12" height="2.4" rx=".5"/>' },
    palme: { name: 'Goldene Palme', svg: '<path d="M12 21c0-6 .4-11 3-16-1.4 1-2.4 2.4-3 4-.6-1.6-1.6-3-3-4 2.6 5 3 10 3 16z"/><path d="M12 12c2-2 5-3 8-2.5-2.6.2-5 1.6-8 4.5zM12 12c-2-2-5-3-8-2.5 2.6.2 5 1.6 8 4.5zM12 16c2.2-1.4 5-1.6 7-.6-2.4-.2-4.6.6-7 2.4zM12 16c-2.2-1.4-5-1.6-7-.6 2.4-.2 4.6.6 7 2.4z"/>' },
    baer: { name: 'Goldener Bär', svg: '<circle cx="9" cy="3.6" r="1.4"/><circle cx="14.6" cy="3.6" r="1.4"/><circle cx="11.8" cy="6" r="3"/><path d="M8 9.5c1-.8 2.4-1.2 3.8-1.2s2.8.4 3.8 1.2l1.8-1.6.8.8-1.8 2c.4 1.2.4 2.8 0 4.3l-.8 6h-2.2l-.4-5h-2.4l-.4 5H8l-.8-6c-.4-1.5-.4-3.1 0-4.3l-1.8-2 .8-.8z"/>' },
    loewe: { name: 'Goldener Löwe', svg: '<circle cx="12" cy="10" r="7.5"/><circle cx="12" cy="10.6" r="4.2" style="fill:var(--surface)"/><circle cx="12" cy="10.6" r="3.1"/><path d="M4 18c2 1.4 5 2.4 8 2.4s6-1 8-2.4l-1 3H5z"/><path d="M2.5 7 6 9.5 4.5 5.5zM21.5 7 18 9.5l1.5-4z"/>' },
    tokio: { name: 'Tokyo Grand Prix', svg: '<g transform="translate(12 12)"><ellipse cy="-6" rx="3.2" ry="5"/><ellipse cy="-6" rx="3.2" ry="5" transform="rotate(72)"/><ellipse cy="-6" rx="3.2" ry="5" transform="rotate(144)"/><ellipse cy="-6" rx="3.2" ry="5" transform="rotate(216)"/><ellipse cy="-6" rx="3.2" ry="5" transform="rotate(288)"/><circle r="2.2" style="fill:var(--surface)"/></g>' },
  };
  // Preise eines Films nach Art gruppiert, in der Reihenfolge aus build-data (Oscar, Palme, Bär, Löwe, Tokio)
  function preisGruppen(f) {
    const g = new Map();
    [].concat(f.info.preise || []).forEach((p) => { if (PREISE[p.p]) { if (!g.has(p.p)) g.set(p.p, []); g.get(p.p).push(p); } });
    return [...g];
  }
  function preisText(art, liste) {
    if (art !== 'oscar') return liste.map((p) => `${p.k}${p.j ? ` ${p.j}` : ''}`).join(', ');
    const jahre = new Map();
    liste.forEach((p) => { if (!jahre.has(p.j)) jahre.set(p.j, []); jahre.get(p.j).push(p.k); });
    return [...jahre].map(([j, k]) => `Oscar${j ? ` ${j}` : ''}: ${k.join(', ')}`).join(' · ');
  }
  function pokale(f) {
    const gruppen = preisGruppen(f);
    if (!gruppen.length) return '';
    return `<span class="pokale">${gruppen.map(([art, liste]) => {
      const text = preisText(art, liste);
      return `<span class="pokal" title="${esc(text)}" aria-label="${esc(text)}"><svg viewBox="0 0 24 24" aria-hidden="true">${PREISE[art].svg}</svg>${liste.length > 1 ? `<b>${liste.length}</b>` : ''}</span>`;
    }).join('')}</span>`;
  }
  function preisListe(f) {
    const gruppen = preisGruppen(f);
    if (!gruppen.length) return '';
    return `<ul class="preisliste">${gruppen.map(([art, liste]) => `<li><span class="pokal"><svg viewBox="0 0 24 24" aria-hidden="true">${PREISE[art].svg}</svg></span>${esc(preisText(art, liste))}</li>`).join('')}</ul>`;
  }

  // Überraschungsfilme (Sneak Preview, Kult Sneak) bekommen ein Fragezeichen statt Plakat
  function istSneak(f) { return /^(Sneak Preview|Kult Sneak)$/.test(f.titel); }
  // Kurzfilmprogramme bekommen einen Filmstreifen statt Plakat
  function istKurzfilm(f) { return f.titel === 'Kurzfilmprogramm'; }
  const FILMSTREIFEN = '<svg class="streifen" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 2v20M15.5 2v20" stroke="currentColor" stroke-width="1.2" opacity=".5"/></svg>';
  function plakat(f, groesse = '') {
    if (istSneak(f)) return `<div class="plakat raetsel ${groesse}" aria-hidden="true"><span class="fz">?</span></div>`;
    if (istKurzfilm(f)) return `<div class="plakat raetsel ${groesse}" aria-hidden="true"><span class="fz">${FILMSTREIFEN}</span></div>`;
    const bild = f.info.poster ? `<img src="${esc(f.info.poster)}" alt="" loading="lazy">` : '';
    return `<div class="plakat ${groesse}" aria-hidden="true">${bild}<span class="pt">${esc(f.titel)}</span><span class="pj">${esc(f.jahr || '')}</span></div>`;
  }
  // Nur die Zahl, dezent umrandet. Die Erklärung steckt im Tooltip.
  const scoreStufe = (b) => (b >= SCORE_GOLD ? ['gold', 'Gold'] : b >= SCORE_SILBER ? ['silber', 'Silber'] : b >= SCORE_BRONZE ? ['bronze', 'Bronze'] : null);
  const wertung = (f) => {
    if (f.bewertung == null) return '';
    const stufe = scoreStufe(f.bewertung);
    const text = `Score ${f.bewertung} von 100${stufe ? ` · ${stufe[1]}` : ''}`;
    return `<span class="abzeichen wertung${stufe ? ` ${stufe[0]}` : ''}" title="${text}, aus mehreren Filmwertungen" aria-label="${text}">${f.bewertung}</span>`;
  };

  // Filme, die in den nächsten 7 Tagen zum letzten Mal laufen.
  // Sicher ist das nur, wenn jedes betroffene Kino schon weiter in die Zukunft veröffentlicht hat.
  function letzteChance(daten) {
    const proFilm = new Map();
    daten.forEach((t) => {
      if (!proFilm.has(t.f)) proFilm.set(t.f, new Map());
      const m = proFilm.get(t.f);
      if (!m.has(t.k) || t.d > m.get(t.k)) m.set(t.k, t.d);
    });
    const sicher = [], offen = [];
    proFilm.forEach((m, fid) => {
      const letzter = [...m.values()].sort().pop();
      const rest = tageZwischen(HEUTE, letzter);
      if (rest < 0 || rest > 7) return;
      const eintrag = { f: filme[fid], letzter, rest, kinos: [...m].filter(([, d]) => d === letzter).map(([k]) => kinos[k]) };
      const bestaetigt = [...m].every(([k, d]) => programmDanach(k, d));
      (bestaetigt ? sicher : offen).push(eintrag);
    });
    // Erst letzter Spieltag, am selben Tag nach Score (höchster zuerst), ohne Score am Tagesende, dann alphabetisch
    const ordnung = (a, b) => {
      if (a.letzter !== b.letzter) return a.letzter.localeCompare(b.letzter);
      const sa = a.f.bewertung, sb = b.f.bewertung;
      if (sa != null && sb != null && sa !== sb) return sb - sa;
      if ((sa != null) !== (sb != null)) return sa != null ? -1 : 1;
      return a.f.titel.localeCompare(b.f.titel, 'de');
    };
    return { sicher: sicher.sort(ordnung), offen: offen.sort(ordnung) };
  }

  // ---------- Fakten je Film und Grund-Zeile ----------
  const donnerstagVon = (s) => plusTage(s, -((wochentag(s) + 4) % 7)); // Kinowoche läuft Donnerstag bis Mittwoch
  // Erfassungslücke (daten/luecke.json): Für einzeln geprüfte Filme zählen die Wochen der Lücke als Spielwochen,
  // damit "Wochen am Stück" nicht an fehlenden Daten abbricht. Für alle anderen Filme beginnt die Serie danach neu.
  const LUECKE = D.luecke || null;
  const lueckeDurchgehend = new Set((LUECKE && LUECKE.durchgehend) || []);
  function mitLuecke(wochen, f) {
    if (!LUECKE || !f || !f.info.tmdb || !lueckeDurchgehend.has(Number(f.info.tmdb))) return wochen;
    const erg = new Set(wochen);
    for (let w = donnerstagVon(LUECKE.von); w <= LUECKE.bis; w = plusTage(w, 7)) erg.add(w);
    return erg;
  }
  let faktenCache = null;
  let chanceCache = null;
  function fakten() {
    if (faktenCache) return faktenCache;
    const ende = plusTage(HEUTE, 7);
    const m = new Map();
    termine.forEach((t) => {
      let e = m.get(t.f);
      if (!e) { e = { erster: t.d, tage: new Set(), kinos: new Set(), spaeter: false, wochen: new Set() }; m.set(t.f, e); }
      if (t.d < e.erster) e.erster = t.d;
      if (t.d >= HEUTE && t.d <= ende) { e.tage.add(t.d); e.kinos.add(t.k); }
      if (t.d > ende) e.spaeter = true;
      e.wochen.add(donnerstagVon(t.d));
    });
    // Kinowochen am Stück, rückwärts ab der aktuellen Kinowoche
    // Neu: deutscher Kinostart (TMDB) in der laufenden Woche. Ohne Kinostart: erster Termin überhaupt liegt in der laufenden Woche
    // und der Film ist kein alter Film in Wiederaufführung
    const neuAb = plusTage(HEUTE, -((wochentag(HEUTE) + 7 - NEU_WOCHE_BEGINNT) % 7));
    const neuBis = plusTage(neuAb, 6);
    const diesesJahr = Number(HEUTE.slice(0, 4));
    m.forEach((e, id) => {
      const wochen = mitLuecke(e.wochen, filme[id]);
      let w = donnerstagVon(HEUTE), n = 0;
      while (wochen.has(w)) { n++; w = plusTage(w, -7); }
      e.serie = n;
      const jahr = parseInt(filme[id].jahr, 10);
      const ks = filme[id].info && filme[id].info.kinostart;
      if (ks) {
        // Deutscher Kinostart laut TMDB: neu, wenn er in der laufenden Woche liegt. Lag er davor, aber höchstens
        // NEU_KINOSTART_TOLERANZ Tage vor Wochenbeginn, zählt es noch, wenn der erste erfasste Termin in dieser Woche liegt.
        e.neu = (String(ks) >= neuAb && String(ks) <= neuBis)
          || (String(ks) < neuAb && String(ks) >= plusTage(neuAb, -NEU_KINOSTART_TOLERANZ) && e.erster >= neuAb && e.erster <= neuBis);
      } else {
        e.neu = e.erster >= neuAb && e.erster <= neuBis && (!jahr || diesesJahr - jahr <= NEU_HOECHSTALTER);
      }
    });
    faktenCache = m;
    return m;
  }
  function chanceFilme() {
    if (!chanceCache) chanceCache = new Map(letzteChance(termine).sicher.map((e) => [e.f.id, e]));
    return chanceCache;
  }
  const wochentagDatum = (d) => `${fmtWt.format(parse(d)).replace('.', '')} ${datumKurz(d)}`;

  // ---------- Auslastung (nur Cinecitta-Gruppe, siehe tools/auslastung.ps1) ----------
  // Erst ab dem achten Tag: die nächsten sieben Tage stehen ohnehin im Programm
  const AUSLASTUNG_AB_TAGEN = 8;
  // Eigene, strengere Namen: "hohe Auslastung" beim Kino hieß in Stichproben etwa 75 bis 85 % belegt,
  // "nur wenige Plätze" teils schon praktisch ausverkauft
  const STUFEN = { hoch: 'Fast voll', wenige: 'Restplätze', ausverkauft: 'Ausverkauft' };
  const auslastung = (D.auslastung || [])
    .map(([f, k, d, zeit, stufe, link]) => ({ f: filme[f], k, d, zeit, stufe, link }))
    .filter((v) => v.f && STUFEN[v.stufe] && tageZwischen(HEUTE, v.d) >= AUSLASTUNG_AB_TAGEN)
    .sort((a, b) => a.d.localeCompare(b.d) || a.zeit.localeCompare(b.zeit));
  const gefragtIds = new Set(auslastung.map((v) => v.f.id));
  const gefragtAbzeichen = (f) => (gefragtIds.has(f.id) ? '<span class="abzeichen gefragt" title="Einzelne Vorstellungen ab nächster Woche sind schon gut gebucht">Vorverkauf gefragt</span>' : '');
  // Je Film die gut gebuchten Vorstellungen, nur Filme und Kinos unter den gewählten Filtern, nach erster Vorstellung sortiert
  function vorverkaufFilme(daten) {
    const sichtbar = new Set(daten.map((t) => `${t.f}|${t.k}`));
    const proFilm = new Map();
    auslastung.filter((v) => sichtbar.has(`${v.f.id}|${v.k}`)).forEach((v) => {
      if (!proFilm.has(v.f.id)) proFilm.set(v.f.id, { f: v.f, vs: [] });
      proFilm.get(v.f.id).vs.push(v);
    });
    return [...proFilm.values()];
  }
  const vorverkaufText = () => `Vorstellungen ab nächster Woche, die schon gut gebucht sind. Freie Plätze gibt es meist nur noch vorne oder am Rand. Nur Cinecitta, Meisengeige, Metropolis und Manhattan.${D.auslastungStand ? ` Stand ${datumKurz(D.auslastungStand)}.` : ''}`;
  // Filmkarte wie in den anderen Rubriken, statt der Kinos die Vorstellungen mit Link zur Sitzplatzwahl
  function vorverkaufKarte(e) {
    const f = e.f;
    const termine = e.vs.map((v) => `<a class="vv vv-${v.stufe}" href="${esc(v.link)}" target="_blank" rel="noopener" title="Zur Sitzplatzwahl beim Kino"><span class="punkt" aria-hidden="true"></span>${fmtWt.format(parse(v.d)).replace('.', '')} ${v.d.slice(8, 10)}.${v.d.slice(5, 7)}. ${esc(v.zeit)} · ${esc(kinos[v.k].name.replace(/\s+(Nürnberg|Fürth|Erlangen)$/, ''))} · ${STUFEN[v.stufe]}</a>`).join('');
    return `<article class="filmkarte hl-karte">${plakat(f, 'mittel')}<div>${filmLink(f)}${pokale(f)}${wertung(f)}<div class="meta">${filmMeta(f)}</div>${grundZeile(f)}<div class="vv-liste">${termine}</div></div></article>`;
  }
  // Bis zu zwei Gründe, warum ein Film besonders ist. Wird überall gleich gebildet.
  function gruende(f) {
    const e = fakten().get(f.id);
    if (!e || OHNE_HIGHLIGHT.test(f.titel)) return [];
    const liste = [];
    const gruppen = preisGruppen(f);
    if (gruppen.length) {
      const [art, pl] = gruppen[0];
      const jahr = Math.max(0, ...pl.map((p) => Number(p.j) || 0)) || '';
      liste.push(art === 'oscar' ? `${pl.length > 1 ? `${pl.length} Oscars` : 'Oscar'}${jahr ? ` ${jahr}` : ''}` : `${PREISE[art].name}${jahr ? ` ${jahr}` : ''}`);
    }
    const imKino = (ks) => [...ks].map((k) => kinos[k].name).sort().join(', ');
    const einmal = e.tage.size === 1 && !e.spaeter;
    if (einmal) liste.push(`Nur eine Vorstellung: ${wochentagDatum([...e.tage][0])} im ${imKino(e.kinos)}`);
    const chance = chanceFilme().get(f.id);
    if (chance && !einmal) liste.push(`Zum letzten Mal am ${wochentagDatum(chance.letzter)}`);
    if (e.neu) liste.push('Neu diese Woche');
    if (e.kinos.size === 1 && !einmal) liste.push(`Nur in einem Kino: ${imKino(e.kinos)}`);
    if (e.serie >= DAUERBRENNER_WOCHEN) liste.push(`Seit ${e.serie} Wochen im Programm`);
    return liste.slice(0, 2);
  }
  function grundZeile(f) {
    const g = gruende(f);
    return g.length ? `<div class="grund">${g.map(esc).join(' · ')}</div>` : '';
  }

  // ---------- Kopf ----------
  function zeigeKopf() {
    const heute = termine.filter((t) => t.d === HEUTE);
    const woche = termine.filter((t) => statusVon(t.d) === 'ja');
    const kinosHeute = new Set(heute.map((t) => t.k)).size;
    const chance = letzteChance(termine).sicher.length;
    $('#augenbraue').innerHTML = `Nürnberg <i></i> Fürth <i></i> Erlangen <i></i> KW ${kalenderwoche(HEUTE)}`;
    $('#kennzahlen').innerHTML = [
      [new Set(heute.map((t) => t.f)).size, `Filme heute in ${kinosHeute} Kinos`],
      [new Set(woche.map((t) => t.f)).size, 'Filme in den nächsten 7 Tagen'],
      [chance, 'zum letzten Mal diese Woche'],
      [kinos.length, 'Kinos und Spielorte'],
    ].map(([z, t]) => `<div class="kennzahl"><b>${zahl(z)}</b><span>${t}</span></div>`).join('');
  }

  // ---------- Ansicht Highlights ----------
  const nachScore = (a, b) => (b.genau ?? -1) - (a.genau ?? -1) || a.titel.localeCompare(b.titel, 'de');
  function highlightKarte(h, gross) {
    const f = h.f;
    // Nur die Kinos dieser Woche. Die einzelnen Tage stehen in der Filmansicht, hier wären sie zu unübersichtlich.
    const zeilen = [...h.kinos.keys()].sort((a, b) => kinos[a].name.localeCompare(kinos[b].name, 'de'))
      .map((k) => `<li><span class="chip">${esc(kinos[k].name)}</span></li>`).join('');
    return `<article class="filmkarte hl-karte${gross ? ' hl-gross' : ''}">${plakat(f, gross ? 'gross' : 'mittel')}<div>${filmLink(f)}${pokale(f)}${festivalAbzeichen(h.fest)}${wertung(f)}<div class="meta">${filmMeta(f)}</div>${grundZeile(f)}${h.hinweis ? `<div class="zuletzt">${esc(h.hinweis)}</div>` : ''}<ul class="hl-kinos">${zeilen}</ul></div></article>`;
  }
  function zeigeHighlights(daten) {
    const ende = plusTage(HEUTE, 7);
    const fk = fakten();
    const jetzt = Number(HEUTE.slice(0, 4));
    // Kandidaten: Filme mit Terminen in dieser Woche (unter den gewählten Filtern)
    const kand = new Map();
    daten.forEach((t) => {
      if (t.d < HEUTE || t.d > ende || OHNE_HIGHLIGHT.test(filme[t.f].titel)) return;
      if (!kand.has(t.f)) kand.set(t.f, { f: filme[t.f], kinos: new Map(), hinweis: '' });
      const h = kand.get(t.f);
      if (!h.fest) h.fest = festivalVon(t);
      if (!h.kinos.has(t.k)) h.kinos.set(t.k, new Set());
      h.kinos.get(t.k).add(t.d);
    });
    const alle = [...kand.values()].sort((a, b) => nachScore(a.f, b.f));
    // Sneak und Kurzfilmprogramm sind keine Highlights, stehen aber mit ihren Terminen am Ende der Seite
    const sonder = new Map();
    daten.forEach((t) => {
      if (t.d < HEUTE || t.d > ende || !OHNE_HIGHLIGHT.test(filme[t.f].titel)) return;
      const s = `${t.f}|${t.k}`;
      if (!sonder.has(s)) sonder.set(s, { f: filme[t.f], k: t.k, tage: new Set() });
      sonder.get(s).tage.add(t.d);
    });
    const sonderZeilen = [...sonder.values()].map((e) => ({ ...e, tage: [...e.tage].sort() }))
      .sort((a, b) => a.tage[0].localeCompare(b.tage[0]) || a.f.titel.localeCompare(b.f.titel, 'de') || kinos[a.k].name.localeCompare(kinos[b.k].name, 'de'));
    const belegt = new Set();
    const nimm = (liste, n = FILME_JE_RUBRIK) => {
      const r = liste.filter((h) => !belegt.has(h.f.id)).slice(0, n);
      r.forEach((h) => belegt.add(h.f.id));
      return r;
    };
    const mitScore = (h) => h.f.bewertung != null;
    const neu = alle.filter((h) => fk.get(h.f.id).neu && mitScore(h));
    // Film der Woche ist immer ein Neustart. Gibt es keinen, entfällt die Rubrik.
    const film = neu[0] || null;
    if (film) belegt.add(film.f.id);
    const hatPreis = (h) => preisGruppen(h.f).length > 0;
    // Previews: Vorstellungen vor dem deutschen Kinostart laut TMDB (Feld kinostart).
    // Der Vorabend zählt nicht: Viele Kinos zeigen Mittwochabend schon den Donnerstagsstart.
    // Ersatzregel ohne Kinostart: neuer Film (Produktionsjahr dieses oder letztes Jahr oder unbekannt),
    // der bei uns noch nie gelaufen ist (erster Termin überhaupt heute oder später). Dann zählen alle Termine der Woche.
    const previewBis = (h) => (h.f.info.kinostart ? plusTage(String(h.f.info.kinostart), -1) : null);   // Termine vor diesem Tag sind Previews
    const ersatzPreview = (h) => {
      if (h.f.info.kinostart) return false;
      const j = parseInt(h.f.jahr, 10);
      return (!j || j >= jetzt - 1) && fk.get(h.f.id).erster >= HEUTE;
    };
    const previewTag = (h, d) => (previewBis(h) ? d < previewBis(h) : ersatzPreview(h));
    const previews = alle.filter((h) => [...h.kinos.values()].some((ds) => [...ds].some((d) => previewTag(h, d))))
      .map((h) => {
        // Je Kino die Preview-Tage, z. B. "So 22.11.26, Mo 23.11.26 im Uferpalast Fürth"
        const wann = [...h.kinos].map(([k, ds]) => ({ k, tage: [...ds].filter((d) => previewTag(h, d)).sort() })).filter((e) => e.tage.length)
          .sort((a, b) => a.tage[0].localeCompare(b.tage[0]))
          .map((e) => `${e.tage.map(wochentagDatum).join(', ')} im ${kinos[e.k].name}`).join(' · ');
        const start = h.f.info.kinostart ? `Kinostart ${datumKurz(h.f.info.kinostart)}` : 'Kinostart unbekannt';
        return { ...h, hinweis: `Preview ${wann} · ${start}` };
      });
    // Festival diese Woche: läuft gerade oder beginnt in den nächsten sieben Tagen (nur sichere Termine).
    // Bei mehreren das, das zuerst beginnt. Die besten Filme des Festivals in dieser Woche, je Karte mit den Festivaltagen.
    const festWoche = FESTIVALS.filter((fe) => fe.von && fe.sicher !== false && fe.bis >= HEUTE && fe.von <= ende)
      .sort((a, b) => a.von.localeCompare(b.von))
      .map((fe) => {
        const ts = festivalTermine(fe, daten).filter((t) => t.d >= HEUTE && t.d <= ende);
        const tage = new Map();
        ts.forEach((t) => { if (!tage.has(t.f)) tage.set(t.f, new Set()); tage.get(t.f).add(t.d); });
        const liste = alle.filter((h) => tage.has(h.f.id))
          .map((h) => ({ ...h, hinweis: `Beim Festival ${[...tage.get(h.f.id)].sort().map(wochentagDatum).join(', ')}` }));
        return { fe, liste };
      }).find((e) => e.liste.length);
    const festListe = festWoche ? nimm(festWoche.liste) : [];
    const festText = festWoche ? `${esc(festWoche.fe.name)}, ${zeitraumText(festWoche.fe)}${festWoche.fe.kinos.length ? ` im ${festWoche.fe.kinos.map(esc).join(', ')}` : ''}. Die besten Filme des Festivals in dieser Woche.` : '';
    const festFuss = festWoche ? `<p><button type="button" class="film-link" data-festival-zu="${esc(festWoche.fe.id)}">Mehr zum Festival →</button></p>` : '';
    const neuListe = nimm(neu);
    // Previews: zuerst die 3 besten nach Score, der Knopf darunter zeigt alle weiteren
    const previewsFrei = previews.filter((h) => !belegt.has(h.f.id));
    const previewListe = nimm(previews, zustand.allePreviews ? previewsFrei.length : FILME_JE_RUBRIK);
    const previewKnopf = previewsFrei.length > FILME_JE_RUBRIK
      ? `<button type="button" class="vorbei-knopf mehr-knopf" data-alle-previews aria-expanded="${zustand.allePreviews}">${zustand.allePreviews ? 'Weniger Previews' : `Mehr Previews (${previewsFrei.length - FILME_JE_RUBRIK})`}</button>` : '';
    const rubriken = [
      ['Festival diese Woche', festText, festListe, null, festFuss],
      ['Neu diese Woche', 'Weitere Neustarts dieser Woche, die besten zuerst.', neuListe],
      ['Previews', 'Diese Filme laufen schon vor ihrem offiziellen Kinostart. Vorstellungen am Vorabend des Starts zählen nicht.', previewListe, null, previewKnopf],
      ['Klassiker zum Nachholen', `Mindestens ${KLASSIKER_ALTER} Jahre alt, mit hohem Score oder einem Hauptpreis.`, nimm(alle.filter((h) => {
        const j = parseInt(h.f.jahr, 10);
        return j && jetzt - j >= KLASSIKER_ALTER && ((h.f.bewertung ?? -1) >= KLASSIKER_SCORE || hatPreis(h));
      }))],
      ['Letzte Chance', 'Diese Filme laufen in den nächsten Tagen zum letzten Mal.', nimm(alle.filter((h) => chanceFilme().has(h.f.id)).map((h) => {
        const c = chanceFilme().get(h.f.id);
        return { ...h, hinweis: `Zum letzten Mal ${wochentagDatum(c.letzter)} im ${c.kinos.map((k) => k.name).join(', ')}` };
      }))],
      // Blickt über die sieben Tage hinaus und zeigt deshalb alle betroffenen Filme, unabhängig von den anderen Rubriken
      ['Schnell vergriffen', vorverkaufText(), vorverkaufFilme(daten), vorverkaufKarte],
      ['Geheimtipp', 'Hoher Score, aber nur in einem Kino und an wenigen Tagen.', nimm(alle.filter((h) => (h.f.bewertung ?? -1) >= GEHEIMTIPP_SCORE && fk.get(h.f.id).kinos.size === 1 && fk.get(h.f.id).tage.size <= GEHEIMTIPP_MAX_TAGE))],
      ['Nur einmal', 'Nur ein Spieltag in dieser Woche und danach kein Termin mehr.', nimm(alle.filter((h) => (h.f.bewertung ?? -1) >= NUR_EINMAL_SCORE && fk.get(h.f.id).tage.size === 1 && !fk.get(h.f.id).spaeter))],
      ['Ausgezeichnet', 'Laufende Filme mit einem Hauptpreis.', nimm(alle.filter(hatPreis))],
      ['Dauerbrenner', 'Seit vielen Kinowochen am Stück im Programm.', nimm(alle.filter((h) => fk.get(h.f.id).serie >= DAUERBRENNER_WOCHEN)
        .sort((a, b) => fk.get(b.f.id).serie - fk.get(a.f.id).serie || nachScore(a.f, b.f))
        .map((h) => ({ ...h, hinweis: `${fk.get(h.f.id).serie} Kinowochen am Stück` })))],
    ].filter(([, , liste]) => liste.length);

    $('#v-highlights').innerHTML = `
      <div class="ansicht-kopf"><h2>Highlights</h2></div>
      <p class="hinweis">Besondere Filme der nächsten sieben Tage. Jeder Film erscheint nur einmal.</p>
      ${film ? `<section class="hl-rubrik"><h3 class="hl-titel">Film der Woche</h3>${highlightKarte(film, true)}</section>` : ''}
      ${rubriken.map(([name, text, liste, karte, fuss]) => `<section class="hl-rubrik"><h3 class="hl-titel">${name}</h3><p class="meta">${text}</p><div class="karten">${liste.map((h) => (karte ? karte(h) : highlightKarte(h, false))).join('')}</div>${fuss || ''}</section>`).join('')}
      ${film || rubriken.length ? '' : '<p class="leer">Für diese Auswahl gibt es in den nächsten sieben Tagen keine Highlights.</p>'}
      ${sonderZeilen.length ? `<section class="hl-rubrik"><h3 class="hl-titel">Sneak und Kurzfilme</h3><p class="meta">Überraschungsfilme und Kurzfilmprogramme der nächsten sieben Tage.</p><ul class="hl-termine">${sonderZeilen.map((e) => `<li>${filmLink(e.f)}<span class="chip">${esc(kinos[e.k].name)}</span><span class="meta">${e.tage.map(wochentagDatum).join(', ')}</span></li>`).join('')}</ul></section>` : ''}
      <p class="hl-fuss"><button class="film-link" data-zu="programm">Zum ganzen Programm →</button></p>`;
  }

  // ---------- Ansicht Programm ----------
  function zeigeProgramm(daten) {
    // Haken "Start diese Woche": nur Neustarts, nach derselben Regel wie in den Highlights
    if (zustand.nurNeu) { const fk = fakten(); daten = daten.filter((t) => fk.get(t.f)?.neu); }
    const proTag = new Map();
    daten.forEach((t) => { if (!proTag.has(t.d)) proTag.set(t.d, new Set()); proTag.get(t.d).add(t.f); });
    const chanceIds = new Set(letzteChance(daten).sicher.map((e) => e.f.id));

    // Ganze Woche: heute bis einschließlich Sonntag der aktuellen ISO-Woche (vergangene Tage zählen nicht)
    const sonntag = plusTage(montagVon(HEUTE), 6);
    const ganzeWoche = zustand.tag === 'woche';
    const wochenFilme = new Set();
    daten.forEach((t) => { if (t.d >= HEUTE && t.d <= sonntag) wochenFilme.add(t.f); });
    const wochenKnopf = `<button class="tag" data-tag="woche" aria-pressed="${ganzeWoche}"><small>KW ${kalenderwoche(HEUTE)}</small><b>${wochenFilme.size} ${wochenFilme.size === 1 ? 'Film' : 'Filme'}</b></button>`;

    const knoepfe = wochenKnopf + Array.from({ length: 8 }, (_, i) => plusTage(HEUTE, i)).map((d, i) => {
      const n = proTag.get(d)?.size || 0;
      const oben = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : fmtWt.format(parse(d));
      return `<button class="tag" data-tag="${d}" aria-pressed="${d === zustand.tag}"><small>${oben} · ${datumKurz(d)}</small><b>${n} ${n === 1 ? 'Film' : 'Filme'}</b></button>`;
    }).join('');

    const amTag = ganzeWoche ? daten.filter((t) => t.d >= HEUTE && t.d <= sonntag) : daten.filter((t) => t.d === zustand.tag);
    // Sortierung für beide Ansichten immer nach Score, Filme ohne Score am Ende, bei Gleichstand alphabetisch
    const filmOrdnung = (a, b) => (b.genau ?? -1) - (a.genau ?? -1) || a.titel.localeCompare(b.titel, 'de');
    // Festival je Film (Ansicht nach Film) und je Film und Kino (Ansicht nach Kino), erstes passendes zählt
    const festJeFilm = new Map(), festJeFilmKino = new Map();
    amTag.forEach((t) => {
      const fe = festivalVon(t);
      if (!fe) return;
      if (!festJeFilm.has(t.f)) festJeFilm.set(t.f, fe);
      if (!festJeFilmKino.has(`${t.f}|${t.k}`)) festJeFilmKino.set(`${t.f}|${t.k}`, fe);
    });
    let inhalt;
    if (!amTag.length) {
      inhalt = zustand.nurNeu
        ? `<p class="leer">Für ${ganzeWoche ? 'diese Woche' : datum(zustand.tag)} gibt es keine Neustarts in dieser Auswahl.</p>`
        : `<p class="leer">Für ${ganzeWoche ? 'diese Woche' : datum(zustand.tag)} sind keine Vorstellungen eingetragen.<br>Viele Kinos veröffentlichen ihr Programm erst kurzfristig.</p>`;
    } else if (zustand.gruppe === 'film') {
      const nachFilm = new Map();
      amTag.forEach((t) => { if (!nachFilm.has(t.f)) nachFilm.set(t.f, new Set()); nachFilm.get(t.f).add(t.k); });
      const liste = [...nachFilm].sort((a, b) => filmOrdnung(filme[a[0]], filme[b[0]]));
      inhalt = `<div class="karten">${liste.map(([fid, ks]) => {
        const f = filme[fid];
        const chips = [...ks].map((k) => kinos[k].name).sort().map((n) => `<span class="chip">${esc(n)}</span>`).join('');
        const badge = (chanceIds.has(fid) ? '<span class="abzeichen chance">Letzte Chance</span>' : '') + festivalAbzeichen(festJeFilm.get(fid));
        return `<article class="filmkarte">${plakat(f)}<div>${filmLink(f)}${pokale(f)}${badge}${wertung(f)}<div class="meta">${filmMeta(f)}</div>${grundZeile(f)}<div class="chips">${chips}</div></div></article>`;
      }).join('')}</div>`;
    } else {
      const nachKino = new Map();
      amTag.forEach((t) => { if (!nachKino.has(t.k)) nachKino.set(t.k, new Set()); nachKino.get(t.k).add(t.f); });
      const liste = [...nachKino].sort((a, b) => kinos[a[0]].name.localeCompare(kinos[b[0]].name, 'de'));
      inhalt = `<div class="karten">${liste.map(([kid, fs]) => {
        const k = kinos[kid];
        const zeilen = [...fs].map((f) => filme[f]).sort(filmOrdnung)
          .map((f) => `<li>${plakat(f, 'mini')}<div>${filmLink(f)}${pokale(f)}${chanceIds.has(f.id) ? '<span class="abzeichen chance">Letzte Chance</span>' : ''}${festivalAbzeichen(festJeFilmKino.get(`${f.id}|${kid}`))}${wertung(f)}<div class="meta">${filmMeta(f)}</div>${grundZeile(f)}</div></li>`).join('');
        return `<article class="kinoblock"><h3><span class="monogramm klein">${esc(k.mono)}</span>${esc(k.name)}</h3><div class="meta">${fs.size} ${fs.size === 1 ? 'Film' : 'Filme'}</div><ul>${zeilen}</ul></article>`;
      }).join('')}</div>`;
    }

    $('#v-programm').innerHTML = `
      <div class="tage">${knoepfe}
        <label class="tag-wahl">Anderer Tag<input type="date" id="tag-wahl" value="${ganzeWoche ? HEUTE : zustand.tag}" min="${ERSTER}" max="${LETZTER}"></label>
      </div>
      <div class="ansicht-kopf">
        <h2>${ganzeWoche ? `KW ${kalenderwoche(HEUTE)} · ${datumKurz(HEUTE)} bis ${datumKurz(sonntag)}` : fmtVoll.format(parse(zustand.tag))}</h2>
        <div class="steuerung">
          <label class="haken"><input type="checkbox" id="nur-neu" ${zustand.nurNeu ? 'checked' : ''}> Start diese Woche</label>
          <div class="umschalter" role="group" aria-label="Gruppierung">
            <button data-gruppe="film" aria-pressed="${zustand.gruppe === 'film'}">Nach Film</button>
            <button data-gruppe="kino" aria-pressed="${zustand.gruppe === 'kino'}">Nach Kino</button>
          </div>
        </div>
      </div>
      ${inhalt}`;
  }

  // ---------- Ansicht Letzte Chance ----------
  function chanceZeile(e) {
    const wann = e.rest === 0 ? 'heute' : e.rest === 1 ? 'morgen' : fmtVoll.format(parse(e.letzter));
    const wo = e.kinos.map((k) => esc(k.name)).join(', ');
    const zaehler = e.rest === 0 ? '<b>Heute</b><span>letzter Tag</span>' : `<b>${e.rest}</b><span>${e.rest === 1 ? 'Tag' : 'Tage'} übrig</span>`;
    return `<article class="chance-zeile">${plakat(e.f)}<div class="text">${filmLink(e.f)}${pokale(e.f)}${wertung(e.f)}<div class="meta">${filmMeta(e.f)}</div>${grundZeile(e.f)}<div class="zuletzt">Zum letzten Mal ${wann} im ${wo}</div></div><div class="countdown">${zaehler}</div></article>`;
  }
  function zeigeChance(daten) {
    const { sicher, offen } = letzteChance(daten);
    $('#v-chance').innerHTML = `
      <div class="ansicht-kopf"><h2>Letzte Chance</h2></div>
      <p class="hinweis">Diese Filme laufen in den nächsten sieben Tagen zum letzten Mal. Aufgeführt sind nur Filme, bei denen das Kino für die Folgetage schon sein Programm veröffentlicht hat und der Film darin fehlt.</p>
      ${sicher.length ? `<div class="chance-liste">${sicher.map(chanceZeile).join('')}</div>` : '<p class="leer">Gerade endet kein Film sicher in den nächsten sieben Tagen.</p>'}
      ${offen.length ? `<details class="offen-liste"><summary>${offen.length} weitere Filme mit offenem Ende</summary>
        <p class="hinweis">Bei diesen Filmen reicht das veröffentlichte Programm des Kinos nur bis zum genannten Tag. Sie können also noch verlängert werden.</p>
        <div class="chance-liste">${offen.map(chanceZeile).join('')}</div></details>` : ''}`;
  }

  // ---------- Ansicht Kalender ----------
  function zeigeKalender(daten) {
    const proTag = new Map();
    daten.forEach((t) => { if (!proTag.has(t.d)) proTag.set(t.d, new Set()); proTag.get(t.d).add(t.f); });
    const umschalter = `<div class="umschalter" role="group" aria-label="Kalenderart">
      <button data-kal="monat" aria-pressed="${zustand.kalModus === 'monat'}">Monat</button>
      <button data-kal="matrix" aria-pressed="${zustand.kalModus === 'matrix'}">Matrix</button></div>`;
    $('#v-kalender').innerHTML = zustand.kalModus === 'monat' ? monatsKalender(proTag, umschalter) : matrix(daten, umschalter);
  }

  function monatsKalender(proTag, umschalter) {
    const m = zustand.kalMonat;
    const erster = `${m}-01`;
    const tageImMonat = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
    const max = Math.max(1, ...[...proTag.values()].map((s) => s.size));
    let zellen = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<div class="wt">${w}</div>`).join('');
    for (let i = 0; i < wochentag(erster); i++) zellen += '<div class="kal-tag aussen"></div>';
    for (let t = 1; t <= tageImMonat; t++) {
      const d = `${m}-${String(t).padStart(2, '0')}`;
      const n = proTag.get(d)?.size || 0;
      const klassen = ['kal-tag', n ? '' : 'ohne', d === HEUTE ? 'heute' : ''].join(' ');
      zellen += `<button class="${klassen}" ${n ? `data-tag-sprung="${d}"` : 'disabled'} aria-label="${datum(d)}: ${n} Filme">
        <span class="fuell" style="height:${(n / max) * 100}%"></span>
        <span class="nr">${t}</span><span class="anz">${n || '–'}${n ? '<small>Filme</small>' : ''}</span></button>`;
    }
    const vor = plusTage(erster, -1).slice(0, 7), nach = plusTage(erster, 32).slice(0, 7);
    return `
      <div class="ansicht-kopf">
        <div class="kal-nav">
          <button data-monat="${vor}" ${vor < ERSTER.slice(0, 7) ? 'disabled' : ''} aria-label="Vorheriger Monat">‹</button>
          <strong>${fmtMonatLang.format(parse(erster))}</strong>
          <button data-monat="${nach}" ${nach > LETZTER.slice(0, 7) ? 'disabled' : ''} aria-label="Nächster Monat">›</button>
        </div>${umschalter}
      </div>
      <p class="hinweis">Zahl der verschiedenen Filme pro Tag. Ein Klick auf einen Tag öffnet das Programm.</p>
      <div class="monat">${zellen}</div>`;
  }

  function matrix(daten, umschalter) {
    const start = zustand.matrixStart;
    const tage = Array.from({ length: 14 }, (_, i) => plusTage(start, i));
    const ende = tage[tage.length - 1];
    const zellen = new Map();
    daten.forEach((t) => {
      if (t.d < start || t.d > ende) return;
      if (!zellen.has(t.f)) zellen.set(t.f, new Map());
      const m = zellen.get(t.f);
      if (!m.has(t.d)) m.set(t.d, []);
      m.get(t.d).push(kinos[t.k].name);
    });
    const maxKinos = Math.max(1, ...[...zellen.values()].flatMap((m) => [...m.values()].map((l) => l.length)));
    const zeilen = [...zellen].sort((a, b) => {
      const ea = [...a[1].keys()].sort()[0], eb = [...b[1].keys()].sort()[0];
      return ea.localeCompare(eb) || filme[a[0]].titel.localeCompare(filme[b[0]].titel, 'de');
    });
    // Einfarbige Goldskala: mehr Kinos = kräftiger
    const ton = (n) => `rgba(201,162,74,${(0.35 + 0.65 * (n / maxKinos)).toFixed(2)})`;
    const kopf = tage.map((d) => {
      const we = wochentag(d) >= 5 ? ' wochenende' : '';
      return `<th class="${d === HEUTE ? 'heute' : ''}${we}">${fmtWt.format(parse(d))}<br>${datumKurz(d)}</th>`;
    }).join('');
    const koerper = zeilen.map(([fid, m]) => `<tr><th class="erste" scope="row">${filmLink(filme[fid])}</th>${tage.map((d) => {
      const l = m.get(d);
      const we = wochentag(d) >= 5 ? ' class="wochenende"' : '';
      return l ? `<td${we} title="${esc(datum(d))}: ${esc(l.sort().join(', '))}"><span class="punkt" style="background:${ton(l.length)}">${l.length}</span></td>` : `<td${we}></td>`;
    }).join('')}</tr>`).join('');
    const vor = plusTage(start, -7), nach = plusTage(start, 7);
    return `
      <div class="ansicht-kopf">
        <div class="kal-nav">
          <button data-matrix="${vor}" ${plusTage(vor, 13) < ERSTER ? 'disabled' : ''} aria-label="Eine Woche zurück">‹</button>
          <strong>${datumKurz(start)} – ${datumKurz(ende)}</strong>
          <button data-matrix="${nach}" ${nach > LETZTER ? 'disabled' : ''} aria-label="Eine Woche vor">›</button>
        </div>${umschalter}
      </div>
      <p class="hinweis">Welcher Film läuft an welchem Tag. Die Zahl im Punkt nennt die Anzahl der Kinos. Mit der Maus auf einen Punkt zeigen, um die Kinos zu sehen.</p>
      ${zeilen.length ? `<div class="matrix-wrap"><table class="matrix"><thead><tr><th class="erste">Film</th>${kopf}</tr></thead><tbody>${koerper}</tbody></table></div>
      <div class="legende">Kinos pro Tag: <span class="punkt" style="background:${ton(1)}">1</span><span class="punkt" style="background:${ton(maxKinos)}">${maxKinos}</span></div>` : '<p class="leer">In diesen zwei Wochen sind keine Vorstellungen eingetragen.</p>'}`;
  }

  // ---------- Ansicht Filme ----------
  function filmStatistik(daten) {
    const m = new Map();
    daten.forEach((t) => {
      let s = m.get(t.f);
      if (!s) { s = { f: filme[t.f], kinos: new Set(), tage: new Set(), erster: t.d, letzter: t.d }; m.set(t.f, s); }
      s.kinos.add(t.k); s.tage.add(t.d);
      if (t.d > s.letzter) s.letzter = t.d;
      if (t.d < s.erster) s.erster = t.d;
    });
    const chanceIds = new Set(letzteChance(daten).sicher.map((e) => e.f.id));
    return [...m.values()].map((s) => {
      const naechster = [...s.tage].filter((d) => d >= HEUTE).sort()[0] || null;
      let status = naechster ? statusVon(naechster) : 'nein';
      if (chanceIds.has(s.f.id)) status = 'chance';
      return { ...s, nKinos: s.kinos.size, nTage: s.tage.size, naechster, status };
    });
  }

  // Reihenfolge der Spalten. "Kinostart": deutscher Start laut TMDB, sonst der erste erfasste Spieltag.
  // Der Rang folgt immer dem Score der angezeigten Filme (gleicher Score, gleicher Rang), auch bei anderer Sortierung.
  const SPALTEN = [
    { feld: 'rang', titel: '#', wert: (s) => s.rang, zahl: true, zelle: (s) => (s.rang ? `<span class="rang">${s.rang}</span>` : '–') },
    { feld: 'titel', titel: 'Titel', wert: (s) => s.f.titel.toLocaleLowerCase('de'), klasse: 'umbruch',
      zelle: (s) => `<div class="titelzelle">${plakat(s.f, 'mini')}<div>${filmLink(s.f)}${pokale(s.f)}${gefragtAbzeichen(s.f)}</div></div>` },
    { feld: 'bewertung', titel: 'Score', wert: (s) => s.f.genau, zahl: true, zelle: (s) => (s.f.bewertung != null ? wertung(s.f) : '–') },
    { feld: 'regie', titel: 'Regie', wert: (s) => (s.f.regie || '￿').toLocaleLowerCase('de'), klasse: 'umbruch', zelle: (s) => (istSneak(s.f) ? '?' : regieLinks(s.f) || '–') },
    { feld: 'erster', titel: 'Kinostart', wert: (s) => kinostart(s).d, hinweis: 'Deutscher Kinostart laut TMDB, sonst der erste erfasste Spieltag', zelle: kinostartZelle },
    { feld: 'naechster', titel: 'Nächster Tag', wert: (s) => s.naechster || '9999', zelle: (s) => (s.naechster ? datumKurz(s.naechster) : '–') },
    { feld: 'letzter', titel: 'Letzter Tag', wert: (s) => s.letzter, zelle: (s) => datumKurz(s.letzter) },
    { feld: 'jahr', titel: 'Produktionsjahr', wert: (s) => s.f.jahr || '0000', zahl: true, zelle: (s) => (istSneak(s.f) ? '?' : esc(s.f.jahr || '–')) },
    { feld: 'land', titel: 'Land', wert: (s) => (s.f.laender[0] || '￿').toLocaleLowerCase('de'), klasse: 'umbruch schmal', zelle: (s) => (istSneak(s.f) ? '?' : s.f.laender.map(mitFlagge).join(', ') || '–') },
    { feld: 'kinos', titel: 'Kinos', wert: (s) => s.nKinos, zahl: true, zelle: (s) => s.nKinos },
    { feld: 'tage', titel: 'Spieltage', wert: (s) => s.nTage, zahl: true, zelle: (s) => s.nTage },
  ];
  // Kinostart: deutscher Start laut TMDB (Feld kinostart, Issue #37), sonst der erste erfasste Spieltag
  function kinostart(s) {
    const k = s.f.info && s.f.info.kinostart;
    return k ? { d: String(k), echt: true } : { d: s.erster, echt: false };
  }
  function kinostartZelle(s) {
    const k = kinostart(s);
    return k.echt ? datumKurz(k.d) : `<span class="geschaetzt" title="Kein Kinostart bekannt, erster erfasster Spieltag">${datumKurz(k.d)}</span>`;
  }
  // Rang nach dem genauen Score (drei Nachkommastellen). Gleicher Rang nur bei exakt gleichem Wert.
  // Filme ohne Score bekommen keinen Rang.
  function setzeRang(liste) {
    const mitScore = liste.filter((s) => s.f.genau != null).sort((a, b) => b.f.genau - a.f.genau);
    liste.forEach((s) => { s.rang = null; });
    mitScore.forEach((s, i) => { s.rang = i > 0 && s.f.genau === mitScore[i - 1].f.genau ? mitScore[i - 1].rang : i + 1; });
  }

  function zeigeFilme(daten) {
    let liste = filmStatistik(daten);
    if (zustand.nurKommend) liste = liste.filter((s) => s.naechster);
    setzeRang(liste);
    const sp = SPALTEN.find((s) => s.feld === zustand.sort.feld);
    liste.sort((a, b) => {
      const x = sp.wert(a), y = sp.wert(b);
      // Filme ohne Score stehen immer am Ende, egal in welcher Richtung
      if (x == null || y == null) return (x == null) - (y == null) || a.f.titel.localeCompare(b.f.titel, 'de');
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'de');
      return (zustand.sort.auf ? r : -r) || a.f.titel.localeCompare(b.f.titel, 'de');
    });

    const kopf = SPALTEN.map((s) => {
      const aktiv = s.feld === zustand.sort.feld;
      const r = aktiv ? ` data-richtung="${zustand.sort.auf ? 'auf' : 'ab'}"` : '';
      return `<th class="${s.zahl ? 'zahl' : ''}" aria-sort="${aktiv ? (zustand.sort.auf ? 'ascending' : 'descending') : 'none'}"${s.hinweis ? ` title="${s.hinweis}"` : ''}><button data-sort="${s.feld}"${r}>${s.titel}</button></th>`;
    }).join('') + '<th>Status</th><th title="Im Kino gesehen (Mein Kino)">Gesehen</th>';

    // Letzte Spalte: Häkchen für "Mein Kino", direkt in der Liste umschaltbar
    const haken = (f) => (istSneak(f) || istKurzfilm(f) ? '' : `<button type="button" class="gesehen-haken" data-gesehen-film="${f.id}" aria-pressed="${Boolean(gesehenAm(f))}" aria-label="${esc(f.titel)} im Kino gesehen" title="Im Kino gesehen">✓</button>`);
    const zeilen = liste.map((s) => `<tr>${SPALTEN.map((sp2) => `<td class="${[sp2.zahl ? 'zahl' : '', sp2.klasse || ''].join(' ').trim()}">${sp2.zelle(s)}</td>`).join('')}<td><span class="status ${s.status}">${STATUS_TEXT[s.status]}</span></td><td class="mitte">${haken(s.f)}</td></tr>`).join('');

    // Nach einem Sprung aus Statistik oder Datenexploration: Knopf zurück (stellt die vorherigen Filter wieder her)
    const zurueckKnopf = auswertungZurueck ? `<button type="button" class="zurueck-film" data-zurueck-auswertung-seite>← Zurück zur ${AUSWERTUNGEN[auswertungZurueck.ansicht]}</button>` : '';
    $('#v-filme').innerHTML = `${zurueckKnopf}
      <div class="ansicht-kopf"><h2>${zahl(liste.length)} Filme</h2>
        <label class="meta"><input type="checkbox" id="nur-kommend" ${zustand.nurKommend ? 'checked' : ''}> Nur Filme mit kommenden Terminen</label></div>
      ${liste.length ? `<div class="tabelle-wrap"><table class="liste"><thead><tr>${kopf}</tr></thead><tbody>${zeilen}</tbody></table></div>` : '<p class="leer">Keine Filme für diese Auswahl.</p>'}`;
  }

  // ---------- Ansicht Regie ----------
  // Ein Film mit mehreren Regisseur:innen zählt für jede und jeden. Sneaks und Kurzfilmprogramme haben keine Regie.
  function regieNamen(f) {
    if (istSneak(f) || istKurzfilm(f) || !f.regie) return [];
    return [...new Set(f.regie.split(/\s*,\s*/).filter(Boolean))];
  }
  function regieLinks(f) {
    return regieNamen(f).map((n) => `<button class="film-link regie-link" data-regie="${esc(n)}" title="Alle Filme von ${esc(n)}">${esc(n)}</button>`).join(', ');
  }
  function regieStatistik(daten) {
    const m = new Map();
    filmStatistik(daten).forEach((s) => regieNamen(s.f).forEach((n) => { if (!m.has(n)) m.set(n, []); m.get(n).push(s); }));
    return [...m].map(([name, fs]) => {
      const mitScore = fs.filter((s) => s.f.bewertung != null);
      const tage = new Set();
      fs.forEach((s) => s.tage.forEach((d) => tage.add(d)));
      const t = [...tage].sort();
      return {
        name, filme: fs, nFilme: fs.length, nTage: tage.size,
        // Durchschnitt nur über Filme mit Score, ganze Zahl wie beim Film-Score
        schnitt: mitScore.length ? Math.round(mitScore.reduce((a, s) => a + s.f.bewertung, 0) / mitScore.length) : null,
        erster: t[0], letzter: t[t.length - 1], naechster: t.find((d) => d >= HEUTE) || null,
      };
    });
  }
  const REGIE_SPALTEN = [
    { feld: 'name', titel: 'Regie', wert: (r) => r.name.toLocaleLowerCase('de') },
    { feld: 'schnitt', titel: 'Ø Score', wert: (r) => r.schnitt, zahl: true },
    { feld: 'filme', titel: 'Filme', wert: (r) => r.nFilme, zahl: true },
    { feld: 'tage', titel: 'Spieltage', wert: (r) => r.nTage, zahl: true },
    { feld: 'erster', titel: 'Erster Tag', wert: (r) => r.erster },
    { feld: 'letzter', titel: 'Letzter Tag', wert: (r) => r.letzter },
    { feld: 'naechster', titel: 'Nächster Tag', wert: (r) => r.naechster || '9999' },
  ];
  // Angaben von TMDB je Name: [Foto, Geburtsjahr, Todesjahr, Geburtsort, Spielfilme als Regie]
  const PERSONEN = D.personen || {};
  function regieFoto(name, klasse) {
    const p = PERSONEN[name];
    const initialen = name.split(/\s+/).filter(Boolean).map((t) => t[0]).slice(0, 2).join('').toUpperCase();
    return p && p[0]
      ? `<span class="regie-foto ${klasse}" aria-hidden="true"><img src="${esc(p[0])}" alt="" loading="lazy"></span>`
      : `<span class="regie-foto ${klasse} leer" aria-hidden="true">${esc(initialen)}</span>`;
  }
  function regieKopf(r) {
    const p = PERSONEN[r.name] || [];
    const [, geboren, gestorben, ort, arbeiten, lbSlug] = p;
    // Geprüfte Letterboxd-Seite, sonst die Letterboxd-Suche nach dem Namen
    const lbUrl = lbSlug ? `https://letterboxd.com/director/${encodeURIComponent(lbSlug)}/` : `https://letterboxd.com/search/${encodeURIComponent(r.name)}/`;
    const lbLink = `<a class="lb-link" href="${esc(lbUrl)}" target="_blank" rel="noopener">${lbSlug ? 'Auf Letterboxd' : 'Auf Letterboxd suchen'} ↗</a>`;
    const leben = geboren ? `* ${geboren}${ort ? ` in ${esc(ort)}` : ''}${gestorben ? ` · † ${gestorben}` : ''}` : (ort ? `Geboren in ${esc(ort)}` : '');
    const werk = arbeiten ? `${arbeiten} ${arbeiten === 1 ? 'Spielfilm' : 'Spielfilme'} als Regie` : '';
    const zeilen = [leben, werk].filter(Boolean);
    const zurueckKnopf = zurueck && zurueck.name === r.name && filme[zurueck.film]
      ? `<button type="button" class="zurueck-film" data-zurueck-film>← Zurück zu ${esc(filme[zurueck.film].titel)}</button>` : '';
    return `${zurueckKnopf}<div class="regie-kopf">${regieFoto(r.name, 'gross')}<div><b>${esc(r.name)}</b>${zeilen.length ? `<div class="meta">${zeilen.join(' · ')}</div>` : ''}<div class="meta">${r.nFilme} ${r.nFilme === 1 ? 'Film' : 'Filme'} bei uns${r.schnitt != null ? `, Ø Score ${r.schnitt}` : ''}</div><div class="meta">${lbLink}</div></div></div>`;
  }
  // Filme einer Person, aufgeklappt unter ihrer Zeile. Spalten wie im Reiter Filme, dazu der erste Tag.
  function regieFilmTabelle(r) {
    const zeilen = [...r.filme].sort((a, b) => b.letzter.localeCompare(a.letzter) || a.f.titel.localeCompare(b.f.titel, 'de')).map((s) => `<tr>
      <td class="umbruch"><div class="titelzelle">${plakat(s.f, 'mini')}<div>${filmLink(s.f)}${pokale(s.f)}${gefragtAbzeichen(s.f)}</div></div></td>
      <td class="zahl">${s.f.bewertung != null ? wertung(s.f) : '–'}</td>
      <td>${kinostartZelle(s)}</td>
      <td>${s.naechster ? datumKurz(s.naechster) : '–'}</td>
      <td>${datumKurz(s.letzter)}</td>
      <td class="zahl">${esc(s.f.jahr || '–')}</td>
      <td class="umbruch schmal">${s.f.laender.map(mitFlagge).join(', ') || '–'}</td>
      <td class="zahl">${s.nKinos}</td>
      <td class="zahl">${s.nTage}</td>
      <td><span class="status ${s.status}">${STATUS_TEXT[s.status]}</span></td>
    </tr>`).join('');
    return `<table class="liste innen"><thead><tr><th>Titel</th><th class="zahl">Score</th><th title="Deutscher Kinostart laut TMDB, sonst der erste erfasste Spieltag">Kinostart</th><th>Nächster Tag</th><th>Letzter Tag</th><th class="zahl">Produktionsjahr</th><th>Land</th><th class="zahl">Kinos</th><th class="zahl">Spieltage</th><th>Status</th></tr></thead><tbody>${zeilen}</tbody></table>`;
  }
  function zeigeRegie(daten) {
    const liste = regieStatistik(daten);
    const sp = REGIE_SPALTEN.find((s) => s.feld === zustand.regieSort.feld);
    liste.sort((a, b) => {
      const x = sp.wert(a), y = sp.wert(b);
      // Ohne Score immer am Ende
      if (x == null || y == null) return (x == null) - (y == null) || a.name.localeCompare(b.name, 'de');
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'de');
      return (zustand.regieSort.auf ? r : -r) || b.nFilme - a.nFilme || a.name.localeCompare(b.name, 'de');
    });
    const kopf = REGIE_SPALTEN.map((s) => {
      const aktiv = s.feld === zustand.regieSort.feld;
      const r = aktiv ? ` data-richtung="${zustand.regieSort.auf ? 'auf' : 'ab'}"` : '';
      return `<th class="${s.zahl ? 'zahl' : ''}" aria-sort="${aktiv ? (zustand.regieSort.auf ? 'ascending' : 'descending') : 'none'}"><button data-rsort="${s.feld}"${r}>${s.titel}</button></th>`;
    }).join('');
    const zeilen = liste.map((r) => {
      const offen = r.name === zustand.regieOffen;
      const zeile = `<tr class="regie-zeile${offen ? ' offen' : ''}" data-regie-auf="${esc(r.name)}" aria-expanded="${offen}">
        <td class="umbruch"><button class="film-link regie-name" data-regie-auf="${esc(r.name)}"><span class="pfeil" aria-hidden="true">${offen ? '▾' : '▸'}</span>${regieFoto(r.name, 'klein')}${esc(r.name)}</button></td>
        <td class="zahl">${r.schnitt != null ? wertung({ bewertung: r.schnitt }) : '–'}</td>
        <td class="zahl">${r.nFilme}</td>
        <td class="zahl">${r.nTage}</td>
        <td>${datumKurz(r.erster)}</td>
        <td>${datumKurz(r.letzter)}</td>
        <td>${r.naechster ? datumKurz(r.naechster) : '–'}</td>
      </tr>`;
      return offen ? `${zeile}<tr class="regie-filme"><td colspan="${REGIE_SPALTEN.length}">${regieKopf(r)}${regieFilmTabelle(r)}</td></tr>` : zeile;
    }).join('');
    $('#v-regie').innerHTML = `
      <div class="ansicht-kopf"><h2>${zahl(liste.length)} Regisseur:innen</h2></div>
      <p class="hinweis">Ø Score aus allen Filmen mit Score, die seit Beginn der Erfassung in den Kinos liefen. Ein Klick auf den Namen zeigt die Filme.</p>
      ${liste.length ? `<div class="tabelle-wrap"><table class="liste regie-liste"><thead><tr>${kopf}</tr></thead><tbody>${zeilen}</tbody></table></div>` : '<p class="leer">Keine Regie für diese Auswahl.</p>'}`;
  }
  // Sprung aus Film-Dialog oder Filmliste: Reiter Regie, Person aufgeklappt und sichtbar
  // Vom Abzeichen oder aus den Highlights zur Karte des Festivals im Reiter Festivals
  function springeZuFestival(id) {
    if ($('#film-dialog').open) $('#film-dialog').close();
    wechsleAnsicht('festivals');
    const k = document.getElementById(`festival-${id}`);
    if (k) k.scrollIntoView({ block: 'start' }); else scrollTo(0, 0);
  }
  // herkunft: Film-Dialog, aus dem gesprungen wurde. Dann zeigt der Kopf der Person einen Knopf zurück zum Film.
  let zurueck = null;
  function zeigeRegiePerson(name, herkunft = null) {
    zustand.regieOffen = name;
    zurueck = herkunft ? { ...herkunft, name } : null;
    if ($('#film-dialog').open) $('#film-dialog').close();
    wechsleAnsicht('regie');
    const zeile = [...document.querySelectorAll('#v-regie tr.regie-zeile')].find((z) => z.dataset.regieAuf === name);
    if (zeile) zeile.scrollIntoView({ block: 'start' });
  }

  // ---------- Ansicht Statistik ----------
  function tagesreihe(daten) {
    const proTag = new Map();
    daten.forEach((t) => { if (!proTag.has(t.d)) proTag.set(t.d, new Set()); proTag.get(t.d).add(t.f); });
    const reihe = [];
    for (let d = ERSTER; d <= LETZTER; d = plusTage(d, 1)) reihe.push({ d, n: proTag.get(d)?.size || 0 });
    return reihe;
  }
  function schritt(max) {
    const roh = max / 4;
    const p = Math.pow(10, Math.floor(Math.log10(roh || 1)));
    return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= roh) || p * 10;
  }
  function balken(eintraege, filterArt) {
    const max = Math.max(1, ...eintraege.map((e) => e[1]));
    const name = (n) => (filterArt === 'land' ? mitFlagge(n) : esc(n));
    return `<div class="balkenliste">${eintraege.map(([n, z]) => `<button class="balkenzeile" data-setze="${filterArt}" data-wert="${esc(n)}" title="Nach ${esc(n)} filtern">
      <span>${name(n)}</span><span class="bahn"><i style="width:${(z / max) * 100}%"></i></span><span class="wert">${z}</span></button>`).join('')}</div>`;
  }

  // Durchschnittlicher Score je Tag: jeder Film zählt pro Tag nur einmal, nur Filme mit Score
  function bewertungsreihe(daten) {
    const proTag = new Map();
    daten.forEach((t) => {
      if (filme[t.f].bewertung == null) return;
      if (!proTag.has(t.d)) proTag.set(t.d, new Set());
      proTag.get(t.d).add(t.f);
    });
    const reihe = [];
    for (let d = ERSTER; d <= LETZTER; d = plusTage(d, 1)) {
      const s = proTag.get(d);
      const werte = s ? [...s].map((f) => filme[f].bewertung) : [];
      reihe.push({ d, n: werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null, anzahl: werte.length });
    }
    return reihe;
  }

  // Farben für Länder (Filme pro Tag nach Land) und Gruppen im Baukasten, feste Reihenfolge
  const LANDFARBEN = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
  const FARBE_ANDERE = '#6b6760';
  function zeigeStatistik(daten) {
    const reihe = tagesreihe(daten);
    // Die Tagesverläufe erst ab Projektstart: davor sind die Daten aus der Übergabe lückenhaft
    const ab = (p) => p.d >= PROJEKT_START;
    const reiheAb = reihe.filter(ab);
    const wertungen = bewertungsreihe(daten).filter(ab);
    const laenderTag = laenderJeTag(daten);
    const mitWert = wertungen.filter((p) => p.n != null).map((p) => p.n);
    const kommende = new Set(daten.filter((t) => t.d >= HEUTE).map((t) => t.f));
    const basis = kommende.size ? [...kommende].map((id) => filme[id]) : [];
    const jz = new Map(), la = new Map();
    basis.forEach((f) => {
      if (f.jahrzehnt) jz.set(f.jahrzehnt, (jz.get(f.jahrzehnt) || 0) + 1);   // ohne "unbekannt"
      f.laender.forEach((l) => la.set(l, (la.get(l) || 0) + 1));
    });
    const jahrzehnte = [...jz].sort((a, b) => a[0].localeCompare(b[0]));
    const laender = [...la].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, 12);
    const rankingHinweis = `Nur Neustarts (deutscher Kinostart im jeweiligen Zeitraum), ab Projektstart am ${datumKurz(PROJEKT_START)}. Spieltage zählen jeden Tag in jedem Kino, an dem ein Film läuft. Einzelne Vorstellungen und Uhrzeiten erfassen wir nicht.`;

    $('#v-statistik').innerHTML = `
      <h2 class="statistik-zwischentitel erst">Rankings je Monat</h2>
      <p class="hinweis">${rankingHinweis}</p>
      ${zeitRankings(daten, 'monat')}
      <h2 class="statistik-zwischentitel">Rankings je Jahr</h2>
      <p class="hinweis">Nur Neustarts (deutscher Kinostart im jeweiligen Jahr). Anders als bei den Monaten zählen hier auch die Spieltage vor dem Projektstart aus den übernommenen Daten. Diese Daten haben Lücken, vor allem Ende August bis Mitte Oktober 2026. Spieltage zählen jeden Tag in jedem Kino, an dem ein Film läuft.</p>
      ${zeitRankings(daten, 'jahr')}
      <div class="tafel diagramm abstand" id="d-wertung">
        <h3>Ø Score pro Tag</h3>
        <p class="hinweis">Ab Projektstart am ${datumKurz(PROJEKT_START)}. Durchschnittlicher Score aller Filme, die an diesem Tag laufen. Jeder Film zählt pro Tag nur einmal, Filme ohne Score bleiben außen vor. Markiert sind Höchst- und Tiefstwert der vergangenen Tage.</p>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="tafel diagramm abstand" id="d-filme">
        <h3>Verschiedene Filme pro Tag</h3>
        <p class="hinweis">Ab Projektstart am ${datumKurz(PROJEKT_START)}. Ein Film in mehreren Kinos zählt an einem Tag nur einmal. Markiert sind Höchst- und Tiefstwert der vergangenen Tage. Ein Klick auf einen Tag öffnet das Programm.</p>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="tafel diagramm abstand" id="d-sankey">
        <h3>Lebenslauf der Neustarts</h3>
        <p class="hinweis">Alle Filme mit deutschem Kinostart seit Projektstart: in welcher Woche sie starteten, in wie vielen Kinos sie in der Startwoche liefen und wie lange sie bisher am Stück im Programm blieben. Jeder Strom zählt Filme. Fahre über einen Strom, um die Filme zu sehen.</p>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="tafel diagramm abstand" id="d-karte">
        <h3>Ø Score nach Produktionsland</h3>
        <p class="hinweis">Je kräftiger das Gold, desto besser der Ø Score der Filme aus diesem Land. Koproduktionen zählen für jedes beteiligte Land. Grau: keine Filme. Ein Klick zeigt die Filme des Landes.</p>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
        <p class="hinweis karten-fuss"></p>
      </div>
      <div class="tafel diagramm abstand" id="d-streu">
        <h3>Score und Produktionsjahr</h3>
        <p class="hinweis">Jeder Punkt ist ein Film, der seit Beginn der Erfassung lief. Die Linien zeigen den Ø Score je Jahrzehnt. Rechts der gestrichelten Linie sind die 2020er gestreckt, weil dort die meisten Filme liegen. Ein Klick auf einen Punkt öffnet den Film.</p>
        <div class="legende-laender"><span><i class="punkt-laeuft"></i>läuft noch</span><span><i class="punkt-vorbei"></i>lief schon</span><span><i class="strich-schnitt"></i>Ø je Jahrzehnt</span></div>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="tafel diagramm abstand" id="d-hantel">
        <h3>Spieltage je Produktionsjahr</h3>
        <p class="hinweis">Spieltage je Film seit Projektstart am ${datumKurz(PROJEKT_START)}, für jedes Produktionsjahr. Jahre mit wenigen Filmen sind zu Zeiträumen mit mindestens fünf Filmen zusammengefasst. Oben der Film mit den meisten, unten der mit den wenigsten Spieltagen, der kleine Punkt ist der Median. Die Achse ist logarithmisch, jeder Schritt nach oben ist ein Vielfaches. Ein Klick auf einen Punkt öffnet den Film.</p>
        <div class="legende-laender"><span><i class="punkt-max"></i>meiste</span><span><i class="punkt-median"></i>Median</span><span><i class="punkt-min"></i>wenigste</span></div>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="tafel diagramm abstand" id="d-laender">
        <h3>Filme pro Tag nach Land</h3>
        <p class="hinweis">Ab Projektstart am ${datumKurz(PROJEKT_START)}, gleiche Zeitachse wie der Ø Score pro Tag. Jeder Film zählt pro Tag einmal, und zwar für das erstgenannte Produktionsland. Eine Linie je Land, bei heute stehen die Zahlen der drei häufigsten Länder. Die Zahl in der Legende nennt die verschiedenen Filme seit Projektstart.</p>
        <div class="legende-laender">${laenderTag.reihen.map((r, i) => `<span><i style="background:${laenderTag.farben[i]}"></i>${r === 'Andere' ? 'Andere' : mitFlagge(r)} <b>${laenderTag.gesamt[i]}</b></span>`).join('')}</div>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="raster-2">
        <div class="tafel"><h3>Nach Jahrzehnt</h3><p class="hinweis">Filme mit kommenden Terminen nach Produktionsjahr. Ein Klick filtert.</p>${jahrzehnte.length ? balken(jahrzehnte, 'jahrzehnt') : '<p class="leer">Keine Daten.</p>'}</div>
        <div class="tafel"><h3>Nach Land</h3><p class="hinweis">Die zwölf häufigsten Produktionsländer. Koproduktionen zählen für jedes Land.</p>${laender.length ? balken(laender, 'land') : '<p class="leer">Keine Daten.</p>'}</div>
      </div>`;

    const maxFilme = Math.max(1, ...reiheAb.map((p) => p.n));
    const stF = schritt(maxFilme);
    linienDiagramm('d-filme', reiheAb, {
      yMin: 0, yMax: Math.ceil(maxFilme / stF) * stF, schritt: stF, flaeche: true, markierung: true,
      markeText: (p) => `${p.n} Filme`,
      tipp: (p) => `${datum(p.d)}<br><b>${p.n}</b> ${p.n === 1 ? 'Film' : 'Filme'}`,
      beschreibung: 'Liniendiagramm: verschiedene Filme pro Tag',
    });
    // Score-Achse in 5er-Schritten, knapp um die tatsächlichen Werte
    const unten = mitWert.length ? Math.max(0, Math.floor(Math.min(...mitWert) / 5) * 5 - 5) : 0;
    const oben = mitWert.length ? Math.min(100, Math.ceil(Math.max(...mitWert) / 5) * 5 + 5) : 100;
    linienDiagramm('d-wertung', wertungen, {
      yMin: unten, yMax: oben, schritt: 5, flaeche: false, markierung: true,
      markeText: (p) => `Ø ${p.n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}`,
      tipp: (p) => (p.n == null ? `${datum(p.d)}<br>keine Filme mit Score` : `${datum(p.d)}<br>Ø Score <b>${p.n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}</b> aus ${p.anzahl} ${p.anzahl === 1 ? 'Film' : 'Filmen'}`),
      beschreibung: 'Liniendiagramm: durchschnittlicher Score pro Tag',
    });
    laenderLinien('d-laender', laenderTag);
    streuDiagramm('d-streu', daten);
    weltkarte('d-karte', daten);
    sankeyNeustarts('d-sankey', daten);
    hantelDiagramm('d-hantel', daten);
  }

  // Filme pro Tag nach Land: gleiche Zeitachse wie "Ø Score pro Tag" (Projektstart bis zum letzten Tag mit Terminen).
  // Jeder Film zählt pro Tag einmal, für das erstgenannte Produktionsland. Eine Linie je Land (die häufigsten plus "Andere").
  function laenderJeTag(daten) {
    const tage = new Map(), filmeJeLand = new Map();
    daten.forEach((t) => {
      if (t.d < PROJEKT_START) return;
      const land = filme[t.f].laender[0];
      if (!land) return;
      if (!tage.has(t.d)) tage.set(t.d, new Map());
      tage.get(t.d).set(t.f, land);
      if (!filmeJeLand.has(land)) filmeJeLand.set(land, new Set());
      filmeJeLand.get(land).add(t.f);
    });
    const spitze = [...filmeJeLand].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], 'de')).slice(0, LANDFARBEN.length).map(([l]) => l);
    const reihen = [...spitze, 'Andere'];
    const gesamt = reihen.map((r) => (r === 'Andere' ? [...filmeJeLand].filter(([l]) => !spitze.includes(l)).reduce((s, [, f]) => s + f.size, 0) : filmeJeLand.get(r).size));
    const liste = [];
    for (let d = PROJEKT_START; d <= LETZTER; d = plusTage(d, 1)) {
      const z = new Map(reihen.map((r) => [r, 0]));
      (tage.get(d) || new Map()).forEach((land) => { const r = spitze.includes(land) ? land : 'Andere'; z.set(r, z.get(r) + 1); });
      liste.push({ d, werte: reihen.map((r) => z.get(r)), gesamt: tage.get(d)?.size || 0 });
    }
    return { reihen, liste, gesamt, farben: [...LANDFARBEN.slice(0, spitze.length), FARBE_ANDERE] };
  }

  // Linien je Land über die Tage, mit Heute-Linie. Bei heute stehen die Werte der drei häufigsten Länder dieses Tages.
  function laenderLinien(id, { reihen, liste, farben }) {
    const rahmen = document.getElementById(id);
    const ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    if (!liste.length) { ziel.innerHTML = '<p class="leer">Keine Filme mit Länderangabe.</p>'; return; }
    const B = Math.max(ziel.clientWidth, 280), H = B < 500 ? 240 : 300;
    const r = { l: 34, o: 20, u: 26, re: 8 };
    const max = Math.max(1, ...liste.flatMap((e) => e.werte));
    const st = schritt(max), yMax = Math.ceil(max / st) * st;
    const y = (n) => r.o + (1 - n / yMax) * (H - r.o - r.u);
    const x = (i) => r.l + (i / Math.max(1, liste.length - 1)) * (B - r.l - r.re);
    let gitter = '', ticks = '';
    for (let v = 0; v <= yMax; v += st) { gitter += `<line x1="${r.l}" x2="${B - r.re}" y1="${y(v)}" y2="${y(v)}"/>`; ticks += `<text x="${r.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; }
    // Beschriftung wie bei den anderen Tagesverläufen: Monatsanfang, bei kurzem Zeitraum auch der 15.
    const kurz = liste.length < 200;
    liste.forEach((e, i) => {
      if (e.d.endsWith('-01')) ticks += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fmtMonat.format(parse(e.d))}${e.d.endsWith('-01-01') ? ` ’${e.d.slice(2, 4)}` : ''}</text>`;
      else if (kurz && B >= 500 && e.d.endsWith('-15')) ticks += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">15.</text>`;
    });
    const linien = reihen.map((land, j) => `<polyline points="${liste.map((e, i) => `${x(i).toFixed(1)},${y(e.werte[j]).toFixed(1)}`).join(' ')}" fill="none" stroke="${farben[j]}" stroke-width="${land === 'Andere' ? 1.5 : 2}" stroke-linejoin="round" opacity="${land === 'Andere' ? 0.7 : 1}"/>`).join('');
    const hi = liste.findIndex((e) => e.d === HEUTE);
    const heute = hi >= 0 ? `<g class="heute"><line x1="${x(hi)}" x2="${x(hi)}" y1="${r.o - 6}" y2="${y(0)}"/><text x="${x(hi) + 5}" y="${r.o + 4}">Heute</text></g>` : '';
    // Werte der drei häufigsten Länder heute (ohne "Andere"), untereinander mit Abstand gegen Überlappung
    let marken = '';
    if (hi >= 0) {
      const e = liste[hi];
      const top3 = reihen.map((land, j) => ({ land, j, n: e.werte[j] })).filter((t) => t.land !== 'Andere' && t.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
      const belegt = [];
      top3.sort((a, b) => y(a.n) - y(b.n)).forEach((t) => {
        let ty = y(t.n) + 4;
        belegt.forEach((b) => { if (Math.abs(ty - b) < 14) ty = b + 14; });
        belegt.push(ty);
        const name = B < 500 ? (D.laenderCodes || {})[t.land] || t.land : t.land;
        marken += `<circle cx="${x(hi).toFixed(1)}" cy="${y(t.n).toFixed(1)}" r="3.5" fill="${farben[t.j]}" stroke="var(--surface)" stroke-width="1.5"/><text class="land-wert" x="${(x(hi) - 6).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="end" fill="${farben[t.j]}">${t.n} ${esc(name)}</text>`;
      });
    }
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Liniendiagramm: Filme pro Tag nach erstgenanntem Produktionsland"><g class="gitter">${gitter}</g><line class="basis" x1="${r.l}" x2="${B - r.re}" y1="${y(0)}" y2="${y(0)}"/>${linien}<g class="achse">${ticks}</g>${heute}${marken}
      <g class="fadenkreuz" visibility="hidden"><line y1="${r.o}" y2="${y(0)}"/></g>
      <rect class="treffer" x="${r.l}" y="0" width="${B - r.l - r.re}" height="${H}" fill="transparent" style="cursor:crosshair"/></svg>`;
    const svg = ziel.querySelector('svg'), fk = svg.querySelector('.fadenkreuz'), fkL = fk.querySelector('line');
    const treffer = svg.querySelector('.treffer');
    treffer.addEventListener('pointermove', (ev) => {
      const b = svg.getBoundingClientRect(), px = (ev.clientX - b.left) * (B / b.width);
      const i = Math.max(0, Math.min(liste.length - 1, Math.round(((px - r.l) / (B - r.l - r.re)) * (liste.length - 1))));
      const m = liste[i];
      fk.setAttribute('visibility', 'visible'); fkL.setAttribute('x1', x(i)); fkL.setAttribute('x2', x(i));
      const zeilen = reihen.map((land, j) => ({ land, j, n: m.werte[j] })).filter((t) => t.n > 0).sort((a, c) => c.n - a.n)
        .map((t) => `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${farben[t.j]}"></i> ${t.land === 'Andere' ? 'Andere' : mitFlagge(t.land)}: <b>${t.n}</b>`).join('<br>');
      setzeTipp(rahmen, tip, svg, B, x(i), r.o + 10, `${datum(m.d)} · ${m.gesamt} ${m.gesamt === 1 ? 'Film' : 'Filme'}${zeilen ? `<br>${zeilen}` : ''}`);
    });
    treffer.addEventListener('pointerleave', () => { tip.hidden = true; fk.setAttribute('visibility', 'hidden'); });
    treffer.addEventListener('click', (ev) => {
      const b = svg.getBoundingClientRect(), px = (ev.clientX - b.left) * (B / b.width);
      const i = Math.max(0, Math.min(liste.length - 1, Math.round(((px - r.l) / (B - r.l - r.re)) * (liste.length - 1))));
      zustand.tag = liste[i].d; wechsleAnsicht('programm');
    });
  }

  // ---------- Streudiagramm: Score gegen Spieltage ----------
  // Ein Punkt je Film mit Score, Spieltage seit Projektstart bis heute (logarithmisch). Farbe nach Zahl der Kinos.
  // Dazu die Rangkorrelation (Spearman): 0 = kein Zusammenhang, 1 = perfekt gleichläufig.
  function spearman(a, b) {
    const rang = (w) => {
      const s = w.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = Array(w.length);
      for (let i = 0; i < s.length;) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; for (let k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2 + 1; i = j + 1; }
      return r;
    };
    const ra = rang(a), rb = rang(b), n = a.length, m = (n + 1) / 2;
    let c = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) { c += (ra[i] - m) * (rb[i] - m); va += (ra[i] - m) ** 2; vb += (rb[i] - m) ** 2; }
    return va && vb ? c / Math.sqrt(va * vb) : 0;
  }
  function scoreLaufzeit(id, daten) {
    const rahmen = document.getElementById(id);
    if (!rahmen) return;
    const ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip'), wert = rahmen.querySelector('.korrelation');
    const st = new Map();
    daten.forEach((t) => {
      if (t.d < PROJEKT_START || t.d > HEUTE) return;
      if (!st.has(t.f)) st.set(t.f, { tage: 0, kinos: new Set() });
      const e = st.get(t.f); e.tage++; e.kinos.add(t.k);
    });
    const GRUPPEN = [['1 Kino', '#7a6638'], ['2–4 Kinos', '#b08f45'], ['5 und mehr', '#e8cf8a']];
    const punkte = [];
    st.forEach((e, fid) => {
      const f = filme[fid];
      if (f.bewertung == null || istSneak(f) || istKurzfilm(f)) return;
      const g = e.kinos.size === 1 ? 0 : e.kinos.size <= 4 ? 1 : 2;
      punkte.push({ f, s: f.genau ?? f.bewertung, n: e.tage, kinos: e.kinos.size, g });
    });
    if (punkte.length < 5) { ziel.innerHTML = '<p class="leer">Noch zu wenige Filme seit Projektstart.</p>'; wert.textContent = ''; return; }
    const rho = spearman(punkte.map((p) => p.s), punkte.map((p) => p.n));
    const deutung = Math.abs(rho) < 0.1 ? 'kein Zusammenhang' : Math.abs(rho) < 0.3 ? 'schwacher Zusammenhang' : Math.abs(rho) < 0.5 ? 'mittlerer Zusammenhang' : 'starker Zusammenhang';
    wert.innerHTML = `Rangkorrelation <b>${rho.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> · ${deutung} · ${punkte.length} Filme`;
    const B = Math.max(ziel.clientWidth, 280), H = B < 500 ? 280 : 340;
    const r = { l: 34, o: 12, u: 26, re: 10 };
    const sMin = Math.floor(Math.min(...punkte.map((p) => p.s)) / 10) * 10, sMax = Math.ceil(Math.max(...punkte.map((p) => p.s)) / 10) * 10;
    const maxN = Math.max(...punkte.map((p) => p.n));
    const stufen = [];
    for (let p = 1; p <= maxN * 10; p *= 10) [1, 2, 5].forEach((m) => stufen.push(m * p));
    const yMax = stufen.find((v) => v >= maxN) || maxN;
    const x = (s) => r.l + ((s - sMin) / (sMax - sMin)) * (B - r.l - r.re);
    const y = (n) => r.o + (1 - Math.log(n) / Math.log(yMax)) * (H - r.o - r.u);
    // Leichter fester Versatz nach oben/unten, damit Filme mit gleichen Spieltagen nicht deckungsgleich liegen
    const versatz = (f) => (((f.id * 9301 + 49297) % 233280) / 233280 - 0.5) * 6;
    let gitter = '', ticks = '';
    stufen.filter((v) => v <= yMax).forEach((v) => { gitter += `<line x1="${r.l}" x2="${B - r.re}" y1="${y(v)}" y2="${y(v)}"/>`; ticks += `<text x="${r.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; });
    for (let s = sMin; s <= sMax; s += 10) ticks += `<text x="${x(s)}" y="${H - 6}" text-anchor="middle">${s}</text>`;
    punkte.forEach((p) => { p.x = x(p.s); p.y = y(p.n) + versatz(p.f); });
    const kreise = punkte.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${B < 500 ? 2.5 : 3}" fill="${GRUPPEN[p.g][1]}"/>`).join('');
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Streudiagramm: Score gegen Spieltage, ${punkte.length} Filme">
      <g class="gitter">${gitter}</g><line class="basis" x1="${r.l}" x2="${B - r.re}" y1="${y(1)}" y2="${y(1)}"/>
      <g class="streu">${kreise}</g><circle class="markiert" r="6" hidden/><g class="achse">${ticks}</g></svg>
      <div class="achsen-titel"><span>Score →</span></div>`;
    rahmen.querySelector('.legende-laender').innerHTML = GRUPPEN.map(([n, c]) => `<span><i style="background:${c};border-radius:50%"></i>${n}</span>`).join('');
    const svg = ziel.querySelector('svg'), mark = svg.querySelector('.markiert');
    const naechster = (ev) => {
      const b = svg.getBoundingClientRect(), mx = (ev.clientX - b.left) * (B / b.width), my = (ev.clientY - b.top) * (H / b.height);
      let best = null, bd = 14 * 14;
      punkte.forEach((p) => { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = p; } });
      return best;
    };
    svg.addEventListener('pointermove', (ev) => {
      const p = naechster(ev);
      if (!p) { tip.hidden = true; mark.setAttribute('hidden', ''); svg.style.cursor = ''; return; }
      mark.removeAttribute('hidden'); mark.setAttribute('cx', p.x); mark.setAttribute('cy', p.y); svg.style.cursor = 'pointer';
      setzeTipp(rahmen, tip, svg, B, p.x, p.y - 6, `<b>${esc(p.f.titel)}</b><br>Score <b>${p.f.bewertung}</b> · <b>${p.n}</b> Spieltage in ${p.kinos} ${p.kinos === 1 ? 'Kino' : 'Kinos'}`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; mark.setAttribute('hidden', ''); });
    svg.addEventListener('click', (ev) => { const p = naechster(ev); if (p) zeigeFilm(p.f.id); });
  }

  // ---------- Hantel: Spanne der Spieltage je Produktionsjahr ----------
  // Spieltage ab Projektstart bis heute (Tage je Kino mit dem Film). Je Produktionsjahr (nur Jahre mit Filmen):
  // Film mit den wenigsten und den meisten Spieltagen, dazu der Median als typischer Wert.
  function hantelDiagramm(id, daten) {
    const rahmen = document.getElementById(id);
    if (!rahmen) return;
    const ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    const tage = new Map();
    daten.forEach((t) => { if (t.d >= PROJEKT_START && t.d <= HEUTE) tage.set(t.f, (tage.get(t.f) || 0) + 1); });
    const jz = new Map();
    tage.forEach((n, fid) => {
      const f = filme[fid];
      const jahr = parseInt(f.jahr, 10);
      if (!(jahr > 1880) || istSneak(f) || istKurzfilm(f)) return;
      if (!jz.has(jahr)) jz.set(jahr, []);
      jz.get(jahr).push({ f, n });
    });
    // Jahre mit wenigen Filmen zusammenfassen: aufeinanderfolgende Jahre werden zu einem Zeitraum gebündelt,
    // bis er mindestens HANTEL_MIN_FILME Filme hat. Jahre mit genug Filmen (meist die neuen) stehen einzeln.
    const HANTEL_MIN_FILME = 5;
    const buendel = [];
    let offen = null;
    [...jz].sort((a, b) => a[0] - b[0]).forEach(([jahr, l]) => {
      if (!offen) offen = { von: jahr, bis: jahr, l: [] };
      offen.bis = jahr; offen.l.push(...l);
      if (offen.l.length >= HANTEL_MIN_FILME) { buendel.push(offen); offen = null; }
    });
    // Rest am Ende an den letzten Zeitraum hängen, statt einen zu kleinen eigenen zu bilden
    if (offen) { if (buendel.length) { const v = buendel[buendel.length - 1]; v.bis = offen.bis; v.l.push(...offen.l); } else buendel.push(offen); }
    const gruppen = buendel.map((b) => [b.von === b.bis ? String(b.von) : `${b.von}–${b.bis}`, b.l]).map(([name, l]) => {
      l.sort((a, b) => a.n - b.n || a.f.titel.localeCompare(b.f.titel, 'de'));
      const mitte = l.length % 2 ? l[(l.length - 1) / 2].n : (l[l.length / 2 - 1].n + l[l.length / 2].n) / 2;
      return { name, anzahl: l.length, min: l[0], max: l[l.length - 1], median: mitte };
    });
    if (!gruppen.length) { ziel.innerHTML = '<p class="leer">Noch keine Daten ab Projektstart.</p>'; return; }
    const B = Math.max(ziel.clientWidth, 280), H = B < 500 ? 280 : 340;
    const r = { l: 34, o: 14, u: 34, re: 8 };
    // Logarithmische y-Achse: Neue Jahrgänge reichen bis rund 100 Spieltage, ältere liegen meist unter 10.
    // Linear wären deren Spannen nicht zu sehen. Beschriftung 1, 2, 5, 10, 20, 50, 100 ...
    const maxN = Math.max(...gruppen.map((g) => g.max.n));
    const stufen = [];
    for (let p = 1; p <= maxN * 10; p *= 10) [1, 2, 5].forEach((m) => stufen.push(m * p));
    const yMax = stufen.find((v) => v >= maxN) || maxN;
    const y = (n) => r.o + (1 - Math.log(Math.max(1, n)) / Math.log(yMax)) * (H - r.o - r.u);
    const breite = (B - r.l - r.re) / gruppen.length;
    const xm = (i) => r.l + breite * (i + 0.5);
    let gitter = '', ticks = '';
    stufen.filter((v) => v <= yMax).forEach((v) => { gitter += `<line x1="${r.l}" x2="${B - r.re}" y1="${y(v)}" y2="${y(v)}"/>`; ticks += `<text x="${r.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; });
    // Viele Jahre nebeneinander: Punkte nach verfügbarer Breite, Jahreszahl nur an jedem n-ten Jahr (Abstand mind. 34 px)
    const punktR = Math.max(2.5, Math.min(5, breite * 0.35));
    const jedes = Math.max(1, Math.ceil(34 / breite));
    const hanteln = gruppen.map((g, i) => {
      const x = xm(i).toFixed(1);
      const beschriftet = i % jedes === 0;
      return `<g class="hantel" data-i="${i}">
        <rect class="treffer" x="${(xm(i) - breite / 2).toFixed(1)}" y="0" width="${breite.toFixed(1)}" height="${H - r.u + 4}" fill="transparent"/>
        <line class="spanne" x1="${x}" x2="${x}" y1="${y(g.min.n).toFixed(1)}" y2="${y(g.max.n).toFixed(1)}"/>
        <circle class="min" cx="${x}" cy="${y(g.min.n).toFixed(1)}" r="${punktR.toFixed(1)}" data-film="${g.min.f.id}"/>
        <circle class="median" cx="${x}" cy="${y(g.median).toFixed(1)}" r="${(punktR * 0.6).toFixed(1)}"/>
        <circle class="max" cx="${x}" cy="${y(g.max.n).toFixed(1)}" r="${punktR.toFixed(1)}" data-film="${g.max.f.id}"/>
        ${beschriftet ? `<text class="jahrzehnt" x="${x}" y="${H - r.u + 16}" text-anchor="middle">${B < 500 ? g.name.replace(/\b(19|20)(\d\d)\b/g, '’$2') : g.name}</text>` : ''}
      </g>`;
    }).join('');
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Hanteldiagramm: wenigste und meiste Spieltage je Film nach Produktionsjahr">
      <g class="gitter">${gitter}</g><line class="basis" x1="${r.l}" x2="${B - r.re}" y1="${y(1)}" y2="${y(1)}"/>
      <g class="achse">${ticks}</g>${hanteln}</svg>`;
    const svg = ziel.querySelector('svg');
    svg.addEventListener('pointermove', (ev) => {
      const h = ev.target.closest('.hantel');
      svg.querySelectorAll('.hantel.aktiv').forEach((e) => e.classList.remove('aktiv'));
      if (!h) { tip.hidden = true; return; }
      h.classList.add('aktiv');
      const g = gruppen[+h.dataset.i];
      const zahl = (n) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
      setzeTipp(rahmen, tip, svg, B, xm(+h.dataset.i), y(g.max.n) - 8,
        `<b>${g.name}</b> · ${g.anzahl} ${g.anzahl === 1 ? 'Film' : 'Filme'}<br>meiste: <b>${g.max.n}</b> ${esc(g.max.f.titel)}<br>Median: <b>${zahl(g.median)}</b><br>wenigste: <b>${g.min.n}</b> ${esc(g.min.f.titel)}`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; svg.querySelectorAll('.hantel.aktiv').forEach((e) => e.classList.remove('aktiv')); });
    svg.addEventListener('click', (ev) => { const c = ev.target.closest('[data-film]'); if (c) zeigeFilm(Number(c.dataset.film)); });
  }

  // ---------- Sankey: Lebenslauf der Neustarts ----------
  // Neustart: deutscher Kinostart (TMDB) zwischen Projektstart und heute. Drei Spalten:
  // Startwoche (Kinowoche des Kinostarts) -> Zahl der Kinos in dieser Woche -> Laufzeit bis heute.
  function sankeyNeustarts(id, daten) {
    const rahmen = document.getElementById(id);
    if (!rahmen) return;
    const ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    const jeFilm = new Map();
    daten.forEach((t) => { if (!jeFilm.has(t.f)) jeFilm.set(t.f, []); jeFilm.get(t.f).push(t); });
    const ersteWoche = donnerstagVon(PROJEKT_START) < PROJEKT_START ? plusTage(donnerstagVon(PROJEKT_START), 7) : donnerstagVon(PROJEKT_START);
    const KINOS = ['1 Kino', '2–4 Kinos', '5 und mehr', 'erst später bei uns'];
    const LAUF = ['1 Woche, dann abgesetzt', '2–3 Wochen, dann abgesetzt', '4 und mehr Wochen, abgesetzt', 'läuft noch'];
    const filmeListe = [];
    jeFilm.forEach((ts, fid) => {
      const f = filme[fid], ks = f.info.kinostart && String(f.info.kinostart);
      if (!ks || istSneak(f) || istKurzfilm(f)) return;
      const sw = donnerstagVon(ks);
      if (sw < ersteWoche || ks > HEUTE) return;
      const kinosStart = new Set(ts.filter((t) => donnerstagVon(t.d) === sw).map((t) => t.k)).size;
      const wochen = new Set(ts.filter((t) => t.d >= sw && t.d <= HEUTE).map((t) => donnerstagVon(t.d)));
      let n = 0;
      for (let w = sw; wochen.has(w); w = plusTage(w, 7)) n++;
      const laeuft = ts.some((t) => t.d >= HEUTE);
      filmeListe.push({
        f, start: sw,
        kinos: kinosStart === 0 ? KINOS[3] : kinosStart === 1 ? KINOS[0] : kinosStart <= 4 ? KINOS[1] : KINOS[2],
        lauf: laeuft ? LAUF[3] : n <= 1 ? LAUF[0] : n <= 3 ? LAUF[1] : LAUF[2],
      });
    });
    if (filmeListe.length < 3) { ziel.innerHTML = '<p class="leer">Noch zu wenige Neustarts seit Projektstart.</p>'; return; }
    const wochenNamen = [...new Set(filmeListe.map((e) => e.start))].sort();
    const spalten = [
      wochenNamen.map((w) => ({ id: `w${w}`, name: `Start ${w.slice(8)}.${w.slice(5, 7)}.` })),
      KINOS.map((k) => ({ id: `k${k}`, name: k })),
      LAUF.map((l) => ({ id: `l${l}`, name: l })),
    ];
    // Ströme zählen Filme
    const strom = new Map();
    const add = (a, b, e) => { const k = `${a}>${b}`; if (!strom.has(k)) strom.set(k, { a, b, filme: [] }); strom.get(k).filme.push(e.f); };
    filmeListe.forEach((e) => { add(`w${e.start}`, `k${e.kinos}`, e); add(`k${e.kinos}`, `l${e.lauf}`, e); });
    const knotenWert = new Map();
    filmeListe.forEach((e) => [`w${e.start}`, `k${e.kinos}`, `l${e.lauf}`].forEach((k) => knotenWert.set(k, (knotenWert.get(k) || 0) + 1)));
    spalten.forEach((s, i) => { spalten[i] = s.filter((kn) => knotenWert.get(kn.id)); });

    const B = Math.max(ziel.clientWidth, 280), schmal = B < 500;
    const H = schmal ? 360 : 420, LUECKE = 10, KNOTEN_B = 12;
    const randL = schmal ? 4 : 8, randR = schmal ? 4 : 8;
    const xs = [randL, (B - KNOTEN_B) / 2, B - randR - KNOTEN_B];
    const gesamt = filmeListe.length;
    const hoeheProFilm = Math.min(...spalten.map((s) => (H - LUECKE * (s.length - 1)) / gesamt));
    const pos = new Map();
    spalten.forEach((s, i) => {
      const belegt = gesamt * hoeheProFilm + LUECKE * (s.length - 1);
      let y = (H - belegt) / 2;
      s.forEach((kn) => { const h = knotenWert.get(kn.id) * hoeheProFilm; pos.set(kn.id, { x: xs[i], y, h, aus: y, ein: y, spalte: i, name: kn.name }); y += h + LUECKE; });
    });
    // Farben: je Kinozahl zum Start eine Goldstufe, Ströme tragen die Farbe ihrer Kino-Gruppe
    const FARBE = { [`k${KINOS[0]}`]: '#7a6638', [`k${KINOS[1]}`]: '#b08f45', [`k${KINOS[2]}`]: '#e8cf8a', [`k${KINOS[3]}`]: '#6f6758' };
    const reihenfolge = (id2) => spalten.flat().findIndex((kn) => kn.id === id2);
    const stroeme = [...strom.values()].sort((p, q) => reihenfolge(p.a) - reihenfolge(q.a) || reihenfolge(p.b) - reihenfolge(q.b));
    const pfade = stroeme.map((s, i) => {
      const a = pos.get(s.a), b = pos.get(s.b), h = s.filme.length * hoeheProFilm;
      const x0 = a.x + KNOTEN_B, x1 = b.x, y0 = a.aus, y1 = b.ein;
      a.aus += h; b.ein += h;
      const xm = (x0 + x1) / 2;
      const d = `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}L${x1},${y1 + h}C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h}Z`;
      const farbe = FARBE[s.a] || FARBE[s.b];
      return `<path class="strom" d="${d}" fill="${farbe}" data-i="${i}"/>`;
    }).join('');
    const knoten = [...pos.entries()].map(([kid, p]) => {
      const rechts = p.spalte === 2, mitte = p.spalte === 1;
      const tx = rechts ? p.x - 6 : p.x + KNOTEN_B + 6;
      const anker = rechts ? 'end' : 'start';
      const zahlText = knotenWert.get(kid);
      return `<g class="knoten"><rect x="${p.x}" y="${p.y.toFixed(1)}" width="${KNOTEN_B}" height="${Math.max(2, p.h).toFixed(1)}" rx="2" fill="${FARBE[kid] || 'var(--gold)'}"/>
        <text x="${tx}" y="${(p.y + p.h / 2 + 4).toFixed(1)}" text-anchor="${anker}"${mitte ? ' class="mitte"' : ''}>${esc(p.name)} <tspan class="zahl">${zahlText}</tspan></text></g>`;
    }).join('');
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Sankey-Diagramm: ${gesamt} Neustarts nach Startwoche, Kinozahl zum Start und Laufzeit"><g class="stroeme">${pfade}</g>${knoten}</svg>
      <div class="sankey-kopf"><span>Startwoche</span><span>Kinos in der Startwoche</span><span>Laufzeit bis heute</span></div>`;
    const svg = ziel.querySelector('svg');
    svg.addEventListener('pointermove', (ev) => {
      const el = ev.target.closest('.strom');
      svg.querySelectorAll('.strom.aktiv').forEach((p) => p.classList.remove('aktiv'));
      if (!el) { tip.hidden = true; svg.classList.remove('hervor'); return; }
      el.classList.add('aktiv'); svg.classList.add('hervor');
      const s = stroeme[+el.dataset.i], b = svg.getBoundingClientRect();
      const titel = s.filme.slice().sort(nachScore).slice(0, 6).map((f) => esc(f.titel)).join('<br>');
      setzeTipp(rahmen, tip, svg, B, (ev.clientX - b.left) * (B / b.width), (ev.clientY - b.top) * (B / b.width) - 6,
        `${esc(pos.get(s.a).name)} → ${esc(pos.get(s.b).name)}: <b>${s.filme.length}</b> ${s.filme.length === 1 ? 'Film' : 'Filme'}<br><span class="meta">${titel}${s.filme.length > 6 ? '<br>…' : ''}</span>`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; svg.classList.remove('hervor'); svg.querySelectorAll('.strom.aktiv').forEach((p) => p.classList.remove('aktiv')); });
  }

  // ---------- Weltkarte: Ø Score je Produktionsland ----------
  // ISO-Kürzel (aus data.js) -> ISO-Zahlencode der Kartendatei world-atlas. Sehr kleine Länder (Hongkong, Singapur,
  // Kapverden ...) haben in der vereinfachten Karte keine Fläche und stehen deshalb unter der Karte.
  const ISO_ZAHL = {
    AF: 4, AL: 8, DZ: 12, AO: 24, AR: 32, AM: 51, AU: 36, AT: 40, AZ: 31, BD: 50, BY: 112, BE: 56, BJ: 204, BT: 64, BO: 68, BA: 70, BW: 72,
    BR: 76, BG: 100, BF: 854, KH: 116, CM: 120, CA: 124, TD: 148, CL: 152, CN: 156, CO: 170, CD: 180, CG: 178, CR: 188, CI: 384, HR: 191,
    CU: 192, CY: 196, CZ: 203, DK: 208, DO: 214, EC: 218, EG: 818, SV: 222, EE: 233, ET: 231, FI: 246, FR: 250, GE: 268, DE: 276, GH: 288,
    GR: 300, GT: 320, GN: 324, HT: 332, HN: 340, HU: 348, IS: 352, IN: 356, ID: 360, IR: 364, IQ: 368, IE: 372, IL: 376, IT: 380, JM: 388,
    JP: 392, JO: 400, KZ: 398, KE: 404, KP: 408, KR: 410, KW: 414, KG: 417, LA: 418, LV: 428, LB: 422, LY: 434, LT: 440, LU: 442, MK: 807,
    MG: 450, MW: 454, MY: 458, ML: 466, MR: 478, MX: 484, MD: 498, MN: 496, ME: 499, MA: 504, MZ: 508, MM: 104, NA: 516, NP: 524, NL: 528,
    NZ: 554, NI: 558, NE: 562, NG: 566, NO: 578, OM: 512, PK: 586, PS: 275, PA: 591, PY: 600, PE: 604, PH: 608, PL: 616, PT: 620, QA: 634,
    RO: 642, RU: 643, RW: 646, SA: 682, SN: 686, RS: 688, SL: 694, SK: 703, SI: 705, SO: 706, ZA: 710, SS: 728, ES: 724, LK: 144, SD: 729,
    SE: 752, CH: 756, SY: 760, TW: 158, TJ: 762, TZ: 834, TH: 764, TN: 788, TR: 792, TM: 795, UG: 800, UA: 804, AE: 784, GB: 826, US: 840,
    UY: 858, UZ: 860, VE: 862, VN: 704, YE: 887, ZM: 894, ZW: 716, HK: 344, SG: 702, CV: 132,
  };
  let kartenDaten = null;   // Länderumrisse, einmal geladen
  async function weltkarte(id, daten) {
    const rahmen = document.getElementById(id);
    if (!rahmen) return;
    const ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip'), fuss = rahmen.querySelector('.karten-fuss');
    if (!window.d3 || !window.topojson) { ziel.innerHTML = '<p class="leer">Die Karte konnte nicht geladen werden.</p>'; return; }
    // Ø Score je Land über alle Filme der Auswahl mit Score. Koproduktionen zählen für jedes Land.
    const ids = new Set(daten.map((t) => t.f));
    const jeLand = new Map();
    ids.forEach((i) => {
      const f = filme[i];
      if (f.bewertung == null || istSneak(f) || istKurzfilm(f)) return;
      f.laender.forEach((l) => { if (!jeLand.has(l)) jeLand.set(l, []); jeLand.get(l).push(f.bewertung); });
    });
    const codes = D.laenderCodes || {};
    const werte = new Map();   // Zahlencode -> { land, schnitt, n }
    const ohneFlaeche = [];
    jeLand.forEach((w, land) => {
      const e = { land, schnitt: w.reduce((a, b) => a + b, 0) / w.length, n: w.length };
      const zahl = ISO_ZAHL[codes[land]];
      if (zahl) werte.set(String(zahl).padStart(3, '0'), e); else ohneFlaeche.push(e);
    });
    try {
      if (!kartenDaten) kartenDaten = await fetch('vendor/countries-110m.json').then((r) => r.json());
    } catch (e) { ziel.innerHTML = '<p class="leer">Die Karte konnte nicht geladen werden.</p>'; return; }
    if (!document.body.contains(rahmen)) return;   // Ansicht wurde inzwischen gewechselt
    const laender = topojson.feature(kartenDaten, kartenDaten.objects.countries).features.filter((g) => g.id !== '010');   // ohne Antarktis
    const B = Math.max(ziel.clientWidth, 280), H = Math.round(B * 0.5);
    const proj = d3.geoNaturalEarth1().fitSize([B, H], { type: 'FeatureCollection', features: laender });
    const pfad = d3.geoPath(proj);
    // Farbe: ein Goldton, je höher der Ø Score, desto kräftiger. Skala vom niedrigsten bis zum höchsten Landesschnitt.
    const alle = [...werte.values(), ...ohneFlaeche].map((e) => e.schnitt);
    const sMin = Math.floor(Math.min(...alle)), sMax = Math.ceil(Math.max(...alle));
    const farbe = (s) => {
      const t = sMax > sMin ? (s - sMin) / (sMax - sMin) : 1;
      // von gedecktem Ocker (#6b5a32) bis hellem Gold (#f0d27a), klar abgesetzt vom Grau der Länder ohne Filme
      const mix = (a, b) => Math.round(a + (b - a) * t);
      return `rgb(${mix(0x6b, 0xf0)},${mix(0x5a, 0xd2)},${mix(0x32, 0x7a)})`;
    };
    const formen = laender.map((g) => {
      const e = werte.get(String(g.id));
      return `<path d="${pfad(g)}" class="${e ? 'mit' : 'ohne'}"${e ? ` fill="${farbe(e.schnitt)}" data-land="${esc(e.land)}"` : ''}/>`;
    }).join('');
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Weltkarte: Ø Score der Filme je Produktionsland">${formen}</svg>
      <div class="karten-legende"><span>Ø ${sMin}</span><i style="background:linear-gradient(90deg, ${farbe(sMin)}, ${farbe(sMax)})"></i><span>Ø ${sMax}</span></div>`;
    const svg = ziel.querySelector('svg');
    svg.addEventListener('pointermove', (ev) => {
      const el = ev.target.closest('path[data-land]');
      if (!el) { tip.hidden = true; return; }
      const e = jeLand.get(el.dataset.land), s = e.reduce((a, b) => a + b, 0) / e.length;
      const b = svg.getBoundingClientRect();
      setzeTipp(rahmen, tip, svg, B, (ev.clientX - b.left) * (B / b.width), (ev.clientY - b.top) * (B / b.width) - 6,
        `${mitFlagge(el.dataset.land)}<br>Ø Score <b>${Math.round(s)}</b> aus ${e.length} ${e.length === 1 ? 'Film' : 'Filmen'}`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; });
    svg.addEventListener('click', (ev) => {
      const el = ev.target.closest('path[data-land]');
      if (!el) return;
      springeAusAuswertung({ land: el.dataset.land });
    });
    fuss.innerHTML = ohneFlaeche.length
      ? `Nicht auf der Karte (zu klein oder historisch): ${ohneFlaeche.sort((a, b) => a.land.localeCompare(b.land, 'de')).map((e) => `${mitFlagge(e.land)} Ø ${Math.round(e.schnitt)} (${e.n})`).join(' · ')}` : '';
  }

  // ---------- Rankings je Monat: meiste Spieltage und bester Score ----------
  // Erst ab Projektstart und nur bis zum laufenden Monat. Spieltage: Tage je Kino mit dem Film (Uhrzeiten erfassen wir nicht).
  // Nur Neustarts des Monats: deutscher Kinostart (TMDB) in diesem Monat. Ohne Kinostart: erster Termin überhaupt
  // in diesem Monat und kein alter Film (Produktionsjahr höchstens NEU_HOECHSTALTER Jahre zurück oder unbekannt).
  // art 'monat' oder 'jahr'. Spieltage bis heute, je Monat ab Projektstart, je Jahr auch davor. Der laufende Zeitraum ist aufgeklappt,
  // vergangene sind eingeklappt.
  function zeitRankings(daten, art) {
    const laenge = art === 'jahr' ? 4 : 7;
    const bis = HEUTE.slice(0, laenge);
    const fk = fakten();
    const istNeustart = (f, zeit) => {
      if (f.info.kinostart) return String(f.info.kinostart).slice(0, laenge) === zeit;
      const j = parseInt(f.jahr, 10);
      return fk.get(f.id).erster.slice(0, laenge) === zeit && (!j || Number(zeit.slice(0, 4)) - j <= NEU_HOECHSTALTER);
    };
    const m = new Map();
    daten.forEach((t) => {
      // Je Jahr zählen auch Spieltage vor dem Projektstart (Übergabedaten), je Monat erst ab Projektstart
      if ((art !== 'jahr' && t.d < PROJEKT_START) || t.d > HEUTE) return;
      const f = filme[t.f];
      if (istSneak(f) || istKurzfilm(f)) return;
      const k = t.d.slice(0, laenge);
      if (k > bis || !istNeustart(f, k)) return;
      if (!m.has(k)) m.set(k, new Map());
      const jeFilm = m.get(k);
      jeFilm.set(t.f, (jeFilm.get(t.f) || 0) + 1);
    });
    const zeiten = [...m].sort((a, b) => b[0].localeCompare(a[0]));
    if (!zeiten.length) return '<p class="leer">Noch keine Daten ab Projektstart.</p>';
    const liste = (eintraege, wert) => `<ol class="rangliste">${eintraege.map(([fid, n]) => `<li>${plakat(filme[fid], 'mini')}<div>${filmLink(filme[fid])}<div class="meta">${wert(filme[fid], n)}</div></div></li>`).join('')}</ol>`;
    return zeiten.map(([zeit, jeFilm]) => {
      const nachTagen = [...jeFilm].sort((a, b) => b[1] - a[1] || nachScore(filme[a[0]], filme[b[0]])).slice(0, 3);
      const nachScoreListe = [...jeFilm].filter(([fid]) => filme[fid].bewertung != null).sort((a, b) => nachScore(filme[a[0]], filme[b[0]])).slice(0, 3);
      const laufend = zeit === bis;
      const name = art === 'jahr' ? zeit : fmtMonatLang.format(parse(zeit + '-01'));
      return `<details class="tafel monat-ranking"${laufend ? ' open' : ''}><summary><h3>${name}${laufend ? ' <span class="meta">(bisher)</span>' : ''}</h3><span class="meta">${jeFilm.size} Neustarts</span></summary>
        <div class="raster-2 eng">
          <div><h4>Meiste Spieltage</h4>${liste(nachTagen, (f, n) => `${n} Spieltage${f.bewertung != null ? ` · Score ${f.bewertung}` : ''}`)}</div>
          <div><h4>Bester Score</h4>${liste(nachScoreListe, (f, n) => `Score ${f.bewertung} · ${n} Spieltage`)}</div>
        </div></details>`;
    }).join('');
  }

  // Streudiagramm: x = Produktionsjahr, y = Score. Ein Punkt je Film mit Score und Jahr (ohne Sneaks und Kurzfilme).
  function streuDiagramm(id, daten) {
    const rahmen = document.getElementById(id);
    const ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    const ids = new Set(daten.map((t) => t.f)), kommend = new Set(daten.filter((t) => t.d >= HEUTE).map((t) => t.f));
    const punkte = [...ids].map((i) => filme[i])
      .filter((f) => f.bewertung != null && parseInt(f.jahr, 10) > 1880 && !istSneak(f) && !istKurzfilm(f))
      .map((f) => ({ f, j: parseInt(f.jahr, 10), s: f.genau ?? f.bewertung, laeuft: kommend.has(f.id) }));
    if (!punkte.length) { ziel.innerHTML = '<p class="leer">Keine Filme mit Score und Produktionsjahr.</p>'; return; }
    const B = Math.max(ziel.clientWidth, 280), H = B < 500 ? 300 : 380;
    const r = { l: 34, o: 12, u: 26, re: 10 };
    // x-Achse auf volle Jahrzehnte, y-Achse in 10er-Schritten knapp um die Werte
    const jMin = Math.floor(Math.min(...punkte.map((p) => p.j)) / 10) * 10, jNeu = Math.max(...punkte.map((p) => p.j)) + 1;
    let jMax = Math.ceil(jNeu / 10) * 10;
    const sMin = Math.max(0, Math.floor(Math.min(...punkte.map((p) => p.s)) / 10) * 10), sMax = Math.min(100, Math.ceil(Math.max(...punkte.map((p) => p.s)) / 10) * 10);
    // Die meisten Filme sind neu. Damit sie nicht in einer schmalen Säule kleben, bekommen die 2020er
    // einen eigenen, gestreckten Abschnitt der x-Achse (45 % der Breite), sofern auch ältere Filme dabei sind.
    const W = B - r.l - r.re, BRUCH = 2020;
    const gestreckt = jMin < BRUCH - 20 && jNeu > BRUCH && punkte.filter((p) => p.j >= BRUCH).length > punkte.length * 0.3;
    if (gestreckt) jMax = jNeu;   // gestreckter Abschnitt endet mit dem jüngsten Jahr
    const x = (j) => (!gestreckt ? r.l + ((j - jMin) / (jMax - jMin)) * W
      : j < BRUCH ? r.l + ((j - jMin) / (BRUCH - jMin)) * W * 0.55
        : r.l + W * 0.55 + ((j - BRUCH) / (jMax - BRUCH)) * W * 0.45);
    const y = (s) => r.o + (1 - (s - sMin) / (sMax - sMin)) * (H - r.o - r.u);
    // Leichter, fester Versatz innerhalb des Jahres, damit Filme mit gleichem Jahr und Score nicht deckungsgleich liegen
    const versatz = (f) => ((f.id * 9301 + 49297) % 233280) / 233280 - 0.5;
    punkte.forEach((p) => { p.x = x(p.j + 0.5 + versatz(p.f) * 0.7); p.y = y(p.s); });
    let gitter = '', ticks = '';
    for (let s = sMin; s <= sMax; s += 10) { gitter += `<line x1="${r.l}" x2="${B - r.re}" y1="${y(s)}" y2="${y(s)}"/>`; ticks += `<text x="${r.l - 6}" y="${y(s) + 4}" text-anchor="end">${s}</text>`; }
    // Schmale Bildschirme: weniger Jahreszahlen, damit sie nicht aneinanderstoßen
    const jSchritt = B < 500 ? (gestreckt ? 40 : 20) : (gestreckt ? (BRUCH - jMin) / 10 > 6 : (jMax - jMin) / 10 > 10) ? 20 : 10;
    const bisJahr = gestreckt ? BRUCH - 1 : jMax;
    for (let j = jMin; j <= bisJahr; j += jSchritt) ticks += `<text x="${x(j)}" y="${H - 6}" text-anchor="middle">${j}</text>`;
    let bruch = '';
    if (gestreckt) {
      // Im gestreckten Abschnitt jedes Jahr (auf schmalen Bildschirmen jedes zweite), Beschriftung in der Jahresmitte
      for (let j = BRUCH; j < jMax; j += B < 500 ? 2 : 1) ticks += `<text x="${x(j + 0.5)}" y="${H - 6}" text-anchor="middle">${B < 500 ? `’${String(j).slice(2)}` : j}</text>`;
      bruch = `<line class="bruch" x1="${x(BRUCH)}" x2="${x(BRUCH)}" y1="${r.o}" y2="${H - r.u}"/>`;
    }
    // Ø Score je Jahrzehnt als kurze waagerechte Linie über das Jahrzehnt
    const jz = new Map();
    punkte.forEach((p) => { const d = Math.floor(p.j / 10) * 10; if (!jz.has(d)) jz.set(d, []); jz.get(d).push(p.s); });
    const schnitte = [...jz].map(([d, w]) => ({ d, n: w.length, s: w.reduce((a, b) => a + b, 0) / w.length }));
    const linien = schnitte.map((e) => `<line class="schnitt" x1="${x(e.d) + 3}" x2="${x(Math.min(e.d + 10, jMax)) - 3}" y1="${y(e.s)}" y2="${y(e.s)}"/>`).join('');
    // Vergangene zuerst, laufende darüber
    const kreise = [...punkte].sort((a, b) => a.laeuft - b.laeuft)
      .map((p) => `<circle class="${p.laeuft ? 'laeuft' : 'vorbei'}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${B < 500 ? 2.5 : 3}"/>`).join('');
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Streudiagramm: ${punkte.length} Filme nach Produktionsjahr und Score">
      <g class="gitter">${gitter}</g>${bruch}
      <line class="basis" x1="${r.l}" x2="${B - r.re}" y1="${H - r.u}" y2="${H - r.u}"/>
      <g class="streu">${kreise}</g><g class="schnitte">${linien}</g>
      <circle class="markiert" r="6" hidden/>
      <g class="achse">${ticks}</g></svg>`;
    const svg = ziel.querySelector('svg'), mark = svg.querySelector('.markiert');
    // Nächster Punkt zur Maus (Trefferfläche größer als der Punkt), sonst Ø des Jahrzehnts unter der Maus
    const naechster = (ev) => {
      const b = svg.getBoundingClientRect(), mx = (ev.clientX - b.left) * (B / b.width), my = (ev.clientY - b.top) * (H / b.height);
      let best = null, bd = 14 * 14;
      punkte.forEach((p) => { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = p; } });
      return best;
    };
    svg.addEventListener('pointermove', (ev) => {
      const p = naechster(ev);
      if (!p) { tip.hidden = true; mark.setAttribute('hidden', ''); svg.style.cursor = ''; return; }
      mark.removeAttribute('hidden'); mark.setAttribute('cx', p.x); mark.setAttribute('cy', p.y);
      svg.style.cursor = 'pointer';
      const e = schnitte.find((s) => s.d === Math.floor(p.j / 10) * 10);
      setzeTipp(rahmen, tip, svg, B, p.x, p.y - 6,
        `<b>${esc(p.f.titel)}</b><br>${esc(p.f.jahr)} · Score <b>${p.f.bewertung}</b>${p.f.regie ? `<br>${esc(p.f.regie)}` : ''}<br><span class="meta">Ø ${e.d}er: ${Math.round(e.s)} (${e.n} ${e.n === 1 ? 'Film' : 'Filme'})</span>`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; mark.setAttribute('hidden', ''); });
    svg.addEventListener('click', (ev) => { const p = naechster(ev); if (p) zeigeFilm(p.f.id); });
  }

  // Tooltip relativ zum Diagrammrahmen setzen (SVG-Elemente kennen kein offsetLeft)
  function setzeTipp(rahmen, tip, svg, B, xPunkt, yPunkt, html) {
    const sr = svg.getBoundingClientRect(), dr = rahmen.getBoundingClientRect();
    const skala = sr.width / B;
    tip.hidden = false;
    tip.innerHTML = html;
    const links = Math.max(80, Math.min(sr.width - 80, xPunkt * skala));
    tip.style.left = `${links + sr.left - dr.left}px`;
    tip.style.top = `${yPunkt * skala + sr.top - dr.top - 10}px`;
  }

  // Liniendiagramm über alle Tage. Werte null erzeugen eine Lücke in der Linie.
  function linienDiagramm(id, reihe, opt) {
    const rahmen = document.getElementById(id);
    const ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    const B = Math.max(ziel.clientWidth, 280), H = B < 500 ? 220 : 280;
    const r = { l: 38, o: 20, u: 26, re: 8 };
    const zahl = opt.zahl || ((v) => String(v));
    const x = (i) => r.l + (i / Math.max(1, reihe.length - 1)) * (B - r.l - r.re);
    const y = (n) => r.o + (1 - (n - opt.yMin) / (opt.yMax - opt.yMin)) * (H - r.o - r.u);

    let gitter = '', ticksY = '';
    for (let v = opt.yMin; v <= opt.yMax + 1e-9; v += opt.schritt) {
      gitter += `<line x1="${r.l}" x2="${B - r.re}" y1="${y(v)}" y2="${y(v)}"/>`;
      ticksY += `<text x="${r.l - 6}" y="${y(v) + 4}" text-anchor="end">${zahl(v)}</text>`;
    }
    let ticksX = '';
    const kurzerZeitraum = reihe.length < 200;   // dann auch der 15. jedes Monats beschriftet
    reihe.forEach((p, i) => {
      if (p.d.endsWith('-01') && !(B < 500 && !kurzerZeitraum && Number(p.d.slice(5, 7)) % 2 === 0)) {
        ticksX += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fmtMonat.format(parse(p.d))}${p.d.endsWith('-01-01') ? ` ’${p.d.slice(2, 4)}` : ''}</text>`;
      } else if (kurzerZeitraum && B >= 500 && p.d.endsWith('-15')) {
        ticksX += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">15.</text>`;
      }
    });
    // Höchst- und Tiefstwert, nur aus vergangenen Tagen (heute und später zählen nicht)
    let marken = '';
    if (opt.markierung) {
      const vergangen = reihe.map((p, i) => ({ ...p, i })).filter((p) => p.d < HEUTE && p.n != null && p.n > 0);
      if (vergangen.length > 1) {
        const hoch = vergangen.reduce((a, b) => (b.n > a.n ? b : a));
        const tief = vergangen.reduce((a, b) => (b.n < a.n ? b : a));
        const basisY = y(opt.yMin);
        const marke = (p, art) => {
          const px = x(p.i), py = y(p.n);
          // Beschriftung über dem Hoch und unter dem Tief, bei Platzmangel auf die andere Seite
          let ty = art === 'hoch' ? py - 10 : py + 18;
          if (ty < 12) ty = py + 18;
          if (ty > basisY - 4) ty = py - 10;
          const anker = px > B - 110 ? 'end' : px < r.l + 70 ? 'start' : 'middle';
          const tag = `${p.d.slice(8)}.${p.d.slice(5, 7)}.`;
          return `<g class="marke ${art}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4"/><text x="${px.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anker}">${art === 'hoch' ? '▲' : '▼'} ${opt.markeText(p)} · ${tag}</text></g>`;
        };
        marken = marke(hoch, 'hoch') + (tief.i !== hoch.i ? marke(tief, 'tief') : '');
      }
    }
    let pfad = '', offen = false;
    reihe.forEach((p, i) => {
      if (p.n == null) { offen = false; return; }
      pfad += `${offen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`;
      offen = true;
    });
    const flaechePfad = opt.flaeche ? `<path class="flaeche" d="${pfad}L${x(reihe.length - 1)},${y(opt.yMin)}L${x(0)},${y(opt.yMin)}Z"/>` : '';
    const hi = reihe.findIndex((p) => p.d === HEUTE);
    const heute = hi >= 0 ? `<g class="heute"><line x1="${x(hi)}" x2="${x(hi)}" y1="${r.o - 6}" y2="${y(opt.yMin)}"/><text x="${x(hi) + 5}" y="${r.o + 4}">Heute</text></g>` : '';

    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="${esc(opt.beschreibung)} von ${datum(reihe[0].d)} bis ${datum(reihe[reihe.length - 1].d)}">
      <defs><linearGradient id="goldverlauf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c9a24a" stop-opacity=".28"/><stop offset="1" stop-color="#c9a24a" stop-opacity="0"/></linearGradient></defs>
      <g class="gitter">${gitter}</g>
      ${flaechePfad}
      <path class="linie" d="${pfad}"/>
      <line class="basis" x1="${r.l}" x2="${B - r.re}" y1="${y(opt.yMin)}" y2="${y(opt.yMin)}"/>
      <g class="achse">${ticksY}${ticksX}</g>
      ${heute}
      ${marken}
      <g class="fadenkreuz" visibility="hidden"><line y1="${r.o}" y2="${y(opt.yMin)}"/><circle r="4.5"/></g>
      <rect class="treffer" x="${r.l}" y="0" width="${B - r.l - r.re}" height="${H}" fill="transparent" style="cursor:crosshair"/>
    </svg>`;

    const svg = ziel.querySelector('svg');
    const fk = svg.querySelector('.fadenkreuz'), fkL = fk.querySelector('line'), fkP = fk.querySelector('circle');
    const index = (ev) => {
      const pt = svg.getBoundingClientRect();
      const px = ((ev.clientX - pt.left) / pt.width) * B;
      return Math.max(0, Math.min(reihe.length - 1, Math.round(((px - r.l) / (B - r.l - r.re)) * (reihe.length - 1))));
    };
    const treffer = svg.querySelector('.treffer');
    treffer.addEventListener('pointermove', (ev) => {
      const i = index(ev), p = reihe[i];
      fk.setAttribute('visibility', 'visible');
      fkL.setAttribute('x1', x(i)); fkL.setAttribute('x2', x(i));
      fkP.setAttribute('visibility', p.n == null ? 'hidden' : 'visible');
      if (p.n != null) { fkP.setAttribute('cx', x(i)); fkP.setAttribute('cy', y(p.n)); }
      setzeTipp(rahmen, tip, svg, B, x(i), p.n == null ? r.o + 20 : y(p.n), opt.tipp(p));
    });
    treffer.addEventListener('pointerleave', () => { fk.setAttribute('visibility', 'hidden'); tip.hidden = true; });
    treffer.addEventListener('click', (ev) => { zustand.tag = reihe[index(ev)].d; wechsleAnsicht('programm'); });
  }

  // ---------- Ansicht Festivals ----------
  // Festivalkalender aus daten/festivals.json. Vorstellungen gehören zu einem Festival, wenn sie im Zeitraum in einem
  // der genannten Kinos laufen. titel, land und bisJahr schränken das ein (dann reicht eines davon).
  // reihe: Reihe laut Kinoseite (bisher nur Filmhaus, z. B. "Griechische Filmtage"). Ist die Reihe einer Vorstellung bekannt,
  // entscheidet allein sie. Für ältere Termine ohne Reihe gelten die übrigen Angaben.
  // genres: Genres laut TMDB, hoechstensTage: nur Filme, die im Zeitraum an höchstens so vielen Tagen im Kino laufen
  // (Festivalfilme laufen ein- oder zweimal, das reguläre Programm täglich).
  // nurTitel: nur Filme aus der Titelliste zählen. Ohne Kino und ohne Filter wird nichts zugeordnet.
  // Die Liste kommt beim Laden frisch aus daten/festivals.json, data.js dient nur als Rückfall.
  // Dazu kommen automatisch erkannte Festivals aus den Filmhaus-Reihen (D.festivalsErkannt), sofern kein
  // Eintrag von Hand dieselbe Reihe oder denselben Namen hat.
  const FESTIVAL_FARBEN = { 'Länderfokus': '#3987e5', 'Klassiker': '#c98500', 'Open Air': '#199e70', 'Thema': '#d55181', 'Genre': '#d95926', 'Kinder': '#9085e9' };
  const festivalFarbe = (fe) => FESTIVAL_FARBEN[fe.art] || 'var(--gold)';
  const normTitel = (s) => String(s || '').toLocaleLowerCase('de').replace(/[^\p{L}\p{N}]/gu, '');
  const REIHEN = D.reihen || [];
  const reiheTrifft = (soll, ist) => Boolean(ist) && String(ist).split(' | ').some((r) => normTitel(r).includes(normTitel(soll)));
  function festivalListe(liste) {
    const hand = (liste || []).map((fe) => ({ ...fe, kinos: fe.kinos || [] }));
    const auto = (D.festivalsErkannt || []).filter((a) => !hand.some((h) => (h.reihe && (reiheTrifft(h.reihe, a.reihe) || reiheTrifft(a.reihe, h.reihe)))
      || normTitel(h.name).includes(normTitel(a.name)) || normTitel(a.name).includes(normTitel(h.name))))
      .map((a) => ({ ...a, kinos: a.kinos || [], beschreibung: a.beschreibung || `Automatisch erkannt aus der Reihe „${a.ausgabe || a.reihe}“ im Programm des Kinos.` }));
    return [...hand, ...auto];
  }
  let FESTIVALS = festivalListe(D.festivals);
  let festivalIndexCache = null;
  fetch('daten/festivals.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || !Array.isArray(j.festivals)) return;
      FESTIVALS = festivalListe(j.festivals);
      festivalIndexCache = null;
      zeichne();
    })
    .catch(() => { /* Rückfall auf data.js */ });
  function festivalTermine(fe, daten) {
    if (!fe.von || !fe.bis) return [];
    const hatTitel = Boolean(fe.titel && fe.titel.length);
    const mitFilter = hatTitel || fe.land || fe.bisJahr || (fe.genres && fe.genres.length);
    if (fe.nurTitel && !hatTitel && !fe.reihe) return [];
    if (!fe.kinos.length && !mitFilter && !fe.reihe) return [];
    // Spieltage je Film und Kino im Zeitraum, über alle Termine (nicht nur die gefilterten)
    let tageJe = null;
    if (fe.hoechstensTage) {
      tageJe = new Map();
      termine.forEach((t) => { if (t.d >= fe.von && t.d <= fe.bis) { const s = `${t.f}|${t.k}`; tageJe.set(s, (tageJe.get(s) || 0) + 1); } });
    }
    return daten.filter((t) => {
      if (t.d < fe.von || t.d > fe.bis) return false;
      if (fe.kinos.length && !fe.kinos.includes(kinos[t.k].roh)) return false;
      if (fe.reihe && t.r != null) return reiheTrifft(fe.reihe, REIHEN[t.r]);
      if (!mitFilter) return !fe.reihe;
      const f = filme[t.f], j = parseInt(f.jahr, 10);
      const titelTrifft = hatTitel && fe.titel.some((x) => normTitel(f.titel).includes(normTitel(x)));
      if (fe.nurTitel) return titelTrifft;
      if (tageJe && tageJe.get(`${t.f}|${t.k}`) > fe.hoechstensTage && !titelTrifft) return false;
      return Boolean(titelTrifft
        || (fe.land && f.laender.includes(fe.land))
        || (fe.bisJahr && j && j <= fe.bisJahr)
        || (fe.genres && (f.info.genres || []).some((g) => fe.genres.includes(g))));
    });
  }
  // Welche Vorstellung gehört zu welchem Festival? Schlüssel "Film|Kino|Tag", über alle Termine
  function festivalIndex() {
    if (festivalIndexCache) return festivalIndexCache;
    festivalIndexCache = new Map();
    FESTIVALS.forEach((fe) => festivalTermine(fe, termine).forEach((t) => {
      const s = `${t.f}|${t.k}|${t.d}`;
      if (!festivalIndexCache.has(s)) festivalIndexCache.set(s, fe);
    }));
    return festivalIndexCache;
  }
  const festivalVon = (t) => festivalIndex().get(`${t.f}|${t.k}|${t.d}`) || null;
  const festivalFilmIds = () => {
    const idx = festivalIndex();
    if (!idx.ids) idx.ids = new Set([...idx.keys()].map((s) => Number(s.split('|')[0])));
    return idx.ids;
  };
  // Abzeichen mit Klick zum Festival, für Programm, Highlights und Film-Dialog
  const festivalAbzeichen = (fe) => (fe ? `<button type="button" class="abzeichen festival" data-festival-zu="${esc(fe.id)}" style="--fest-farbe:${festivalFarbe(fe)}" title="Zum Festival">${esc(fe.name)}</button>` : '');
  function festivalStatus(fe) {
    if (!fe.von || !fe.bis) return 'offen';
    if (fe.bis < HEUTE) return 'vorbei';
    return fe.von <= HEUTE ? 'laeuft' : 'kommt';
  }
  function zeitraumText(fe) {
    if (!fe.von) return 'Termin folgt';
    if (fe.zeitraumText) return fe.zeitraumText;
    return fe.von === fe.bis ? datum(fe.von) : `${datumKurz(fe.von)} bis ${datumKurz(fe.bis)}`;
  }
  function festivalAuswertung(fe, daten) {
    const ts = festivalTermine(fe, daten);
    const ids = [...new Set(ts.map((t) => t.f))].filter((id) => !istSneak(filme[id]));
    const fs = ids.map((id) => filme[id]);
    const mitScore = fs.filter((f) => f.bewertung != null);
    const schnitt = mitScore.length ? mitScore.reduce((a, f) => a + (f.genau ?? f.bewertung), 0) / mitScore.length : null;
    // Vergleich: übrige Filme, die im gleichen Zeitraum in den Kinos liefen
    const imZeitraum = new Set(daten.filter((t) => fe.von && t.d >= fe.von && t.d <= fe.bis).map((t) => t.f));
    const uebrige = [...imZeitraum].filter((id) => !ids.includes(id)).map((id) => filme[id]).filter((f) => f.bewertung != null && !istSneak(f) && !istKurzfilm(f));
    const schnittUebrig = uebrige.length ? uebrige.reduce((a, f) => a + (f.genau ?? f.bewertung), 0) / uebrige.length : null;
    const termineFestival = new Set(ts.map((t) => `${t.f}|${t.k}|${t.d}`));
    const nurHier = fs.filter((f) => termine.every((t) => t.f !== f.id || termineFestival.has(`${t.f}|${t.k}|${t.d}`)));
    const jetztSchon = fs.filter((f) => f.info.kinostart && String(f.info.kinostart) > fe.bis).sort((a, b) => String(a.info.kinostart).localeCompare(String(b.info.kinostart)));
    const laender = new Map(), genres = new Map();
    fs.forEach((f) => f.laender.forEach((l) => laender.set(l, (laender.get(l) || 0) + 1)));
    fs.forEach((f) => (f.info.genres || []).forEach((g) => genres.set(g, (genres.get(g) || 0) + 1)));
    return {
      fs, ts, schnitt, schnittUebrig, nurHier, jetztSchon,
      genres: [...genres].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')),
      tage: new Set(ts.map((t) => t.d)).size, spielorte: [...new Set(ts.map((t) => kinos[t.k].name))],
      laender: [...laender].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')),
      top: mitScore.sort(nachScore).slice(0, 3),
    };
  }
  function festivalKarte(fe, a) {
    const st = festivalStatus(fe);
    const statusText = st === 'laeuft' ? 'läuft gerade' : st === 'kommt' ? (fe.sicher === false ? 'voraussichtlich' : 'demnächst') : st === 'vorbei' ? 'vorbei' : 'Termin folgt';
    const link = fe.link ? `<a href="${esc(fe.link)}" target="_blank" rel="noopener">Zum Festival ↗</a>` : '';
    const zeile = (titel, liste, extra) => (liste.length ? `<div class="fest-liste"><h4>${titel}</h4><ul>${liste.map((f) => `<li>${plakat(f, 'mini')}<div>${filmLink(f)} ${wertung(f)}${extra ? `<div class="meta">${extra(f)}</div>` : ''}</div></li>`).join('')}</ul></div>` : '');
    let inhalt;
    if (a && a.fs.length) {
      const diff = a.schnitt != null && a.schnittUebrig != null ? Math.round(a.schnitt - a.schnittUebrig) : null;
      const vergleich = diff == null ? '' : `<span class="meta">${diff === 0 ? 'wie das übrige Programm' : `${diff > 0 ? '+' : ''}${diff} gegenüber dem übrigen Programm`}</span>`;
      inhalt = `
        <div class="kino-zahlen fest-zahlen">
          <div><b>${a.fs.length}</b><span>${a.fs.length === 1 ? 'Film' : 'Filme'}</span></div>
          <div><b>${a.tage}</b><span>${a.tage === 1 ? 'Tag' : 'Tage'} mit Vorstellungen</span></div>
          <div><b>${a.schnitt != null ? Math.round(a.schnitt) : '–'}</b><span>Ø Score ${vergleich}</span></div>
        </div>
        ${a.laender.length ? `<div class="fest-laender">${a.laender.slice(0, 8).map(([l, n]) => `<span title="${esc(l)}: ${n}">${mitFlagge(l)} <b>${n}</b></span>`).join('')}</div>` : ''}
        ${a.genres.length ? `<div class="fest-genres">${a.genres.slice(0, 6).map(([g, n]) => `<span>${esc(g)} <b>${n}</b></span>`).join('')}</div>` : ''}
        ${zeile('Highlights', a.top)}
        ${zeile('Jetzt schon sehen, Kinostart erst später', a.jetztSchon.slice(0, 4), (f) => `regulärer Kinostart ${datumKurz(String(f.info.kinostart))}`)}
        ${a.nurHier.length ? `<p class="meta fest-nurhier"><b>${a.nurHier.length}</b> ${a.nurHier.length === 1 ? 'Film läuft' : 'Filme laufen'} bei uns nur auf diesem Festival: ${a.nurHier.slice(0, 5).map((f) => filmLink(f)).join(', ')}${a.nurHier.length > 5 ? ' …' : ''}</p>` : ''}`;
    } else {
      inhalt = `<p class="meta">${st === 'offen' ? 'Sobald die Termine feststehen, erscheinen hier Programm und Highlights.' : st === 'vorbei' ? 'Keine Vorstellungen in unseren Daten.' : 'Das Programm ist noch nicht veröffentlicht. Sobald die Kinos es zeigen, erscheinen hier Filme und Highlights.'}</p>`;
    }
    return `<article class="fest-karte ${st}${fe.sicher === false ? ' unsicher' : ''}" id="festival-${esc(fe.id)}" style="--fest-farbe:${festivalFarbe(fe)}">
      <header><span class="fest-art">${esc(fe.art || 'Festival')}</span>${fe.automatisch ? '<span class="fest-auto" title="Aus den Reihen im Kinoprogramm erkannt, noch nicht von Hand geprüft">automatisch erkannt</span>' : ''}<span class="fest-status ${st}">${statusText}</span></header>
      <h3>${esc(fe.name)}</h3>
      <div class="meta">${zeitraumText(fe)}${fe.kinos.length ? ` · ${fe.kinos.map((k) => esc(k.replace('Manhatten', 'Manhattan'))).join(', ')}` : ''}</div>
      ${fe.beschreibung ? `<p class="fest-text">${esc(fe.beschreibung)}</p>` : ''}
      ${inhalt}
      ${link ? `<footer>${link}</footer>` : ''}
    </article>`;
  }
  // Zeitleiste über 15 Monate: drei Monate zurück, zwölf nach vorn. Unsichere Termine gestrichelt.
  function festivalZeitleiste(liste) {
    const start = `${plusTage(HEUTE.slice(0, 7) + '-01', -80).slice(0, 7)}-01`;
    const endeMonat = new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + 15, 1);
    const ende = iso(endeMonat);
    const gesamt = tageZwischen(start, ende);
    const pos = (d) => Math.max(0, Math.min(100, (tageZwischen(start, d) / gesamt) * 100));
    const sichtbar = liste.filter((fe) => fe.von && fe.bis >= start && fe.von < ende).sort((a, b) => a.von.localeCompare(b.von));
    const monate = [];
    for (let m = new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, 1); m < endeMonat; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) monate.push(iso(m));
    // Spuren verteilen, damit sich Balken und Beschriftungen nicht überlagern (Beschriftung grob 0,8 % je Zeichen).
    // --spur gilt mit Beschriftung, --spur-m für schmale Bildschirme, auf denen die Beschriftung fehlt.
    const belegt = [], belegtM = [];
    const freieSpur = (spuren, von, bis) => {
      let i = spuren.findIndex((ende) => ende < von);
      if (i < 0) { i = spuren.length; spuren.push(0); }
      spuren[i] = bis;
      return i;
    };
    const balken = sichtbar.map((fe) => {
      const l = pos(fe.von), b = Math.max(0.9, pos(plusTage(fe.bis, 1)) - l), rechts = l > 70;
      const w = fe.name.length * 0.8 + 1.5;
      const spur = freieSpur(belegt, rechts ? Math.min(l, l + b - w) : l, rechts ? l + b : Math.max(l + b, l + w));
      const spurM = freieSpur(belegtM, l, l + b + 0.5);
      return `<button type="button" class="zeit-balken${fe.sicher === false ? ' unsicher' : ''}${rechts ? ' rechts' : ''}" data-festival-sprung="${esc(fe.id)}" style="left:${l}%;width:${b}%;--spur:${spur};--spur-m:${spurM};--fest-farbe:${festivalFarbe(fe)}" title="${esc(fe.name)} · ${esc(zeitraumText(fe))}"><span>${esc(fe.name)}</span></button>`;
    }).join('');
    const spuren = Math.max(1, belegt.length), spurenM = Math.max(1, belegtM.length);
    return `<div class="zeitleiste">
      <div class="zeit-monate">${monate.map((m) => `<span style="left:${pos(m)}%">${fmtMonat.format(parse(m))}${m.endsWith('-01-01') ? ` ’${m.slice(2, 4)}` : ''}</span>`).join('')}</div>
      <div class="zeit-spur" style="--spuren:${spuren};--spuren-m:${spurenM}">${balken}<i class="zeit-heute" style="left:${pos(HEUTE)}%"><b>Heute</b></i></div>
    </div>`;
  }
  function zeigeFestivals(daten) {
    const auswertung = new Map(FESTIVALS.map((fe) => [fe.id, festivalAuswertung(fe, daten)]));
    const nachStatus = (s) => FESTIVALS.filter((fe) => festivalStatus(fe) === s);
    const laufend = nachStatus('laeuft'), kommend = nachStatus('kommt').sort((a, b) => a.von.localeCompare(b.von));
    const vorbei = nachStatus('vorbei').sort((a, b) => b.bis.localeCompare(a.bis)), offen = nachStatus('offen');
    // Oben: was gerade läuft, sonst das nächste Festival mit sicherem Termin
    const vorne = laufend[0] || kommend.find((fe) => fe.sicher !== false) || kommend[0];
    let hero = '';
    if (vorne) {
      const a = auswertung.get(vorne.id), st = festivalStatus(vorne);
      const rest = st === 'laeuft' ? tageZwischen(HEUTE, vorne.bis) : tageZwischen(HEUTE, vorne.von);
      const countdown = st === 'laeuft' ? (rest === 0 ? '<b>Heute</b><span>letzter Tag</span>' : `<b>${rest + 1}</b><span>${rest === 0 ? 'Tag' : 'Tage'} noch</span>`) : `<b>${rest}</b><span>${rest === 1 ? 'Tag' : 'Tage'} bis zum Start</span>`;
      hero = `<section class="fest-hero" style="--fest-farbe:${festivalFarbe(vorne)}">
        <div><span class="fest-art">${st === 'laeuft' ? 'Läuft gerade' : 'Als Nächstes'} · ${esc(vorne.art || 'Festival')}</span>
          <h2>${esc(vorne.name)}</h2><div class="meta">${zeitraumText(vorne)}${vorne.kinos.length ? ` · ${vorne.kinos.map(esc).join(', ')}` : ''}</div>
          ${vorne.beschreibung ? `<p>${esc(vorne.beschreibung)}</p>` : ''}
          ${a.top.length ? `<div class="chips">${a.top.map((f) => `<span class="chip">${filmLink(f)} ${wertung(f)}</span>`).join('')}</div>` : ''}
          <p><button type="button" class="film-link" data-festival-sprung="${esc(vorne.id)}">Zum Festival auf dieser Seite →</button></p></div>
        <div class="countdown">${countdown}</div>
      </section>`;
    }
    $('#v-festivals').innerHTML = `
      <div class="ansicht-kopf"><h2>Filmfestivals</h2></div>
      <p class="hinweis">Filmfestivals in Nürnberg, Fürth und Erlangen. Vorstellungen werden einem Festival über Zeitraum und Spielort zugeordnet. Termine aus den Seiten der Stadt, des KunstKulturQuartiers und der Festivals, ohne Gewähr.</p>
      ${hero}
      <div class="tafel abstand"><h3>Festivaljahr</h3><p class="hinweis">Ein Klick auf einen Balken springt zum Festival. Gestrichelt: Termin noch nicht sicher.</p>${festivalZeitleiste(FESTIVALS)}
        <div class="legende-laender fest-legende">${Object.entries(FESTIVAL_FARBEN).map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('')}</div></div>
      ${laufend.length || kommend.length ? `<h2 class="statistik-zwischentitel">Aktuell und demnächst</h2><div class="fest-raster">${[...laufend, ...kommend].map((fe) => festivalKarte(fe, auswertung.get(fe.id))).join('')}</div>` : ''}
      ${offen.length ? `<h2 class="statistik-zwischentitel">Termine folgen</h2><div class="fest-raster">${offen.map((fe) => festivalKarte(fe, null)).join('')}</div>` : ''}
      ${vorbei.length ? `<h2 class="statistik-zwischentitel">Rückblick</h2><div class="fest-raster">${vorbei.map((fe) => festivalKarte(fe, auswertung.get(fe.id))).join('')}</div>` : ''}`;
  }

  // ---------- Ansicht Kinos ----------
  // Profil je Kino ab Projektstart (bekannte Termine, auch kommende): Ø Score, Exklusivfilme, Alter, Länder,
  // Kinowochen, Preisträger, Wochenrhythmus. Dazu ein sortierbarer Vergleich, die Überschneidungen als Heatmap,
  // die Score-Verteilung und eine Empfehlung aus "Mein Kino".
  const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const KINO_SPALTEN = [
    { feld: 'name', titel: 'Kino', wert: (e) => e.k.name.toLocaleLowerCase('de') },
    { feld: 'score', titel: 'Ø Score', zahl: true, wert: (e) => e.score, zeige: (e) => (e.score != null ? Math.round(e.score) : '–') },
    { feld: 'filme', titel: 'Filme', zahl: true, wert: (e) => e.filme.size, zeige: (e) => e.filme.size },
    { feld: 'exklusiv', titel: 'Exklusiv', zahl: true, wert: (e) => e.exklusiv.length, zeige: (e) => e.exklusiv.length, hinweis: 'Filme, die seit Projektstart nur in diesem Kino liefen' },
    { feld: 'alter', titel: 'Ø Alter', zahl: true, wert: (e) => e.alter, zeige: (e) => (e.alter != null ? `${Math.round(e.alter)} J.` : '–'), hinweis: 'Durchschnittliches Alter der Filme beim Spieltermin' },
    { feld: 'klassiker', titel: 'Klassiker', zahl: true, wert: (e) => e.klassiker, zeige: (e) => prozent(e.klassiker), hinweis: `Anteil der Filme, die mindestens ${KLASSIKER_ALTER} Jahre alt sind` },
    { feld: 'international', titel: 'International', zahl: true, wert: (e) => e.international, zeige: (e) => prozent(e.international), hinweis: 'Anteil der Filme, deren erstgenanntes Land weder USA noch Deutschland ist' },
    { feld: 'wochen', titel: 'Ø Wochen', zahl: true, wert: (e) => e.wochen, zeige: (e) => (e.wochen != null ? e.wochen.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–'), hinweis: 'Durchschnittliche Zahl der Kinowochen je Film' },
    { feld: 'preise', titel: 'Preisträger', zahl: true, wert: (e) => e.preise, zeige: (e) => prozent(e.preise), hinweis: 'Anteil der Filme mit einem Hauptpreis' },
  ];
  const prozent = (v) => (v == null ? '–' : `${Math.round(v * 100)} %`);
  // Eindeutige Kurznamen für enge Diagramme: Anfang des ersten Worts, so lang wie nötig, damit keine zwei gleich sind
  // (Cinecitta, CineStar, Cineplex -> Cinec, CineS, Cinep; Meisengeige, Metropolis -> Mei, Met)
  function kurzNamen(namen) {
    const wort = namen.map((n) => n.replace(/^Lamm-/, 'Lamm ').split(/\s+/)[0]);
    const laenge = wort.map(() => 3);
    for (let runde = 0; runde < 8; runde++) {
      const kurz = wort.map((w, i) => w.slice(0, laenge[i]));
      let doppelt = false;
      kurz.forEach((k, i) => { if (kurz.filter((x) => x === k).length > 1 && laenge[i] < wort[i].length) { laenge[i]++; doppelt = true; } });
      if (!doppelt) return kurz;
    }
    return wort.map((w, i) => w.slice(0, laenge[i]));
  }
  function kinoKennzahlen(daten) {
    const jeKino = kinos.map((k) => ({ k, filme: new Set(), tageJeFilm: new Map(), wochenJeFilm: new Map(), ersterJeFilm: new Map(), wochentage: Array(7).fill(0), kommendFilme: new Set(), kommendTage: 0 }));
    const kinosJeFilm = new Map();
    daten.forEach((t) => {
      const e = jeKino[t.k];
      if (t.d >= HEUTE) { e.kommendTage++; e.kommendFilme.add(t.f); }
      if (t.d < PROJEKT_START) return;
      const f = filme[t.f];
      if (istSneak(f) || istKurzfilm(f)) return;
      e.filme.add(t.f);
      e.tageJeFilm.set(t.f, (e.tageJeFilm.get(t.f) || 0) + 1);
      if (!e.wochenJeFilm.has(t.f)) e.wochenJeFilm.set(t.f, new Set());
      e.wochenJeFilm.get(t.f).add(donnerstagVon(t.d));
      if (!e.ersterJeFilm.has(t.f) || t.d < e.ersterJeFilm.get(t.f)) e.ersterJeFilm.set(t.f, t.d);
      e.wochentage[wochentag(t.d)]++;
      if (!kinosJeFilm.has(t.f)) kinosJeFilm.set(t.f, new Set());
      kinosJeFilm.get(t.f).add(t.k);
    });
    const mittel = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
    return jeKino.filter((e) => e.filme.size || e.kommendTage).map((e) => {
      const fs = [...e.filme].map((id) => filme[id]);
      const mitScore = fs.filter((f) => f.bewertung != null);
      const alter = fs.map((f) => { const j = parseInt(f.jahr, 10); return j ? Number(e.ersterJeFilm.get(f.id).slice(0, 4)) - j : null; }).filter((a) => a != null);
      const mitLand = fs.filter((f) => f.laender[0]);
      const laender = new Map();
      mitLand.forEach((f) => laender.set(f.laender[0], (laender.get(f.laender[0]) || 0) + 1));
      const kommend = [...e.kommendFilme].map((id) => filme[id]).filter((f) => !istSneak(f) && !istKurzfilm(f));
      const besterJetzt = kommend.filter((f) => f.bewertung != null).sort(nachScore)[0] || null;
      // Mein Kino: gute Filme ab heute, die noch nicht als gesehen markiert sind
      const fuerDich = kommend.filter((f) => f.bewertung != null && f.bewertung >= 75 && !gesehenAm(f)).sort(nachScore);
      return {
        ...e,
        score: mittel(mitScore.map((f) => f.genau ?? f.bewertung)),
        exklusiv: fs.filter((f) => kinosJeFilm.get(f.id).size === 1).sort(nachScore),
        alter: mittel(alter),
        klassiker: alter.length ? alter.filter((a) => a >= KLASSIKER_ALTER).length / alter.length : null,
        international: mitLand.length ? mitLand.filter((f) => f.laender[0] !== 'USA' && f.laender[0] !== 'Deutschland').length / mitLand.length : null,
        topLaender: [...laender].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, 3),
        wochen: mittel([...e.wochenJeFilm.values()].map((w) => w.size)),
        preise: fs.length ? fs.filter((f) => preisGruppen(f).length).length / fs.length : null,
        besterJetzt, fuerDich,
      };
    });
  }

  function zeigeKinos(daten) {
    const liste = kinoKennzahlen(daten);
    if (!liste.length) { $('#v-kinos').innerHTML = '<div class="ansicht-kopf"><h2>Kinos und Spielorte</h2></div><p class="leer">Keine Kinos für diese Auswahl.</p>'; return; }
    // Platz nach Ø Score für die Karten
    const nachScoreRang = liste.filter((e) => e.score != null).sort((a, b) => b.score - a.score);
    nachScoreRang.forEach((e, i) => { e.rang = i + 1; });
    const sp = KINO_SPALTEN.find((s) => s.feld === zustand.kinoSort.feld) || KINO_SPALTEN[1];
    const sortiert = [...liste].sort((a, b) => {
      const x = sp.wert(a), y = sp.wert(b);
      if (x == null || y == null) return (x == null) - (y == null) || a.k.name.localeCompare(b.k.name, 'de');
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'de');
      return (zustand.kinoSort.auf ? r : -r) || a.k.name.localeCompare(b.k.name, 'de');
    });
    const kopf = KINO_SPALTEN.map((s) => {
      const aktiv = s.feld === sp.feld;
      return `<th class="${s.zahl ? 'zahl' : ''}" aria-sort="${aktiv ? (zustand.kinoSort.auf ? 'ascending' : 'descending') : 'none'}"${s.hinweis ? ` title="${esc(s.hinweis)}"` : ''}><button data-ksort="${s.feld}"${aktiv ? ` data-richtung="${zustand.kinoSort.auf ? 'auf' : 'ab'}"` : ''}>${s.titel}</button></th>`;
    }).join('');
    const tabelle = sortiert.map((e) => `<tr data-kino-sprung="${e.k.id}"><td><span class="monogramm klein">${esc(e.k.mono)}</span> ${esc(e.k.name)}</td>${KINO_SPALTEN.slice(1).map((s) => `<td class="zahl">${s.zeige(e)}</td>`).join('')}</tr>`).join('');

    const karten = [...liste].sort((a, b) => b.kommendTage - a.kommendTage || a.k.name.localeCompare(b.k.name, 'de')).map((e) => {
      const bis = horizont[e.k.id];
      const vorlauf = bis >= HEUTE ? tageZwischen(HEUTE, bis) + 1 : 0;
      const st = !vorlauf ? ['nein', 'Kein kommender Termin'] : vorlauf < 7 ? ['kurz', `Programm nur ${vorlauf} ${vorlauf === 1 ? 'Tag' : 'Tage'} im Voraus`] : ['ja', `Programm ${vorlauf} Tage im Voraus`];
      const link = e.k.link ? `<a href="${esc(e.k.link)}" target="_blank" rel="noopener">Zur Kinoseite ↗</a>` : '';
      const maxTag = Math.max(1, ...e.wochentage);
      const rhythmus = `<div class="wochenrhythmus" title="Spieltage je Wochentag seit Projektstart">${e.wochentage.map((n, i) => `<span><i style="height:${Math.max(2, Math.round((n / maxTag) * 28))}px"></i><small>${WOCHENTAGE[i]}</small></span>`).join('')}</div>`;
      const exklusiv = e.exklusiv.length ? `${e.exklusiv.length} · ${e.exklusiv.slice(0, 3).map((f) => filmLink(f)).join(', ')}` : 'keine';
      const laender = e.topLaender.map(([l, n]) => `<span title="${esc(l)}: ${n} Filme">${flagge(l) || esc(l)} ${n}</span>`).join(' ');
      const profil = [
        ['Ø Score', e.score != null ? `<b>${Math.round(e.score)}</b>${e.rang ? ` <span class="meta">Platz ${e.rang} von ${nachScoreRang.length}</span>` : ''}` : '–'],
        ['Bester Film gerade', e.besterJetzt ? `${filmLink(e.besterJetzt)} ${wertung(e.besterJetzt)}` : '–'],
        ['Exklusiv', exklusiv],
        ['Ø Alter der Filme', e.alter != null ? `${Math.round(e.alter)} Jahre · ${prozent(e.klassiker)} Klassiker` : '–'],
        ['Top-Länder', laender ? `${laender} <span class="meta">· ${prozent(e.international)} international</span>` : '–'],
        ['Ø Kinowochen je Film', e.wochen != null ? e.wochen.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–'],
        ['Preisträger', prozent(e.preise)],
        ['Für dich', e.fuerDich.length ? `${e.fuerDich.length} gute ${e.fuerDich.length === 1 ? 'Film' : 'Filme'} noch nicht gesehen, z. B. ${filmLink(e.fuerDich[0])}` : '<span class="meta">nichts Neues ab Score 75</span>'],
      ].map(([n, v]) => `<div class="profil-zeile"><span>${n}</span><span>${v}</span></div>`).join('');
      return `<article class="kinokarte" id="kino-${e.k.id}">
        <header><span class="monogramm">${esc(e.k.mono)}</span><div><h3>${esc(e.k.name)}</h3><div class="meta">${esc(e.k.stadt)}</div></div></header>
        <div class="kino-zahlen">
          <div><b>${e.kommendFilme.size}</b><span>Filme ab heute</span></div>
          <div><b>${e.kommendTage}</b><span>Spieltage ab heute</span></div>
          <div><b>${bis ? datumKurz(bis) : '–'}</b><span>bekannt bis</span></div>
        </div>
        <div class="kino-profil">${profil}</div>
        ${rhythmus}
        <footer><span class="status ${st[0]}">${st[1]}</span>${link}</footer>
      </article>`;
    }).join('');

    $('#v-kinos').innerHTML = `
      <div class="ansicht-kopf"><h2>Kinos und Spielorte</h2></div>
      <p class="hinweis">Kennzahlen seit Projektstart am ${datumKurz(PROJEKT_START)}, mit allen bekannten Terminen. Sneaks und Kurzfilmprogramme zählen nicht mit. Die Filter oben gelten auch hier.</p>
      <div class="tafel"><h3>Kinos im Vergleich</h3><p class="hinweis">Ein Klick auf eine Spaltenüberschrift sortiert, ein Klick auf eine Zeile springt zur Karte des Kinos.</p>
        <div class="tabelle-wrap"><table class="liste kino-vergleich"><thead><tr>${kopf}</tr></thead><tbody>${tabelle}</tbody></table></div></div>
      <div class="tafel diagramm abstand" id="d-ueberschneidung">
        <h3>Welche Kinos spielen dasselbe?</h3>
        <p class="hinweis">Anteil gemeinsamer Filme je Kinopaar seit Projektstart: gemeinsame Filme geteilt durch alle Filme der beiden Kinos. Je kräftiger das Gold, desto ähnlicher das Programm.</p>
        <div class="flaeche"></div><div class="tooltip" hidden></div>
      </div>
      <div class="tafel diagramm abstand" id="d-kinoscore">
        <h3>Score-Verteilung je Kino</h3>
        <p class="hinweis">Jeder Punkt ist ein Film seit Projektstart, der Strich der Median. So sieht man, ob ein Kino gleichmäßig gut spielt oder stark streut. Ein Klick auf einen Punkt öffnet den Film.</p>
        <div class="flaeche"></div><div class="tooltip" hidden></div>
      </div>
      <h2 class="statistik-zwischentitel">Die Kinos im Einzelnen</h2>
      <div class="kino-raster">${karten}</div>`;
    kinoHeatmap('d-ueberschneidung', liste);
    kinoScoreVerteilung('d-kinoscore', liste);
  }

  // Heatmap: Jaccard-Ähnlichkeit der Filmlisten je Kinopaar. Reihenfolge nach Stadt und Name.
  function kinoHeatmap(id, liste) {
    const rahmen = document.getElementById(id), ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    const ks = liste.filter((e) => e.filme.size).sort((a, b) => a.k.stadt.localeCompare(b.k.stadt, 'de') || a.k.name.localeCompare(b.k.name, 'de'));
    if (ks.length < 2) { ziel.innerHTML = '<p class="leer">Zu wenige Kinos für einen Vergleich.</p>'; return; }
    const B = Math.max(ziel.clientWidth, 280), schmal = B < 500;
    const links = schmal ? 52 : 170, oben = 52;
    const zelle = Math.min(44, (B - links - 4) / ks.length);
    const H = oben + zelle * ks.length + 4;
    const werte = ks.map((a) => ks.map((b) => {
      const gemeinsam = [...a.filme].filter((f) => b.filme.has(f));
      return { a, b, gemeinsam, j: gemeinsam.length / new Set([...a.filme, ...b.filme]).size };
    }));
    const maxJ = Math.max(0.01, ...werte.flatMap((z) => z.filter((w) => w.a !== w.b).map((w) => w.j)));
    const farbe = (j) => { const t = Math.min(1, j / maxJ); const mix = (a, b) => Math.round(a + (b - a) * t); return `rgb(${mix(0x24, 0xf0)},${mix(0x22, 0xd2)},${mix(0x1f, 0x7a)})`; };
    let zellen = '';
    werte.forEach((z, i) => z.forEach((w, j) => {
      const x = links + j * zelle, y = oben + i * zelle;
      zellen += i === j
        ? `<rect x="${x}" y="${y}" width="${zelle - 2}" height="${zelle - 2}" rx="3" class="diagonal"/>`
        : `<rect x="${x}" y="${y}" width="${zelle - 2}" height="${zelle - 2}" rx="3" fill="${farbe(w.j)}" data-i="${i}" data-j="${j}"/>${!schmal && zelle >= 30 ? `<text x="${x + zelle / 2 - 1}" y="${y + zelle / 2 + 3}" text-anchor="middle" class="${w.j / maxJ > 0.55 ? 'dunkel' : ''}">${Math.round(w.j * 100)}</text>` : ''}`;
    }));
    // Spalten (und auf dem Handy auch Zeilen) mit eindeutigen Kurznamen, senkrecht gestellt, damit sie in die Zellbreite passen
    const kurz = kurzNamen(ks.map((e) => e.k.name));
    const zeilenNamen = ks.map((e, i) => `<text x="${links - 6}" y="${oben + i * zelle + zelle / 2 + 3}" text-anchor="end">${esc(schmal ? kurz[i] : e.k.name)}</text>`).join('');
    const spaltenNamen = ks.map((e, j) => { const x = links + j * zelle + zelle / 2 + 2; return `<text x="${x}" y="${oben - 6}" text-anchor="start" transform="rotate(-60 ${x} ${oben - 6})">${esc(kurz[j])}</text>`; }).join('');
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Heatmap: Anteil gemeinsamer Filme je Kinopaar"><g class="namen">${zeilenNamen}${spaltenNamen}</g><g class="zellen">${zellen}</g></svg>`;
    const svg = ziel.querySelector('svg');
    svg.addEventListener('pointermove', (ev) => {
      const r = ev.target.closest('rect[data-i]');
      if (!r) { tip.hidden = true; return; }
      const w = werte[+r.dataset.i][+r.dataset.j];
      const beispiele = w.gemeinsam.map((id) => filme[id]).sort(nachScore).slice(0, 4).map((f) => esc(f.titel)).join(', ');
      setzeTipp(rahmen, tip, svg, B, +r.getAttribute('x') + zelle / 2, +r.getAttribute('y'),
        `${esc(w.a.k.name)} und ${esc(w.b.k.name)}<br><b>${w.gemeinsam.length}</b> gemeinsame Filme · <b>${Math.round(w.j * 100)} %</b>${beispiele ? `<br><span class="meta">${beispiele}${w.gemeinsam.length > 4 ? ' …' : ''}</span>` : ''}`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  }

  // Score-Verteilung: je Kino eine Zeile mit allen Filmen als Punkte, dazu der Median. Sortiert nach Median.
  function kinoScoreVerteilung(id, liste) {
    const rahmen = document.getElementById(id), ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    const zeilen = liste.map((e) => {
      const fs = [...e.filme].map((fid) => filme[fid]).filter((f) => f.bewertung != null);
      const w = fs.map((f) => f.genau ?? f.bewertung).sort((a, b) => a - b);
      const median = w.length ? (w.length % 2 ? w[(w.length - 1) / 2] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2) : null;
      return { e, fs, median };
    }).filter((z) => z.fs.length).sort((a, b) => b.median - a.median);
    if (!zeilen.length) { ziel.innerHTML = '<p class="leer">Keine Filme mit Score.</p>'; return; }
    const B = Math.max(ziel.clientWidth, 280), schmal = B < 500;
    const links = schmal ? 52 : 170, zeile = 26, H = zeilen.length * zeile + 30;
    const kurzV = kurzNamen(zeilen.map((z) => z.e.k.name));
    const alle = zeilen.flatMap((z) => z.fs.map((f) => f.genau ?? f.bewertung));
    const sMin = Math.floor(Math.min(...alle) / 10) * 10, sMax = Math.ceil(Math.max(...alle) / 10) * 10;
    const x = (s) => links + ((s - sMin) / (sMax - sMin)) * (B - links - 10);
    let gitter = '', ticks = '';
    for (let s = sMin; s <= sMax; s += 10) { gitter += `<line x1="${x(s)}" x2="${x(s)}" y1="4" y2="${H - 22}"/>`; ticks += `<text x="${x(s)}" y="${H - 6}" text-anchor="middle">${s}</text>`; }
    const punkte = [];
    const reihen = zeilen.map((z, i) => {
      const ym = 4 + i * zeile + zeile / 2;
      const kreise = z.fs.map((f) => {
        const versatz = ((((f.id * 9301 + 49297) % 233280) / 233280) - 0.5) * (zeile - 10);
        const p = { f, x: x(f.genau ?? f.bewertung), y: ym + versatz, kino: z.e.k.name };
        punkte.push(p);
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${schmal ? 2 : 2.5}"/>`;
      }).join('');
      return `<text class="kinoname" x="${links - 8}" y="${ym + 4}" text-anchor="end">${esc(schmal ? kurzV[i] : z.e.k.name)}</text>${kreise}<line class="median" x1="${x(z.median)}" x2="${x(z.median)}" y1="${ym - zeile / 2 + 3}" y2="${ym + zeile / 2 - 3}"/>`;
    }).join('');
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Score-Verteilung je Kino"><g class="gitter">${gitter}</g><g class="streu">${reihen}</g><circle class="markiert" r="5" hidden/><g class="achse">${ticks}</g></svg>`;
    const svg = ziel.querySelector('svg'), mark = svg.querySelector('.markiert');
    const naechster = (ev) => {
      const b = svg.getBoundingClientRect(), mx = (ev.clientX - b.left) * (B / b.width), my = (ev.clientY - b.top) * (H / b.height);
      let best = null, bd = 12 * 12;
      punkte.forEach((p) => { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = p; } });
      return best;
    };
    svg.addEventListener('pointermove', (ev) => {
      const p = naechster(ev);
      if (!p) { tip.hidden = true; mark.setAttribute('hidden', ''); svg.style.cursor = ''; return; }
      mark.removeAttribute('hidden'); mark.setAttribute('cx', p.x); mark.setAttribute('cy', p.y); svg.style.cursor = 'pointer';
      setzeTipp(rahmen, tip, svg, B, p.x, p.y - 6, `<b>${esc(p.f.titel)}</b><br>Score <b>${p.f.bewertung}</b> · ${esc(p.kino)}`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; mark.setAttribute('hidden', ''); });
    svg.addEventListener('click', (ev) => { const p = naechster(ev); if (p) zeigeFilm(p.f.id); });
  }

  // ---------- Impressum ----------
  function zeigeImpressum() {
    const p = (t) => `<span class="platzhalter">${t}</span>`;
    $('#v-impressum').innerHTML = `
      <div class="ansicht-kopf"><h2>Impressum und Hinweise</h2></div>
      <div class="textseite">
        <h3>Angaben gemäß § 5 DDG</h3>
        <p>${p('Vorname Nachname')}<br>${p('Straße Hausnummer')}<br>${p('PLZ Ort')}</p>
        <p>E-Mail: ${p('name@example.de')}</p>
        <h3>Über dieses Projekt</h3>
        <p>Ein privates, nicht kommerzielles Hobbyprojekt. Die Seite sammelt, welche Filme an welchen Tagen in Kinos in Nürnberg, Fürth und Erlangen laufen. Grundlage sind die öffentlich veröffentlichten Programme der Kinos. Uhrzeiten, Säle und Fassungen werden nicht erfasst.</p>
        <p>Ausnahme ist die Rubrik „Schnell vergriffen“: Cinecitta, Meisengeige, Metropolis und Manhattan zeigen auf ihrer Programmseite zu jeder Vorstellung eine Auslastungsstufe. Diese Stufen werden einmal täglich übernommen, für gut gebuchte Vorstellungen mit Uhrzeit. Eigene Berechnungen gibt es dazu nicht.</p>
        <h3>Ohne Gewähr</h3>
        <p>Die Daten werden mit Sorgfalt gepflegt, können aber unvollständig oder veraltet sein. Verbindlich sind allein die Programme und Ticketseiten der Kinos. Für Inhalte verlinkter Seiten sind ausschließlich deren Betreiber verantwortlich.</p>
        <h3>Filmdaten und Plakate</h3>
        <p>Plakate sowie fehlende Angaben zu Land, Regie und Jahr stammen von <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">The Movie Database (TMDB)</a>. This product uses the TMDB API but is not endorsed or certified by TMDB. Die Rechte an den Plakaten liegen bei den jeweiligen Filmverleihen und Studios. Wertungen weiterer Quellen bezieht diese Seite über <a href="https://mdblist.com/" target="_blank" rel="noopener">MDBList</a>.</p>
        <details class="score-erklaerung">
          <summary>Wie der Score entsteht</summary>
          <p>Der Score ist eine eigene Zahl von 0 bis 100. Er fasst Wertungen aus Letterboxd, Metacritic (Kritik und Publikum), IMDb, Rotten Tomatoes (Tomatometer und Popcornmeter) und TMDB zusammen. Einzelwerte werden hier nicht angezeigt.</p>
          <p><strong>1. Wenige Stimmen dämpfen.</strong> Hat ein Film bei einer Quelle nur wenige Stimmen, wird sein Wert zum Durchschnitt dieser Quelle gezogen. Ein Film mit 12 Stimmen und einem Schnitt von 9,1 gilt so nicht automatisch als besser als einer mit 200.000 Stimmen und 8,2.</p>
          <p><strong>2. Quellen vergleichbar machen.</strong> Für jede Quelle zählt, wie weit ein Film über oder unter dem Durchschnitt aller Filme dieser Quelle liegt. Das gleicht unterschiedliche Skalen aus. Der Tomatometer misst zum Beispiel nur den Anteil positiver Kritiken und liegt deshalb oft sehr hoch.</p>
          <p><strong>3. Gewichten.</strong> Letterboxd 50 %, Metacritic Kritik 15,7 %, IMDb 10,7 %, Tomatometer 9,3 %, TMDB 5,7 %, Popcornmeter 5,7 %, Metacritic Publikum 2,9 %. Fehlt eine Quelle, geht die Hälfte ihres Gewichts an die übrigen. Die andere Hälfte zählt wie ein durchschnittlicher Wert.</p>
          <p><strong>4. Zurückrechnen.</strong> Das gewichtete Ergebnis wird auf eine Skala von 0 bis 100 übertragen, deren Mitte dem gewichteten Durchschnitt der Quellen entspricht.</p>
          <p><strong>5. Begrenzen.</strong> Der Score liegt nie über der besten Einzelwertung eines Films.</p>
        </details>
        <p>Flaggen: Twemoji von Twitter, Lizenz <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC-BY 4.0</a>. Schriften Figtree und Italiana unter der SIL Open Font License.</p>
        <h3>Kinos und Marken</h3>
        <p>Die Namen der Kinos gehören den jeweiligen Betreibern. Diese Seite steht in keiner Verbindung zu den Kinos.</p>
        <h3>Datenschutz</h3>
        <p>Diese Seite setzt keine Cookies und verwendet kein Tracking. Sie wird über GitHub Pages bereitgestellt, einen Dienst der GitHub Inc. (USA). Beim Aufruf verarbeitet GitHub technisch notwendige Zugriffsdaten wie die IP-Adresse, um die Seite auszuliefern und vor Missbrauch zu schützen. Näheres steht in der <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">Datenschutzerklärung von GitHub</a>.</p>
        <p>„Mein Kino“ ist freiwillig. Wer sich dort mit einem selbst gewählten Nutzernamen anmeldet, dessen Nutzername und die als gesehen markierten Filme mit Datum werden in einer Datenbank bei Supabase gespeichert (Supabase Inc., Rechenzentrum in Frankfurt am Main). Weitere Angaben wie E-Mail-Adresse oder Passwort werden nicht erhoben. Beim Abruf verarbeitet Supabase technisch notwendige Zugriffsdaten wie die IP-Adresse. Näheres steht in der <a href="https://supabase.com/privacy" target="_blank" rel="noopener">Datenschutzerklärung von Supabase</a>. Eine Kopie der Liste liegt zusätzlich im Speicher deines Browsers (localStorage). Bitte keinen echten Namen als Nutzernamen verwenden. Wer die eigene Liste gelöscht haben möchte, entfernt die Markierungen im Profil oder wendet sich an die oben genannte Kontaktadresse.</p>
        <p>Schriftarten werden direkt von dieser Seite geladen. Es werden dabei keine Daten an Dritte wie Google übertragen. Links zu den Kinos führen auf deren eigene Seiten, für die deren Datenschutzbestimmungen gelten.</p>
        <p class="meta">Rot markierte Stellen sind Platzhalter und müssen vor der Veröffentlichung ersetzt werden.</p>
      </div>`;
  }

  // ---------- Filmdetails ----------
  // Kinowoche läuft von Donnerstag bis Mittwoch, Rückgabe ist der Donnerstag
  const kinowocheVon = (s) => plusTage(s, -((wochentag(s) + 4) % 7));

  // Zeile "Im Kino seit ..." mit der Zahl zusammenhängender Kinowochen (leer bei Überraschungsfilmen)
  function laufzeitZeile(f, tage) {
    if (/^(Sneak Preview|Kult Sneak)$/.test(f.titel) || !tage.length) return '';
    const erster = tage[0];
    const ksText = f.info && f.info.kinostart ? `Kinostart: ${esc(datumKurz(String(f.info.kinostart)))}` : '';
    // Noch nicht gelaufen (z. B. Preview oder kommender Start): Kinostart und erster Termin bei uns
    if (erster > HEUTE) {
      const teile = [ksText, `Erster Termin bei uns: ${esc(datum(erster).replace(/^\S+\s/, ''))}`].filter(Boolean);
      return `<div class="meta">${teile.join(' · ')}</div>`;
    }
    const wochen = mitLuecke(new Set(tage.map(kinowocheVon)), f);
    const jetzt = kinowocheVon(HEUTE);
    const laeuft = wochen.has(jetzt);
    // Rückwärts ab aktueller Woche, sonst ab der letzten Woche mit Termin bis heute
    let w = jetzt;
    if (!laeuft) w = [...wochen].filter((x) => x < jetzt).sort().pop();
    let n = 0;
    while (wochen.has(w)) { n++; w = plusTage(w, -7); }
    const einheit = n === 1 ? 'Woche' : 'Wochen';
    const start = ksText ? `${ksText} · ` : '';
    return `<div class="meta">${start}Im Kino seit ${esc(datum(erster).replace(/^\S+\s/, ''))} · ${laeuft ? `seit ${n} ${einheit} am Stück` : `lief ${n} ${einheit}`}</div>`;
  }

  let offenerFilm = null;   // Film im Dialog, für den Sprung zur Regie und zurück
  // Reiter mit Auswertungen, aus denen heraus Filme geöffnet werden. Wert: Name im Zurück-Knopf.
  const AUSWERTUNGEN = { statistik: 'Statistik', baukasten: 'Datenexploration' };
  // Sprung aus einer Auswertung in einen anderen Reiter (Karte, Balken): wohin zurück und welche Filter vorher galten
  let auswertungZurueck = null;
  function springeAusAuswertung(aenderung) {
    if (AUSWERTUNGEN[zustand.ansicht]) {
      auswertungZurueck = { ansicht: zustand.ansicht, y: scrollY, filter: { stadt: zustand.stadt, kino: zustand.kino, land: zustand.land, jahrzehnt: zustand.jahrzehnt, suche: zustand.suche } };
    }
    Object.assign(zustand, aenderung);
    fuelleAuswahl(); wechsleAnsicht('filme'); scrollTo(0, 0);
  }
  function zurueckZurAuswertung() {
    const z = auswertungZurueck;
    auswertungZurueck = null;
    if (!z) return;
    Object.assign(zustand, z.filter);
    fuelleAuswahl(); wechsleAnsicht(z.ansicht); scrollTo(0, z.y);
  }
  function zeigeFilm(fid) {
    offenerFilm = fid;
    const f = filme[fid];
    const nachKino = new Map();
    const alleTage = [];
    termine.filter((t) => t.f === fid).forEach((t) => { alleTage.push(t.d); if (!nachKino.has(t.k)) nachKino.set(t.k, []); nachKino.get(t.k).push(t.d); });
    alleTage.sort();
    const anzahlVorbei = alleTage.filter((d) => d < HEUTE).length;
    const hatKommend = alleTage.some((d) => d >= HEUTE);
    // Vergangene Termine sind versteckt, außer der Film hat keine kommenden
    let vorbeiSichtbar = !hatKommend;
    const sortiert = [...nachKino].sort((a, b) => kinos[a[0]].name.localeCompare(kinos[b[0]].name, 'de'));
    const gruppenHtml = () => sortiert.map(([k, ds]) => {
      ds.sort();
      const sicht = ds.filter((d) => vorbeiSichtbar || d >= HEUTE);
      if (!sicht.length) return '';
      const link = kinos[k].link;
      const chips = sicht.map((d) => {
        const klasse = d >= HEUTE ? 'kommend' : 'vorbei';
        // Kommende Spieltage führen zur Programmseite des Kinos, sofern bekannt
        return d >= HEUTE && link
          ? `<a class="chip ${klasse}" href="${esc(link)}" target="_blank" rel="noopener" title="${datum(d)}, Programm im Kino ansehen">${datumKurz(d)}</a>`
          : `<span class="chip ${klasse}" title="${datum(d)}">${datumKurz(d)}</span>`;
      }).join('');
      return `<div class="termin-gruppe"><h4>${esc(kinos[k].name)} <span class="meta">· ${sicht.length} ${sicht.length === 1 ? 'Tag' : 'Tage'}</span></h4><div class="chips">${chips}</div></div>`;
    }).join('');
    const knopfText = () => (vorbeiSichtbar ? `Vergangene Termine ausblenden (${anzahlVorbei})` : `Vergangene Termine anzeigen (${anzahlVorbei})`);
    const knopf = hatKommend && anzahlVorbei ? `<button type="button" class="vorbei-knopf" aria-expanded="${vorbeiSichtbar}">${knopfText()}</button>` : '';
    // Aus Statistik oder Datenexploration geöffnet: Knopf zurück zur Auswertung (schließt den Dialog, Stelle bleibt)
    const auswertung = AUSWERTUNGEN[zustand.ansicht];
    const zurueckAuswertung = auswertung ? `<button type="button" class="zurueck-film zurueck-auswertung" data-zurueck-auswertung>← Zurück zur ${auswertung}</button>` : '';
    // Genres laut TMDB und Festivals, auf denen der Film bei uns lief oder läuft
    const genreZeile = (f.info.genres || []).length ? `<div class="meta">${f.info.genres.map(esc).join(', ')}</div>` : '';
    const festivals = [...new Set(termine.filter((t) => t.f === fid).map(festivalVon).filter(Boolean))];
    const festZeile = festivals.length ? `<div class="fd-festivals"><span class="meta">Festival</span> ${festivals.map(festivalAbzeichen).join(' ')}</div>` : '';
    $('#fd-inhalt').innerHTML = `${zurueckAuswertung}<div class="dialog-kopf">${plakat(f, 'gross')}<div><h2 id="fd-titel">${esc(f.titel)}</h2>${pokale(f)}${wertung(f)}<div class="meta">${filmMeta(f, true)}</div>${genreZeile}${festZeile}${laufzeitZeile(f, alleTage)}${grundZeile(f)}${preisListe(f)}<div id="fd-gesehen">${gesehenKnopf(f)}</div><p class="meta">Gold markiert kommende Tage, grau vergangene.</p></div></div>${knopf}<div id="fd-termine">${gruppenHtml()}</div>`;
    const knopfEl = $('#fd-inhalt .vorbei-knopf');
    if (knopfEl) {
      knopfEl.addEventListener('click', () => {
        vorbeiSichtbar = !vorbeiSichtbar;
        knopfEl.textContent = knopfText();
        knopfEl.setAttribute('aria-expanded', String(vorbeiSichtbar));
        $('#fd-termine').innerHTML = gruppenHtml();
      });
    }
    $('#film-dialog').showModal();
  }

  // ---------- Ansicht Baukasten: eigene Streudiagramme und Sankeys ----------
  // Merkmale je Film werden per Drag-and-drop (oder Antippen) auf die Felder gelegt. Zahlen für die Achsen des
  // Streudiagramms, Gruppen für Farbe und Sankey-Spalten. Spieltage, Kinos und Kinowochen zählen ab Projektstart bis heute.
  const BK_SPEICHER = 'kinoprogramm-baukasten-v1';
  const bk = { art: 'streu', x: 'score', y: 'laufzeit', farbe: '', spalten: ['jahrzehnt', 'scoreStufe', 'status'], mass: 'filme', logX: false, logY: false, gewaehlt: '' };
  try { Object.assign(bk, JSON.parse(localStorage.getItem(BK_SPEICHER) || '{}'), { gewaehlt: '' }); } catch (e) { /* ohne Speicher */ }
  const bkSpeichern = () => { try { const { gewaehlt, ...rest } = bk; localStorage.setItem(BK_SPEICHER, JSON.stringify(rest)); } catch (e) { /* egal */ } };
  const stufe = (grenzen, namen) => (v) => (v == null ? null : namen[grenzen.findIndex((g) => v < g)] ?? namen[namen.length - 1]);
  const BK_MERKMALE = [
    { id: 'score', name: 'Score', typ: 'zahl', wert: (e) => e.f.genau },
    { id: 'jahr', name: 'Produktionsjahr', typ: 'zahl', wert: (e) => parseInt(e.f.jahr, 10) || null },
    { id: 'laufzeit', name: 'Filmlänge (Min.)', typ: 'zahl', wert: (e) => e.f.info.laufzeit || null },
    { id: 'spieltage', name: 'Spieltage', typ: 'zahl', wert: (e) => e.tage || null },
    { id: 'kinos', name: 'Zahl der Kinos', typ: 'zahl', wert: (e) => e.kinos.size || null },
    { id: 'wochen', name: 'Kinowochen', typ: 'zahl', wert: (e) => e.wochen.size || null },
    { id: 'alter', name: 'Alter des Films (Jahre)', typ: 'zahl', wert: (e) => { const j = parseInt(e.f.jahr, 10); return j ? Number(e.erster.slice(0, 4)) - j : null; } },
    { id: 'jahrzehnt', name: 'Jahrzehnt', typ: 'gruppe', wert: (e) => e.f.jahrzehnt, ordnung: 'name' },
    { id: 'land', name: 'Land (erstgenannt)', typ: 'gruppe', wert: (e) => e.f.laender[0] || null },
    { id: 'genre', name: 'Genre (erstgenannt)', typ: 'gruppe', wert: (e) => (e.f.info.genres || [])[0] || null },
    { id: 'festival', name: 'Festivalfilm', typ: 'gruppe', wert: (e) => (festivalFilmIds().has(e.f.id) ? 'auf einem Festival' : 'nur regulär'), reihe: ['auf einem Festival', 'nur regulär'] },
    { id: 'hauptkino', name: 'Hauptkino', typ: 'gruppe', wert: (e) => e.hauptkino },
    { id: 'stadt', name: 'Stadt', typ: 'gruppe', wert: (e) => e.stadt },
    { id: 'status', name: 'Läuft noch?', typ: 'gruppe', wert: (e) => (e.laeuft ? 'läuft noch' : 'vorbei'), reihe: ['läuft noch', 'vorbei'] },
    { id: 'scoreStufe', name: 'Score-Stufe', typ: 'gruppe', wert: (e) => stufe([60, 70, 80, 90], ['unter 60', '60–69', '70–79', '80–89', '90+'])(e.f.bewertung), reihe: ['90+', '80–89', '70–79', '60–69', 'unter 60'] },
    { id: 'laengeStufe', name: 'Filmlänge-Stufe', typ: 'gruppe', wert: (e) => stufe([90, 110, 130, 150], ['unter 90 Min.', '90–109 Min.', '110–129 Min.', '130–149 Min.', '150+ Min.'])(e.f.info.laufzeit || null), reihe: ['unter 90 Min.', '90–109 Min.', '110–129 Min.', '130–149 Min.', '150+ Min.'] },
    { id: 'spieltageStufe', name: 'Spieltage-Stufe', typ: 'gruppe', wert: (e) => stufe([2, 6, 21, 51], ['1', '2–5', '6–20', '21–50', '51+'])(e.tage || null), reihe: ['51+', '21–50', '6–20', '2–5', '1'] },
    { id: 'kinosStufe', name: 'Kinos-Stufe', typ: 'gruppe', wert: (e) => (e.kinos.size ? stufe([2, 5], ['1 Kino', '2–4 Kinos', '5 und mehr'])(e.kinos.size) : null), reihe: ['5 und mehr', '2–4 Kinos', '1 Kino'] },
    { id: 'preis', name: 'Hauptpreis', typ: 'gruppe', wert: (e) => (preisGruppen(e.f).length ? 'mit Hauptpreis' : 'ohne'), reihe: ['mit Hauptpreis', 'ohne'] },
    { id: 'gesehen', name: 'Mein Kino', typ: 'gruppe', wert: (e) => (gesehenAm(e.f) ? 'gesehen' : 'nicht gesehen'), reihe: ['gesehen', 'nicht gesehen'] },
  ];
  const bkMerkmal = (id) => BK_MERKMALE.find((m) => m.id === id);
  // Kennzahlen je Film aus den gefilterten Terminen
  function bkFilme(daten) {
    const m = new Map();
    daten.forEach((t) => {
      const f = filme[t.f];
      if (istSneak(f) || istKurzfilm(f)) return;
      if (!m.has(t.f)) m.set(t.f, { f, tage: 0, kinos: new Set(), wochen: new Set(), jeKino: new Map(), laeuft: false, erster: t.d });
      const e = m.get(t.f);
      if (t.d < e.erster) e.erster = t.d;
      if (t.d >= HEUTE) e.laeuft = true;
      if (t.d >= PROJEKT_START && t.d <= HEUTE) {
        e.tage++; e.kinos.add(t.k); e.wochen.add(donnerstagVon(t.d)); e.jeKino.set(t.k, (e.jeKino.get(t.k) || 0) + 1);
      }
    });
    return [...m.values()].map((e) => {
      const haupt = [...e.jeKino].sort((a, b) => b[1] - a[1])[0];
      e.hauptkino = haupt ? kinos[haupt[0]].name : null;
      e.stadt = haupt ? kinos[haupt[0]].stadt : null;
      return e;
    });
  }
  // Gruppenwerte auf höchstens 7 häufige plus "Andere" begrenzen, feste Reihenfolge je Merkmal
  function bkGruppen(merkmal, eintraege) {
    const z = new Map();
    eintraege.forEach((e) => { const v = merkmal.wert(e); if (v != null) z.set(v, (z.get(v) || 0) + 1); });
    let namen = merkmal.reihe ? merkmal.reihe.filter((n) => z.has(n))
      : merkmal.ordnung === 'name' ? [...z.keys()].sort() : [...z].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    let andere = false;
    if (namen.length > 7) { const behalten = new Set([...z].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([n]) => n)); namen = namen.filter((n) => behalten.has(n)); andere = true; }
    const ziel = (v) => (v == null ? null : namen.includes(v) ? v : andere ? 'Andere' : null);
    return { namen: andere ? [...namen, 'Andere'] : namen, ziel };
  }
  function korrelation(a, b) {
    const n = a.length;
    if (n < 3) return null;
    const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let c = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
    return va && vb ? c / Math.sqrt(va * vb) : 0;
  }
  const deutung = (r) => (r == null ? '' : Math.abs(r) < 0.1 ? 'kein Zusammenhang' : `${Math.abs(r) < 0.3 ? 'schwacher' : Math.abs(r) < 0.5 ? 'mittlerer' : 'starker'} ${r > 0 ? 'gleichläufiger' : 'gegenläufiger'} Zusammenhang`);
  const kommaZahl = (r) => r.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function zeigeBaukasten(daten) {
    const eintraege = bkFilme(daten);
    const chip = (m) => `<button type="button" class="bk-chip ${m.typ}" draggable="true" data-merkmal="${m.id}" aria-pressed="${bk.gewaehlt === m.id}">${esc(m.name)}</button>`;
    const feld = (ziel, titel, typ, wert, zusatz = '') => {
      const m = wert && bkMerkmal(wert);
      return `<div class="bk-feld" data-ziel="${ziel}" data-typ="${typ}"><span class="bk-feld-titel">${titel}</span>${m ? `<span class="bk-belegt ${m.typ}">${esc(m.name)}<button type="button" data-leeren="${ziel}" aria-label="${titel} leeren">×</button></span>` : `<span class="bk-leer">${typ === 'zahl' ? 'Zahl hierher ziehen' : 'Gruppe hierher ziehen'}</span>`}${zusatz}</div>`;
    };
    const streu = bk.art === 'streu';
    const felder = streu
      ? feld('x', 'x-Achse', 'zahl', bk.x, `<label class="bk-log"><input type="checkbox" data-log="logX" ${bk.logX ? 'checked' : ''}> log</label>`)
        + feld('y', 'y-Achse', 'zahl', bk.y, `<label class="bk-log"><input type="checkbox" data-log="logY" ${bk.logY ? 'checked' : ''}> log</label>`)
        + feld('farbe', 'Farbe (optional)', 'gruppe', bk.farbe)
      : [0, 1, 2, 3].map((i) => feld(`s${i}`, `Spalte ${i + 1}${i > 1 ? ' (optional)' : ''}`, 'gruppe', bk.spalten[i])).join('')
        + `<div class="umschalter bk-mass" role="group" aria-label="Ströme zählen"><button data-mass="filme" aria-pressed="${bk.mass === 'filme'}">Filme zählen</button><button data-mass="spieltage" aria-pressed="${bk.mass === 'spieltage'}">Spieltage zählen</button></div>`;
    $('#v-baukasten').innerHTML = `
      <div class="ansicht-kopf"><h2>Datenexploration</h2>
        <div class="umschalter" role="group" aria-label="Diagrammart"><button data-bk-art="streu" aria-pressed="${streu}">Streudiagramm</button><button data-bk-art="sankey" aria-pressed="${!streu}">Sankey</button></div></div>
      <p class="hinweis">Ziehe Merkmale auf die Felder (oder tippe erst ein Merkmal und dann ein Feld an). Goldene Merkmale sind Zahlen, graue sind Gruppen. Spieltage, Kinos und Kinowochen zählen ab Projektstart am ${datumKurz(PROJEKT_START)}. Die Filter oben gelten auch hier.</p>
      <div class="bk-werkbank">
        <div class="bk-merkmale"><div><span class="bk-feld-titel">Zahlen</span>${BK_MERKMALE.filter((m) => m.typ === 'zahl').map(chip).join('')}</div>
          <div><span class="bk-feld-titel">Gruppen</span>${BK_MERKMALE.filter((m) => m.typ === 'gruppe').map(chip).join('')}</div></div>
        <div class="bk-felder">${felder}</div>
      </div>
      <p class="bk-meldung" role="status"></p>
      <div class="tafel diagramm" id="d-baukasten"><p class="korrelation"></p><div class="legende-laender"></div><div class="flaeche"></div><div class="tooltip" hidden></div></div>
      <h2 class="statistik-zwischentitel">Analysen</h2>
      <div class="tafel diagramm" id="d-scorelauf">
        <h3>Läuft ein guter Film länger?</h3>
        <p class="hinweis">Jeder Punkt ist ein Film mit Score: rechts der bessere Score, oben mehr Spieltage seit Projektstart am ${datumKurz(PROJEKT_START)}. Die Farbe zeigt, in wie vielen Kinos der Film lief. Die y-Achse ist logarithmisch. Ein Klick auf einen Punkt öffnet den Film.</p>
        <p class="korrelation"></p>
        <div class="legende-laender"></div>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>`;
    if (streu) bkStreu(eintraege); else bkSankey(eintraege);
    scoreLaufzeit('d-scorelauf', daten);
  }

  function bkStreu(eintraege) {
    const rahmen = $('#d-baukasten'), ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    const mx = bkMerkmal(bk.x), my = bkMerkmal(bk.y), mf = bk.farbe && bkMerkmal(bk.farbe);
    if (!mx || !my) { ziel.innerHTML = '<p class="leer">Lege eine Zahl auf die x-Achse und eine auf die y-Achse.</p>'; return; }
    const gruppen = mf ? bkGruppen(mf, eintraege) : null;
    const farbeVon = (name) => (name === 'Andere' ? FARBE_ANDERE : LANDFARBEN[gruppen.namen.indexOf(name)] || FARBE_ANDERE);
    const punkte = eintraege.map((e) => ({ e, x: mx.wert(e), y: my.wert(e), g: gruppen ? gruppen.ziel(mf.wert(e)) : null }))
      .filter((p) => p.x != null && p.y != null && Number.isFinite(p.x) && Number.isFinite(p.y) && (!bk.logX || p.x > 0) && (!bk.logY || p.y > 0) && (!gruppen || p.g != null));
    // Korrelation: Rangkorrelation (robust, Grundlage der Deutung) und linear
    const kopf = rahmen.querySelector('.korrelation');
    if (punkte.length < 3) { ziel.innerHTML = '<p class="leer">Zu wenige Filme mit beiden Werten.</p>'; kopf.textContent = ''; return; }
    const rang = (w) => { const s = w.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = Array(w.length); for (let i = 0; i < s.length;) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; for (let k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
    const rho = korrelation(rang(punkte.map((p) => p.x)), rang(punkte.map((p) => p.y)));
    const lin = korrelation(punkte.map((p) => p.x), punkte.map((p) => p.y));
    kopf.innerHTML = `Rangkorrelation <b>${kommaZahl(rho)}</b> · ${deutung(rho)} · linear ${kommaZahl(lin)} · ${punkte.length} Filme`;
    rahmen.querySelector('.legende-laender').innerHTML = gruppen ? gruppen.namen.map((n) => `<span><i style="background:${farbeVon(n)};border-radius:50%"></i>${esc(n)}</span>`).join('') : '';
    const B = Math.max(ziel.clientWidth, 280), H = B < 500 ? 300 : 380, r = { l: 40, o: 12, u: 40, re: 12 };
    const achse = (werte, log, lo, hi) => {
      let min = Math.min(...werte), max = Math.max(...werte);
      if (log) {
        const stufen = []; for (let p = 10 ** Math.floor(Math.log10(min)); p <= max * 10; p *= 10) [1, 2, 5].forEach((m) => stufen.push(m * p));
        const a = [...stufen].reverse().find((v) => v <= min) || min, b = stufen.find((v) => v >= max) || max;
        return { pos: (v) => lo + ((Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a) || 1)) * (hi - lo), ticks: stufen.filter((v) => v >= a && v <= b) };
      }
      if (min === max) { min -= 1; max += 1; }
      const st = schritt(max - min), a = Math.floor(min / st) * st, b = Math.ceil(max / st) * st;
      const ticks = []; for (let v = a; v <= b + 1e-9; v += st) ticks.push(+v.toFixed(6));
      return { pos: (v) => lo + ((v - a) / (b - a)) * (hi - lo), ticks };
    };
    const ax = achse(punkte.map((p) => p.x), bk.logX, r.l, B - r.re), ay = achse(punkte.map((p) => p.y), bk.logY, H - r.u, r.o);
    let gitter = '', ticks = '';
    ay.ticks.forEach((v) => { gitter += `<line x1="${r.l}" x2="${B - r.re}" y1="${ay.pos(v)}" y2="${ay.pos(v)}"/>`; ticks += `<text x="${r.l - 6}" y="${ay.pos(v) + 4}" text-anchor="end">${v.toLocaleString('de-DE')}</text>`; });
    const xt = ax.ticks.length > (B < 500 ? 6 : 12) ? ax.ticks.filter((_, i) => i % 2 === 0) : ax.ticks;
    xt.forEach((v) => { ticks += `<text x="${ax.pos(v)}" y="${H - r.u + 16}" text-anchor="middle">${v.toLocaleString('de-DE', { useGrouping: false })}</text>`; });
    ticks += `<text class="achsen-name" x="${B - r.re}" y="${H - 4}" text-anchor="end">${esc(mx.name)} →</text><text class="achsen-name" x="${r.l}" y="${r.o - 2}" text-anchor="start">↑ ${esc(my.name)}</text>`;
    const versatz = (f) => (((f.id * 9301 + 49297) % 233280) / 233280 - 0.5) * 4;
    punkte.forEach((p) => { p.px = ax.pos(p.x) + versatz(p.e.f); p.py = ay.pos(p.y) + versatz({ id: p.e.f.id + 7 }); });
    const kreise = punkte.map((p) => `<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="${B < 500 ? 2.5 : 3}" fill="${gruppen ? farbeVon(p.g) : 'var(--gold)'}"/>`).join('');
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Streudiagramm: ${esc(my.name)} gegen ${esc(mx.name)}"><g class="gitter">${gitter}</g><g class="streu">${kreise}</g><circle class="markiert" r="6" hidden/><g class="achse">${ticks}</g></svg>`;
    const svg = ziel.querySelector('svg'), mark = svg.querySelector('.markiert');
    const fmt = (m, v) => (Number.isInteger(v) ? String(v) : v.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
    const naechster = (ev) => {
      const b = svg.getBoundingClientRect(), mxp = (ev.clientX - b.left) * (B / b.width), myp = (ev.clientY - b.top) * (H / b.height);
      let best = null, bd = 14 * 14;
      punkte.forEach((p) => { const d = (p.px - mxp) ** 2 + (p.py - myp) ** 2; if (d < bd) { bd = d; best = p; } });
      return best;
    };
    svg.addEventListener('pointermove', (ev) => {
      const p = naechster(ev);
      if (!p) { tip.hidden = true; mark.setAttribute('hidden', ''); svg.style.cursor = ''; return; }
      mark.removeAttribute('hidden'); mark.setAttribute('cx', p.px); mark.setAttribute('cy', p.py); svg.style.cursor = 'pointer';
      setzeTipp(rahmen, tip, svg, B, p.px, p.py - 6, `<b>${esc(p.e.f.titel)}</b><br>${esc(mx.name)}: <b>${fmt(mx, p.x)}</b><br>${esc(my.name)}: <b>${fmt(my, p.y)}</b>${p.g ? `<br>${esc(mf.name)}: ${esc(p.g)}` : ''}`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; mark.setAttribute('hidden', ''); });
    svg.addEventListener('click', (ev) => { const p = naechster(ev); if (p) zeigeFilm(p.e.f.id); });
  }

  function bkSankey(eintraege) {
    const rahmen = $('#d-baukasten'), ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    rahmen.querySelector('.korrelation').textContent = '';
    rahmen.querySelector('.legende-laender').innerHTML = '';
    const merkmale = bk.spalten.filter(Boolean).map(bkMerkmal).filter(Boolean);
    if (merkmale.length < 2) { ziel.innerHTML = '<p class="leer">Lege mindestens zwei Gruppen auf die Spalten.</p>'; return; }
    const gruppen = merkmale.map((m) => bkGruppen(m, eintraege));
    const zeilen = eintraege.map((e) => ({ e, werte: merkmale.map((m, i) => gruppen[i].ziel(m.wert(e))), gewicht: bk.mass === 'spieltage' ? e.tage : 1 }))
      .filter((z) => z.werte.every((v) => v != null) && z.gewicht > 0);
    if (zeilen.length < 2) { ziel.innerHTML = '<p class="leer">Zu wenige Filme mit allen gewählten Merkmalen.</p>'; return; }
    const spalten = gruppen.map((g, i) => g.namen.map((n) => ({ id: `${i}|${n}`, name: n })));
    const strom = new Map(), wert = new Map();
    zeilen.forEach((z) => {
      z.werte.forEach((v, i) => { const k = `${i}|${v}`; wert.set(k, (wert.get(k) || 0) + z.gewicht); });
      for (let i = 0; i + 1 < z.werte.length; i++) {
        // Ströme je Herkunft (Wert der ersten Spalte) getrennt, damit deren Farbe bis zur letzten Spalte durchläuft
        const k = `${i}|${z.werte[i]}>${i + 1}|${z.werte[i + 1]}#${z.werte[0]}`;
        if (!strom.has(k)) strom.set(k, { a: `${i}|${z.werte[i]}`, b: `${i + 1}|${z.werte[i + 1]}`, herkunft: `0|${z.werte[0]}`, w: 0, filme: [] });
        const s = strom.get(k); s.w += z.gewicht; s.filme.push(z.e.f);
      }
    });
    spalten.forEach((s, i) => { spalten[i] = s.filter((kn) => wert.get(kn.id)); });
    const B = Math.max(ziel.clientWidth, 280), H = B < 500 ? 380 : 460, LUECKE = 10, KB = 12;
    const n = spalten.length, xs = spalten.map((_, i) => 4 + (i / (n - 1)) * (B - 8 - KB));
    const summe = zeilen.reduce((a, z) => a + z.gewicht, 0);
    const proEinheit = Math.min(...spalten.map((s) => (H - LUECKE * (s.length - 1)) / summe));
    const pos = new Map();
    spalten.forEach((s, i) => {
      let y = (H - (summe * proEinheit + LUECKE * (s.length - 1))) / 2;
      s.forEach((kn) => { const h = wert.get(kn.id) * proEinheit; pos.set(kn.id, { x: xs[i], y, h, aus: y, ein: y, i, name: kn.name }); y += h + LUECKE; });
    });
    // Farbe der Ströme nach der ersten Spalte, feste Reihenfolge der Palette
    const farbeVon = (id) => { const [i, name] = [Number(id.split('|')[0]), id.slice(id.indexOf('|') + 1)]; if (i !== 0) return 'var(--gold)'; return name === 'Andere' ? FARBE_ANDERE : LANDFARBEN[spalten[0].findIndex((k) => k.name === name)] || FARBE_ANDERE; };
    const reihenfolge = new Map(spalten.flat().map((kn, i) => [kn.id, i]));
    const stroeme = [...strom.values()].sort((p, q) => reihenfolge.get(p.a) - reihenfolge.get(q.a) || reihenfolge.get(p.b) - reihenfolge.get(q.b) || reihenfolge.get(p.herkunft) - reihenfolge.get(q.herkunft));
    // Jeder Strom trägt die Farbe seiner Herkunft in der ersten Spalte
    const pfade = stroeme.map((s, k) => {
      const a = pos.get(s.a), b = pos.get(s.b), h = s.w * proEinheit;
      const x0 = a.x + KB, x1 = b.x, y0 = a.aus, y1 = b.ein, xm = (x0 + x1) / 2;
      a.aus += h; b.ein += h;
      return `<path class="strom" d="M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}L${x1},${y1 + h}C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h}Z" fill="${farbeVon(s.herkunft)}" data-i="${k}"/>`;
    }).join('');
    const knoten = [...pos.entries()].map(([kid, p]) => {
      const rechts = p.i === n - 1;
      return `<g class="knoten"><rect x="${p.x}" y="${p.y.toFixed(1)}" width="${KB}" height="${Math.max(2, p.h).toFixed(1)}" rx="2" fill="${farbeVon(kid)}"/><text x="${rechts ? p.x - 6 : p.x + KB + 6}" y="${(p.y + p.h / 2 + 4).toFixed(1)}" text-anchor="${rechts ? 'end' : 'start'}">${esc(p.name)} <tspan class="zahl">${wert.get(kid)}</tspan></text></g>`;
    }).join('');
    const einheit = bk.mass === 'spieltage' ? 'Spieltage' : 'Filme';
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Sankey: ${merkmale.map((m) => esc(m.name)).join(' → ')}"><g class="stroeme">${pfade}</g>${knoten}</svg>
      <div class="sankey-kopf" style="grid-template-columns:repeat(${n},1fr)">${merkmale.map((m, i) => `<span style="text-align:${i === 0 ? 'left' : i === n - 1 ? 'right' : 'center'}">${esc(m.name)}</span>`).join('')}</div>
      <p class="hinweis">${bk.mass === 'spieltage' ? `${summe} Spieltage · ` : ''}${zeilen.length} Filme. Mehr als sieben Gruppen werden zu „Andere“ zusammengefasst.</p>`;
    const svg = ziel.querySelector('svg');
    svg.addEventListener('pointermove', (ev) => {
      const el = ev.target.closest('.strom');
      svg.querySelectorAll('.strom.aktiv').forEach((p) => p.classList.remove('aktiv'));
      if (!el) { tip.hidden = true; svg.classList.remove('hervor'); return; }
      el.classList.add('aktiv'); svg.classList.add('hervor');
      const s = stroeme[+el.dataset.i], b = svg.getBoundingClientRect();
      const titel = [...new Set(s.filme)].sort(nachScore).slice(0, 6).map((f) => esc(f.titel)).join('<br>');
      setzeTipp(rahmen, tip, svg, B, (ev.clientX - b.left) * (B / b.width), (ev.clientY - b.top) * (B / b.width) - 6,
        `${s.a !== s.herkunft ? `${esc(pos.get(s.herkunft).name)}: ` : ''}${esc(pos.get(s.a).name)} → ${esc(pos.get(s.b).name)}: <b>${s.w}</b> ${einheit}<br><span class="meta">${titel}${s.filme.length > 6 ? '<br>…' : ''}</span>`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; svg.classList.remove('hervor'); svg.querySelectorAll('.strom.aktiv').forEach((p) => p.classList.remove('aktiv')); });
  }

  // Merkmal auf ein Feld legen (per Ziehen oder Antippen). Zahlen nur auf Achsen, Gruppen nur auf Farbe und Spalten.
  function bkLegen(merkmalId, zielId) {
    const m = bkMerkmal(merkmalId), meldung = $('#v-baukasten .bk-meldung');
    const typ = zielId === 'x' || zielId === 'y' ? 'zahl' : 'gruppe';
    if (!m) return;
    if (m.typ !== typ) { if (meldung) meldung.textContent = typ === 'zahl' ? `„${m.name}“ ist eine Gruppe. Auf die Achsen gehören Zahlen.` : `„${m.name}“ ist eine Zahl. Hierher gehören Gruppen, z. B. die passende Stufe.`; return; }
    if (zielId.startsWith('s')) bk.spalten[Number(zielId.slice(1))] = m.id; else bk[zielId] = m.id;
    bk.gewaehlt = '';
    bkSpeichern(); zeichne();
  }
  const bkWurzel = $('#v-baukasten');
  bkWurzel.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-merkmal]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.merkmal); e.dataTransfer.effectAllowed = 'copy'; } });
  bkWurzel.addEventListener('dragover', (e) => { const f = e.target.closest('.bk-feld'); if (f) { e.preventDefault(); f.classList.add('ueber'); } });
  bkWurzel.addEventListener('dragleave', (e) => { const f = e.target.closest('.bk-feld'); if (f) f.classList.remove('ueber'); });
  bkWurzel.addEventListener('drop', (e) => { const f = e.target.closest('.bk-feld'); if (!f) return; e.preventDefault(); bkLegen(e.dataTransfer.getData('text/plain'), f.dataset.ziel); });
  bkWurzel.addEventListener('click', (e) => {
    let el;
    if ((el = e.target.closest('[data-bk-art]'))) { bk.art = el.dataset.bkArt; bkSpeichern(); return zeichne(); }
    if ((el = e.target.closest('[data-mass]'))) { bk.mass = el.dataset.mass; bkSpeichern(); return zeichne(); }
    if ((el = e.target.closest('[data-leeren]'))) { const z = el.dataset.leeren; if (z.startsWith('s')) bk.spalten[Number(z.slice(1))] = ''; else bk[z] = ''; bkSpeichern(); return zeichne(); }
    if ((el = e.target.closest('[data-merkmal]'))) { bk.gewaehlt = bk.gewaehlt === el.dataset.merkmal ? '' : el.dataset.merkmal; bkWurzel.querySelectorAll('[data-merkmal]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.merkmal === bk.gewaehlt))); bkWurzel.classList.toggle('waehlt', Boolean(bk.gewaehlt)); return; }
    if ((el = e.target.closest('.bk-feld')) && bk.gewaehlt) return bkLegen(bk.gewaehlt, el.dataset.ziel);
  });
  bkWurzel.addEventListener('change', (e) => { const l = e.target.closest('[data-log]'); if (l) { bk[l.dataset.log] = l.checked; bkSpeichern(); zeichne(); } });

  // ---------- Mein Kino: im Kino gesehene Filme ----------
  // Anmeldung nur mit Nutzername (ohne Passwort). Die Liste liegt bei Supabase (Rechenzentrum Frankfurt),
  // dazu eine Kopie im Browser, damit die Seite sofort und auch ohne Verbindung das Häkchen zeigt.
  // Die Website darf nur drei Datenbankfunktionen aufrufen (mk_laden, mk_setzen, mk_loeschen), die Tabelle
  // selbst ist gesperrt. So kann niemand die Liste aller Nutzernamen abrufen.
  // Der Publishable Key ist für die Veröffentlichung im Browser gedacht.
  // Schlüssel je Film: TMDB-Nummer, sonst Titel und Jahr. Die laufende Nummer in data.js ändert sich bei jedem Lauf.
  const SUPABASE_URL = 'https://ksruwflrjitbxhrolqlr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_3pEljk4pexNEtxjwI13tEQ_kc2938a9';
  const SPEICHER = 'kinoprogramm-meinkino-v1';
  const filmSchluessel = (f) => (f.info.tmdb ? `t${f.info.tmdb}` : `n${f.titel.toLocaleLowerCase('de')}|${f.jahr || ''}`);
  const normName = (n) => String(n || '').trim().toLowerCase().slice(0, 40);
  let meinKino = { nutzer: '', gesehen: {} };
  let syncStatus = '';   // Meldung im Profil, z. B. "Gespeichert" oder ein Fehler
  function ladeMeinKino(roh) {
    const s = roh && typeof roh === 'object' ? roh : {};
    const gesehen = {};
    if (s.gesehen && typeof s.gesehen === 'object') Object.entries(s.gesehen).forEach(([k, d]) => { if (/^[tn]/.test(k) && /^\d{4}-\d{2}-\d{2}$/.test(String(d))) gesehen[k] = String(d); });
    // ausstehend: eine Änderung konnte nicht gesendet werden und wird beim nächsten Abgleich nachgeholt
    return { nutzer: normName(s.nutzer), gesehen, ...(s.ausstehend ? { ausstehend: true } : {}) };
  }
  try { meinKino = ladeMeinKino(JSON.parse(localStorage.getItem(SPEICHER) || 'null')); } catch (e) { /* privater Modus o. ä. */ }
  function speichereMeinKino() {
    try { localStorage.setItem(SPEICHER, JSON.stringify(meinKino)); } catch (e) { /* nicht speicherbar, gilt dann nur bis zum Neuladen */ }
    profilKnopfText();
  }

  // Aufruf einer Datenbankfunktion über die Supabase-Schnittstelle
  async function rpc(name, daten) {
    const antwort = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(daten),
    });
    if (!antwort.ok) throw new Error(`${name}: ${antwort.status}`);
    return antwort.status === 204 ? null : antwort.json();
  }
  function meldeSync(text) {
    syncStatus = text;
    const el = $('#pd-sync');
    if (el) el.textContent = text;
  }
  // Änderung an die Datenbank schicken. Schlägt das fehl, bleibt die Änderung im Browser und wird beim nächsten Laden nachgeholt.
  async function sendeAenderung(schluessel, datum) {
    if (!meinKino.nutzer) return;
    try {
      if (datum) await rpc('mk_setzen', { p_nutzer: meinKino.nutzer, p_film: schluessel, p_datum: datum });
      else await rpc('mk_loeschen', { p_nutzer: meinKino.nutzer, p_film: schluessel });
      meldeSync('Gespeichert, auf allen Geräten verfügbar.');
    } catch (e) {
      meinKino.ausstehend = true;
      speichereMeinKino();
      meldeSync('Nicht gespeichert, keine Verbindung. Wird beim nächsten Öffnen nachgeholt.');
    }
  }
  // Liste aus der Datenbank holen. Mit "zusammenfuehren" werden Markierungen aus dem Browser dazugenommen
  // (beim ersten Anmelden und wenn eine Änderung nicht gesendet werden konnte), sonst gilt die Datenbank.
  async function holeVomServer(zusammenfuehren) {
    if (!meinKino.nutzer) return;
    try {
      const zeilen = await rpc('mk_laden', { p_nutzer: meinKino.nutzer });
      const server = {};
      (zeilen || []).forEach((z) => { server[z.film] = String(z.datum); });
      if (zusammenfuehren || meinKino.ausstehend) {
        const fehlen = Object.entries(meinKino.gesehen).filter(([k, d]) => server[k] !== d);
        for (const [k, d] of fehlen) { await rpc('mk_setzen', { p_nutzer: meinKino.nutzer, p_film: k, p_datum: d }); server[k] = d; }
      }
      meinKino = { nutzer: meinKino.nutzer, gesehen: server };
      speichereMeinKino();
      meldeSync('Abgeglichen, auf allen Geräten verfügbar.');
      zeichne();
      if ($('#profil-dialog').open) zeigeProfil();
    } catch (e) {
      meldeSync('Keine Verbindung zur Datenbank. Angezeigt wird der Stand in diesem Browser.');
    }
  }

  const gesehenAm = (f) => meinKino.gesehen[filmSchluessel(f)] || null;
  function setzeGesehen(f, an) {
    const k = filmSchluessel(f);
    if (an) meinKino.gesehen[k] = HEUTE; else delete meinKino.gesehen[k];
    speichereMeinKino();
    sendeAenderung(k, an ? HEUTE : null);
  }
  // Datum frei wählbar, höchstens heute. Vorgabe beim Markieren ist heute.
  const datumFeld = (f, am) => `<label class="gesehen-datum">am <input type="date" data-gesehen-datum="${f.id}" value="${am}" max="${HEUTE}" aria-label="Gesehen am"></label>`;
  function setzeGesehenDatum(feld) {
    const f = filme[Number(feld.dataset.gesehenDatum)];
    const d = feld.value;
    // Leere oder ungültige Eingabe und Daten in der Zukunft nicht übernehmen
    if (!f || !gesehenAm(f) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d > HEUTE) { if (f && gesehenAm(f)) feld.value = gesehenAm(f); return; }
    meinKino.gesehen[filmSchluessel(f)] = d;
    speichereMeinKino();
    sendeAenderung(filmSchluessel(f), d);
  }
  function gesehenKnopf(f) {
    const am = gesehenAm(f);
    return am
      ? `<button type="button" class="gesehen-knopf an" data-gesehen-film="${f.id}" aria-pressed="true">✓ Im Kino gesehen</button>${datumFeld(f, am)}<span class="meta"> Knopf nochmal klicken zum Entfernen</span>`
      : `<button type="button" class="gesehen-knopf" data-gesehen-film="${f.id}" aria-pressed="false">Im Kino gesehen?</button>`;
  }
  // Gesehene Filme überall abschwächen, aber sichtbar lassen: Karten, Tabellenzeilen, Listeneinträge mit Filmlink
  function markiereGesehene() {
    document.querySelectorAll('main [data-film]').forEach((b) => {
      const f = filme[Number(b.dataset.film)];
      const box = b.closest('.filmkarte, .chance-zeile, tr, li');
      if (f && box) box.classList.toggle('gesehen', Boolean(gesehenAm(f)));
    });
  }
  function profilKnopfText() {
    const n = Object.keys(meinKino.gesehen).length;
    $('#profil-knopf').innerHTML = `${meinKino.nutzer ? esc(meinKino.nutzer) : 'Mein Kino'}${n ? ` <span class="zahl-punkt">${n}</span>` : ''}`;
  }

  function anmeldeBereich() {
    if (meinKino.nutzer) {
      return `<div class="profil-konto"><span>Angemeldet als <b>${esc(meinKino.nutzer)}</b></span><button type="button" class="vorbei-knopf" id="pd-abmelden">Abmelden</button></div>
        <p class="meta" id="pd-sync" role="status">${esc(syncStatus)}</p>`;
    }
    const lokal = Object.keys(meinKino.gesehen).length;
    return `<form class="profil-konto" id="pd-anmelden">
        <label class="profil-name">Nutzername <input id="pd-nutzer" type="text" minlength="2" maxlength="40" required autocomplete="username" placeholder="z. B. dein Spitzname"></label>
        <button type="submit" class="gesehen-knopf an">Anmelden</button>
      </form>
      <p class="meta">Melde dich auf jedem Gerät mit demselben Namen an, dann siehst du überall dieselbe Liste. Es gibt kein Passwort: Wähle einen Namen, den niemand errät.${lokal ? ` Deine ${lokal} Markierungen aus diesem Browser werden beim Anmelden übernommen.` : ''}</p>
      <p class="meta" id="pd-sync" role="status">${esc(syncStatus)}</p>`;
  }

  function zeigeProfil() {
    const alleFilme = filme.filter((f) => !OHNE_HIGHLIGHT.test(f.titel));
    const meine = alleFilme.filter((f) => gesehenAm(f)).sort((a, b) => gesehenAm(b).localeCompare(gesehenAm(a)) || a.titel.localeCompare(b.titel, 'de'));
    const schnitt = (l) => { const m = l.filter((f) => f.bewertung != null); return m.length ? Math.round(m.reduce((a, f) => a + f.bewertung, 0) / m.length) : null; };
    // Noch offen: läuft noch, nicht gesehen, die besten zuerst
    const kommend = new Set(termine.filter((t) => t.d >= HEUTE).map((t) => t.f));
    const offen = alleFilme.filter((f) => kommend.has(f.id) && !gesehenAm(f) && f.bewertung != null).sort(nachScore);
    const zaehle = (werte) => { const m = new Map(); werte.forEach((w) => m.set(w, (m.get(w) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'de')).slice(0, 5); };
    const laender = zaehle(meine.flatMap((f) => f.laender));
    const jz = zaehle(meine.map((f) => f.jahrzehnt).filter(Boolean));
    const reihe = (liste) => liste.map(([n, z]) => `<span class="chip">${esc(n)} · ${z}</span>`).join('');
    const sMeine = schnitt(meine), sAlle = schnitt(alleFilme);
    $('#pd-inhalt').innerHTML = `
      <h2 id="pd-titel">Mein Kino</h2>
      <p class="meta">Markiere Filme, die du im Kino gesehen hast. Gesehene Filme erscheinen auf der Seite blasser mit einem Häkchen.</p>
      ${anmeldeBereich()}
      <div class="profil-zahlen">
        <div><b>${meine.length}</b><span>${meine.length === 1 ? 'Film' : 'Filme'} gesehen</span></div>
        <div><b>${sMeine ?? '–'}</b><span>Ø Score deiner Filme</span></div>
        <div><b>${sAlle ?? '–'}</b><span>Ø Score aller Filme</span></div>
        <div><b>${offen.length}</b><span>laufen noch, nicht gesehen</span></div>
      </div>
      ${laender.length ? `<h3>Deine Länder</h3><div class="chips">${reihe(laender)}</div>` : ''}
      ${jz.length ? `<h3>Deine Jahrzehnte</h3><div class="chips">${reihe(jz)}</div>` : ''}
      ${offen.length ? `<h3>Noch nicht gesehen, läuft noch</h3><ul class="profil-liste">${offen.slice(0, 8).map((f) => `<li>${filmLink(f)} ${wertung(f)}</li>`).join('')}</ul>` : ''}
      <h3>Gesehen</h3>
      ${meine.length ? `<ul class="profil-liste">${meine.map((f) => `<li>${filmLink(f)} ${wertung(f)} ${datumFeld(f, gesehenAm(f))} <button type="button" class="entfernen" data-gesehen-film="${f.id}" aria-label="${esc(f.titel)} entfernen">×</button></li>`).join('')}</ul>` : '<p class="meta">Noch keine Filme markiert. Öffne einen Film und klicke auf „Im Kino gesehen?“.</p>'}`;
    const form = $('#pd-anmelden');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = normName($('#pd-nutzer').value);
        if (name.length < 2) return meldeSync('Bitte mindestens 2 Zeichen eingeben.');
        meinKino.nutzer = name;
        speichereMeinKino();
        meldeSync('Wird abgeglichen …');
        zeigeProfil();
        await holeVomServer(true);
      });
    }
    const ab = $('#pd-abmelden');
    if (ab) {
      ab.addEventListener('click', () => {
        // Abmelden entfernt die Liste nur aus diesem Browser, in der Datenbank bleibt sie erhalten
        meinKino = { nutzer: '', gesehen: {} };
        speichereMeinKino();
        meldeSync('Abgemeldet. Deine Liste bleibt gespeichert, melde dich mit demselben Namen wieder an.');
        zeigeProfil(); zeichne();
      });
    }
    if (!$('#profil-dialog').open) $('#profil-dialog').showModal();
  }

  // ---------- Steuerung ----------
  const ANSICHTEN = { highlights: zeigeHighlights, programm: zeigeProgramm, chance: zeigeChance, festivals: zeigeFestivals, kalender: zeigeKalender, filme: zeigeFilme, regie: zeigeRegie, statistik: zeigeStatistik, baukasten: zeigeBaukasten, kinos: zeigeKinos, impressum: zeigeImpressum };

  function zeichne() {
    $('#f-reset').hidden = !filterAktiv();
    $('#filter').hidden = zustand.ansicht === 'impressum';
    ANSICHTEN[zustand.ansicht](gefiltert());
    markiereGesehene();
  }

  function wechsleAnsicht(name) {
    zustand.ansicht = name;
    document.querySelectorAll('.reiter button').forEach((b) => b.setAttribute('aria-selected', b.dataset.ansicht === name));
    document.querySelectorAll('.ansicht').forEach((s) => { s.hidden = s.id !== `v-${name}`; });
    try { history.replaceState(null, '', `#${name}`); } catch (e) { /* nicht überall erlaubt */ }
    zeichne();
  }

  function fuelleAuswahl() {
    const kinoSel = $('#f-kino');
    const kListe = kinos.filter((k) => !zustand.stadt || k.stadt === zustand.stadt).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    kinoSel.innerHTML = '<option value="">Alle Kinos</option>' + kListe.map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join('');
    if (!kListe.some((k) => String(k.id) === zustand.kino)) zustand.kino = '';
    kinoSel.value = zustand.kino;

    const laender = new Map(), jz = new Set();
    filme.forEach((f) => { f.laender.forEach((l) => laender.set(l, (laender.get(l) || 0) + 1)); jz.add(f.jahrzehnt || 'unbekannt'); });
    $('#f-land').innerHTML = '<option value="">Alle Länder</option>' + [...laender].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([l]) => `<option>${esc(l)}</option>`).join('');
    $('#f-land').value = zustand.land;
    $('#f-jahrzehnt').innerHTML = '<option value="">Alle Jahrzehnte</option>' + [...jz].sort((a, b) => (a === 'unbekannt') - (b === 'unbekannt') || b.localeCompare(a)).map((j) => `<option>${esc(j)}</option>`).join('');
    $('#f-jahrzehnt').value = zustand.jahrzehnt;
    $('#f-stadt').value = zustand.stadt;
    $('#f-suche').value = zustand.suche;
  }

  document.querySelector('.reiter').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ansicht]');
    // Wer selbst einen Reiter wählt, verlässt den Sprung aus der Auswertung: Zurück-Knopf verschwindet
    if (b) { auswertungZurueck = null; wechsleAnsicht(b.dataset.ansicht); }
  });
  $('#f-stadt').addEventListener('change', (e) => { zustand.stadt = e.target.value; fuelleAuswahl(); zeichne(); });
  $('#f-kino').addEventListener('change', (e) => { zustand.kino = e.target.value; zeichne(); });
  $('#f-land').addEventListener('change', (e) => { zustand.land = e.target.value; zeichne(); });
  $('#f-jahrzehnt').addEventListener('change', (e) => { zustand.jahrzehnt = e.target.value; zeichne(); });
  $('#f-suche').addEventListener('input', (e) => { zustand.suche = e.target.value; zeichne(); });
  $('#f-reset').addEventListener('click', () => {
    Object.assign(zustand, { stadt: '', kino: '', land: '', jahrzehnt: '', suche: '' });
    fuelleAuswahl(); zeichne();
  });

  document.querySelector('main').addEventListener('click', (e) => {
    const ziel = (sel) => e.target.closest(sel);
    let el;
    if ((el = ziel('[data-zu]'))) { wechsleAnsicht(el.dataset.zu); return scrollTo(0, 0); }
    if ((el = ziel('[data-film]'))) return zeigeFilm(Number(el.dataset.film));
    if ((el = ziel('[data-gesehen-film]'))) return umschaltenGesehen(el);
    if ((el = ziel('[data-ksort]'))) {
      const feld = el.dataset.ksort;
      zustand.kinoSort = { feld, auf: zustand.kinoSort.feld === feld ? !zustand.kinoSort.auf : feld === 'name' };
      return zeichne();
    }
    if ((el = ziel('[data-festival-zu]'))) return springeZuFestival(el.dataset.festivalZu);
    if ((el = ziel('[data-festival-sprung]'))) { const k = document.getElementById(`festival-${el.dataset.festivalSprung}`); if (k) k.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if ((el = ziel('[data-kino-sprung]'))) { const k = $(`#kino-${el.dataset.kinoSprung}`); if (k) k.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if ((el = ziel('[data-alle-previews]'))) {
      zustand.allePreviews = !zustand.allePreviews;
      const y = scrollY; zeichne(); scrollTo(0, y);
      return;
    }
    if ((el = ziel('[data-zurueck-film]'))) {
      const z = zurueck;
      zurueck = null;
      if (!z) return;
      if (z.ansicht !== 'regie') wechsleAnsicht(z.ansicht);
      scrollTo(0, z.y);
      return zeigeFilm(z.film);
    }
    if ((el = ziel('[data-regie]'))) return zeigeRegiePerson(el.dataset.regie);
    if ((el = ziel('[data-regie-auf]'))) { zustand.regieOffen = zustand.regieOffen === el.dataset.regieAuf ? '' : el.dataset.regieAuf; return zeichne(); }
    if ((el = ziel('[data-rsort]'))) {
      const feld = el.dataset.rsort;
      zustand.regieSort = { feld, auf: zustand.regieSort.feld === feld ? !zustand.regieSort.auf : ['name', 'naechster'].includes(feld) };
      return zeichne();
    }
    if ((el = ziel('[data-tag]'))) { zustand.tag = el.dataset.tag; return zeichne(); }
    if ((el = ziel('[data-tag-sprung]'))) { zustand.tag = el.dataset.tagSprung; return wechsleAnsicht('programm'); }
    if ((el = ziel('[data-gruppe]'))) { zustand.gruppe = el.dataset.gruppe; return zeichne(); }
    if ((el = ziel('[data-kal]'))) { zustand.kalModus = el.dataset.kal; return zeichne(); }
    if ((el = ziel('[data-monat]'))) { zustand.kalMonat = el.dataset.monat; return zeichne(); }
    if ((el = ziel('[data-matrix]'))) { zustand.matrixStart = el.dataset.matrix; return zeichne(); }
    if ((el = ziel('[data-setze]'))) return springeAusAuswertung({ [el.dataset.setze]: el.dataset.wert });
    if ((el = ziel('[data-zurueck-auswertung-seite]'))) return zurueckZurAuswertung();
    if ((el = ziel('[data-sort]'))) {
      const feld = el.dataset.sort;
      zustand.sort = { feld, auf: zustand.sort.feld === feld ? !zustand.sort.auf : ['rang', 'titel', 'regie', 'land', 'naechster'].includes(feld) };
      return zeichne();
    }
  });
  document.querySelector('main').addEventListener('change', (e) => {
    if (e.target.id === 'tag-wahl' && e.target.value) { zustand.tag = e.target.value; zeichne(); }
    if (e.target.id === 'nur-kommend') { zustand.nurKommend = e.target.checked; zeichne(); }
    if (e.target.id === 'nur-neu') { zustand.nurNeu = e.target.checked; zeichne(); }
  });
  // Gesehen-Knopf im Film-Dialog und im Profil
  function umschaltenGesehen(knopf) {
    const f = filme[Number(knopf.dataset.gesehenFilm)];
    if (!f) return;
    setzeGesehen(f, !gesehenAm(f));
    if ($('#fd-gesehen') && $('#film-dialog').open) $('#fd-gesehen').innerHTML = gesehenKnopf(f);
    if ($('#profil-dialog').open) zeigeProfil();
    zeichne();
  }
  $('#profil-knopf').addEventListener('click', zeigeProfil);
  ['#film-dialog', '#profil-dialog'].forEach((sel) => $(sel).addEventListener('change', (e) => {
    if (e.target.matches('[data-gesehen-datum]')) setzeGesehenDatum(e.target);
  }));
  $('#profil-dialog').addEventListener('click', (e) => {
    if (e.target.id === 'profil-dialog') return e.target.close();
    const g = e.target.closest('[data-gesehen-film]');
    if (g) return umschaltenGesehen(g);
    const film = e.target.closest('[data-film]');
    if (film) { $('#profil-dialog').close(); zeigeFilm(Number(film.dataset.film)); }
  });
  $('#film-dialog').addEventListener('click', (e) => {
    if (e.target.id === 'film-dialog') return e.target.close();
    const g = e.target.closest('[data-gesehen-film]');
    if (g) return umschaltenGesehen(g);
    if (e.target.closest('[data-zurueck-auswertung]')) return e.target.closest('dialog').close();
    const fest = e.target.closest('[data-festival-zu]');
    if (fest) return springeZuFestival(fest.dataset.festivalZu);
    const regie = e.target.closest('[data-regie]');
    // Herkunft merken: Film, Reiter und Scrollposition, damit "Zurück zum Film" alles wiederherstellt
    if (regie) zeigeRegiePerson(regie.dataset.regie, { film: offenerFilm, ansicht: zustand.ansicht, y: scrollY });
  });
  $('#fuss').addEventListener('click', (e) => { if (e.target.closest('[data-impressum]')) { wechsleAnsicht('impressum'); scrollTo(0, 0); } });

  let warte;
  window.addEventListener('resize', () => {
    clearTimeout(warte);
    warte = setTimeout(() => { if (zustand.ansicht === 'statistik') zeichne(); }, 150);
  });

  $('#fuss').innerHTML = `<p>Datenstand ${datum(D.stand)} · ${zahl(termine.length)} Einträge von ${datum(ERSTER)} bis ${datum(LETZTER)}. Angaben ohne Gewähr, verbindlich sind die Programme der Kinos. Filmdaten und Plakate: TMDB.</p><button data-impressum>Impressum und Datenschutz</button>`;

  fuelleAuswahl();
  zeigeKopf();
  profilKnopfText();
  const start = location.hash.slice(1);
  wechsleAnsicht(ANSICHTEN[start] ? start : 'highlights');
  // Angemeldet: aktuellen Stand aus der Datenbank holen (andere Geräte könnten etwas geändert haben)
  holeVomServer(false);
})();
