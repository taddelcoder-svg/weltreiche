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
  if (!m){ m = new THREE.MeshLambertMaterial({ color:farbe, side:doppelt ? THREE.DoubleSide : THREE.FrontSide }); m.userData.verschmelzen = true; matCache.set(k, m); }
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
  stein:'#c8bca6', steinDunkel:'#8f877a', gold:'#e8c14a', eisen:'#4a4a4f', lehm:'#ecdcbc',
  tuer:'#5b3d27', fenster:'#33414d', rot:'#a3352b', blau:'#3b6fb0', laub:'#4f8a3c', glut:'#ff8a2a'
};
let toenung = 1;        // leichte Helligkeitsabweichung je Haus, damit eine Stadt nicht wie gestempelt aussieht

function teil(gruppe, g, farbe, x = 0, zz = 0, dreh = 0, skala = 1, doppelt = false){
  const m = new THREE.Mesh(g, typeof farbe === 'string' ? mat(farbe, doppelt) : farbe);
  m.position.set(x, 0, zz); m.rotation.y = dreh; m.scale.setScalar(skala);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.ton = toenung;
  gruppe.add(m);
  return m;
}
function einheit(bau, dach, skala = 1){ const g = new THREE.Group(); bau(g, dach); g.scale.setScalar(skala); return g; }
function setze(gruppe, obj, x, zz, dreh){ obj.position.set(x, 0, zz); obj.rotation.y = dreh; gruppe.add(obj); }

/* ---------- Kleine Details: Türen, Fenster, Schornsteine ---------- */
// Haustür vorn (+z) und Fenster ringsum; y0 = Höhe der Unterkante der Wand
function oeffnungen(g, w, h, d, tuer = F.tuer, y0 = 0){
  teil(g, box(0.16, Math.min(0.3, h * 0.55), 0.04, y0), tuer, 0, d / 2);
  for (const sx of [-1, 1]){
    teil(g, box(0.11, 0.11, 0.04, y0 + h * 0.5), F.fenster, sx * w * 0.3, d / 2);
    teil(g, box(0.04, 0.11, 0.11, y0 + h * 0.45), F.fenster, sx * w / 2, 0);
  }
  teil(g, box(0.11, 0.11, 0.04, y0 + h * 0.5), F.fenster, 0, -d / 2);
}
const schornstein = (g, x, zz, y0) => { teil(g, box(0.13, 0.28, 0.13, y0), F.steinDunkel, x, zz); teil(g, box(0.17, 0.04, 0.17, y0 + 0.28), F.stein, x, zz); };
const sockel = (g, w, d, farbe = F.stein) => teil(g, box(w + 0.07, 0.07, d + 0.07), farbe);
function palme(g, x, zz, s = 1){
  teil(g, zyl(0.025 * s, 0.045 * s, 0.55 * s, 5), F.holz, x, zz);
  for (let i = 0; i < 5; i++) teil(g, box(0.34 * s, 0.025, 0.09 * s, 0.55 * s), F.laub, x + Math.cos(i * 1.26) * 0.14 * s, zz + Math.sin(i * 1.26) * 0.14 * s, -i * 1.26);
}
function drachenkopf(g, x, y, zz, dreh){
  teil(g, kegel(0.05, 0.22, 4, y), F.holzDunkel, x, zz, dreh);
}
const rundschild = (g, x, y, zz, farbe, dreh) => {
  const m = teil(g, zyl(0.1, 0.1, 0.03, 8), farbe, x, zz, 0); m.rotation.set(Math.PI / 2, 0, dreh); m.position.y = y; return m;
};

