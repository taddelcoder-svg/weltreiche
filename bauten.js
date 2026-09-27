'use strict';
// Weltreiche – Gebäude im Baustil der Reiche. Alles Low-Poly aus Grundformen, keine Bilddateien.
// Bauten.fuellen(gruppe, stadt, reich, dachFarbe) baut den Inhalt einer Stadt; Dächer tragen die Farbe des Besitzers.
(function(){
const flach = g => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };
const geoCache = new Map(), matCache = new Map();
function geo(schluessel, bauen){ let g = geoCache.get(schluessel); if (!g){ g = bauen(); geoCache.set(schluessel, g); } return g; }
function mat(farbe, doppelt){
  const k = farbe + (doppelt ? '|2' : '');
  let m = matCache.get(k);
  if (!m){ m = new THREE.MeshLambertMaterial({ color:farbe, side:doppelt ? THREE.DoubleSide : THREE.FrontSide }); matCache.set(k, m); }
  return m;
}
// Grundformen, jeweils mit Unterkante bei y0
const box = (w, h, d, y0 = 0) => geo(`b${w},${h},${d},${y0}`, () => flach(new THREE.BoxGeometry(w, h, d)).translate(0, y0 + h / 2, 0));
const kegel = (r, h, seg, y0 = 0, dreh = 0) => geo(`k${r},${h},${seg},${y0},${dreh}`, () => flach(new THREE.ConeGeometry(r, h, seg).rotateY(dreh)).translate(0, y0 + h / 2, 0));
const zyl = (ro, ru, h, seg, y0 = 0, offen = false) => geo(`z${ro},${ru},${h},${seg},${y0},${offen}`, () => {
  const g = new THREE.CylinderGeometry(ro, ru, h, seg, 1, offen).translate(0, y0 + h / 2, 0);
  return offen ? g : flach(g);
});
// Satteldach (dreiseitiges Prisma) entlang x
const giebel = (lang, breit, hoch, y0) => geo(`g${lang},${breit},${hoch},${y0}`, () =>
  flach(new THREE.CylinderGeometry(1, 1, lang, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2))
    .scale(1, hoch / 1.5, breit / 1.732).translate(0, y0 + hoch / 3, 0));

const F = {
  putz:'#f1e4c4', marmor:'#f4efe4', sandstein:'#e2c58a', holz:'#8b6a45', holzDunkel:'#6b4a2a', filz:'#efe8d8',
  stein:'#c8bca6', steinDunkel:'#8f877a', gold:'#e8c14a', eisen:'#4a4a4f', lehm:'#ecdcbc'
};

function teil(gruppe, g, farbe, x = 0, zz = 0, dreh = 0, skala = 1, doppelt = false){
  const m = new THREE.Mesh(g, typeof farbe === 'string' ? mat(farbe, doppelt) : farbe);
  m.position.set(x, 0, zz); m.rotation.y = dreh; m.scale.setScalar(skala);
  m.castShadow = true; m.receiveShadow = true;
  gruppe.add(m);
  return m;
}
function einheit(bau, dach, skala = 1){ const g = new THREE.Group(); bau(g, dach); g.scale.setScalar(skala); return g; }
function setze(gruppe, obj, x, zz, dreh){ obj.position.set(x, 0, zz); obj.rotation.y = dreh; gruppe.add(obj); }

/* ---------- Häuser je Stil ---------- */
const HAUS = {
  neutral(g, dach){ teil(g, box(0.8, 0.6, 0.7), F.putz); teil(g, kegel(0.66, 0.55, 4, 0.6, Math.PI / 4), dach); },
  roemer(g, dach){ teil(g, box(0.85, 0.6, 0.72), F.putz); teil(g, kegel(0.7, 0.42, 4, 0.6, Math.PI / 4), dach); },
  griechen(g, dach){ teil(g, box(0.8, 0.58, 0.7), F.marmor); teil(g, giebel(0.95, 0.85, 0.3, 0.58), dach); },
  aegypter(g, dach){ teil(g, box(0.85, 0.62, 0.75), F.sandstein); teil(g, box(0.92, 0.1, 0.82, 0.62), dach); teil(g, box(0.3, 0.2, 0.3, 0.72), F.sandstein, 0.2, 0.15); },
  wikinger(g, dach){ teil(g, box(1.25, 0.4, 0.6), F.holz); teil(g, giebel(1.35, 0.8, 0.55, 0.4), dach); },
  mongolen(g, dach){ teil(g, zyl(0.42, 0.44, 0.4, 10), F.filz); teil(g, kegel(0.5, 0.34, 10, 0.4), dach); },
  chinesen(g, dach){ teil(g, box(0.75, 0.55, 0.65), F.lehm); teil(g, kegel(0.75, 0.2, 4, 0.55, Math.PI / 4), dach); teil(g, kegel(0.42, 0.28, 4, 0.72, Math.PI / 4), dach); }
};

/* ---------- Mitte einer Stadt je Stufe ---------- */
function tempel(g, dach, saeulen){
  teil(g, box(1.9, 0.25, 1.35), F.stein);
  const reihe = saeulen / 2;
  for (let i = 0; i < saeulen; i++){
    const seite = i < reihe ? -0.5 : 0.5, k = i % reihe;
    teil(g, zyl(0.09, 0.1, 0.9, 6, 0.25), F.marmor, -0.75 + k * (1.5 / (reihe - 1)), seite);
  }
  teil(g, box(1.9, 0.14, 1.35, 1.15), F.marmor);
  teil(g, giebel(2.0, 1.4, 0.45, 1.29), dach);
}
function pagode(g, dach, stockwerke){
  let y = 0, b = 1.0;
  for (let i = 0; i < stockwerke; i++){
    const h = 0.5 - i * 0.04;
    teil(g, box(b, h, b, y), F.lehm);
    teil(g, kegel(b * 0.95, 0.28, 4, y + h - 0.02, Math.PI / 4), dach);
    y += h + 0.18; b *= 0.8;
  }
  teil(g, kegel(0.08, 0.5, 6, y), F.gold);
}
const MITTE = {
  neutral:  [null, (g, d) => { teil(g, box(1.3, 1.0, 1.05), F.putz); teil(g, kegel(1.05, 0.75, 4, 1.0, Math.PI / 4), d); }, (g, d) => tempel(g, d, 8)],
  roemer:   [null,
    (g, d) => { teil(g, box(1.4, 0.95, 1.05), F.putz); teil(g, kegel(1.1, 0.6, 4, 0.95, Math.PI / 4), d);
      for (let i = 0; i < 4; i++) teil(g, zyl(0.08, 0.09, 0.8, 6), F.marmor, -0.6 + i * 0.4, 0.68); },
    (g, d) => { // Kolosseum
      teil(g, zyl(1.3, 1.35, 0.55, 22, 0, true), F.lehm, 0, 0, 0, 1, true);
      teil(g, zyl(1.24, 1.3, 0.5, 22, 0.55, true), '#e4d3ad', 0, 0, 0, 1, true);
      teil(g, zyl(1.2, 1.24, 0.12, 22, 1.05, true), d, 0, 0, 0, 1, true);
      teil(g, zyl(0.9, 0.9, 0.05, 16, 0.02), '#d9c49a');
      for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; teil(g, box(0.16, 0.34, 0.06, 0.12), F.steinDunkel, Math.cos(a) * 1.34, Math.sin(a) * 1.34, -a + Math.PI / 2); }
    }],
  griechen: [null, (g, d) => tempel(g, d, 4), (g, d) => tempel(g, d, 8)],
  aegypter: [null,
    (g, d) => { teil(g, zyl(0.1, 0.2, 2.2, 4, 0, false), F.sandstein, 0, 0, Math.PI / 4); teil(g, kegel(0.12, 0.25, 4, 2.2, Math.PI / 4), d);
      teil(g, box(0.7, 0.15, 0.7), F.sandstein); },
    (g, d) => { teil(g, kegel(1.55, 1.9, 4, 0, Math.PI / 4), F.sandstein); teil(g, kegel(0.36, 0.44, 4, 1.46, Math.PI / 4), d); }],
  wikinger: [null,
    (g, d) => { teil(g, box(2.0, 0.55, 0.9), F.holz); teil(g, giebel(2.2, 1.2, 0.8, 0.55), d); teil(g, box(0.1, 0.5, 0.1, 1.05), F.holzDunkel, 1.0, 0); teil(g, box(0.1, 0.5, 0.1, 1.05), F.holzDunkel, -1.0, 0); },
    (g, d) => { teil(g, box(2.4, 0.7, 1.1), F.holz); teil(g, giebel(2.6, 1.45, 1.0, 0.7), d);
      teil(g, box(0.12, 0.6, 0.12, 1.3), F.holzDunkel, 1.2, 0); teil(g, box(0.12, 0.6, 0.12, 1.3), F.holzDunkel, -1.2, 0); }],
  mongolen: [null,
    (g, d) => { teil(g, zyl(0.75, 0.78, 0.6, 12), F.filz); teil(g, kegel(0.88, 0.5, 12, 0.6), d); },
    (g, d) => { teil(g, zyl(1.0, 1.04, 0.8, 14), F.filz); teil(g, kegel(1.16, 0.65, 14, 0.8), d); teil(g, kegel(0.2, 0.3, 8, 1.4), F.gold);
      for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; teil(g, box(0.05, 0.62, 0.05, 0.1), d, Math.cos(a) * 1.04, Math.sin(a) * 1.04); } }],
  chinesen: [null, (g, d) => pagode(g, d, 2), (g, d) => pagode(g, d, 4)]
};

