(function () {
  'use strict';

  const D = window.KINO_DATA;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zahl = (n) => n.toLocaleString('de-DE');

  // ---------- Datumshilfen (alle Daten als ISO-Text JJJJ-MM-TT in lokaler Zeit) ----------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const plusTage = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const tageZwischen = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const wochentag = (s) => (parse(s).getDay() + 6) % 7; // Montag = 0
  const montagVon = (s) => plusTage(s, -wochentag(s));
  const fmt = (o) => new Intl.DateTimeFormat('de-DE', o);
  const fmtKurz = fmt({ day: '2-digit', month: '2-digit' });
  const fmtLang = fmt({ weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtVoll = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
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

  // Länderschreibweisen vereinheitlichen, nur für Filter und Anzeige
  const LAND_ALIAS = { 'Vereinigte Staaten': 'USA', 'Vereinigtes Königreich': 'Großbritannien', UK: 'Großbritannien', It: 'Italien', Turkey: 'Türkei', BRD: 'Deutschland', IE: 'Irland' };
  const leerWert = (v) => (v == null || v === '' || v === '?' ? null : v);
  const filme = D.filme.map(([titel, land, regie, jahr, info], id) => {
    const laender = (leerWert(land) || '').split(/\s*[,/]\s*/).map((l) => LAND_ALIAS[l] || l).filter((l) => l && l !== '?');
    const j = parseInt(String(jahr || '').slice(0, 4), 10);
    return {
      id, titel, regie: leerWert(regie), jahr: leerWert(jahr), info: info || {},
      laender: [...new Set(laender)],
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
    ansicht: 'programm', tag: HEUTE, gruppe: 'film',
    sort: { feld: 'naechster', auf: true }, nurKommend: true,
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
    return [f.regie, f.laender.join(', '), f.jahr].filter(Boolean).map(esc).join(' · ') || 'Keine Angaben';
  }
  const filmLink = (f) => `<button class="film-link" data-film="${f.id}">${esc(f.titel)}</button>`;
  function plakat(f, groesse = '') {
    const bild = f.info.poster ? `<img src="${esc(f.info.poster)}" alt="" loading="lazy">` : '';
    return `<div class="plakat ${groesse}" aria-hidden="true">${bild}<span class="pt">${esc(f.titel)}</span><span class="pj">${esc(f.jahr || '')}</span></div>`;
  }
  const wertung = (f) => (f.info.bewertung ? `<span class="abzeichen wertung" title="Bewertung">★ ${esc(f.info.bewertung)}</span>` : '');

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
    const ordnung = (a, b) => a.letzter.localeCompare(b.letzter) || a.f.titel.localeCompare(b.f.titel, 'de');
    return { sicher: sicher.sort(ordnung), offen: offen.sort(ordnung) };
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

  // ---------- Ansicht Programm ----------
  function zeigeProgramm(daten) {
    const proTag = new Map();
    daten.forEach((t) => { if (!proTag.has(t.d)) proTag.set(t.d, new Set()); proTag.get(t.d).add(t.f); });
    const chanceIds = new Set(letzteChance(daten).sicher.map((e) => e.f.id));

    const knoepfe = Array.from({ length: 8 }, (_, i) => plusTage(HEUTE, i)).map((d, i) => {
      const n = proTag.get(d)?.size || 0;
      const oben = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : fmtWt.format(parse(d));
      return `<button class="tag" data-tag="${d}" aria-pressed="${d === zustand.tag}"><small>${oben} · ${datumKurz(d)}</small><b>${n} ${n === 1 ? 'Film' : 'Filme'}</b></button>`;
    }).join('');

    const amTag = daten.filter((t) => t.d === zustand.tag);
    let inhalt;
    if (!amTag.length) {
      inhalt = `<p class="leer">Für ${datum(zustand.tag)} sind keine Vorstellungen eingetragen.<br>Viele Kinos veröffentlichen ihr Programm erst kurzfristig.</p>`;
    } else if (zustand.gruppe === 'film') {
      const nachFilm = new Map();
      amTag.forEach((t) => { if (!nachFilm.has(t.f)) nachFilm.set(t.f, new Set()); nachFilm.get(t.f).add(t.k); });
      const liste = [...nachFilm].sort((a, b) => b[1].size - a[1].size || filme[a[0]].titel.localeCompare(filme[b[0]].titel, 'de'));
      inhalt = `<div class="karten">${liste.map(([fid, ks]) => {
        const f = filme[fid];
        const chips = [...ks].map((k) => kinos[k].name).sort().map((n) => `<span class="chip">${esc(n)}</span>`).join('');
        const badge = chanceIds.has(fid) ? '<span class="abzeichen chance">Letzte Chance</span>' : '';
        return `<article class="filmkarte">${plakat(f)}<div>${filmLink(f)}${badge}${wertung(f)}<div class="meta">${filmMeta(f)}</div><div class="chips">${chips}</div></div></article>`;
      }).join('')}</div>`;
    } else {
      const nachKino = new Map();
      amTag.forEach((t) => { if (!nachKino.has(t.k)) nachKino.set(t.k, new Set()); nachKino.get(t.k).add(t.f); });
      const liste = [...nachKino].sort((a, b) => kinos[a[0]].name.localeCompare(kinos[b[0]].name, 'de'));
      inhalt = `<div class="karten">${liste.map(([kid, fs]) => {
        const k = kinos[kid];
        const zeilen = [...fs].map((f) => filme[f]).sort((a, b) => a.titel.localeCompare(b.titel, 'de'))
          .map((f) => `<li>${plakat(f, 'mini')}<div>${filmLink(f)}${chanceIds.has(f.id) ? '<span class="abzeichen chance">Letzte Chance</span>' : ''}<div class="meta">${filmMeta(f)}</div></div></li>`).join('');
        return `<article class="kinoblock"><h3><span class="monogramm klein">${esc(k.mono)}</span>${esc(k.name)}</h3><div class="meta">${fs.size} ${fs.size === 1 ? 'Film' : 'Filme'}</div><ul>${zeilen}</ul></article>`;
      }).join('')}</div>`;
    }

    $('#v-programm').innerHTML = `
      <div class="tage">${knoepfe}
        <label class="tag-wahl">Anderer Tag<input type="date" id="tag-wahl" value="${zustand.tag}" min="${ERSTER}" max="${LETZTER}"></label>
      </div>
      <div class="ansicht-kopf">
        <h2>${fmtVoll.format(parse(zustand.tag))}</h2>
        <div class="umschalter" role="group" aria-label="Gruppierung">
          <button data-gruppe="film" aria-pressed="${zustand.gruppe === 'film'}">Nach Film</button>
          <button data-gruppe="kino" aria-pressed="${zustand.gruppe === 'kino'}">Nach Kino</button>
        </div>
      </div>
      ${inhalt}`;
  }

  // ---------- Ansicht Letzte Chance ----------
  function chanceZeile(e) {
    const wann = e.rest === 0 ? 'heute' : e.rest === 1 ? 'morgen' : fmtVoll.format(parse(e.letzter));
    const wo = e.kinos.map((k) => esc(k.name)).join(', ');
    const zaehler = e.rest === 0 ? '<b>Heute</b><span>letzter Tag</span>' : `<b>${e.rest}</b><span>${e.rest === 1 ? 'Tag' : 'Tage'} übrig</span>`;
    return `<article class="chance-zeile">${plakat(e.f)}<div class="text">${filmLink(e.f)}${wertung(e.f)}<div class="meta">${filmMeta(e.f)}</div><div class="zuletzt">Zum letzten Mal ${wann} im ${wo}</div></div><div class="countdown">${zaehler}</div></article>`;
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
    { feld: 'regie', titel: 'Regie', wert: (s) => (s.f.regie || '￿').toLocaleLowerCase('de') },
    { feld: 'land', titel: 'Land', wert: (s) => (s.f.laender[0] || '￿').toLocaleLowerCase('de') },
    { feld: 'jahr', titel: 'Jahr', wert: (s) => s.f.jahr || '0000', zahl: true },
    { feld: 'kinos', titel: 'Kinos', wert: (s) => s.nKinos, zahl: true },
    { feld: 'tage', titel: 'Spieltage', wert: (s) => s.nTage, zahl: true },
    { feld: 'naechster', titel: 'Nächster Tag', wert: (s) => s.naechster || '9999' },
    { feld: 'letzter', titel: 'Letzter Tag', wert: (s) => s.letzter },
  ];

  function zeigeFilme(daten) {
    let liste = filmStatistik(daten);
    if (zustand.nurKommend) liste = liste.filter((s) => s.naechster);
    const sp = SPALTEN.find((s) => s.feld === zustand.sort.feld);
    liste.sort((a, b) => {
      const x = sp.wert(a), y = sp.wert(b);
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'de');
      return (zustand.sort.auf ? r : -r) || a.f.titel.localeCompare(b.f.titel, 'de');
    });

    const kopf = SPALTEN.map((s) => {
      const aktiv = s.feld === zustand.sort.feld;
      const r = aktiv ? ` data-richtung="${zustand.sort.auf ? 'auf' : 'ab'}"` : '';
      return `<th class="${s.zahl ? 'zahl' : ''}" aria-sort="${aktiv ? (zustand.sort.auf ? 'ascending' : 'descending') : 'none'}"><button data-sort="${s.feld}"${r}>${s.titel}</button></th>`;
    }).join('') + '<th>Status</th>';

    const zeilen = liste.map((s) => `<tr>
      <td class="umbruch"><div class="titelzelle">${plakat(s.f, 'mini')}<div>${filmLink(s.f)}${wertung(s.f)}</div></div></td>
      <td class="umbruch">${esc(s.f.regie || '–')}</td>
      <td class="umbruch schmal">${esc(s.f.laender.join(', ') || '–')}</td>
      <td class="zahl">${esc(s.f.jahr || '–')}</td>
      <td class="zahl">${s.nKinos}</td>
      <td class="zahl">${s.nTage}</td>
      <td>${s.naechster ? datumKurz(s.naechster) : '–'}</td>
      <td>${datumKurz(s.letzter)}</td>
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
    return `<div class="balkenliste">${eintraege.map(([name, n]) => `<button class="balkenzeile" data-setze="${filterArt}" data-wert="${esc(name)}" title="Nach ${esc(name)} filtern">
      <span>${esc(name)}</span><span class="bahn"><i style="width:${(n / max) * 100}%"></i></span><span class="wert">${n}</span></button>`).join('')}</div>`;
  }

  function zeigeStatistik(daten) {
    const reihe = tagesreihe(daten);
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
      <div class="tafel diagramm" id="diagramm">
        <h3>Verschiedene Filme pro Tag</h3>
        <p class="hinweis">Ein Film in mehreren Kinos zählt an einem Tag nur einmal. Tage auf 0 sind meist Lücken in der Datenerfassung. Ein Klick auf einen Tag öffnet das Programm.</p>
        <div id="diagramm-flaeche"></div>
        <div class="tooltip" id="tooltip" hidden></div>
      </div>
      <div class="raster-2">
        <div class="tafel"><h3>Nach Jahrzehnt</h3><p class="hinweis">Filme mit kommenden Terminen nach Produktionsjahr. Ein Klick filtert.</p>${jahrzehnte.length ? balken(jahrzehnte, 'jahrzehnt') : '<p class="leer">Keine Daten.</p>'}</div>
        <div class="tafel"><h3>Nach Land</h3><p class="hinweis">Die zwölf häufigsten Produktionsländer. Koproduktionen zählen für jedes Land.</p>${laender.length ? balken(laender, 'land') : '<p class="leer">Keine Daten.</p>'}</div>
      </div>
      <details><summary>Verlauf als Tabelle anzeigen (pro Monat)</summary>${monatsTabelle(reihe)}</details>`;
    zeichneLinie(reihe);
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

  function zeichneLinie(reihe) {
    const flaeche = $('#diagramm-flaeche');
    if (!flaeche) return;
    const B = Math.max(flaeche.clientWidth, 280), H = B < 500 ? 220 : 300;
    const r = { l: 34, o: 20, u: 26, re: 8 };
    const max = Math.max(1, ...reihe.map((p) => p.n));
    const st = schritt(max), yMax = Math.ceil(max / st) * st;
    const x = (i) => r.l + (i / Math.max(1, reihe.length - 1)) * (B - r.l - r.re);
    const y = (n) => r.o + (1 - n / yMax) * (H - r.o - r.u);

    let gitter = '', ticksY = '';
    for (let v = 0; v <= yMax; v += st) {
      gitter += `<line x1="${r.l}" x2="${B - r.re}" y1="${y(v)}" y2="${y(v)}"/>`;
      ticksY += `<text x="${r.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    let ticksX = '';
    reihe.forEach((p, i) => {
      if (p.d.endsWith('-01') && !(B < 500 && Number(p.d.slice(5, 7)) % 2 === 0)) {
        ticksX += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fmtMonat.format(parse(p.d))}</text>`;
      }
    });
    const pfad = reihe.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join('');
    const flaechePfad = `${pfad}L${x(reihe.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    const hi = reihe.findIndex((p) => p.d === HEUTE);
    const heute = hi >= 0 ? `<g class="heute"><line x1="${x(hi)}" x2="${x(hi)}" y1="${r.o - 6}" y2="${y(0)}"/><text x="${x(hi) + 5}" y="${r.o + 4}">Heute</text></g>` : '';

    flaeche.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Liniendiagramm: verschiedene Filme pro Tag von ${datum(ERSTER)} bis ${datum(LETZTER)}">
      <defs><linearGradient id="goldverlauf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c9a24a" stop-opacity=".28"/><stop offset="1" stop-color="#c9a24a" stop-opacity="0"/></linearGradient></defs>
      <g class="gitter">${gitter}</g>
      <path class="flaeche" d="${flaechePfad}"/>
      <path class="linie" d="${pfad}"/>
      <line class="basis" x1="${r.l}" x2="${B - r.re}" y1="${y(0)}" y2="${y(0)}"/>
      <g class="achse">${ticksY}${ticksX}</g>
      ${heute}
      <g class="fadenkreuz" id="fk" visibility="hidden"><line id="fk-l" y1="${r.o}" y2="${y(0)}"/><circle id="fk-p" r="4.5"/></g>
      <rect id="treffer" x="${r.l}" y="0" width="${B - r.l - r.re}" height="${H}" fill="transparent" style="cursor:crosshair"/>
    </svg>`;

    const svg = flaeche.querySelector('svg');
    const tip = $('#tooltip');
    const index = (ev) => {
      const pt = svg.getBoundingClientRect();
      const px = ((ev.clientX - pt.left) / pt.width) * B;
      return Math.max(0, Math.min(reihe.length - 1, Math.round(((px - r.l) / (B - r.l - r.re)) * (reihe.length - 1))));
    };
    const treffer = $('#treffer');
    treffer.addEventListener('pointermove', (ev) => {
      const i = index(ev), p = reihe[i];
      $('#fk').setAttribute('visibility', 'visible');
      $('#fk-l').setAttribute('x1', x(i)); $('#fk-l').setAttribute('x2', x(i));
      $('#fk-p').setAttribute('cx', x(i)); $('#fk-p').setAttribute('cy', y(p.n));
      // SVG-Elemente kennen kein offsetLeft, daher Lage relativ zum Diagrammrahmen berechnen
      const sr = svg.getBoundingClientRect(), dr = $('#diagramm').getBoundingClientRect();
      const skala = sr.width / B;
      tip.hidden = false;
      tip.innerHTML = `${datum(p.d)}<br><b>${p.n}</b> ${p.n === 1 ? 'Film' : 'Filme'}`;
      const links = Math.max(70, Math.min(sr.width - 70, x(i) * skala));
      tip.style.left = `${links + sr.left - dr.left}px`;
      tip.style.top = `${y(p.n) * skala + sr.top - dr.top - 10}px`;
    });
    treffer.addEventListener('pointerleave', () => { $('#fk').setAttribute('visibility', 'hidden'); tip.hidden = true; });
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
        <h3>Kinos und Marken</h3>
        <p>Die Namen der Kinos gehören den jeweiligen Betreibern. Diese Seite steht in keiner Verbindung zu den Kinos.</p>
        <h3>Datenschutz</h3>
        <p>Diese Seite setzt keine Cookies und verwendet kein Tracking. Sie wird über GitHub Pages bereitgestellt, einen Dienst der GitHub Inc. (USA). Beim Aufruf verarbeitet GitHub technisch notwendige Zugriffsdaten wie die IP-Adresse, um die Seite auszuliefern und vor Missbrauch zu schützen. Näheres steht in der <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">Datenschutzerklärung von GitHub</a>.</p>
        <p>Schriftarten werden direkt von dieser Seite geladen. Es werden dabei keine Daten an Dritte wie Google übertragen. Links zu den Kinos führen auf deren eigene Seiten, für die deren Datenschutzbestimmungen gelten.</p>
        <p class="meta">Rot markierte Stellen sind Platzhalter und müssen vor der Veröffentlichung ersetzt werden.</p>
      </div>`;
  }

  // ---------- Filmdetails ----------
  function zeigeFilm(fid) {
    const f = filme[fid];
    const nachKino = new Map();
    termine.filter((t) => t.f === fid).forEach((t) => { if (!nachKino.has(t.k)) nachKino.set(t.k, []); nachKino.get(t.k).push(t.d); });
    const gruppen = [...nachKino].sort((a, b) => kinos[a[0]].name.localeCompare(kinos[b[0]].name, 'de')).map(([k, ds]) => {
      ds.sort();
      const chips = ds.map((d) => `<span class="chip ${d >= HEUTE ? 'kommend' : 'vorbei'}" title="${datum(d)}">${datumKurz(d)}</span>`).join('');
      return `<div class="termin-gruppe"><h4>${esc(kinos[k].name)} <span class="meta">· ${ds.length} ${ds.length === 1 ? 'Tag' : 'Tage'}</span></h4><div class="chips">${chips}</div></div>`;
    }).join('');
    const imdb = f.info.imdb ? `<p><a href="https://www.imdb.com/title/${esc(f.info.imdb)}/" target="_blank" rel="noopener">Auf IMDb ansehen ↗</a></p>` : '';
    $('#fd-inhalt').innerHTML = `<div class="dialog-kopf">${plakat(f, 'gross')}<div><h2 id="fd-titel">${esc(f.titel)}</h2>${wertung(f)}<div class="meta">${filmMeta(f)}</div>${imdb}<p class="meta">Gold markiert kommende Tage, grau vergangene.</p></div></div>${gruppen}`;
    $('#film-dialog').showModal();
  }

  // ---------- Steuerung ----------
  const ANSICHTEN = { programm: zeigeProgramm, chance: zeigeChance, kalender: zeigeKalender, filme: zeigeFilme, statistik: zeigeStatistik, kinos: zeigeKinos, impressum: zeigeImpressum };

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
    if ((el = ziel('[data-film]'))) return zeigeFilm(Number(el.dataset.film));
    if ((el = ziel('[data-tag]'))) { zustand.tag = el.dataset.tag; return zeichne(); }
    if ((el = ziel('[data-tag-sprung]'))) { zustand.tag = el.dataset.tagSprung; return wechsleAnsicht('programm'); }
    if ((el = ziel('[data-gruppe]'))) { zustand.gruppe = el.dataset.gruppe; return zeichne(); }
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
  });
  $('#film-dialog').addEventListener('click', (e) => { if (e.target.id === 'film-dialog') e.target.close(); });
  $('#fuss').addEventListener('click', (e) => { if (e.target.closest('[data-impressum]')) { wechsleAnsicht('impressum'); scrollTo(0, 0); } });

  let warte;
  window.addEventListener('resize', () => {
    clearTimeout(warte);
    warte = setTimeout(() => { if (zustand.ansicht === 'statistik') zeichne(); }, 150);
  });

  $('#fuss').innerHTML = `<p>Datenstand ${datum(D.stand)} · ${zahl(termine.length)} Einträge von ${datum(ERSTER)} bis ${datum(LETZTER)}. Angaben ohne Gewähr, verbindlich sind die Programme der Kinos.</p><button data-impressum>Impressum und Datenschutz</button>`;

  fuelleAuswahl();
  zeigeKopf();
  const start = location.hash.slice(1);
  wechsleAnsicht(ANSICHTEN[start] ? start : 'programm');
})();
