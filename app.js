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
      jahrzehnt: j > 1880 && j <= new Date().getFullYear() + 1 ? `${Math.floor(j / 10) * 10}er` : null,
    };
  });
  const termine = D.termine.map(([f, k, d]) => ({ f, k, d }));

  const alleDaten = termine.map((t) => t.d).sort();
  const ERSTER = alleDaten[0];
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
    ansicht: 'highlights', tag: 'woche', gruppe: 'film', reihenfolge: 'bewertung',
    sort: { feld: 'bewertung', auf: false }, nurKommend: false, nurNeu: false,
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
  function filmMeta(f) {
    if (istSneak(f)) return '? · ? · ?';   // Regie, Land, Jahr sind bei Überraschungsfilmen unbekannt
    if (istKurzfilm(f)) return '– · – · –';   // mehrere Filme, keine einheitlichen Angaben
    const teile = [f.regie && esc(f.regie), f.laender.length && f.laender.map(mitFlagge).join(', '), f.jahr && esc(f.jahr)].filter(Boolean);
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
    // Neu: erster Termin überhaupt liegt in der laufenden Woche und der Film ist kein alter Film in Wiederaufführung
    const neuAb = plusTage(HEUTE, -((wochentag(HEUTE) + 7 - NEU_WOCHE_BEGINNT) % 7));
    const neuBis = plusTage(neuAb, 6);
    const diesesJahr = Number(HEUTE.slice(0, 4));
    m.forEach((e, id) => {
      let w = donnerstagVon(HEUTE), n = 0;
      while (e.wochen.has(w)) { n++; w = plusTage(w, -7); }
      e.serie = n;
      const jahr = parseInt(filme[id].jahr, 10);
      e.neu = e.erster >= neuAb && e.erster <= neuBis && (!jahr || diesesJahr - jahr <= NEU_HOECHSTALTER);
    });
    faktenCache = m;
    return m;
  }
  function chanceFilme() {
    if (!chanceCache) chanceCache = new Map(letzteChance(termine).sicher.map((e) => [e.f.id, e]));
    return chanceCache;
  }
  const wochentagDatum = (d) => `${fmtWt.format(parse(d)).replace('.', '')} ${datumKurz(d)}`;
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
  const nachScore = (a, b) => (b.bewertung ?? -1) - (a.bewertung ?? -1) || a.titel.localeCompare(b.titel, 'de');
  function highlightKarte(h, gross) {
    const f = h.f;
    // Nur die Kinos dieser Woche. Die einzelnen Tage stehen in der Filmansicht, hier wären sie zu unübersichtlich.
    const zeilen = [...h.kinos.keys()].sort((a, b) => kinos[a].name.localeCompare(kinos[b].name, 'de'))
      .map((k) => `<li><span class="chip">${esc(kinos[k].name)}</span></li>`).join('');
    return `<article class="filmkarte hl-karte${gross ? ' hl-gross' : ''}">${plakat(f, gross ? 'gross' : 'mittel')}<div>${filmLink(f)}${pokale(f)}${wertung(f)}<div class="meta">${filmMeta(f)}</div>${grundZeile(f)}${h.hinweis ? `<div class="zuletzt">${esc(h.hinweis)}</div>` : ''}<ul class="hl-kinos">${zeilen}</ul></div></article>`;
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
    const rubriken = [
      ['Neu diese Woche', 'Weitere Neustarts dieser Woche, die besten zuerst.', nimm(neu)],
      ['Klassiker zum Nachholen', `Mindestens ${KLASSIKER_ALTER} Jahre alt, mit hohem Score oder einem Hauptpreis.`, nimm(alle.filter((h) => {
        const j = parseInt(h.f.jahr, 10);
        return j && jetzt - j >= KLASSIKER_ALTER && ((h.f.bewertung ?? -1) >= KLASSIKER_SCORE || hatPreis(h));
      }))],
      ['Letzte Chance', 'Diese Filme laufen in den nächsten Tagen zum letzten Mal.', nimm(alle.filter((h) => chanceFilme().has(h.f.id)).map((h) => {
        const c = chanceFilme().get(h.f.id);
        return { ...h, hinweis: `Zum letzten Mal ${wochentagDatum(c.letzter)} im ${c.kinos.map((k) => k.name).join(', ')}` };
      }))],
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
      ${rubriken.map(([name, text, liste]) => `<section class="hl-rubrik"><h3 class="hl-titel">${name}</h3><p class="meta">${text}</p><div class="karten">${liste.map((h) => highlightKarte(h, false)).join('')}</div></section>`).join('')}
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
    // Sortierung für beide Ansichten: nach Score (Filme ohne Score am Ende) oder alphabetisch
    const nachTitel = (a, b) => a.titel.localeCompare(b.titel, 'de');
    const filmOrdnung = zustand.reihenfolge === 'titel'
      ? nachTitel
      : (a, b) => (b.bewertung ?? -1) - (a.bewertung ?? -1) || nachTitel(a, b);
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
        const badge = chanceIds.has(fid) ? '<span class="abzeichen chance">Letzte Chance</span>' : '';
        return `<article class="filmkarte">${plakat(f)}<div>${filmLink(f)}${pokale(f)}${badge}${wertung(f)}<div class="meta">${filmMeta(f)}</div>${grundZeile(f)}<div class="chips">${chips}</div></div></article>`;
      }).join('')}</div>`;
    } else {
      const nachKino = new Map();
      amTag.forEach((t) => { if (!nachKino.has(t.k)) nachKino.set(t.k, new Set()); nachKino.get(t.k).add(t.f); });
      const liste = [...nachKino].sort((a, b) => kinos[a[0]].name.localeCompare(kinos[b[0]].name, 'de'));
      inhalt = `<div class="karten">${liste.map(([kid, fs]) => {
        const k = kinos[kid];
        const zeilen = [...fs].map((f) => filme[f]).sort(filmOrdnung)
          .map((f) => `<li>${plakat(f, 'mini')}<div>${filmLink(f)}${pokale(f)}${chanceIds.has(f.id) ? '<span class="abzeichen chance">Letzte Chance</span>' : ''}${wertung(f)}<div class="meta">${filmMeta(f)}</div>${grundZeile(f)}</div></li>`).join('');
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
          <div class="umschalter" role="group" aria-label="Sortierung">
            <button data-reihenfolge="bewertung" aria-pressed="${zustand.reihenfolge === 'bewertung'}">Score</button>
            <button data-reihenfolge="titel" aria-pressed="${zustand.reihenfolge === 'titel'}">A–Z</button>
          </div>
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
      if (!s) { s = { f: filme[t.f], kinos: new Set(), tage: new Set(), letzter: t.d }; m.set(t.f, s); }
      s.kinos.add(t.k); s.tage.add(t.d);
      if (t.d > s.letzter) s.letzter = t.d;
    });
    const chanceIds = new Set(letzteChance(daten).sicher.map((e) => e.f.id));
    return [...m.values()].map((s) => {
      const naechster = [...s.tage].filter((d) => d >= HEUTE).sort()[0] || null;
      let status = naechster ? statusVon(naechster) : 'nein';
      if (chanceIds.has(s.f.id)) status = 'chance';
      return { ...s, nKinos: s.kinos.size, nTage: s.tage.size, naechster, status };
    });
  }

  const SPALTEN = [
    { feld: 'titel', titel: 'Titel', wert: (s) => s.f.titel.toLocaleLowerCase('de') },
    { feld: 'bewertung', titel: 'Score', wert: (s) => s.f.bewertung, zahl: true },
    { feld: 'letzter', titel: 'Letzter Tag', wert: (s) => s.letzter },
    { feld: 'regie', titel: 'Regie', wert: (s) => (s.f.regie || '￿').toLocaleLowerCase('de') },
    { feld: 'land', titel: 'Land', wert: (s) => (s.f.laender[0] || '￿').toLocaleLowerCase('de') },
    { feld: 'jahr', titel: 'Jahr', wert: (s) => s.f.jahr || '0000', zahl: true },
    { feld: 'kinos', titel: 'Kinos', wert: (s) => s.nKinos, zahl: true },
    { feld: 'tage', titel: 'Spieltage', wert: (s) => s.nTage, zahl: true },
    { feld: 'naechster', titel: 'Nächster Tag', wert: (s) => s.naechster || '9999' },
  ];

  function zeigeFilme(daten) {
    let liste = filmStatistik(daten);
    if (zustand.nurKommend) liste = liste.filter((s) => s.naechster);
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
      return `<th class="${s.zahl ? 'zahl' : ''}" aria-sort="${aktiv ? (zustand.sort.auf ? 'ascending' : 'descending') : 'none'}"><button data-sort="${s.feld}"${r}>${s.titel}</button></th>`;
    }).join('') + '<th>Status</th>';

    const zeilen = liste.map((s) => `<tr>
      <td class="umbruch"><div class="titelzelle">${plakat(s.f, 'mini')}<div>${filmLink(s.f)}${pokale(s.f)}</div></div></td>
      <td class="zahl">${s.f.bewertung != null ? wertung(s.f) : '–'}</td>
      <td>${datumKurz(s.letzter)}</td>
      <td class="umbruch">${istSneak(s.f) ? '?' : esc(s.f.regie || '–')}</td>
      <td class="umbruch schmal">${istSneak(s.f) ? '?' : s.f.laender.map(mitFlagge).join(', ') || '–'}</td>
      <td class="zahl">${istSneak(s.f) ? '?' : esc(s.f.jahr || '–')}</td>
      <td class="zahl">${s.nKinos}</td>
      <td class="zahl">${s.nTage}</td>
      <td>${s.naechster ? datumKurz(s.naechster) : '–'}</td>
      <td><span class="status ${s.status}">${STATUS_TEXT[s.status]}</span></td>
    </tr>`).join('');

    $('#v-filme').innerHTML = `
      <div class="ansicht-kopf"><h2>${zahl(liste.length)} Filme</h2>
        <label class="meta"><input type="checkbox" id="nur-kommend" ${zustand.nurKommend ? 'checked' : ''}> Nur Filme mit kommenden Terminen</label></div>
      ${liste.length ? `<div class="tabelle-wrap"><table class="liste"><thead><tr>${kopf}</tr></thead><tbody>${zeilen}</tbody></table></div>` : '<p class="leer">Keine Filme für diese Auswahl.</p>'}`;
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

  // Filme pro Monat nach erstgenanntem Produktionsland: jeder Film zählt pro Monat einmal
  const LANDFARBEN = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
  const FARBE_ANDERE = '#6b6760';
  function laenderJeMonat(daten) {
    const monate = new Map();
    daten.forEach((t) => {
      const land = filme[t.f].laender[0];
      if (!land) return;
      const m = t.d.slice(0, 7);
      if (!monate.has(m)) monate.set(m, new Map());
      monate.get(m).set(t.f, land);
    });
    const summe = new Map();
    monate.forEach((fs) => fs.forEach((land) => summe.set(land, (summe.get(land) || 0) + 1)));
    const spitze = [...summe].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, LANDFARBEN.length).map(([l]) => l);
    const reihen = [...spitze, 'Andere'];
    const liste = [...monate.keys()].sort().map((m) => {
      const z = new Map(reihen.map((r) => [r, 0]));
      monate.get(m).forEach((land) => { const r = spitze.includes(land) ? land : 'Andere'; z.set(r, z.get(r) + 1); });
      return { m, werte: reihen.map((r) => z.get(r)), gesamt: monate.get(m).size };
    });
    const gesamt = reihen.map((r, i) => liste.reduce((s, e) => s + e.werte[i], 0));
    return { reihen, liste, gesamt, farben: [...LANDFARBEN.slice(0, spitze.length), FARBE_ANDERE] };
  }

  function zeigeStatistik(daten) {
    const reihe = tagesreihe(daten);
    const wertungen = bewertungsreihe(daten);
    const laenderMonat = laenderJeMonat(daten);
    const mitWert = wertungen.filter((p) => p.n != null).map((p) => p.n);
    const kommende = new Set(daten.filter((t) => t.d >= HEUTE).map((t) => t.f));
    const basis = kommende.size ? [...kommende].map((id) => filme[id]) : [];
    const jz = new Map(), la = new Map();
    basis.forEach((f) => {
      const j = f.jahrzehnt || 'unbekannt';
      jz.set(j, (jz.get(j) || 0) + 1);
      f.laender.forEach((l) => la.set(l, (la.get(l) || 0) + 1));
    });
    const jahrzehnte = [...jz].sort((a, b) => (a[0] === 'unbekannt') - (b[0] === 'unbekannt') || a[0].localeCompare(b[0]));
    const laender = [...la].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, 12);

    $('#v-statistik').innerHTML = `
      <div class="tafel diagramm" id="d-filme">
        <h3>Verschiedene Filme pro Tag</h3>
        <p class="hinweis">Ein Film in mehreren Kinos zählt an einem Tag nur einmal. Tage auf 0 sind meist Lücken in der Datenerfassung. Ein Klick auf einen Tag öffnet das Programm.</p>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="tafel diagramm abstand" id="d-wertung">
        <h3>Ø Score pro Tag</h3>
        <p class="hinweis">Durchschnittlicher Score aller Filme, die an diesem Tag laufen. Jeder Film zählt pro Tag nur einmal, Filme ohne Score bleiben außen vor.${mitWert.length ? ` Über den ganzen Zeitraum liegt der Tagesschnitt zwischen ${Math.round(Math.min(...mitWert))} und ${Math.round(Math.max(...mitWert))}.` : ''}</p>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="tafel diagramm abstand" id="d-laender">
        <h3>Filme pro Monat nach Land</h3>
        <p class="hinweis">Jeder Film zählt pro Monat einmal, und zwar für das erstgenannte Produktionsland. Eine deutsch-französische Koproduktion mit Deutschland an erster Stelle zählt also als deutscher Film.</p>
        <div class="legende-laender">${laenderMonat.reihen.map((r, i) => `<span><i style="background:${laenderMonat.farben[i]}"></i>${r === 'Andere' ? 'Andere' : mitFlagge(r)} <b>${laenderMonat.gesamt[i]}</b></span>`).join('')}</div>
        <div class="flaeche"></div>
        <div class="tooltip" hidden></div>
      </div>
      <div class="raster-2">
        <div class="tafel"><h3>Nach Jahrzehnt</h3><p class="hinweis">Filme mit kommenden Terminen nach Produktionsjahr. Ein Klick filtert.</p>${jahrzehnte.length ? balken(jahrzehnte, 'jahrzehnt') : '<p class="leer">Keine Daten.</p>'}</div>
        <div class="tafel"><h3>Nach Land</h3><p class="hinweis">Die zwölf häufigsten Produktionsländer. Koproduktionen zählen für jedes Land.</p>${laender.length ? balken(laender, 'land') : '<p class="leer">Keine Daten.</p>'}</div>
      </div>
      <details><summary>Verlauf als Tabelle anzeigen (pro Monat)</summary>${monatsTabelle(reihe)}</details>
      <details><summary>Länder als Tabelle anzeigen (pro Monat)</summary>${laenderTabelle(laenderMonat)}</details>`;

    const maxFilme = Math.max(1, ...reihe.map((p) => p.n));
    const stF = schritt(maxFilme);
    linienDiagramm('d-filme', reihe, {
      yMin: 0, yMax: Math.ceil(maxFilme / stF) * stF, schritt: stF, flaeche: true,
      tipp: (p) => `${datum(p.d)}<br><b>${p.n}</b> ${p.n === 1 ? 'Film' : 'Filme'}`,
      beschreibung: 'Liniendiagramm: verschiedene Filme pro Tag',
    });
    // Score-Achse in 5er-Schritten, knapp um die tatsächlichen Werte
    const unten = mitWert.length ? Math.max(0, Math.floor(Math.min(...mitWert) / 5) * 5 - 5) : 0;
    const oben = mitWert.length ? Math.min(100, Math.ceil(Math.max(...mitWert) / 5) * 5 + 5) : 100;
    linienDiagramm('d-wertung', wertungen, {
      yMin: unten, yMax: oben, schritt: 5, flaeche: false,
      tipp: (p) => (p.n == null ? `${datum(p.d)}<br>keine Filme mit Score` : `${datum(p.d)}<br>Ø Score <b>${p.n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}</b> aus ${p.anzahl} ${p.anzahl === 1 ? 'Film' : 'Filmen'}`),
      beschreibung: 'Liniendiagramm: durchschnittlicher Score pro Tag',
    });
    saeulenDiagramm('d-laender', laenderMonat);
  }

  function laenderTabelle({ reihen, liste }) {
    const kopf = reihen.map((r) => `<th class="zahl">${r === 'Andere' ? 'Andere' : mitFlagge(r)}</th>`).join('');
    const zeilen = liste.map((e) => `<tr><td>${fmtMonatLang.format(parse(e.m + '-01'))}</td>${e.werte.map((w) => `<td class="zahl">${w || '–'}</td>`).join('')}<td class="zahl"><b>${e.gesamt}</b></td></tr>`).join('');
    return `<div class="tabelle-wrap"><table class="liste"><thead><tr><th>Monat</th>${kopf}<th class="zahl">Gesamt</th></tr></thead><tbody>${zeilen}</tbody></table></div>`;
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

  function saeulenDiagramm(id, { reihen, liste, farben }) {
    const rahmen = document.getElementById(id);
    const ziel = rahmen.querySelector('.flaeche'), tip = rahmen.querySelector('.tooltip');
    if (!liste.length) { ziel.innerHTML = '<p class="leer">Keine Filme mit Länderangabe.</p>'; return; }
    const B = Math.max(ziel.clientWidth, 280), H = B < 500 ? 240 : 300;
    const r = { l: 34, o: 12, u: 26, re: 8 };
    const max = Math.max(1, ...liste.map((e) => e.gesamt));
    const st = schritt(max), yMax = Math.ceil(max / st) * st;
    const y = (n) => r.o + (1 - n / yMax) * (H - r.o - r.u);
    const breite = (B - r.l - r.re) / liste.length;
    const saeule = Math.min(56, breite * 0.62);
    let gitter = '', ticksY = '', ticksX = '', segmente = '';
    for (let v = 0; v <= yMax; v += st) {
      gitter += `<line x1="${r.l}" x2="${B - r.re}" y1="${y(v)}" y2="${y(v)}"/>`;
      ticksY += `<text x="${r.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    liste.forEach((e, i) => {
      const xm = r.l + breite * (i + 0.5), x0 = xm - saeule / 2;
      // Januar mit Jahreszahl, weil die Daten über den Jahreswechsel reichen
      const kurz = fmtMonat.format(parse(e.m + '-01')) + (e.m.endsWith('-01') && i > 0 ? ` ’${e.m.slice(2, 4)}` : '');
      if (!(B < 500 && liste.length > 8 && i % 2)) ticksX += `<text x="${xm}" y="${H - 6}" text-anchor="middle">${kurz}</text>`;
      let unten = 0;
      e.werte.forEach((w, j) => {
        if (!w) return;
        // 2px Abstand in Flächenfarbe zwischen gestapelten Segmenten
        const y1 = y(unten + w), y0 = y(unten);
        segmente += `<rect class="segment" x="${x0.toFixed(1)}" y="${y1.toFixed(1)}" width="${saeule.toFixed(1)}" height="${Math.max(1, y0 - y1 - 2).toFixed(1)}" fill="${farben[j]}" data-i="${i}" data-j="${j}"/>`;
        unten += w;
      });
    });
    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Gestapeltes Säulendiagramm: Filme pro Monat nach erstgenanntem Produktionsland">
      <g class="gitter">${gitter}</g>${segmente}
      <line class="basis" x1="${r.l}" x2="${B - r.re}" y1="${y(0)}" y2="${y(0)}"/>
      <g class="achse">${ticksY}${ticksX}</g></svg>`;
    const svg = ziel.querySelector('svg');
    svg.addEventListener('pointermove', (ev) => {
      const s = ev.target.closest('.segment');
      if (!s) { tip.hidden = true; return; }
      const e = liste[+s.dataset.i], j = +s.dataset.j, land = reihen[j];
      setzeTipp(rahmen, tip, svg, B, +s.getAttribute('x') + saeule / 2, +s.getAttribute('y'),
        `${fmtMonatLang.format(parse(e.m + '-01'))}<br>${land === 'Andere' ? 'Andere Länder' : mitFlagge(land)}: <b>${e.werte[j]}</b> von ${e.gesamt} Filmen`);
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  }

  function monatsTabelle(reihe) {
    const m = new Map();
    reihe.forEach(({ d, n }) => {
      const k = d.slice(0, 7);
      if (!m.has(k)) m.set(k, { tage: 0, summe: 0, max: 0 });
      const s = m.get(k);
      if (n > 0) { s.tage++; s.summe += n; }
      s.max = Math.max(s.max, n);
    });
    const zeilen = [...m].map(([k, s]) => `<tr><td>${fmtMonatLang.format(parse(k + '-01'))}</td><td class="zahl">${s.tage}</td><td class="zahl">${s.tage ? (s.summe / s.tage).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–'}</td><td class="zahl">${s.max}</td></tr>`).join('');
    return `<div class="tabelle-wrap"><table class="liste"><thead><tr><th>Monat</th><th class="zahl">Tage mit Daten</th><th class="zahl">Ø Filme pro Tag</th><th class="zahl">Höchstwert</th></tr></thead><tbody>${zeilen}</tbody></table></div>`;
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
    reihe.forEach((p, i) => {
      if (p.d.endsWith('-01') && !(B < 500 && Number(p.d.slice(5, 7)) % 2 === 0)) {
        ticksX += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fmtMonat.format(parse(p.d))}${p.d.endsWith('-01-01') ? ` ’${p.d.slice(2, 4)}` : ''}</text>`;
      }
    });
    let pfad = '', offen = false;
    reihe.forEach((p, i) => {
      if (p.n == null) { offen = false; return; }
      pfad += `${offen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`;
      offen = true;
    });
    const flaechePfad = opt.flaeche ? `<path class="flaeche" d="${pfad}L${x(reihe.length - 1)},${y(opt.yMin)}L${x(0)},${y(opt.yMin)}Z"/>` : '';
    const hi = reihe.findIndex((p) => p.d === HEUTE);
    const heute = hi >= 0 ? `<g class="heute"><line x1="${x(hi)}" x2="${x(hi)}" y1="${r.o - 6}" y2="${y(opt.yMin)}"/><text x="${x(hi) + 5}" y="${r.o + 4}">Heute</text></g>` : '';

    ziel.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="${esc(opt.beschreibung)} von ${datum(ERSTER)} bis ${datum(LETZTER)}">
      <defs><linearGradient id="goldverlauf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c9a24a" stop-opacity=".28"/><stop offset="1" stop-color="#c9a24a" stop-opacity="0"/></linearGradient></defs>
      <g class="gitter">${gitter}</g>
      ${flaechePfad}
      <path class="linie" d="${pfad}"/>
      <line class="basis" x1="${r.l}" x2="${B - r.re}" y1="${y(opt.yMin)}" y2="${y(opt.yMin)}"/>
      <g class="achse">${ticksY}${ticksX}</g>
      ${heute}
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

  // ---------- Ansicht Kinos ----------
  function zeigeKinos(daten) {
    const s = kinos.map((k) => ({ k, gesamt: 0, kommend: 0, filmeKommend: new Set() }));
    daten.forEach((t) => {
      const e = s[t.k];
      e.gesamt++;
      if (t.d >= HEUTE) { e.kommend++; e.filmeKommend.add(t.f); }
    });
    const liste = s.filter((e) => e.gesamt).sort((a, b) => b.kommend - a.kommend || a.k.name.localeCompare(b.k.name, 'de'));
    const karten = liste.map((e) => {
      const bis = horizont[e.k.id];
      const vorlauf = bis >= HEUTE ? tageZwischen(HEUTE, bis) + 1 : 0;
      const st = !vorlauf ? ['nein', 'Kein kommender Termin'] : vorlauf < 7 ? ['kurz', `Programm nur ${vorlauf} ${vorlauf === 1 ? 'Tag' : 'Tage'} im Voraus`] : ['ja', `Programm ${vorlauf} Tage im Voraus`];
      const link = e.k.link ? `<a href="${esc(e.k.link)}" target="_blank" rel="noopener">Zur Kinoseite ↗</a>` : '';
      return `<article class="kinokarte">
        <header><span class="monogramm">${esc(e.k.mono)}</span><div><h3>${esc(e.k.name)}</h3><div class="meta">${esc(e.k.stadt)}</div></div></header>
        <div class="kino-zahlen">
          <div><b>${e.filmeKommend.size}</b><span>Filme ab heute</span></div>
          <div><b>${e.kommend}</b><span>Spieltage ab heute</span></div>
          <div><b>${bis ? datumKurz(bis) : '–'}</b><span>bekannt bis</span></div>
        </div>
        <footer><span class="status ${st[0]}">${st[1]}</span>${link}</footer>
      </article>`;
    }).join('');
    $('#v-kinos').innerHTML = `
      <div class="ansicht-kopf"><h2>Kinos und Spielorte</h2></div>
      <p class="hinweis">Wie weit das bekannte Programm je Kino reicht. Ein kurzer Vorlauf heißt meist, dass das Kino noch nicht weiter veröffentlicht hat.</p>
      ${liste.length ? `<div class="kino-raster">${karten}</div>` : '<p class="leer">Keine Kinos für diese Auswahl.</p>'}`;
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
    if (erster > HEUTE) return '';
    const wochen = new Set(tage.map(kinowocheVon));
    const jetzt = kinowocheVon(HEUTE);
    const laeuft = wochen.has(jetzt);
    // Rückwärts ab aktueller Woche, sonst ab der letzten Woche mit Termin bis heute
    let w = jetzt;
    if (!laeuft) w = [...wochen].filter((x) => x < jetzt).sort().pop();
    let n = 0;
    while (wochen.has(w)) { n++; w = plusTage(w, -7); }
    const einheit = n === 1 ? 'Woche' : 'Wochen';
    return `<div class="meta">Im Kino seit ${esc(datum(erster).replace(/^\S+\s/, ''))} · ${laeuft ? `seit ${n} ${einheit} am Stück` : `lief ${n} ${einheit}`}</div>`;
  }

  function zeigeFilm(fid) {
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
    $('#fd-inhalt').innerHTML = `<div class="dialog-kopf">${plakat(f, 'gross')}<div><h2 id="fd-titel">${esc(f.titel)}</h2>${pokale(f)}${wertung(f)}<div class="meta">${filmMeta(f)}</div>${laufzeitZeile(f, alleTage)}${grundZeile(f)}${preisListe(f)}<p class="meta">Gold markiert kommende Tage, grau vergangene.</p></div></div>${knopf}<div id="fd-termine">${gruppenHtml()}</div>`;
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

  // ---------- Steuerung ----------
  const ANSICHTEN = { highlights: zeigeHighlights, programm: zeigeProgramm, chance: zeigeChance, kalender: zeigeKalender, filme: zeigeFilme, statistik: zeigeStatistik, kinos: zeigeKinos, impressum: zeigeImpressum };

  function zeichne() {
    $('#f-reset').hidden = !filterAktiv();
    $('#filter').hidden = zustand.ansicht === 'impressum';
    ANSICHTEN[zustand.ansicht](gefiltert());
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
    if (b) wechsleAnsicht(b.dataset.ansicht);
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
    if ((el = ziel('[data-tag]'))) { zustand.tag = el.dataset.tag; return zeichne(); }
    if ((el = ziel('[data-tag-sprung]'))) { zustand.tag = el.dataset.tagSprung; return wechsleAnsicht('programm'); }
    if ((el = ziel('[data-gruppe]'))) { zustand.gruppe = el.dataset.gruppe; return zeichne(); }
    if ((el = ziel('[data-reihenfolge]'))) { zustand.reihenfolge = el.dataset.reihenfolge; return zeichne(); }
    if ((el = ziel('[data-kal]'))) { zustand.kalModus = el.dataset.kal; return zeichne(); }
    if ((el = ziel('[data-monat]'))) { zustand.kalMonat = el.dataset.monat; return zeichne(); }
    if ((el = ziel('[data-matrix]'))) { zustand.matrixStart = el.dataset.matrix; return zeichne(); }
    if ((el = ziel('[data-setze]'))) {
      zustand[el.dataset.setze] = el.dataset.wert;
      fuelleAuswahl();
      return wechsleAnsicht('filme');
    }
    if ((el = ziel('[data-sort]'))) {
      const feld = el.dataset.sort;
      zustand.sort = { feld, auf: zustand.sort.feld === feld ? !zustand.sort.auf : ['titel', 'regie', 'land', 'naechster'].includes(feld) };
      return zeichne();
    }
  });
  document.querySelector('main').addEventListener('change', (e) => {
    if (e.target.id === 'tag-wahl' && e.target.value) { zustand.tag = e.target.value; zeichne(); }
    if (e.target.id === 'nur-kommend') { zustand.nurKommend = e.target.checked; zeichne(); }
    if (e.target.id === 'nur-neu') { zustand.nurNeu = e.target.checked; zeichne(); }
  });
  $('#film-dialog').addEventListener('click', (e) => { if (e.target.id === 'film-dialog') e.target.close(); });
  $('#fuss').addEventListener('click', (e) => { if (e.target.closest('[data-impressum]')) { wechsleAnsicht('impressum'); scrollTo(0, 0); } });

  let warte;
  window.addEventListener('resize', () => {
    clearTimeout(warte);
    warte = setTimeout(() => { if (zustand.ansicht === 'statistik') zeichne(); }, 150);
  });

  $('#fuss').innerHTML = `<p>Datenstand ${datum(D.stand)} · ${zahl(termine.length)} Einträge von ${datum(ERSTER)} bis ${datum(LETZTER)}. Angaben ohne Gewähr, verbindlich sind die Programme der Kinos. Filmdaten und Plakate: TMDB.</p><button data-impressum>Impressum und Datenschutz</button>`;

  fuelleAuswahl();
  zeigeKopf();
  const start = location.hash.slice(1);
  wechsleAnsicht(ANSICHTEN[start] ? start : 'highlights');
})();