/* ---------- Häuser je Stil ---------- */
const HAUS = {
  neutral(g, dach){
    sockel(g, 0.8, 0.7);
    teil(g, box(0.8, 0.6, 0.7), F.putz); oeffnungen(g, 0.8, 0.6, 0.7);
    teil(g, kegel(0.7, 0.55, 4, 0.6, Math.PI / 4), dach); schornstein(g, 0.22, -0.1, 0.72);
  },
  roemer(g, dach){
    sockel(g, 0.85, 0.72);
    teil(g, box(0.85, 0.6, 0.72), F.putz); oeffnungen(g, 0.85, 0.6, 0.72, F.tuer);
    teil(g, box(0.85, 0.05, 0.74, 0.5), '#d9c9a6');                       // Gesims
    teil(g, kegel(0.76, 0.42, 4, 0.6, Math.PI / 4), dach); schornstein(g, -0.2, -0.12, 0.7);
  },
  griechen(g, dach){
    sockel(g, 0.8, 0.7, F.marmor);
    teil(g, box(0.8, 0.58, 0.7), F.marmor); oeffnungen(g, 0.8, 0.58, 0.7, F.blau);
    teil(g, box(0.82, 0.04, 0.72, 0.42), F.blau);                           // blaues Zierband
    teil(g, giebel(0.95, 0.85, 0.3, 0.58), dach);
  },
  aegypter(g, dach){
    sockel(g, 0.85, 0.75, F.sandstein);
    teil(g, box(0.85, 0.62, 0.75), F.sandstein); oeffnungen(g, 0.85, 0.62, 0.75, F.tuer);
    teil(g, box(0.92, 0.1, 0.82, 0.62), dach); teil(g, box(0.3, 0.2, 0.3, 0.72), F.sandstein, 0.2, 0.15);
    teil(g, box(0.34, 0.03, 0.34, 0.92), dach, 0.2, 0.15);
    teil(g, box(0.5, 0.05, 0.05, 0.4), '#c8553d', 0, 0.41);              // Markise
    palme(g, -0.62, 0.45, 0.8);
  },
  wikinger(g, dach){
    teil(g, box(1.25, 0.4, 0.6), F.holz);
    for (let i = -3; i <= 3; i++){ teil(g, box(0.025, 0.4, 0.62), F.holzDunkel, i * 0.17, 0); }  // Bohlen
    oeffnungen(g, 1.25, 0.4, 0.6, F.holzDunkel);
    teil(g, giebel(1.35, 0.8, 0.55, 0.4), dach);
    drachenkopf(g, 0.66, 0.9, 0, -0.5); drachenkopf(g, -0.66, 0.9, 0, 0.5);
    rundschild(g, 0.35, 0.22, 0.31, '#b8452f', 0); rundschild(g, -0.35, 0.22, 0.31, '#d9b44a', 0);
  },
  mongolen(g, dach){
    teil(g, zyl(0.42, 0.44, 0.4, 10), F.filz);
    teil(g, zyl(0.445, 0.445, 0.04, 10, 0.18), F.holzDunkel);              // Gurtband
    teil(g, box(0.16, 0.27, 0.04), F.tuer, 0, 0.44);
    teil(g, kegel(0.5, 0.34, 10, 0.4), dach); teil(g, zyl(0.07, 0.07, 0.05, 6, 0.73), F.holzDunkel);
  },
  chinesen(g, dach){
    sockel(g, 0.75, 0.65, F.steinDunkel);
    teil(g, box(0.75, 0.55, 0.65), F.lehm); oeffnungen(g, 0.75, 0.55, 0.65, F.rot);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) teil(g, box(0.06, 0.55, 0.06), F.rot, sx * 0.37, sz * 0.32);
    teil(g, kegel(0.8, 0.2, 4, 0.55, Math.PI / 4), dach); teil(g, kegel(0.44, 0.28, 4, 0.72, Math.PI / 4), dach);
    teil(g, kegel(0.04, 0.16, 5, 1.0), F.gold);
  }
};