/* ---------- Mauern (ab Stufe 3) ---------- */
function mauer(g, stil){
  if (stil === 'wikinger'){                       // Palisade aus Pfählen
    teil(g, zyl(2.45, 2.45, 0.8, 30, 0, true), F.holz, 0, 0, 0, 1, true);
    for (let i = 0; i < 30; i++){ const a = i / 30 * Math.PI * 2; teil(g, kegel(0.14, 0.25, 4, 0.8), F.holzDunkel, Math.cos(a) * 2.45, Math.sin(a) * 2.45); }
  } else if (stil === 'mongolen'){                // niedriger Zaun
    teil(g, zyl(2.45, 2.45, 0.3, 24, 0, true), F.holz, 0, 0, 0, 1, true);
  } else {
    const farbe = stil === 'aegypter' ? F.sandstein : stil === 'chinesen' ? '#b9b3a6' : F.stein;
    teil(g, zyl(2.45, 2.45, 0.55, 28, 0, true), farbe, 0, 0, 0, 1, true);
    if (stil === 'chinesen') for (let i = 0; i < 20; i++){ const a = i / 20 * Math.PI * 2; teil(g, box(0.22, 0.18, 0.22, 0.55), farbe, Math.cos(a) * 2.45, Math.sin(a) * 2.45, -a); }
  }
}

