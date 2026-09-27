'use strict';
// Weltreiche – Online-Räume (WebSocket unter /ws).
// Der Server rechnet das Spiel mit logik.js – dieselben Regeln wie im Browser, damit niemand schummeln kann.
// Die Browser schicken nur Befehle und bekommen 10-mal pro Sekunde den Stand.
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const L = require('./logik');

const MAX_RAEUME = 100;
const MAX_REICHE = 4;             // Menschen + Computer zusammen
const TAKT_MS = 50;               // Spielschritt auf dem Server
const SCHRITT = 1 / 60;
const RAUM_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const raeume = new Map();

const nameOk = n => String(n || '').replace(/[\u0000-\u001f\u007f<>&"]/g, '').trim().slice(0, 16) || 'Spieler';
const ganz = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
function sende(ws, m){ if (ws && ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
function anAlle(raum, m){ const text = JSON.stringify(m); for (const mg of raum.mitglieder) sende(mg.ws, text); }
function mischen(a){ for (let i = a.length - 1; i > 0; i--){ const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function neuerCode(){
  for (;;){
    let c = '';
    for (let i = 0; i < 4; i++) c += RAUM_ZEICHEN[crypto.randomInt(RAUM_ZEICHEN.length)];
    if (!raeume.has(c)) return c;
  }
}
function freiesReich(raum, wunsch, ausser){
  const belegt = new Set(raum.mitglieder.filter(m => m !== ausser).map(m => m.reich));
  if (L.REICH[wunsch] && !belegt.has(wunsch)) return wunsch;
  return L.REICHE.map(r => r.id).find(r => !belegt.has(r));
}

function raumSenden(raum){
  const m = {
    t:'raum', code:raum.code, host:raum.host, phase:raum.phase, einst:raum.einst,
    mitglieder:raum.mitglieder.map(mg => ({ id:mg.id, name:mg.name, reich:mg.reich }))
  };
  for (const mg of raum.mitglieder) sende(mg.ws, { ...m, du:mg.id });
}

/* ---------- Spiel im Raum ---------- */
function starten(raum){
  const e = raum.einst, menschen = raum.mitglieder;
  const gesamt = menschen.length + e.bots;
  if (gesamt < 2) return 'Ihr braucht mindestens zwei Reiche – lade Freunde ein oder nimm Computergegner dazu.';
  if (gesamt > MAX_REICHE) return `Höchstens ${MAX_REICHE} Reiche pro Spiel.`;
  if (e.modus === 'koop' && e.bots < 1) return 'Für „Zusammen gegen den Computer“ braucht ihr mindestens einen Computergegner.';
  const karten = L.KARTEN.filter(k => k.starts.length >= gesamt);
  const karte = karten.find(k => k.id === e.karte) || karten[crypto.randomInt(karten.length)];
  const belegt = new Set(menschen.map(m => m.reich));
  const botReiche = mischen(L.REICHE.filter(r => !belegt.has(r.id))).slice(0, e.bots);
  const koop = e.modus === 'koop';
  const opts = {
    karte:karte.id, seed:crypto.randomInt(1, 2 ** 31),
    spieler:[
      ...menschen.map((m, i) => ({ reich:m.reich, name:m.name, team:koop ? 0 : i })),
      ...botReiche.map((r, k) => ({ reich:r.id, name:r.name, bot:e.stufe, team:koop ? 1 : menschen.length + k }))
    ]
  };
  raum.z = L.neuesSpiel(opts);
  raum.plaetze = new Map(menschen.map((m, i) => [m.id, i]));
  raum.phase = 'spiel';
  raum.takt = 0;
  raum.ereignisse = [];
  for (const [i, m] of menschen.entries()) sende(m.ws, { t:'start', opts, du:i });
  raumSenden(raum);
  clearInterval(raum.uhr);
  raum.uhr = setInterval(() => ticken(raum), TAKT_MS);
  return null;
}

function stand(z, ereignisse){
  return {
    t:'stand', zeit:r2(z.zeit),
    s:z.staedte.map(s => [s.besitzer, r1(s.truppen), s.stufe, s.typ]),
    q:z.zuege.map(q => [q.id, q.besitzer, r1(q.anzahl), q.pfad, q.i, r2(q.d), q.wartet ? 1 : 0]),
    p:z.spieler.map(p => [r1(p.energie), p.raus ? 1 : 0, p.bot == null ? 0 : 1]),
    fx:z.effekte, e:ereignisse, ende:z.ende
  };
}

function ticken(raum){
  const z = raum.z;
  if (!z) return;
  // Ereignisse von außerhalb des Spielschritts (Aufgeben, Verlassen) zuerst einsammeln
  if (z.ereignisse.length){ raum.ereignisse.push(...z.ereignisse); z.ereignisse.length = 0; }
  const n = Math.round(TAKT_MS / 1000 / SCHRITT);
  for (let i = 0; i < n && !z.ende; i++){
    L.schritt(z, SCHRITT);
    if (z.ereignisse.length){ raum.ereignisse.push(...z.ereignisse); z.ereignisse.length = 0; }
  }
  raum.takt++;
  if (raum.takt % 2 === 0 || z.ende){
    anAlle(raum, stand(z, raum.ereignisse));
    raum.ereignisse = [];
  }
  if (z.ende){
    clearInterval(raum.uhr); raum.uhr = null;
    anAlle(raum, { t:'ende', ende:z.ende, stats:z.spieler.map(p => p.stats) });
    raum.phase = 'lobby'; raum.z = null;
    raumSenden(raum);
  }
}

function befehl(raum, sp, m){
  const z = raum.z;
  if (!z) return;
  const anzahlStaedte = z.staedte.length;
  switch (m.art){
    case 'senden': {
      if (!Array.isArray(m.von) || m.von.length > 30 || !m.von.every(v => ganz(v, 0, anzahlStaedte - 1))) return;
      if (!ganz(m.ziel, 0, anzahlStaedte - 1)) return;
      const anteil = Number(m.anteil);
      if (!(anteil > 0 && anteil <= 1)) return;
      L.senden(z, sp, m.von, m.ziel, anteil);
      break;
    }
    case 'ausbauen':
      if (ganz(m.stadt, 0, anzahlStaedte - 1)) L.ausbauen(z, sp, m.stadt);
      break;
    case 'umbauen':
      if (ganz(m.stadt, 0, anzahlStaedte - 1) && L.GEBAEUDE[m.typ]) L.umbauen(z, sp, m.stadt, m.typ);
      break;
    case 'faehigkeit': {
      const q = m.ziel && typeof m.ziel === 'object' ? m.ziel : {};
      const ziel = {};
      if (ganz(q.stadt, 0, anzahlStaedte - 1)) ziel.stadt = q.stadt;
      if (ganz(q.weg, 0, z.wege.length - 1)) ziel.weg = q.weg;
      if (Number.isFinite(q.x) && Number.isFinite(q.z)){ ziel.x = q.x; ziel.z = q.z; }
      L.faehigkeitNutzen(z, sp, ziel);
      break;
    }
  }
}

function verlassen(ws){
  const raum = ws.raum;
  if (!raum) return;
  ws.raum = null;
  const mg = raum.mitglieder.find(m => m.ws === ws);
  raum.mitglieder = raum.mitglieder.filter(m => m.ws !== ws);
  if (!raum.mitglieder.length){
    clearInterval(raum.uhr);
    raeume.delete(raum.code);
    return;
  }
  // Mitten im Spiel übernimmt ein Computergegner das Reich
  if (raum.z && mg && raum.plaetze.has(mg.id)){
    const sp = raum.plaetze.get(mg.id);
    raum.plaetze.delete(mg.id);
    const spieler = raum.z.spieler[sp];
    if (!spieler.raus){ spieler.bot = 1; raum.z.ereignisse.push({ typ:'weg', sp }); }
  }
  if (raum.host === ws.id) raum.host = raum.mitglieder[0].id;
  raumSenden(raum);
}

function verarbeiten(ws, m){
  const raum = ws.raum;
  switch (m.t){
    case 'erstellen': {
      if (raum) verlassen(ws);
      if (raeume.size >= MAX_RAEUME) return sende(ws, { t:'fehler', text:'Gerade sind zu viele Räume offen. Versuch es gleich noch mal.' });
      const neu = {
        code:neuerCode(), host:ws.id, phase:'lobby', mitglieder:[], z:null, uhr:null, plaetze:new Map(), ereignisse:[],
        einst:{ modus:'frei', bots:1, stufe:1, karte:'zufall' }
      };
      raeume.set(neu.code, neu);
      neu.mitglieder.push({ id:ws.id, ws, name:nameOk(m.name), reich:freiesReich(neu, m.reich) });
      ws.raum = neu;
      return raumSenden(neu);
    }
    case 'beitreten': {
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const ziel = raeume.get(code);
      if (!ziel) return sende(ws, { t:'fehler', text:'Diesen Raum gibt es nicht. Prüf den Code.' });
      if (ziel === raum) return raumSenden(ziel);
      if (ziel.phase !== 'lobby') return sende(ws, { t:'fehler', text:'In diesem Raum läuft gerade eine Schlacht. Warte, bis sie vorbei ist.' });
      if (ziel.mitglieder.length >= MAX_REICHE) return sende(ws, { t:'fehler', text:'Der Raum ist voll.' });
      if (raum) verlassen(ws);
      ziel.mitglieder.push({ id:ws.id, ws, name:nameOk(m.name), reich:freiesReich(ziel, m.reich) });
      // Menschen + Computer dürfen zusammen nicht mehr als 4 sein
      ziel.einst.bots = Math.min(ziel.einst.bots, MAX_REICHE - ziel.mitglieder.length);
      ws.raum = ziel;
      return raumSenden(ziel);
    }
    case 'reich': {
      if (!raum || raum.phase !== 'lobby' || !L.REICH[m.reich]) return;
      const mg = raum.mitglieder.find(x => x.ws === ws);
      if (raum.mitglieder.some(x => x !== mg && x.reich === m.reich)) return sende(ws, { t:'fehler', text:'Dieses Reich hat schon jemand anderes.' });
      mg.reich = m.reich;
      return raumSenden(raum);
    }
    case 'einst': {
      if (!raum || raum.phase !== 'lobby' || raum.host !== ws.id) return;
      const e = raum.einst;
      if (m.modus === 'frei' || m.modus === 'koop') e.modus = m.modus;
      if (ganz(m.bots, 0, 3)) e.bots = Math.min(m.bots, MAX_REICHE - raum.mitglieder.length);
      if (ganz(m.stufe, 0, 2)) e.stufe = m.stufe;
      if (m.karte === 'zufall' || L.KARTE[m.karte]) e.karte = m.karte;
      return raumSenden(raum);
    }
    case 'start': {
      if (!raum || raum.phase !== 'lobby' || raum.host !== ws.id) return;
      const fehler = starten(raum);
      if (fehler) sende(ws, { t:'fehler', text:fehler });
      return;
    }
    case 'befehl': {
      if (!raum || raum.phase !== 'spiel' || !raum.plaetze.has(ws.id)) return;
      if (++ws.befehle > 25) return;        // höchstens 25 Befehle pro Sekunde
      return befehl(raum, raum.plaetze.get(ws.id), m);
    }
    case 'aufgeben': {
      if (!raum || !raum.z || !raum.plaetze.has(ws.id)) return;
      L.aufgeben(raum.z, raum.plaetze.get(ws.id));
      return;
    }
    case 'verlassen':
      return verlassen(ws);
  }
}

module.exports = function onlineStarten(server, zugang){
  const wss = new WebSocketServer({ server, path:'/ws', maxPayload:4096, verifyClient:({ req }) => zugang.hatZugang(req) });
  let naechsteId = 1;
  wss.on('connection', ws => {
    ws.id = naechsteId++; ws.raum = null; ws.lebt = true; ws.befehle = 0;
    ws.on('pong', () => { ws.lebt = true; });
    ws.on('message', daten => {
      let m;
      try { m = JSON.parse(daten); } catch { return; }
      if (m && typeof m === 'object') verarbeiten(ws, m);
    });
    ws.on('close', () => verlassen(ws));
    ws.on('error', () => {});
  });
  // Abgerissene Verbindungen aufräumen und Befehlszähler zurücksetzen
  setInterval(() => {
    for (const ws of wss.clients){ if (!ws.lebt){ ws.terminate(); continue; } ws.lebt = false; ws.ping(); }
  }, 30_000).unref();
  setInterval(() => { for (const ws of wss.clients) ws.befehle = 0; }, 1000).unref();
  return { raeume };
};