/* ---------- Mitte einer Stadt je Stufe ---------- */
function tempel(g, dach, saeulen){
  teil(g, box(2.1, 0.08, 1.55), F.stein); teil(g, box(2.0, 0.08, 1.45, 0.08), F.marmor);   // Stufen
  teil(g, box(1.9, 0.12, 1.35, 0.16), F.stein);
  const reihe = saeulen / 2;
  for (let i = 0; i < saeulen; i++){
    const seite = i < reihe ? -0.5 : 0.5, k = i % reihe, x = -0.75 + k * (1.5 / (reihe - 1));
    teil(g, box(0.24, 0.07, 0.24, 0.28), F.stein, x, seite);
    teil(g, zyl(0.09, 0.1, 0.8, 8, 0.35), F.marmor, x, seite);
    teil(g, box(0.25, 0.06, 0.25, 1.12), F.marmor, x, seite);
  }
  teil(g, box(1.3, 0.8, 0.5, 0.28), F.putz, 0, 0);                                           // Cella
  teil(g, box(0.2, 0.4, 0.04, 0.28), F.tuer, 0, 0.26);
  teil(g, box(1.9, 0.14, 1.35, 1.18), F.marmor);
  teil(g, giebel(2.0, 1.4, 0.45, 1.32), dach);
  teil(g, kegel(0.06, 0.2, 4, 1.8), F.gold, 0, 0);
}
function pagode(g, dach, stockwerke){
  let y = 0, b = 1.0;
  teil(g, box(1.45, 0.1, 1.45), F.stein); y = 0.1;
  for (let i = 0; i < stockwerke; i++){
    const h = 0.5 - i * 0.04;
    teil(g, box(b, h, b, y), F.lehm);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) teil(g, box(0.06, h, 0.06, y), F.rot, sx * b / 2, sz * b / 2);
    teil(g, box(b * 0.3, h * 0.55, b * 1.02, y + h * 0.15), F.fenster, 0, 0);
    teil(g, kegel(b * 1.0, 0.28, 4, y + h - 0.02, Math.PI / 4), dach);
    for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2 + Math.PI / 4, r = b * 0.7; teil(g, kegel(0.04, 0.12, 4, y + h + 0.0), F.gold, Math.cos(a) * r, Math.sin(a) * r); }
    y += h + 0.18; b *= 0.8;
  }
  teil(g, kegel(0.08, 0.5, 6, y), F.gold);
}
function halle(g, dach, l, br, hoehe){
  teil(g, box(l, 0.55 * hoehe, br), F.holz);
  for (let i = -5; i <= 5; i++) teil(g, box(0.03, 0.55 * hoehe, br + 0.02), F.holzDunkel, i * l / 11, 0);
  teil(g, box(0.28, 0.4 * hoehe, 0.04), F.tuer, 0, br / 2);
  teil(g, giebel(l + 0.2, br + 0.3, 0.8 * hoehe, 0.55 * hoehe), dach);
  for (const s of [-1, 1]){
    teil(g, box(0.1, 0.5, 0.1, 1.05 * hoehe), F.holzDunkel, s * (l / 2 + 0.05), 0);
    drachenkopf(g, s * (l / 2 + 0.08), 1.5 * hoehe, 0, -s * 0.5);
    for (let k = 0; k < 4; k++) rundschild(g, s * 0.12 + (k - 1.5) * l * 0.2, 0.28, br / 2 + 0.03, k % 2 ? '#d9b44a' : '#b8452f', 0);
  }
}
const MITTE = {
  neutral:  [null, (g, d) => { sockel(g, 1.3, 1.05); teil(g, box(1.3, 1.0, 1.05), F.putz); oeffnungen(g, 1.3, 1.0, 1.05); teil(g, kegel(1.05, 0.75, 4, 1.0, Math.PI / 4), d); schornstein(g, 0.3, -0.2, 1.2); }, (g, d) => tempel(g, d, 8)],
  roemer:   [null,
    (g, d) => { sockel(g, 1.4, 1.05); teil(g, box(1.4, 0.95, 1.05), F.putz); oeffnungen(g, 1.4, 0.95, 1.05); teil(g, kegel(1.1, 0.6, 4, 0.95, Math.PI / 4), d);
      for (let i = 0; i < 4; i++){ teil(g, zyl(0.08, 0.09, 0.8, 8), F.marmor, -0.6 + i * 0.4, 0.68); teil(g, box(0.2, 0.05, 0.2, 0.8), F.marmor, -0.6 + i * 0.4, 0.68); }
      teil(g, box(1.4, 0.06, 0.3, 0.84), F.marmor, 0, 0.68); },
    (g, d) => { // Kolosseum
      teil(g, zyl(1.3, 1.35, 0.55, 22, 0, true), F.lehm, 0, 0, 0, 1, true);
      teil(g, zyl(1.24, 1.3, 0.5, 22, 0.55, true), '#e4d3ad', 0, 0, 0, 1, true);
      teil(g, zyl(1.2, 1.24, 0.12, 22, 1.05, true), d, 0, 0, 0, 1, true);
      teil(g, zyl(0.9, 0.9, 0.05, 16, 0.02), '#d9c49a');
      for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; teil(g, box(0.16, 0.34, 0.06, 0.12), F.steinDunkel, Math.cos(a) * 1.34, Math.sin(a) * 1.34, -a + Math.PI / 2);
        teil(g, box(0.14, 0.26, 0.06, 0.62), F.steinDunkel, Math.cos(a + 0.26) * 1.28, Math.sin(a + 0.26) * 1.28, -a - 0.26 + Math.PI / 2); }
      for (let i = 0; i < 16; i++){ const a = i / 16 * Math.PI * 2; teil(g, box(0.22, 0.08, 0.18, 1.12), '#efe3c3', Math.cos(a) * 1.22, Math.sin(a) * 1.22, -a); }
      teil(g, zyl(0.9, 1.1, 0.02, 16, 0.05), '#c9ae78');
    }],
  griechen: [null, (g, d) => tempel(g, d, 4), (g, d) => tempel(g, d, 8)],
  aegypter: [null,
    (g, d) => { teil(g, box(0.7, 0.15, 0.7), F.sandstein); teil(g, zyl(0.1, 0.2, 2.2, 4, 0, false), F.sandstein, 0, 0, Math.PI / 4); teil(g, kegel(0.12, 0.25, 4, 2.2, Math.PI / 4), F.gold);
      teil(g, box(0.5, 0.06, 0.5, 0.15), F.stein); },
    (g, d) => { teil(g, box(3.4, 0.12, 3.4), F.sandstein); teil(g, kegel(1.55, 1.9, 4, 0.1, Math.PI / 4), F.sandstein); teil(g, kegel(0.36, 0.44, 4, 1.56, Math.PI / 4), F.gold);
      teil(g, box(0.5, 0.5, 0.06, 0.1), F.fenster, 0, 1.05);
      for (const s of [-1, 1]){ teil(g, kegel(0.1, 0.8, 4, 0.1, Math.PI / 4), F.sandstein, s * 0.55, 1.75); teil(g, kegel(0.03, 0.12, 4, 0.9), F.gold, s * 0.55, 1.75); } }],
  wikinger: [null,
    (g, d) => halle(g, d, 2.0, 0.9, 1),
    (g, d) => halle(g, d, 2.4, 1.1, 1.2)],
  mongolen: [null,
    (g, d) => { teil(g, zyl(0.75, 0.78, 0.6, 12), F.filz); teil(g, zyl(0.785, 0.785, 0.05, 12, 0.25), F.holzDunkel); teil(g, box(0.26, 0.42, 0.05), F.tuer, 0, 0.78); teil(g, kegel(0.88, 0.5, 12, 0.6), d); teil(g, zyl(0.1, 0.1, 0.06, 8, 1.07), F.holzDunkel); },
    (g, d) => { teil(g, zyl(1.0, 1.04, 0.8, 14), F.filz); teil(g, zyl(1.045, 1.045, 0.06, 14, 0.35), F.holzDunkel); teil(g, box(0.3, 0.55, 0.05), F.tuer, 0, 1.03); teil(g, kegel(1.16, 0.65, 14, 0.8), d); teil(g, kegel(0.2, 0.3, 8, 1.4), F.gold);
      for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; teil(g, box(0.05, 0.62, 0.05, 0.1), d, Math.cos(a) * 1.04, Math.sin(a) * 1.04); } }],
  chinesen: [null, (g, d) => pagode(g, d, 2), (g, d) => pagode(g, d, 4)]
};

