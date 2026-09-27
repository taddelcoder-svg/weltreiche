'use strict';
// Weltreiche – Spiellogik ohne Grafik. Läuft im Browser (Solo) und später auch auf dem Server (Online).
// Alles ist in einem einfachen Zustands-Objekt z gespeichert; schritt(z, dt) rechnet die Zeit weiter.
(function(wurzel){

const REICHE = [
  { id:'roemer', name:'Römer', zeichen:'🦅', farbe:'#c0392b', passiv:'Legionen: Verteidigung +15 %', bonus:{ vert:1.15 },
    faehigkeit:{ name:'Schildkröte', ziel:null, dauer:10, text:'10 Sek. lang sind deine Trupps vor Türmen geschützt und kämpfen 30 % stärker.' } },
  { id:'aegypter', name:'Ägypter', zeichen:'☥', farbe:'#d8a31a', passiv:'Nil-Ernten: Ausbildung +10 %', bonus:{ prod:1.1 },
    faehigkeit:{ name:'Segen des Ra', ziel:'eigene', dauer:10, text:'Eine eigene Stadt bildet 10 Sek. lang doppelt so schnell aus.' } },
  { id:'wikinger', name:'Wikinger', zeichen:'⚓', farbe:'#2f6fb8', passiv:'Berserker: Angriff +15 %', bonus:{ angr:1.15 },
    faehigkeit:{ name:'Raubzug', ziel:'fremde', text:'Eine fremde Stadt verliert sofort die Hälfte ihrer Verteidiger (höchstens 30).' } },
  { id:'mongolen', name:'Mongolen', zeichen:'🏹', farbe:'#16a08c', passiv:'Reiterei: Truppen 35 % schneller', bonus:{ tempo:1.35 },
    faehigkeit:{ name:'Pfeilhagel', ziel:'punkt', radius:6, text:'Feindliche Trupps im Zielgebiet verlieren 60 %, fremde Städte dort 20 %.' } },
  { id:'chinesen', name:'Chinesen', zeichen:'龍', farbe:'#e2742a', passiv:'Baumeister: Bauen 40 % billiger, Ausbildung +5 %', bonus:{ bau:0.6, prod:1.05 },
    faehigkeit:{ name:'Große Mauer', ziel:'weg', dauer:15, text:'Eine Straße ist 15 Sek. lang gesperrt. Wachen auf der Mauer beschießen wartende Feinde.' } },
  { id:'griechen', name:'Griechen', zeichen:'Ω', farbe:'#7d56c9', passiv:'Stadtstaaten: 30 % mehr Platz, Verteidigung +15 %', bonus:{ platz:1.3, vert:1.15 },
    faehigkeit:{ name:'Thermopylen', ziel:'eigene', dauer:10, text:'Eine eigene Stadt ist 10 Sek. lang unbesiegbar.' } }
];
const REICH = Object.fromEntries(REICHE.map(r => [r.id, r]));

const NEUTRAL = -1;
const PLATZ = [0, 30, 50, 80];          // Höchstzahl an Truppen je Stufe
const PROD = [0, 0.7, 1.0, 1.35];       // neue Truppen pro Sekunde je Stufe
const AUSBAU = [0, 15, 30];             // Kosten von Stufe s auf s+1
// Sondergebäude: entstehen durch Umbau einer Stadt
const GEBAEUDE = {
  turm:     { name:'Turm',     kosten:15, platz:30, vert:1.5,  prod:0,   text:'Schießt auf Feinde in der Nähe, verteidigt 1,5-fach' },
  schmiede: { name:'Schmiede', kosten:20, platz:30, vert:1,    prod:0,   text:'Alle deine Truppen kämpfen 15 % stärker (bis zu 3 Schmieden)' },
  kaserne:  { name:'Kaserne',  kosten:15, platz:40, vert:0.75, prod:1.5, text:'Bildet doppelt so schnell aus, verteidigt aber schwach' }
};
const TURM = { radius:7.5, takt:0.6 };
const SCHMIEDE_BONUS = 0.15, SCHMIEDE_MAX = 3;
const ENERGIE = { start:25, proSek:100 / 70, proEroberung:12 };
const TEMPO = 2.4;                       // Marschtempo in Einheiten pro Sekunde
const ABBAU = 1;                         // überfüllte Städte verlieren so viele Truppen pro Sekunde

const BOT = [
  { name:'Leicht', takt:3.2, marge:1.4,  ausbau:0.3, turm:false, gruppen:1, jagd:0,   schmieden:0, kasernen:0, faehigkeit:0.3 },
  { name:'Mittel', takt:2.0, marge:1.2,  ausbau:0.6, turm:false, gruppen:2, jagd:0.2, schmieden:1, kasernen:1, faehigkeit:0.7 },
  { name:'Schwer', takt:1.1, marge:1.08, ausbau:0.9, turm:true,  gruppen:3, jagd:0.4, schmieden:2, kasernen:2, faehigkeit:1 }
];

/* ---------- Karten ---------- */
// Ein Abschnitt wird gebaut und n-mal um die Mitte gedreht, damit alle Startplätze gleich gut sind.
// abschnitt: [x, z, truppen] – der erste ist der Startplatz. wege: Paare im Abschnitt
// (negative Zahlen = Städte in der Mitte, -1 = erste). quer: [a, b] verbindet a im Abschnitt k mit b im Abschnitt k+1.
function symKarte(id, name, n, mitte, abschnitt, wege, quer, form){
  const staedte = mitte.map(([x, z, t]) => ({ x, z, truppen:t }));
  const m = staedte.length, h = abschnitt.length;
  for (let k = 0; k < n; k++){
    const w = k * Math.PI * 2 / n, c = Math.cos(w), s = Math.sin(w);
    for (const [x, z, t] of abschnitt) staedte.push({ x:+(x * c - z * s).toFixed(2), z:+(x * s + z * c).toFixed(2), truppen:t });
  }
  const idx = (a, k) => (a < 0 ? -a - 1 : m + (a - 1) + (k % n) * h);
  const liste = [];
  for (let k = 0; k < n; k++){
    for (const [a, b] of wege) liste.push([idx(a, k), idx(b, k)]);
    for (const [a, b] of quer || []) liste.push([idx(a, k), idx(b, k + 1)]);
  }
  // doppelte Straßen (Mitte bei n = 1) entfernen
  const gesehen = new Set(), eindeutig = [];
  for (const [a, b] of liste){ const s = a < b ? `${a}-${b}` : `${b}-${a}`; if (a !== b && !gesehen.has(s)){ gesehen.add(s); eindeutig.push([a, b]); } }
  const starts = [];
  for (let k = 0; k < n; k++) starts.push(idx(1, k));
  return { id, name, staedte, wege:eindeutig, starts, form };
}
const polar = (grad, r, t) => [+(Math.cos(grad * Math.PI / 180) * r).toFixed(2), +(Math.sin(grad * Math.PI / 180) * r).toFixed(2), t];

const KARTEN = [
  symKarte('mittelinsel', 'Mittelinsel', 2,
    [[0, 0, 20]],
    [[-24, 10, 0], [-16, 15, 8], [-18, 2, 10], [-8, 9, 12], [-10, -4, 15], [-26, -7, 6], [-2, 17, 14]],
    [[1, 2], [1, 3], [1, 6], [2, 4], [3, 4], [3, 5], [3, 6], [4, 7], [4, -1], [5, -1], [6, 5]],
    [[7, 5]],
    { rx:40, rz:28 }),
  symKarte('flussland', 'Flussland', 2,
    [[0, 0, 25]],
    [[-30, 5, 0], [-22, 14, 8], [-23, -7, 10], [-14, 2, 12], [-11, 16, 10], [-12, -14, 14], [-5, 8, 16], [-5, -9, 12]],
    [[1, 2], [1, 3], [1, 4], [2, 5], [3, 4], [3, 6], [4, 7], [4, 8], [5, 7], [6, 8], [4, -1]],
    [[7, 8]],
    { rx:43, rz:27, fluss:true }),
  symKarte('dreilaendereck', 'Dreiländereck', 3,
    [[0, 0, 25]],
    [polar(90, 29, 0), polar(68, 21, 8), polar(112, 21, 8), polar(90, 13, 12), polar(150, 25, 14), polar(150, 12, 16)],
    [[1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 6], [5, 6], [6, -1]],
    [[5, 2], [6, 4]],
    { rx:38, rz:38, rund:true }),
  symKarte('vierwinde', 'Vier Winde', 4,
    [[0, 0, 30]],
    [polar(90, 31, 0), polar(70, 23, 8), polar(110, 23, 8), polar(90, 16, 12), polar(135, 27, 14), polar(135, 12, 16)],
    [[1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 6], [5, 6], [6, -1]],
    [[5, 2], [6, 4]],
    { rx:41, rz:41, rund:true })
];
const KARTE = Object.fromEntries(KARTEN.map(k => [k.id, k]));

/* ---------- Hilfen ---------- */
function zufall(z){ // mulberry32, damit ein Spiel mit gleichem Startwert gleich abläuft
  let t = (z.rng = (z.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Feinde sind alle, die nicht im selben Team sind; Neutrale sind für alle Feinde.
function istFeind(z, a, b){
  if (a === b) return false;
  if (a < 0 || b < 0) return true;
  return z.spieler[a].team !== z.spieler[b].team;
}
function effekt(z, typ, pruef){ return z.effekte.find(e => e.typ === typ && pruef(e)); }
function bonus(z, sp, art){
  if (sp < 0 || !z.spieler[sp]) return 1;
  const r = REICH[z.spieler[sp].reich];
  let b = (r && r.bonus[art]) || 1;
  if (art === 'angr' || art === 'vert') b *= 1 + SCHMIEDE_BONUS * Math.min(SCHMIEDE_MAX, z.schmieden[sp] || 0);
  return b;
}
function zugAngr(z, zug){
  return bonus(z, zug.besitzer, 'angr') * (effekt(z, 'schildkroete', e => e.sp === zug.besitzer) ? 1.3 : 1);
}
function abstand(z, a, b){ const A = z.staedte[a], B = z.staedte[b]; return Math.hypot(B.x - A.x, B.z - A.z); }
function platzVon(z, s){
  const grund = s.typ === 'stadt' ? PLATZ[s.stufe] : GEBAEUDE[s.typ].platz;
  return Math.round(grund * bonus(z, s.besitzer, 'platz'));
}
function segen(z, s){ return !!effekt(z, 'segen', e => e.stadt === s.id && e.sp === s.besitzer); }
function prodVon(z, s){
  if (s.besitzer < 0) return 0;
  const grund = s.typ === 'stadt' ? PROD[s.stufe] : GEBAEUDE[s.typ].prod;
  return grund * bonus(z, s.besitzer, 'prod') * (segen(z, s) ? 2 : 1);
}
function vertFaktor(z, s){ return (s.typ === 'stadt' ? 1 : GEBAEUDE[s.typ].vert) * bonus(z, s.besitzer, 'vert'); }
function geschuetzt(z, s){ return !!effekt(z, 'schutz', e => e.stadt === s.id && e.sp === s.besitzer); }
function ausbauKosten(z, s){ return s.typ !== 'stadt' || s.stufe >= 3 ? Infinity : Math.round(AUSBAU[s.stufe] * bonus(z, s.besitzer, 'bau')); }
function umbauKosten(z, s, typ){ return s.typ !== 'stadt' || !GEBAEUDE[typ] ? Infinity : Math.round(GEBAEUDE[typ].kosten * bonus(z, s.besitzer, 'bau')); }
function schmiedenZaehlen(z){
  z.schmieden = z.spieler.map(() => 0);
  for (const s of z.staedte) if (s.typ === 'schmiede' && s.besitzer >= 0) z.schmieden[s.besitzer]++;
}

/* ---------- Neues Spiel ---------- */
// opt = { karte, seed, spieler:[{ reich, name, bot }] }  (bot = null für Menschen, sonst 0..2)
function neuesSpiel(opt){
  const k = KARTE[opt.karte] || KARTEN[0];
  const n = k.starts.length, p = Math.min(opt.spieler.length, n);
  const z = {
    karte:k.id, form:k.form, zeit:0, ende:null, rng:(opt.seed >>> 0) || 1, naechsteId:1,
    staedte:k.staedte.map((s, i) => ({ id:i, x:s.x, z:s.z, besitzer:NEUTRAL, truppen:s.truppen, stufe:1, typ:'stadt', uhr:0 })),
    wege:k.wege.map(w => w.slice()), nachbarn:[], zuege:[], ereignisse:[], effekte:[], spieler:[], schmieden:[]
  };
  z.nachbarn = z.staedte.map(() => []);
  for (const [a, b] of z.wege){ z.nachbarn[a].push(b); z.nachbarn[b].push(a); }
  for (const i of k.starts) z.staedte[i].truppen = 20;        // freie Startplätze bleiben neutral
  for (let i = 0; i < p; i++){
    const sp = opt.spieler[i];
    z.spieler.push({
      reich:REICH[sp.reich] ? sp.reich : REICHE[i].id, name:sp.name || REICH[sp.reich]?.name || 'Spieler',
      bot:sp.bot ?? null, team:Number.isInteger(sp.team) ? sp.team : i, botUhr:1.5 + i * 0.7, botRuhe:0, raus:false, energie:ENERGIE.start,
      stats:{ erobert:0, verloren:0, ausgebildet:0, gesendet:0, faehigkeiten:0 }
    });
    const st = z.staedte[k.starts[Math.round(i * n / p) % n]];
    st.besitzer = i; st.truppen = 20;
  }
  schmiedenZaehlen(z);
  return z;
}

/* ---------- Wege finden ---------- */
// Kürzester Weg über Straßen. Unterwegs darf man nur durch eigene und verbündete Städte laufen;
// geht das nicht, wird (außer bei nurEigene) der kürzeste Weg genommen und an der ersten fremden Stadt gekämpft.
function route(z, sp, von, ziel, frei, nurEigene){
  const n = z.staedte.length, d = new Array(n).fill(Infinity), vor = new Array(n).fill(-1), fertig = new Array(n).fill(false);
  d[von] = 0;
  for (;;){
    let u = -1;
    for (let i = 0; i < n; i++) if (!fertig[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || u === ziel) break;
    fertig[u] = true;
    if (u !== von && !frei && istFeind(z, sp, z.staedte[u].besitzer)) continue;
    for (const v of z.nachbarn[u]){
      const nd = d[u] + abstand(z, u, v);
      if (nd < d[v]){ d[v] = nd; vor[v] = u; }
    }
  }
  if (d[ziel] === Infinity) return frei || nurEigene ? null : route(z, sp, von, ziel, true);
  const pfad = [ziel];
  while (pfad[0] !== von) pfad.unshift(vor[pfad[0]]);
  return pfad;
}
function pfadLaenge(z, pfad){ let l = 0; for (let k = 1; k < pfad.length; k++) l += abstand(z, pfad[k - 1], pfad[k]); return l; }

/* ---------- Befehle ---------- */
const ganzeZahl = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
function darfHandeln(z, sp){ return !z.ende && z.spieler[sp] && !z.spieler[sp].raus; }

function schicken(z, sp, von, ziel, anzahl){
  if (!ganzeZahl(von, z.staedte.length) || !ganzeZahl(ziel, z.staedte.length)) return 0;
  const s = z.staedte[von];
  if (s.besitzer !== sp || von === ziel) return 0;
  const n = Math.min(Math.floor(s.truppen), Math.floor(anzahl));
  if (n < 1) return 0;
  const pfad = route(z, sp, von, ziel);
  if (!pfad) return 0;
  s.truppen -= n;
  z.zuege.push({ id:z.naechsteId++, besitzer:sp, anzahl:n, pfad, i:0, d:0 });
  z.spieler[sp].stats.gesendet += n;
  return n;
}
// Schickt aus mehreren eigenen Städten einen Anteil (0..1) der Truppen los.
function senden(z, sp, vonListe, ziel, anteil){
  if (!darfHandeln(z, sp)) return 0;
  let summe = 0;
  for (const von of new Set(vonListe)){
    const s = z.staedte[von];
    if (!s) continue;
    summe += schicken(z, sp, von, ziel, anteil >= 1 ? s.truppen : s.truppen * anteil);
  }
  if (summe) z.ereignisse.push({ typ:'senden', sp, anzahl:summe, ziel });
  return summe;
}
function ausbauen(z, sp, id){
  const s = z.staedte[id];
  if (!darfHandeln(z, sp) || !s || s.besitzer !== sp) return false;
  const k = ausbauKosten(z, s);
  if (s.truppen < k) return false;
  s.truppen -= k; s.stufe++;
  z.ereignisse.push({ typ:'ausbau', stadt:id, sp });
  return true;
}
function umbauen(z, sp, id, typ){
  const s = z.staedte[id];
  if (!darfHandeln(z, sp) || !s || s.besitzer !== sp) return false;
  const k = umbauKosten(z, s, typ);
  if (s.truppen < k) return false;
  s.truppen -= k; s.typ = typ; s.uhr = 0;
  schmiedenZaehlen(z);
  z.ereignisse.push({ typ:'ausbau', stadt:id, sp });
  return true;
}
const turmBauen = (z, sp, id) => umbauen(z, sp, id, 'turm');

function faehigkeitNutzen(z, sp, ziel = {}){
  if (!darfHandeln(z, sp)) return false;
  const S = z.spieler[sp];
  if (S.energie < 100) return false;
  const f = REICH[S.reich].faehigkeit, bis = z.zeit + (f.dauer || 0);
  const stadt = ganzeZahl(ziel.stadt, z.staedte.length) ? z.staedte[ziel.stadt] : null;
  const ereignis = { typ:'faehigkeit', sp, reich:S.reich };
  switch (S.reich){
    case 'roemer':
      z.effekte.push({ id:z.naechsteId++, typ:'schildkroete', sp, bis });
      break;
    case 'aegypter':
    case 'griechen':
      if (!stadt || stadt.besitzer !== sp) return false;
      z.effekte.push({ id:z.naechsteId++, typ:S.reich === 'aegypter' ? 'segen' : 'schutz', sp, stadt:stadt.id, bis });
      ereignis.stadt = stadt.id;
      break;
    case 'wikinger': {
      if (!stadt || !istFeind(z, sp, stadt.besitzer)) return false;
      const weg = Math.min(30, stadt.truppen * 0.5);
      stadt.truppen -= weg;
      Object.assign(ereignis, { stadt:stadt.id, menge:Math.round(weg) });
      break;
    }
    case 'mongolen': {
      const x = Number(ziel.x), zz = Number(ziel.z), r = f.radius;
      if (!isFinite(x) || !isFinite(zz) || Math.abs(x) > 60 || Math.abs(zz) > 60) return false;
      for (const zug of z.zuege){
        if (!istFeind(z, sp, zug.besitzer)) continue;
        const p = zugPos(z, zug);
        if (Math.hypot(p.x - x, p.z - zz) < r) zug.anzahl *= 0.4;
      }
      for (const s of z.staedte) if (istFeind(z, sp, s.besitzer) && Math.hypot(s.x - x, s.z - zz) < r) s.truppen *= 0.8;
      z.zuege = z.zuege.filter(zug => zug.anzahl >= 0.5);
      Object.assign(ereignis, { x, z:zz });
      break;
    }
    case 'chinesen': {
      if (!ganzeZahl(ziel.weg, z.wege.length)) return false;
      const [a, b] = z.wege[ziel.weg];
      z.effekte.push({ id:z.naechsteId++, typ:'mauer', sp, weg:[a, b], bis });
      ereignis.weg = ziel.weg;
      break;
    }
    default: return false;
  }
  S.energie = 0; S.stats.faehigkeiten++;
  z.ereignisse.push(ereignis);
  return true;
}

function aufgeben(z, sp){
  if (!z.spieler[sp] || z.spieler[sp].raus) return;
  for (const s of z.staedte) if (s.besitzer === sp) s.besitzer = NEUTRAL;
  for (const zug of z.zuege) if (zug.besitzer === sp) zug.anzahl = 0;
  z.zuege = z.zuege.filter(zug => zug.anzahl > 0);
  schmiedenZaehlen(z);
  pruefeEnde(z);
}

/* ---------- Ablauf ---------- */
function zugPos(z, zug){
  const a = z.staedte[zug.pfad[zug.i]], b = z.staedte[zug.pfad[Math.min(zug.i + 1, zug.pfad.length - 1)]];
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1, t = Math.min(1, zug.d / len);
  return { x:a.x + (b.x - a.x) * t, z:a.z + (b.z - a.z) * t, rx:(b.x - a.x) / len, rz:(b.z - a.z) / len };
}
// Die Stadt, an der ein Zug stehen bleibt (erste feindliche Stadt oder das Ziel)
function stopStadt(z, zug){
  for (let k = zug.i + 1; k < zug.pfad.length; k++){
    const id = zug.pfad[k];
    if (k === zug.pfad.length - 1 || istFeind(z, zug.besitzer, z.staedte[id].besitzer)) return id;
  }
  return zug.pfad[zug.pfad.length - 1];
}
function mauerAuf(z, sp, a, b){
  return z.effekte.some(e => e.typ === 'mauer' && istFeind(z, e.sp, sp) && ((e.weg[0] === a && e.weg[1] === b) || (e.weg[0] === b && e.weg[1] === a)));
}

function ankunft(z, zug, st){
  const sp = zug.besitzer;
  if (!istFeind(z, sp, st.besitzer)){ st.truppen += zug.anzahl; return; }
  if (geschuetzt(z, st)){
    z.ereignisse.push({ typ:'abgewehrt', stadt:st.id, angreifer:sp, verteidiger:st.besitzer, schutz:true });
    return;
  }
  const ba = zugAngr(z, zug), bv = vertFaktor(z, st);
  const angr = zug.anzahl * ba, vert = st.truppen * bv;
  if (angr > vert){
    const alt = st.besitzer;
    st.besitzer = sp; st.truppen = (angr - vert) / ba; st.uhr = 0;
    z.spieler[sp].stats.erobert++;
    z.spieler[sp].energie = Math.min(100, z.spieler[sp].energie + ENERGIE.proEroberung);
    if (alt >= 0) z.spieler[alt].stats.verloren++;
    if (st.typ === 'schmiede') schmiedenZaehlen(z);
    z.ereignisse.push({ typ:'erobert', stadt:st.id, von:alt, nach:sp });
  } else {
    st.truppen = (vert - angr) / bv;
    z.ereignisse.push({ typ:'abgewehrt', stadt:st.id, angreifer:sp, verteidiger:st.besitzer });
  }
}

function kampf(z, A, B){
  const bA = zugAngr(z, A), bB = zugAngr(z, B);
  const sA = A.anzahl * bA, sB = B.anzahl * bB;
  if (sA > sB){ A.anzahl = (sA - sB) / bA; B.anzahl = 0; }
  else if (sB > sA){ B.anzahl = (sB - sA) / bB; A.anzahl = 0; }
  else { A.anzahl = 0; B.anzahl = 0; }
  const p = zugPos(z, A);
  z.ereignisse.push({ typ:'kampf', x:p.x, z:p.z });
}

// Gegnerische Züge, die sich auf derselben Straße entgegenkommen, kämpfen dort.
function begegnungen(z){
  const zs = z.zuege;
  for (let i = 0; i < zs.length; i++){
    const A = zs[i];
    if (A.anzahl < 0.5) continue;
    for (let j = i + 1; j < zs.length; j++){
      const B = zs[j];
      if (B.anzahl < 0.5 || !istFeind(z, A.besitzer, B.besitzer)) continue;
      const a1 = A.pfad[A.i], a2 = A.pfad[A.i + 1];
      if (a1 !== B.pfad[B.i + 1] || a2 !== B.pfad[B.i]) continue;
      if (A.d + B.d < abstand(z, a1, a2)) continue;
      kampf(z, A, B);
      if (A.anzahl < 0.5) break;
    }
  }
}

function pruefeEnde(z){
  const lebt = z.spieler.map(() => false);
  for (const s of z.staedte) if (s.besitzer >= 0) lebt[s.besitzer] = true;
  for (const zug of z.zuege) lebt[zug.besitzer] = true;
  z.spieler.forEach((sp, i) => {
    if (!lebt[i] && !sp.raus){ sp.raus = true; sp.rausZeit = z.zeit; z.ereignisse.push({ typ:'raus', sp:i }); }
  });
  const teams = new Set(z.spieler.filter(sp => !sp.raus).map(sp => sp.team));
  if (teams.size <= 1 && !z.ende){
    const team = teams.size ? [...teams][0] : -1;
    z.ende = { team, sieger:z.spieler.findIndex(sp => !sp.raus && sp.team === team), zeit:z.zeit };
    z.ereignisse.push({ typ:'ende', sieger:z.ende.sieger, team });
  }
}

function ausbilden(z, dt){
  for (const s of z.staedte){
    if (s.besitzer < 0) continue;
    const platz = platzVon(z, s), gesegnet = segen(z, s), grenze = gesegnet ? platz * 1.5 : platz;
    if (s.truppen < grenze){
      const neu = Math.min(grenze - s.truppen, prodVon(z, s) * dt);
      s.truppen += neu; z.spieler[s.besitzer].stats.ausgebildet += neu;
    } else if (s.truppen > platz && !gesegnet) s.truppen = Math.max(platz, s.truppen - Math.max(ABBAU, (s.truppen - platz) * 0.05) * dt);
  }
}

// Online: Zwischen zwei Ständen vom Server rechnet der Browser nur weich weiter
// (Ausbildung, Energie, Marsch bis zur nächsten Stadt). Kämpfe und Eroberungen entscheidet allein der Server.
function vorhersage(z, dt){
  if (z.ende) return;
  z.zeit += dt;
  for (const sp of z.spieler) if (!sp.raus) sp.energie = Math.min(100, sp.energie + ENERGIE.proSek * dt);
  ausbilden(z, dt);
  for (const zug of z.zuege){
    const a = zug.pfad[zug.i], b = zug.pfad[zug.i + 1];
    if (b == null) continue;
    const len = abstand(z, a, b);
    let grenze = len - 0.05;
    if (zug.d <= len / 2 && mauerAuf(z, zug.besitzer, a, b)) grenze = Math.max(zug.d, len / 2 - 0.8);
    zug.d = Math.min(grenze, zug.d + TEMPO * bonus(z, zug.besitzer, 'tempo') * dt);
  }
}

function schritt(z, dt){
  if (z.ende) return;
  z.zeit += dt;
  z.effekte = z.effekte.filter(e => e.bis > z.zeit);

  z.spieler.forEach((sp, i) => {
    if (sp.raus) return;
    sp.energie = Math.min(100, sp.energie + ENERGIE.proSek * dt);
    if (sp.bot == null) return;
    sp.botUhr -= dt;
    if (sp.botUhr <= 0){
      botDenken(z, i);
      sp.botUhr = (BOT[sp.bot] || BOT[1]).takt * (0.8 + 0.4 * zufall(z));
    }
  });

  ausbilden(z, dt);

  for (const zug of z.zuege){
    let rest = TEMPO * bonus(z, zug.besitzer, 'tempo') * dt;
    zug.wartet = false;
    for (;;){
      const a = zug.pfad[zug.i], b = zug.pfad[zug.i + 1], len = abstand(z, a, b);
      // Vor einer feindlichen Mauer bleiben Trupps stehen
      if (zug.d <= len / 2 && mauerAuf(z, zug.besitzer, a, b)){
        const halt = len / 2 - 0.8;
        if (zug.d < halt) zug.d = Math.min(halt, zug.d + rest);
        zug.wartet = true;
        break;
      }
      if (zug.d + rest < len){ zug.d += rest; break; }
      rest -= len - zug.d; zug.d = 0; zug.i++;
      const st = z.staedte[zug.pfad[zug.i]];
      if (zug.i === zug.pfad.length - 1 || istFeind(z, zug.besitzer, st.besitzer)){
        ankunft(z, zug, st); zug.anzahl = 0; zug.i = Math.max(0, zug.i - 1); zug.d = len; break;
      }
    }
  }
  z.zuege = z.zuege.filter(zug => zug.anzahl >= 0.5);

  begegnungen(z);

  for (const s of z.staedte){
    if (s.typ !== 'turm' || s.besitzer < 0) continue;
    s.uhr -= dt;
    if (s.uhr > 0) continue;
    let ziel = null, bd = TURM.radius;
    for (const zug of z.zuege){
      if (!istFeind(z, s.besitzer, zug.besitzer) || zug.anzahl < 0.5) continue;
      if (effekt(z, 'schildkroete', e => e.sp === zug.besitzer)) continue;
      const p = zugPos(z, zug), d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < bd){ bd = d; ziel = zug; }
    }
    if (!ziel){ s.uhr = 0; continue; }
    ziel.anzahl -= 1; s.uhr = TURM.takt / bonus(z, s.besitzer, 'turm');
    const p = zugPos(z, ziel);
    z.ereignisse.push({ typ:'schuss', turm:s.id, x:p.x, z:p.z });
  }
  // Wachen auf der Großen Mauer beschießen wartende Feinde
  for (const e of z.effekte){
    if (e.typ !== 'mauer') continue;
    e.uhr = (e.uhr || 0) - dt;
    if (e.uhr > 0) continue;
    const ziel = z.zuege.find(zug => zug.wartet && istFeind(z, e.sp, zug.besitzer)
      && ((zug.pfad[zug.i] === e.weg[0] && zug.pfad[zug.i + 1] === e.weg[1]) || (zug.pfad[zug.i] === e.weg[1] && zug.pfad[zug.i + 1] === e.weg[0])));
    if (!ziel){ e.uhr = 0; continue; }
    ziel.anzahl -= 1; e.uhr = 0.5;
    const p = zugPos(z, ziel), A = z.staedte[e.weg[0]], B = z.staedte[e.weg[1]];
    z.ereignisse.push({ typ:'schuss', vonX:(A.x + B.x) / 2, vonZ:(A.z + B.z) / 2, x:p.x, z:p.z });
  }
  z.zuege = z.zuege.filter(zug => zug.anzahl >= 0.5);

  pruefeEnde(z);
}

/* ---------- Computergegner ---------- */
function botDenken(z, sp){
  const cfg = BOT[z.spieler[sp].bot] || BOT[1], ich = z.spieler[sp];
  const S = z.staedte, n = S.length;
  const meine = S.filter(s => s.besitzer === sp);
  if (!meine.length) return;
  // Wer lange nicht angegriffen hat, wird mutiger und sammelt Truppen aus mehr Städten (sonst mauern sich Bots ein)
  const ungeduldig = z.zeit - ich.botRuhe > 25;

  // Wer marschiert gerade wohin?
  const feind = new Array(n).fill(0), freund = new Array(n).fill(0);
  for (const zug of z.zuege){
    const ziel = stopStadt(z, zug);
    if (zug.besitzer === sp) freund[ziel] += zug.anzahl;
    else if (istFeind(z, sp, zug.besitzer)) feind[ziel] += zug.anzahl * zugAngr(z, zug);
  }
  const feindNachbar = s => z.nachbarn[s.id].some(k => S[k].besitzer >= 0 && istFeind(z, sp, S[k].besitzer));
  const frei = s => Math.max(0, Math.floor(s.truppen - feind[s.id] / vertFaktor(z, s) - (feindNachbar(s) && !ungeduldig ? 4 : 0)));
  const ba = bonus(z, sp, 'angr');

  if (z.spieler[sp].energie >= 100 && zufall(z) < cfg.faehigkeit) botFaehigkeit(z, sp, meine, feind, freund, feindNachbar);

  // 1) Bedrohte Städte verstärken
  for (const s of meine){
    const luecke = feind[s.id] - (s.truppen + freund[s.id]) * vertFaktor(z, s);
    if (luecke <= 0 || geschuetzt(z, s)) continue;
    const helfer = z.nachbarn[s.id].map(k => S[k]).filter(h => h.besitzer === sp && frei(h) >= 3)
      .sort((a, b) => b.truppen - a.truppen)[0];
    if (helfer) schicken(z, sp, helfer.id, s.id, Math.min(frei(helfer), luecke / vertFaktor(z, s) + 3));
  }

  // 2) Volle, sichere Städte ausbauen
  if (zufall(z) < cfg.ausbau){
    const voll = meine.filter(s => s.typ === 'stadt' && s.stufe < 3 && !feindNachbar(s) && feind[s.id] === 0
      && s.truppen >= Math.max(platzVon(z, s) * 0.85, ausbauKosten(z, s) + 4)).sort((a, b) => b.truppen - a.truppen)[0];
    if (voll) ausbauen(z, sp, voll.id);
  }
  // 2b) Schmiede und Kaserne im sicheren Hinterland
  if (meine.length >= 5 && zufall(z) < 0.3){
    const zahl = typ => meine.filter(s => s.typ === typ).length;
    const hinten = meine.filter(s => s.typ === 'stadt' && s.stufe === 1 && !feindNachbar(s) && feind[s.id] === 0);
    const typ = zahl('schmiede') < cfg.schmieden ? 'schmiede' : zahl('kaserne') < cfg.kasernen ? 'kaserne' : null;
    const k = typ && hinten.find(s => s.truppen >= umbauKosten(z, s, typ) + 5);
    if (k) umbauen(z, sp, k.id, typ);
  }

  // 3) Angreifen: das lohnendste Ziel, das wir sicher schaffen
  let bestes = null;
  for (const t of S){
    if (!istFeind(z, sp, t.besitzer) || geschuetzt(z, t)) continue;
    const quellen = [];
    for (const q of meine){
      const f = frei(q);
      if (f < 3) continue;
      const pfad = route(z, sp, q.id, t.id, false, true);
      if (pfad) quellen.push({ q, f, laenge:pfadLaenge(z, pfad) });
    }
    if (!quellen.length) continue;
    quellen.sort((a, b) => a.laenge - b.laenge);
    const nutz = quellen.slice(0, cfg.gruppen + (ungeduldig ? 4 : 0));
    const reise = nutz[nutz.length - 1].laenge / (TEMPO * bonus(z, sp, 'tempo'));
    let vert = t.truppen * vertFaktor(z, t);
    if (t.besitzer >= 0) vert += Math.max(0, Math.min(platzVon(z, t) - t.truppen, prodVon(z, t) * reise)) * vertFaktor(z, t);
    vert -= freund[t.id] * ba;
    if (vert < 0) continue;
    // Feindliche Türme am Ziel schießen die Angreifer beim Anmarsch ab
    let pfeile = 0;
    for (const w of S) if (w.typ === 'turm' && w.besitzer >= 0 && istFeind(z, sp, w.besitzer) && Math.hypot(w.x - t.x, w.z - t.z) < TURM.radius + 1)
      pfeile += TURM.radius / (TEMPO * bonus(z, sp, 'tempo')) / TURM.takt + 1;
    const noetig = (vert / ba + pfeile) * (ungeduldig ? Math.min(cfg.marge, 1.08) : cfg.marge) + 2;
    if (nutz.reduce((a, b) => a + b.f, 0) < noetig) continue;
    let wert = t.typ === 'stadt' ? 1 + 0.5 * (t.stufe - 1) : t.typ === 'schmiede' ? 1.6 : 1.2;
    if (t.besitzer >= 0) wert *= 1.4 + (z.spieler[t.besitzer].bot == null ? cfg.jagd : 0);
    const punkte = wert / (noetig + 4 + reise * 1.5);
    if (!bestes || punkte > bestes.punkte) bestes = { t, nutz, noetig, punkte };
  }
  if (bestes){
    let rest = Math.ceil(bestes.noetig * (ungeduldig ? 1.4 : 1));
    for (const { q, f } of bestes.nutz){
      if (rest <= 0) break;
      rest -= schicken(z, sp, q.id, bestes.t.id, Math.min(f, rest));
    }
    ich.botRuhe = z.zeit;
    return;
  }

  // 4) Türme an der Front (nur schwere Gegner)
  if (cfg.turm && zufall(z) < 0.3 && meine.length >= 4 && meine.filter(s => s.typ === 'turm').length < 2){
    const k = meine.find(s => s.typ === 'stadt' && s.stufe === 1 && feindNachbar(s) && s.truppen >= umbauKosten(z, s, 'turm') + 10);
    if (k){ umbauen(z, sp, k.id, 'turm'); return; }
  }

  // 5) Volle Städte im Hinterland schicken Nachschub an die Front
  for (const s of meine){
    if (feindNachbar(s) || s.truppen < platzVon(z, s) * 0.85) continue;
    let ziel = null, bd = Infinity;
    for (const g of meine){
      if (g === s || !z.nachbarn[g.id].some(k => istFeind(z, sp, S[k].besitzer))) continue;
      const d = Math.hypot(g.x - s.x, g.z - s.z);
      if (d < bd){ bd = d; ziel = g; }
    }
    if (ziel){ schicken(z, sp, s.id, ziel.id, s.truppen * 0.6); return; }
  }
}

function botFaehigkeit(z, sp, meine, feind, freund, feindNachbar){
  const S = z.staedte, reich = z.spieler[sp].reich;
  const fremdeZuege = z.zuege.filter(q => istFeind(z, sp, q.besitzer)).sort((a, b) => b.anzahl - a.anzahl);
  if (reich === 'roemer'){
    const unterwegs = z.zuege.filter(q => q.besitzer === sp).reduce((a, q) => a + q.anzahl, 0);
    if (unterwegs >= 25) faehigkeitNutzen(z, sp);
  } else if (reich === 'aegypter'){
    const s = meine.filter(s => prodVon(z, s) > 0 && feind[s.id] === 0).sort((a, b) => prodVon(z, b) - prodVon(z, a))[0];
    if (s) faehigkeitNutzen(z, sp, { stadt:s.id });
  } else if (reich === 'griechen'){
    const s = meine.find(s => feind[s.id] > (s.truppen + freund[s.id]) * vertFaktor(z, s));
    if (s) faehigkeitNutzen(z, sp, { stadt:s.id });
  } else if (reich === 'wikinger'){
    const ziele = S.filter(t => istFeind(z, sp, t.besitzer) && t.truppen >= 12 && z.nachbarn[t.id].some(k => S[k].besitzer === sp))
      .sort((a, b) => (b.besitzer >= 0) - (a.besitzer >= 0) || b.truppen - a.truppen);
    if (ziele[0]) faehigkeitNutzen(z, sp, { stadt:ziele[0].id });
  } else if (reich === 'mongolen'){
    const q = fremdeZuege[0];
    if (q && q.anzahl >= 12){ const p = zugPos(z, q); faehigkeitNutzen(z, sp, { x:p.x, z:p.z }); }
  } else if (reich === 'chinesen'){
    const q = fremdeZuege.find(q => q.anzahl >= 10 && S[stopStadt(z, q)].besitzer === sp && !q.wartet);
    if (q){
      const a = q.pfad[q.i], b = q.pfad[q.i + 1];
      const w = z.wege.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
      if (w >= 0 && q.d < abstand(z, a, b) / 2 - 1) faehigkeitNutzen(z, sp, { weg:w });
    }
  }
}

const api = {
  REICHE, REICH, KARTEN, KARTE, BOT, TURM, GEBAEUDE, NEUTRAL,
  neuesSpiel, schritt, vorhersage, senden, ausbauen, umbauen, turmBauen, faehigkeitNutzen, aufgeben,
  ausbauKosten, umbauKosten, platzVon, prodVon, zugPos, stopStadt, route, geschuetzt, segen, istFeind, schmiedenZaehlen
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else wurzel.Logik = api;
})(typeof window !== 'undefined' ? window : globalThis);
