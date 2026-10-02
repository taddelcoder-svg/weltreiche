'use strict';
// Weltreiche – Online-Räume im Browser: Verbindung, Raum erstellen/beitreten, Warteraum.
// Das Spiel selbst rechnet der Server; spiel.js zeigt es an (weltreiche.online).
(function(){
const L = window.Logik, W = window.weltreiche;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const speicher = {
  lesen(k, std){ try { const v = localStorage.getItem('weltreiche.' + k); return v == null ? std : JSON.parse(v); } catch { return std; } },
  schreiben(k, v){ try { localStorage.setItem('weltreiche.' + k, JSON.stringify(v)); } catch {} }
};

let ws = null, raum = null, imSpiel = false, gewollt = false;

// Olympiade: Mit ?olymp=… im Link geht es direkt in den Raum des Vorlaufs (Ticket prüft der Server)
const olympia = (() => {
  let ticket = new URLSearchParams(location.search).get('olymp');
  try {
    if (ticket) sessionStorage.setItem('weltreiche.olymp', ticket);
    else ticket = sessionStorage.getItem('weltreiche.olymp');
  } catch {}
  if (!ticket) return null;
  history.replaceState(null, '', '/');
  return { ticket, info:null, startBis:0, rang:null, vorbei:false };
})();
function olympiaBeenden(){ try { sessionStorage.removeItem('weltreiche.olymp'); } catch {} }
function zurOlympiade(){
  const ziel = olympia && olympia.info && olympia.info.zurueck;
  olympiaBeenden();
  gewollt = true;
  if (ws){ senden({ t:'verlassen' }); ws.close(); }
  location.href = ziel || '/';
}
async function olympLos(){
  $('#onlineFehler').textContent = 'Verbinde mit der Olympia-Schlacht …';
  try { await verbinden(); } catch { $('#onlineFehler').textContent = 'Keine Verbindung – neuer Versuch …'; setTimeout(olympLos, 3000); return; }
  senden({ t:'olymp', ticket:olympia.ticket, reich:W.wahl.reich });
}

function senden(m){ if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
function verbinden(){
  return new Promise((ok, fehler) => {
    if (ws && ws.readyState === 1) return ok();
    gewollt = false;
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => ok();
    ws.onerror = () => fehler(new Error('keine Verbindung'));
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } empfangen(m); };
    ws.onclose = () => {
      ws = null;
      const warImRaum = !!raum;
      raum = null;
      if (gewollt) return;
      // Olympiade: einfach neu verbinden, der Server gibt das eigene Reich zurück
      if (olympia && !olympia.vorbei){ setTimeout(olympLos, 1500); return; }
      if (imSpiel){ imSpiel = false; W.online.getrennt(); }
      else if (warImRaum){ zeigeStart(); fehlerZeigen('Die Verbindung wurde unterbrochen.'); }
    };
  });
}
function trennen(){
  gewollt = true;
  if (ws){ senden({ t:'verlassen' }); ws.close(); }
  ws = null; raum = null; imSpiel = false;
}

function empfangen(m){
  switch (m.t){
    case 'raum':
      raum = m;
      if (olympia && m.olymp){ olympia.info = m.olymp; olympia.startBis = m.olymp.startIn != null ? Date.now() + m.olymp.startIn : 0; }
      if (!imSpiel) raumZeigen();
      break;
    case 'fehler':
      if (m.olymp && olympia){
        olympia.vorbei = true; olympiaBeenden();
        $('#online').hidden = false; $('#menue').hidden = true; zeigeStart();
        fehlerZeigen(m.text + ' Die Seite lädt gleich neu.');
        setTimeout(() => location.replace('/'), 4000);
        return;
      }
      fehlerZeigen(m.text);
      break;
    case 'start':
      imSpiel = true;
      $('#online').hidden = true;
      W.online.starten(m.opts, m.du, senden);
      break;
    case 'stand':
      if (imSpiel) W.online.stand(m);
      break;
    case 'ende':
      if (olympia){ olympia.rang = m.rang || null; olympia.vorbei = true; olympiaBeenden(); }
      if (imSpiel) W.online.ende(m);
      break;
  }
}
function fehlerZeigen(text, gut = false){
  const el = raum ? $('#raumFehler') : $('#onlineFehler');
  el.textContent = text;
  el.style.color = gut ? 'var(--tinte)' : '';
  clearTimeout(fehlerZeigen.uhr);
  fehlerZeigen.uhr = setTimeout(() => (el.textContent = ''), 5000);
}

/* ---------- Ansichten ---------- */
function oeffnen(){
  $('#menue').hidden = true;
  $('#online').hidden = false;
  if (raum) raumZeigen(); else zeigeStart();
}
function zeigeStart(){
  $('#onlineStart').hidden = false; $('#onlineRaum').hidden = true;
  $('#onlineName').value = speicher.lesen('name', '');
}
function name(){
  const n = $('#onlineName').value.trim().slice(0, 16);
  speicher.schreiben('name', n);
  return n;
}
async function mitVerbindung(nachricht){
  const n = name();
  if (!n){ fehlerZeigen('Gib zuerst einen Spitznamen ein.'); $('#onlineName').focus(); return; }
  try { await verbinden(); } catch { fehlerZeigen('Keine Verbindung zum Server. Bist du online?'); return; }
  senden({ ...nachricht, name:n, reich:W.wahl.reich });
}

function raumZeigen(){
  if (!raum) return zeigeStart();
  $('#online').hidden = false; $('#menue').hidden = true;
  $('#onlineStart').hidden = true; $('#onlineRaum').hidden = false;
  $('#raumCodeAnzeige').textContent = raum.code;
  $('#olympBanner').hidden = !raum.olymp; $('#raumKopf').hidden = !!raum.olymp;
  $('#raumVerlassen').textContent = raum.olymp ? 'Zurück zur Olympiade' : 'Raum verlassen';
  const host = raum.host === raum.du, ich = raum.mitglieder.find(m => m.id === raum.du);
  $('#raumSpieler').innerHTML = raum.mitglieder.map(m => {
    const r = L.REICH[m.reich];
    return `<li><span class="wappen" style="background:${r.farbe}">${r.zeichen}</span>
      <span><b>${esc(m.name)}</b>${m.id === raum.du ? ' (du)' : ''}<br><small style="margin:0">${r.name}</small></span>
      <small>${m.id === raum.host ? '👑 Gastgeber' : ''}</small></li>`;
  }).join('') + (raum.einst.bots ? `<li><span>🤖</span><span>${raum.einst.bots} Computergegner · ${L.BOT[raum.einst.stufe].name}</span></li>` : '');
  const belegt = new Set(raum.mitglieder.filter(m => m !== ich).map(m => m.reich));
  $('#raumReiche').innerHTML = L.REICHE.map(r => `
    <button data-r="${r.id}" class="${ich && ich.reich === r.id ? 'aktiv' : ''}" ${belegt.has(r.id) ? 'disabled' : ''} title="${r.passiv} · ${r.faehigkeit.name}">
      <span class="wappen" style="background:${r.farbe}">${r.zeichen}</span>${r.name}</button>`).join('');
  document.querySelectorAll('#raumReiche button').forEach(b => (b.onclick = () => {
    W.wahl.reich = b.dataset.r; speicher.schreiben('reich', b.dataset.r);
    senden({ t:'reich', reich:b.dataset.r });
  }));
  einstellungenZeigen(host);
  const laeuft = raum.phase !== 'lobby';
  $('#raumStart').hidden = !host || laeuft;
  $('#raumWarten').hidden = host && !laeuft;
  $('#raumWarten').textContent = laeuft ? 'Die Schlacht läuft noch – gleich geht es weiter.' : 'Der Gastgeber startet die Schlacht.';
  if (raum.olymp) olympRaum(host);
}
// Warteraum in der Olympiade: wer fehlt noch, Countdown, feste Einstellungen
function olympRaum(host){
  const o = raum.olymp, e = raum.einst;
  $('#olympBanner').innerHTML = `🏅 <b>${esc(o.titel)}</b> · Disziplin ${o.nr} von ${o.von}
    <div class="erwartet">${o.erwartet.map(x => `<span class="${x.da ? 'da' : ''}">${x.da ? '✓' : '…'} ${esc(x.n)}</span>`).join('')}</div>`;
  $('#raumEinst').innerHTML = `<p><b>Modus:</b> Jeder gegen jeden</p><p><b>Zeitlimit:</b> ${Math.round(o.limit / 60)} Minuten – danach gewinnt das größte Reich</p>
    <p><b>Karte:</b> ${e.karte === 'zufall' ? 'Zufall' : L.KARTE[e.karte].name}</p>`;
  $('#raumStart').hidden = !host || o.gestartet;
  $('#raumStart').textContent = 'Ohne die anderen beginnen';
  $('#raumWarten').hidden = false;
  olympWartetext();
}
function olympWartetext(){
  if (!olympia || !raum || !raum.olymp || imSpiel || raum.phase !== 'lobby') return;
  const fehlt = raum.olymp.erwartet.filter(x => !x.da).length;
  const sek = Math.max(0, Math.ceil((olympia.startBis - Date.now()) / 1000));
  $('#raumWarten').textContent = !olympia.startBis ? `Warte auf ${fehlt} Mitspieler – es geht los, sobald alle da sind.`
    : fehlt ? `Warte auf ${fehlt} Mitspieler – spätestens in ${sek} s geht es los.`
    : `Alle da! Die Schlacht beginnt in ${sek} …`;
}
// Restzeit oben im Bild
function olympUhr(){
  const el = $('#olympUhr');
  const z = W.zustand;
  const zeigen = !!(olympia && olympia.info && imSpiel && z && !z.ende);
  el.hidden = !zeigen;
  if (!zeigen) return;
  const rest = Math.max(0, olympia.info.limit - z.zeit);
  el.textContent = `🏅 ${Math.floor(rest / 60)}:${String(Math.floor(rest % 60)).padStart(2, '0')}`;
}
if (olympia) setInterval(() => { olympWartetext(); olympUhr(); }, 250);

function einstellungenZeigen(host){
  const e = raum.einst, menschen = raum.mitglieder.length, gesamt = menschen + e.bots;
  const karteName = e.karte === 'zufall' ? 'Zufall' : L.KARTE[e.karte].name;
  if (!host){
    $('#raumEinst').innerHTML = `<p><b>Modus:</b> ${e.modus === 'koop' ? 'Zusammen gegen den Computer' : 'Jeder gegen jeden'}</p>
      <p><b>Computergegner:</b> ${e.bots ? `${e.bots} (${L.BOT[e.stufe].name})` : 'keine'}</p><p><b>Karte:</b> ${karteName}</p>`;
    return;
  }
  const knopf = (feld, wert, text, aktiv, aus) => `<button class="wahl${aktiv ? ' aktiv' : ''}" data-f="${feld}" data-w="${wert}" ${aus ? 'disabled' : ''}>${text}</button>`;
  const karten = L.KARTEN.map(k => knopf('karte', k.id, `${k.name}<small>bis ${k.starts.length}</small>`, e.karte === k.id, k.starts.length < gesamt)).join('');
  $('#raumEinst').innerHTML = `
    <div class="reihe">${knopf('modus', 'frei', 'Jeder gegen jeden', e.modus === 'frei')}${knopf('modus', 'koop', 'Zusammen gegen Computer', e.modus === 'koop')}</div>
    <div class="reihe">${[0, 1, 2, 3].map(n => knopf('bots', n, n === 0 ? 'Keine Bots' : `${n} Bot${n > 1 ? 's' : ''}`, e.bots === n, menschen + n > 4)).join('')}</div>
    <div class="reihe">${L.BOT.map((b, i) => knopf('stufe', i, b.name, e.stufe === i, !e.bots)).join('')}</div>
    <div class="reihe">${knopf('karte', 'zufall', 'Zufall<small>passend</small>', e.karte === 'zufall')}${karten}</div>`;
  document.querySelectorAll('#raumEinst .wahl').forEach(b => (b.onclick = () => {
    const f = b.dataset.f, w = b.dataset.w;
    senden({ t:'einst', [f]:f === 'bots' || f === 'stufe' ? Number(w) : w });
  }));
}

/* ---------- Knöpfe ---------- */
$('#onlineOeffnen').addEventListener('click', oeffnen);
$('#onlineZurueck').addEventListener('click', () => { trennen(); $('#online').hidden = true; $('#menue').hidden = false; });
$('#raumNeu').addEventListener('click', () => mitVerbindung({ t:'erstellen' }));
$('#raumBeitreten').addEventListener('click', () => {
  const code = $('#raumCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4){ fehlerZeigen('Der Raumcode hat 4 Zeichen.'); return; }
  mitVerbindung({ t:'beitreten', code });
});
$('#raumCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
$('#raumCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#raumBeitreten').click(); });
$('#raumStart').addEventListener('click', () => senden({ t:'start' }));
$('#raumTeilen').addEventListener('click', async () => {
  if (!raum) return;
  const link = `${location.origin}/?raum=${raum.code}`;
  try {
    if (navigator.share) await navigator.share({ title:'Weltreiche', text:`Komm in meinen Raum ${raum.code}!`, url:link });
    else { await navigator.clipboard.writeText(link); fehlerZeigen('Link kopiert – schick ihn deinen Freunden.', true); }
  } catch { /* Teilen abgebrochen */ }
});
$('#raumVerlassen').addEventListener('click', () => { if (olympia) return zurOlympiade(); trennen(); zeigeStart(); });

// Für spiel.js: Spiel verlassen bzw. nach der Schlacht zurück in den Raum
window.Online = {
  get olympia(){ return olympia; },
  zurOlympiade,
  verlassen(){ if (olympia) return zurOlympiade(); trennen(); },
  zumRaum(){ imSpiel = false; if (raum) raumZeigen(); else { zeigeStart(); $('#online').hidden = false; } }
};
// Einladungslink: …/?raum=ABCD öffnet direkt die Beitreten-Ansicht
const einladung = new URLSearchParams(location.search).get('raum');
if (olympia){ oeffnen(); olympLos(); }
else if (einladung){ oeffnen(); $('#raumCode').value = einladung.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
})();