/* ---------- Mauern (ab Stufe 3) ---------- */
function mauer(g, stil){
  if (stil === 'wikinger'){                       // Palisade aus Pfählen
    teil(g, zyl(2.45, 2.45, 0.8, 30, 0, true), F.holz, 0, 0, 0, 1, true);
    for (let i = 0; i < 30; i++){ const a = i / 30 * Math.PI * 2; teil(g, kegel(0.14, 0.25, 4, 0.8), F.holzDunkel, Math.cos(a) * 2.45, Math.sin(a) * 2.45); }
    for (let i = 0; i < 30; i++){ const a = (i + 0.5) / 30 * Math.PI * 2; teil(g, box(0.09, 0.5, 0.09, 0.78), F.holzDunkel, Math.cos(a) * 2.45, Math.sin(a) * 2.45); }
  } else if (stil === 'mongolen'){                // niedriger Zaun
    teil(g, zyl(2.45, 2.45, 0.3, 24, 0, true), F.holz, 0, 0, 0, 1, true);
    for (let i = 0; i < 24; i++){ const a = i / 24 * Math.PI * 2; teil(g, box(0.07, 0.38, 0.07), F.holzDunkel, Math.cos(a) * 2.45, Math.sin(a) * 2.45); }
  } else {
    const farbe = stil === 'aegypter' ? F.sandstein : stil === 'chinesen' ? '#b9b3a6' : F.stein;
    teil(g, zyl(2.45, 2.45, 0.55, 28, 0, true), farbe, 0, 0, 0, 1, true);
    teil(g, zyl(2.52, 2.52, 0.08, 28, 0.55, true), F.steinDunkel, 0, 0, 0, 1, true);
    for (let i = 0; i < 20; i++){ const a = i / 20 * Math.PI * 2; teil(g, box(0.22, 0.18, 0.22, 0.58), farbe, Math.cos(a) * 2.45, Math.sin(a) * 2.45, -a); }
    for (let i = 0; i < 4; i++){ const a = i / 4 * Math.PI * 2 + 0.78; teil(g, box(0.5, 0.9, 0.5), farbe, Math.cos(a) * 2.45, Math.sin(a) * 2.45, -a); teil(g, kegel(0.42, 0.35, 4, 0.9, Math.PI / 4), stil === 'chinesen' ? F.rot : F.steinDunkel, Math.cos(a) * 2.45, Math.sin(a) * 2.45); }
  }
}