/* ---------- Sondergebäude ---------- */
const SONDER = {
  turm(g, dach){
    teil(g, zyl(0.75, 0.9, 2.8, 8), F.stein);
    for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2; teil(g, box(0.28, 0.3, 0.28, 2.8), F.stein, Math.cos(a) * 0.7, Math.sin(a) * 0.7); }
    teil(g, kegel(1.0, 1.15, 8, 2.97), dach);
    return null;
  },
  schmiede(g, dach){
    teil(g, box(1.4, 0.85, 1.05), F.steinDunkel);
    teil(g, kegel(1.08, 0.55, 4, 0.85, Math.PI / 4), dach);
    teil(g, box(0.3, 1.0, 0.3, 0.8), '#5d544b', 0.45, -0.25);
    teil(g, box(0.4, 0.25, 0.2), F.eisen, 0, 0.85);
    teil(g, box(0.18, 0.12, 0.3, 0.25), F.eisen, 0, 0.85);
    return { x:0.45, y:2.0, z:-0.25 };          // Schornstein, dort steigt Rauch auf
  },
  kaserne(g, dach){
    teil(g, box(1.9, 0.62, 0.8, 0), F.putz, 0, -0.45);
    teil(g, giebel(2.05, 1.05, 0.5, 0.62), dach, 0, -0.45);
    teil(g, box(1.8, 0.03, 1.0, 0.01), '#c9b07c', 0, 0.55);
    for (let i = 0; i < 3; i++){       // Übungspuppen
      teil(g, zyl(0.04, 0.04, 0.6, 5), F.holzDunkel, -0.6 + i * 0.6, 0.6);
      teil(g, box(0.4, 0.05, 0.05, 0.42), F.holzDunkel, -0.6 + i * 0.6, 0.6);
      teil(g, box(0.14, 0.14, 0.14, 0.6), '#d8c7a0', -0.6 + i * 0.6, 0.6);
    }
    return null;
  }
};

function zufallsGen(seed){ let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Füllt die Gruppe mit dem Inhalt einer Stadt. Gibt die Position eines Schornsteins zurück (oder null).
function fuellen(gruppe, s, reich, dachFarbe){
  while (gruppe.children.length) gruppe.remove(gruppe.children[0]);
  const stil = HAUS[reich] ? reich : 'neutral';
  const dach = mat(dachFarbe);
  const rnd = zufallsGen(s.id * 7919 + 17);
  const sonder = s.typ !== 'stadt';
  const zahl = sonder ? 3 : [0, 4, 6, 7][s.stufe];
  const radius = sonder ? 1.8 : [0, 1.35, 1.65, 1.8][s.stufe];
  const lang = stil === 'wikinger';
  for (let i = 0; i < zahl; i++){
    const a = (i / zahl) * Math.PI * 2 + rnd() * 0.5 + 0.3;
    const r = radius + (rnd() - 0.5) * 0.3;
    // Langhäuser stehen quer zur Mitte, damit sie sich nicht überlappen
    const dreh = lang ? -a + Math.PI / 2 + (rnd() - 0.5) * 0.3 : rnd() * Math.PI;
    setze(gruppe, einheit(HAUS[stil], dach, lang ? 0.85 : 1), Math.cos(a) * r, Math.sin(a) * r, dreh);
  }
  let rauch = null;
  if (sonder){
    const g = new THREE.Group();
    rauch = SONDER[s.typ](g, dach);
    gruppe.add(g);
  } else if (s.stufe >= 2){
    const g = new THREE.Group();
    MITTE[stil][s.stufe - 1](g, dach);
    g.rotation.y = 0.3;
    gruppe.add(g);
    if (s.stufe === 3) mauer(gruppe, stil);
  }
  if (rauch){ const v = new THREE.Vector3(rauch.x, rauch.y, rauch.z); rauch = v; }
  return rauch;
}

window.Bauten = { fuellen, mat, flach };
})();