/* ---------- Sondergebäude ---------- */
const SONDER = {
  turm(g, dach){
    teil(g, zyl(1.0, 1.05, 0.2, 8), F.steinDunkel);
    teil(g, zyl(0.75, 0.9, 2.6, 8, 0.2), F.stein);
    for (let i = 0; i < 4; i++){ const a = i * Math.PI / 2 + 0.4; teil(g, box(0.07, 0.34, 0.05, 1.0 + i * 0.35), F.fenster, Math.cos(a) * 0.8, Math.sin(a) * 0.8, -a + Math.PI / 2); }
    teil(g, zyl(0.95, 0.8, 0.14, 8, 2.76), F.steinDunkel);
    for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2; teil(g, box(0.28, 0.3, 0.28, 2.9), F.stein, Math.cos(a) * 0.7, Math.sin(a) * 0.7); }
    teil(g, kegel(1.0, 1.15, 8, 3.0), dach);
    teil(g, kegel(0.04, 0.25, 4, 4.1), F.gold);
    return null;
  },
  schmiede(g, dach){
    teil(g, box(1.5, 0.08, 1.15), F.steinDunkel);
    teil(g, box(1.4, 0.85, 1.05, 0.04), F.steinDunkel);
    for (let i = -3; i <= 3; i++) teil(g, box(0.02, 0.85, 1.07, 0.04), '#7c746a', i * 0.2, 0);
    teil(g, kegel(1.08, 0.55, 4, 0.89, Math.PI / 4), dach);
    teil(g, box(0.3, 1.0, 0.3, 0.8), '#5d544b', 0.45, -0.25);
    teil(g, box(0.34, 0.06, 0.34, 1.8), F.steinDunkel, 0.45, -0.25);
    teil(g, box(0.5, 0.35, 0.04, 0.2), F.fenster, 0, 0.53);                     // offene Esse
    teil(g, box(0.4, 0.2, 0.2, 0.04), F.eisen, 0.1, 0.9);                       // Amboss
    teil(g, box(0.18, 0.1, 0.3, 0.24), F.eisen, 0.1, 0.9);
    teil(g, box(0.5, 0.18, 0.4, 0.04), '#6b4a2a', -0.5, 0.85);                 // Holzstapel
    return { x:0.45, y:2.1, z:-0.25 };          // Schornstein, dort steigt Rauch auf
  },
  kaserne(g, dach){
    teil(g, box(1.9, 0.62, 0.8, 0), F.putz, 0, -0.45);
    teil(g, box(1.95, 0.05, 0.85, 0.55), '#cdbb95', 0, -0.45);
    teil(g, giebel(2.05, 1.05, 0.5, 0.62), dach, 0, -0.45);
    for (let i = -1; i <= 1; i++) teil(g, box(0.12, 0.2, 0.04, 0.3), F.fenster, i * 0.6, -0.04);
    teil(g, box(0.26, 0.38, 0.04), F.tuer, 0, -0.04);
    teil(g, box(1.8, 0.03, 1.0, 0.01), '#c9b07c', 0, 0.55);
    for (let i = 0; i < 3; i++){       // Übungspuppen
      teil(g, zyl(0.04, 0.04, 0.6, 5), F.holzDunkel, -0.6 + i * 0.6, 0.6);
      teil(g, box(0.4, 0.05, 0.05, 0.42), F.holzDunkel, -0.6 + i * 0.6, 0.6);
      teil(g, box(0.14, 0.14, 0.14, 0.6), '#d8c7a0', -0.6 + i * 0.6, 0.6);
      teil(g, box(0.16, 0.2, 0.12, 0.2), '#c9b07c', -0.6 + i * 0.6, 0.6);
    }
    for (let i = 0; i < 3; i++) teil(g, zyl(0.015, 0.015, 0.8, 4, 0.0), F.holzDunkel, 0.65 + i * 0.1, 0.95); // Speerständer
    return null;
  }
};

function zufallsGen(seed){ let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- Verschmelzen: eine ganze Stadt wird zu zwei Meshes ---------- */
// Jedes Teil bringt seine Farbe als Vertexfarbe mit (mit Bodenverschattung), so braucht eine Stadt nur zwei Drawcalls.
const matVertex = new THREE.MeshLambertMaterial({ color:'#ffffff', vertexColors:true });
const matVertex2 = new THREE.MeshLambertMaterial({ color:'#ffffff', vertexColors:true, side:THREE.DoubleSide });
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3(), _c = new THREE.Color();
function verschmelzen(gruppe){
  gruppe.updateMatrix();
  const liste = [];
  const geh = (o, eltern) => {
    for (const k of o.children){
      k.updateMatrix();
      const m = eltern.clone().multiply(k.matrix);
      if (k.isMesh) liste.push([k, m]); else geh(k, m);
    }
  };
  geh(gruppe, new THREE.Matrix4());
  const sammlung = new Map();
  for (const [mesh, m] of liste){
    if (!mesh.material.userData.verschmelzen) continue;
    const doppelt = mesh.material.side === THREE.DoubleSide;
    let s = sammlung.get(doppelt);
    if (!s){ s = { pos:[], nor:[], col:[] }; sammlung.set(doppelt, s); }
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pa = g.attributes.position, na = g.attributes.normal;
    _m3.getNormalMatrix(m);
    const basis = mesh.material.color, ton = mesh.userData.ton || 1;
    for (let i = 0; i < pa.count; i++){
      _v.fromBufferAttribute(pa, i).applyMatrix4(m);
      _n.fromBufferAttribute(na, i).applyMatrix3(_m3).normalize();
      // Boden dunkler (weiche Verschattung am Fuß), Oberseiten minimal heller
      const ao = 0.74 + 0.26 * Math.min(1, Math.max(0, _v.y) / 0.5);
      const f = ton * ao * (1 + 0.05 * _n.y);
      s.pos.push(_v.x, _v.y, _v.z); s.nor.push(_n.x, _n.y, _n.z);
      s.col.push(basis.r * f, basis.g * f, basis.b * f);
    }
    if (g !== mesh.geometry) g.dispose();
  }
  const behalten = liste.filter(([mesh]) => !mesh.material.userData.verschmelzen);
  while (gruppe.children.length) gruppe.remove(gruppe.children[0]);
  for (const [mesh, m] of behalten){ m.decompose(mesh.position, mesh.quaternion, mesh.scale); gruppe.add(mesh); }
  for (const [doppelt, s] of sammlung){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
    const m = new THREE.Mesh(g, doppelt ? matVertex2 : matVertex);
    m.castShadow = true; m.receiveShadow = true; m.userData.eigen = true;
    gruppe.add(m);
  }
}
function leeren(gruppe){
  for (const k of gruppe.children) if (k.userData.eigen) k.geometry.dispose();
  while (gruppe.children.length) gruppe.remove(gruppe.children[0]);
}

// Füllt die Gruppe mit dem Inhalt einer Stadt. Gibt die Position eines Schornsteins zurück (oder null).
function fuellen(gruppe, s, reich, dachFarbe){
  leeren(gruppe);
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
    // Langhäuser stehen quer zur Mitte, damit sie sich nicht überlappen; alle Haustüren schauen zur Mitte
    const jitter = (rnd() - 0.5) * 0.5;
    const dreh = lang ? -a - Math.PI / 2 + jitter * 0.6 : Math.atan2(-Math.cos(a), -Math.sin(a)) + jitter;
    toenung = 0.9 + rnd() * 0.16;
    setze(gruppe, einheit(HAUS[stil], dach, lang ? 0.85 : 1), Math.cos(a) * r, Math.sin(a) * r, dreh);
  }
  toenung = 1;
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
  verschmelzen(gruppe);
  if (s.typ === 'schmiede'){                       // glühende Esse (leuchtet unabhängig vom Licht)
    const glut = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.05).translate(0, 0.5, 0.56), new THREE.MeshBasicMaterial({ color:F.glut }));
    glut.userData.eigen = true;
    gruppe.add(glut);
  }
  return rauch;
}

window.Bauten = { fuellen, mat, flach };
})();
