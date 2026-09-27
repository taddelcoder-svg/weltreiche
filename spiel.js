'use strict';
// Weltreiche – 3D-Grafik (three.js r128), Steuerung, Ton und Menüs.
// Die Regeln stehen in logik.js, die Gebäude in bauten.js.
(function(){
const L = window.Logik, B = window.Bauten;
const $ = s => document.querySelector(s);
const HANDY = matchMedia('(pointer: coarse)').matches;
const mat = B.mat, flach = B.flach;

/* ---------- Einstellungen (nur im Browser gespeichert) ---------- */
const speicher = {
  lesen(k, std){ try { const v = localStorage.getItem('weltreiche.' + k); return v == null ? std : JSON.parse(v); } catch { return std; } },
  schreiben(k, v){ try { localStorage.setItem('weltreiche.' + k, JSON.stringify(v)); } catch {} }
};
const wahl = {
  reich:speicher.lesen('reich', 'roemer'), stufe:speicher.lesen('stufe', 1), ton:speicher.lesen('ton', true),
  anzahl:speicher.lesen('anzahl', 1), karte:speicher.lesen('karte', 'zufall')
};

/* ---------- Renderer, Szene, Licht ---------- */
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, HANDY ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#szene').appendChild(renderer.domElement);
// Wenn die Grafikkarte den Kontext kurz verliert, darf der Browser ihn wiederherstellen
renderer.domElement.addEventListener('webglcontextlost', e => e.preventDefault());

const HIMMEL = '#a9d8ef';
const szene = new THREE.Scene();
szene.background = new THREE.Color(HIMMEL);
szene.fog = new THREE.Fog(HIMMEL, 110, 230);
const kamera = new THREE.PerspectiveCamera(40, 1, 0.5, 480);

szene.add(new THREE.HemisphereLight('#fff1d8', '#4a5a34', 0.5));
const sonne = new THREE.DirectionalLight('#fff0d4', 0.72);
sonne.position.set(-28, 55, 30);
sonne.castShadow = true;
sonne.shadow.mapSize.set(HANDY ? 1024 : 2048, HANDY ? 1024 : 2048);
Object.assign(sonne.shadow.camera, { left:-50, right:50, top:48, bottom:-48, near:1, far:170 });
sonne.shadow.bias = -0.0008;
szene.add(sonne, sonne.target);

/* ---------- Bausteine ---------- */
function netz(geo, material, schatten = true){
  const m = new THREE.Mesh(geo, material);
  m.castShadow = schatten; m.receiveShadow = true;
  return m;
}
const G = {
  platz: new THREE.CircleGeometry(2.7, 24).rotateX(-Math.PI / 2).translate(0, 0.05, 0),
  ring:  new THREE.RingGeometry(2.7, 3.05, 40).rotateX(-Math.PI / 2).translate(0, 0.07, 0),
  mast:  new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5).translate(0, 1.7, 0),
  fahne: new THREE.PlaneGeometry(0.95, 0.58).translate(0.475, 0, 0)
};
const HOLZ = '#7a5534', NEUTRAL_DACH = '#a19684', PLATZ = '#d4c196';

let z = null;          // aktueller Spielzustand
let ICH = -1;          // eigener Spielerplatz (-1 = Zuschauen im Hauptmenü)
const farbeVon = sp => (sp >= 0 && z ? L.REICH[z.spieler[sp].reich].farbe : NEUTRAL_DACH);
const reichVon = sp => L.REICH[z.spieler[sp].reich];
// Computergegner heißen wie ihr Reich (Mehrzahl), Menschen tragen ihren Spitznamen
const menschlich = sp => z.spieler[sp].name !== L.REICH[z.spieler[sp].reich].name;
const satz = (sp, einzahl, mehrzahl) => (menschlich(sp) ? `${z.spieler[sp].name} ${einzahl}` : `Die ${z.spieler[sp].name} ${mehrzahl}`);

/* ---------- Welt: Meer, Insel, Fluss, Straßen, Bäume ---------- */
const wasserGeo = new THREE.PlaneGeometry(340, 340, 60, 60).rotateX(-Math.PI / 2);
const wasser = new THREE.Mesh(wasserGeo, new THREE.MeshPhongMaterial({ color:'#3d9ccd', flatShading:true, shininess:70, specular:'#bfe6ff' }));
wasser.position.y = -0.6; wasser.receiveShadow = true;
szene.add(wasser);
const wasserBasis = Float32Array.from(wasserGeo.attributes.position.array);
function wellen(t){
  const p = wasserGeo.attributes.position.array;
  for (let i = 0; i < p.length; i += 3){
    const x = wasserBasis[i], zz = wasserBasis[i + 2];
    p[i + 1] = Math.sin(x * 0.16 + t * 0.9) * 0.14 + Math.cos(zz * 0.21 + t * 1.2) * 0.1;
  }
  wasserGeo.attributes.position.needsUpdate = true;
}

let welt = null;          // alles, was zur aktuellen Karte gehört
let inselRand = [];       // Umriss der Insel (für Bäume und Kamera)

function zufallsGen(seed){ let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function inselUmriss(form){
  const pts = [], N = 80;
  for (let i = 0; i < N; i++){
    const a = i / N * Math.PI * 2;
    const r = 1 + 0.07 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a + 2) + 0.03 * Math.sin(9 * a + 0.5);
    pts.push({ x:Math.cos(a) * form.rx * r, z:Math.sin(a) * form.rz * r });
  }
  return pts;
}
function imUmriss(x, zz, pts, skala = 1){
  let drin = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const xi = pts[i].x * skala, zi = pts[i].z * skala, xj = pts[j].x * skala, zj = pts[j].z * skala;
    if ((zi > zz) !== (zj > zz) && x < (xj - xi) * (zz - zi) / (zj - zi) + xi) drin = !drin;
  }
  return drin;
}
function platte(pts, skala, tiefe, obenY, oben, seite){
  const form = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x * skala, -p.z * skala)));
  const g = new THREE.ExtrudeGeometry(form, { depth:tiefe, bevelEnabled:false, curveSegments:1 }).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, [mat(oben), mat(seite)]);
  m.position.y = obenY - tiefe; m.receiveShadow = true;
  return m;
}
function abstandZuStrecke(px, pz, a, b){
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}
const flussX = zz => 1.6 * Math.sin(zz * 0.18);
function flach2(len, breit, y, farbe){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, breit).rotateX(-Math.PI / 2), farbe);
  m.position.y = y; m.receiveShadow = true;
  return m;
}
function ausrichten(m, A, B){
  m.position.x = (A.x + B.x) / 2; m.position.z = (A.z + B.z) / 2;
  m.rotation.y = Math.atan2(-(B.z - A.z), B.x - A.x);
}

function flussBauen(){
  const flussMat = new THREE.MeshLambertMaterial({ color:'#4aa3d4', polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 });
  let stueck = [];
  const fertig = () => {
    if (stueck.length > 1){
      const pos = [], idx = [];
      stueck.forEach(([x, zz], i) => {
        pos.push(x - 1.7, 0.035, zz, x + 1.7, 0.035, zz);
        if (i) idx.push(2 * i - 2, 2 * i, 2 * i - 1, 2 * i - 1, 2 * i, 2 * i + 1);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, flussMat); m.receiveShadow = true;
      welt.add(m);
    }
    stueck = [];
  };
  const rz = z.form.rz * 1.15;
  for (let zz = -rz; zz <= rz; zz += 0.7){
    const x = flussX(zz);
    const auf = imUmriss(x, zz, inselRand, 1.03) && z.staedte.every(s => Math.hypot(s.x - x, s.z - zz) > 3.4);
    if (auf) stueck.push([x, zz]); else fertig();
  }
  fertig();
  // Brücken, wo Straßen den Fluss kreuzen
  const holz = mat('#9a7048'), gelaender = mat('#6b4a2a');
  for (const [a, b] of z.wege){
    const A = z.staedte[a], Bs = z.staedte[b];
    const f = t => (A.x + (Bs.x - A.x) * t) - flussX(A.z + (Bs.z - A.z) * t);
    if (Math.sign(f(0)) === Math.sign(f(1))) continue;
    let lo = 0, hi = 1;
    for (let k = 0; k < 30; k++){ const m = (lo + hi) / 2; if (Math.sign(f(m)) === Math.sign(f(lo))) lo = m; else hi = m; }
    const P = { x:A.x + (Bs.x - A.x) * lo, z:A.z + (Bs.z - A.z) * lo };
    if (z.staedte.some(s => Math.hypot(s.x - P.x, s.z - P.z) < 3.8)) continue;
    const bruecke = new THREE.Group();
    bruecke.add(netz(new THREE.BoxGeometry(4.2, 0.16, 1.7).translate(0, 0.12, 0), holz));
    for (const s of [-0.8, 0.8]) bruecke.add(netz(new THREE.BoxGeometry(4.2, 0.08, 0.08).translate(0, 0.42, s), gelaender));
    for (const x of [-2, -1, 0, 1, 2]) for (const s of [-0.8, 0.8]) bruecke.add(netz(new THREE.BoxGeometry(0.08, 0.3, 0.08).translate(x, 0.28, s), gelaender));
    bruecke.position.set(P.x, 0, P.z);
    bruecke.rotation.y = Math.atan2(-(Bs.z - A.z), Bs.x - A.x);
    welt.add(bruecke);
  }
}

function weltBauen(){
  if (welt){
    // Städte nutzen gemeinsame Formen aus bauten.js, die bleiben erhalten
    const stadtGruppen = new Set(stadtObj.map(o => o.g));
    szene.remove(welt);
    for (const kind of welt.children) if (!stadtGruppen.has(kind)) kind.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  welt = new THREE.Group();
  szene.add(welt);
  const form = z.form;
  inselRand = inselUmriss(form);
  welt.add(platte(inselRand, 1.06, 5, -0.3, '#e3cf98', '#b89b62'));
  welt.add(platte(inselRand, 1, 5, 0, '#8fc35c', '#8a6a42'));

  const strassenMat = new THREE.MeshLambertMaterial({ color:'#dcc48f', polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
  for (const [a, b] of z.wege){
    const A = z.staedte[a], Bs = z.staedte[b];
    const m = flach2(Math.hypot(Bs.x - A.x, Bs.z - A.z), 1.25, 0.03, strassenMat);
    ausrichten(m, A, Bs);
    welt.add(m);
  }
  if (form.fluss) flussBauen();

  // Bäume, Felsen und Felder, fern von Städten, Straßen und Fluss
  const rnd = zufallsGen(4242);
  const frei = (x, zz, abstandStadt, abstandWeg) => imUmriss(x, zz, inselRand, 0.93)
    && (!form.fluss || Math.abs(x - flussX(zz)) > 2.8)
    && z.staedte.every(s => Math.hypot(s.x - x, s.z - zz) > abstandStadt)
    && z.wege.every(([a, b]) => abstandZuStrecke(x, zz, z.staedte[a], z.staedte[b]) > abstandWeg);
  const flaeche = form.rx * form.rz / (40 * 28);
  const baeume = [], ziel = Math.round(260 * flaeche);
  for (let v = 0; v < 3000 * flaeche && baeume.length < ziel; v++){
    // Bäume stehen gern in Wäldchen
    const x = (rnd() * 2 - 1) * form.rx, zz = (rnd() * 2 - 1) * form.rz;
    const dichte = Math.sin(x * 0.21 + 1.3) * Math.cos(zz * 0.26 - 0.4);
    if (dichte < 0.05 && rnd() > 0.12) continue;
    if (frei(x, zz, 3.6, 1.3)) baeume.push({ x, z:zz, s:0.75 + rnd() * 0.55, f:rnd() });
  }
  const kroneGeo = flach(new THREE.ConeGeometry(0.85, 2.1, 6)).translate(0, 1.55, 0);
  const stammGeo = flach(new THREE.CylinderGeometry(0.13, 0.18, 0.6, 5)).translate(0, 0.3, 0);
  const kronen = new THREE.InstancedMesh(kroneGeo, new THREE.MeshLambertMaterial({ color:'#ffffff' }), Math.max(1, baeume.length));
  const staemme = new THREE.InstancedMesh(stammGeo, mat(HOLZ), Math.max(1, baeume.length));
  const dummy = new THREE.Object3D(), farbe = new THREE.Color();
  const gruen = ['#4f8f3a', '#5c9e40', '#437f35', '#6aa84a'];
  baeume.forEach((b, i) => {
    dummy.position.set(b.x, 0, b.z); dummy.scale.setScalar(b.s); dummy.rotation.y = b.f * 6; dummy.updateMatrix();
    kronen.setMatrixAt(i, dummy.matrix); staemme.setMatrixAt(i, dummy.matrix);
    kronen.setColorAt(i, farbe.set(gruen[Math.floor(b.f * gruen.length)]));
  });
  kronen.count = staemme.count = baeume.length;
  kronen.castShadow = staemme.castShadow = true;
  welt.add(kronen, staemme);

  const felsGeo = flach(new THREE.DodecahedronGeometry(0.6, 0));
  for (let v = 0, n = 0; v < 500 && n < 26 * flaeche; v++){
    const x = (rnd() * 2 - 1) * form.rx, zz = (rnd() * 2 - 1) * form.rz;
    if (!frei(x, zz, 3.4, 1.2)) continue;
    const m = netz(felsGeo, mat(rnd() < 0.5 ? '#a8a296' : '#9a9387'));
    m.position.set(x, 0.1, zz); m.scale.set(0.6 + rnd(), 0.4 + rnd() * 0.6, 0.6 + rnd()); m.rotation.y = rnd() * 6;
    welt.add(m); n++;
  }
  const feldFarben = ['#d8c25a', '#c9b24a', '#9fc45e', '#b7cf6a'];
  for (const s of z.staedte){
    for (let k = 0; k < 2; k++){
      const a = rnd() * Math.PI * 2, r = 4.2 + rnd() * 1.2, x = s.x + Math.cos(a) * r, zz = s.z + Math.sin(a) * r;
      if (!frei(x, zz, 3.3, 1.4)) continue;
      const f = netz(new THREE.BoxGeometry(2.2, 0.08, 1.4), mat(feldFarben[Math.floor(rnd() * 4)]), false);
      f.position.set(x, 0.04, zz); f.rotation.y = rnd() * 3;
      welt.add(f);
    }
  }

  staedteBauen();
}

/* ---------- Städte ---------- */
let stadtObj = [];
function stadtBauen(s){
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  g.add(netz(G.platz, mat(PLATZ), false));
  const ring = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:0.85 }));
  g.add(ring);
  const mast = netz(G.mast, mat(HOLZ));
  mast.position.set(0.2, 0, -2.2);
  const fahne = new THREE.Mesh(G.fahne, new THREE.MeshLambertMaterial({ color:'#ffffff', side:THREE.DoubleSide }));
  fahne.position.set(0.2, 3.05, -2.2); fahne.castShadow = true;
  g.add(mast, fahne);
  const inhalt = new THREE.Group();
  g.add(inhalt);
  welt.add(g);
  return { g, ring, mast, fahne, inhalt, schluessel:'', pop:0, rauch:null, rauchUhr:0 };
}
function stadtInhalt(o, s){
  const reich = s.besitzer >= 0 ? z.spieler[s.besitzer].reich : null;
  o.rauch = B.fuellen(o.inhalt, s, reich, s.besitzer >= 0 ? farbeVon(s.besitzer) : NEUTRAL_DACH);
  const f = s.besitzer >= 0 ? farbeVon(s.besitzer) : '#ffffff';
  o.ring.material.color.set(f);
  o.fahne.material.color.set(f);
  o.fahne.visible = o.mast.visible = s.besitzer >= 0;
}
function staedteBauen(){ stadtObj = z.staedte.map(stadtBauen); }

/* ---------- Soldaten ---------- */
const MAX_SOLDATEN = 2400;
const soldatGeo = {
  koerper: flach(new THREE.CylinderGeometry(0.13, 0.21, 0.5, 6)).translate(0, 0.25, 0),
  kopf:    flach(new THREE.IcosahedronGeometry(0.14, 0)).translate(0, 0.63, 0),
  speer:   new THREE.BoxGeometry(0.045, 1.0, 0.045).translate(0.22, 0.5, 0.05)
};
const koerper = new THREE.InstancedMesh(soldatGeo.koerper, new THREE.MeshLambertMaterial({ color:'#ffffff' }), MAX_SOLDATEN);
const koepfe = new THREE.InstancedMesh(soldatGeo.kopf, mat('#e9c49c'), MAX_SOLDATEN);
const speere = new THREE.InstancedMesh(soldatGeo.speer, mat('#6b4a2a'), MAX_SOLDATEN);
// Der Farbspeicher richtet sich nach count, also vor dem Nullsetzen anlegen
koerper.setColorAt(0, new THREE.Color('#ffffff'));
koerper.instanceColor.setUsage(THREE.DynamicDrawUsage);
for (const m of [koerper, koepfe, speere]){
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false; m.castShadow = true; m.count = 0;
  szene.add(m);
}
const farbObjekte = new Map();
const farbObj = hex => { let c = farbObjekte.get(hex); if (!c){ c = new THREE.Color(hex); farbObjekte.set(hex, c); } return c; };
const dummy = new THREE.Object3D();

// Goldene Ringe unter Trupps, die unter der Schildkröte marschieren
const schildGeo = new THREE.RingGeometry(1.5, 1.85, 32).rotateX(-Math.PI / 2).translate(0, 0.09, 0);
const schildMat = new THREE.MeshBasicMaterial({ color:'#ffd766', transparent:true, opacity:0.85, depthWrite:false });
const schildRinge = [];

function soldatenZeichnen(t){
  let n = 0, r = 0;
  const schild = new Set(z.effekte.filter(e => e.typ === 'schildkroete').map(e => e.sp));
  for (const zug of z.zuege){
    const p = L.zugPos(z, zug);
    const menge = Math.max(1, Math.min(30, Math.round(zug.anzahl / 2)));
    const dreh = Math.atan2(p.rx, p.rz), farbe = farbObj(farbeVon(zug.besitzer));
    for (let k = 0; k < menge && n < MAX_SOLDATEN; k++, n++){
      const reihe = Math.floor(k / 3), spalte = (k % 3) - 1;
      const x = p.x - p.rx * reihe * 0.62 + p.rz * spalte * 0.52;
      const zz = p.z - p.rz * reihe * 0.62 - p.rx * spalte * 0.52;
      const hopp = zug.wartet ? 0 : Math.abs(Math.sin(t * 11 + k * 1.9 + zug.id)) * 0.16;
      dummy.position.set(x, 0.05 + hopp, zz); dummy.rotation.set(0, dreh, 0); dummy.scale.setScalar(1.45); dummy.updateMatrix();
      koerper.setMatrixAt(n, dummy.matrix); koepfe.setMatrixAt(n, dummy.matrix); speere.setMatrixAt(n, dummy.matrix);
      koerper.setColorAt(n, farbe);
    }
    if (schild.has(zug.besitzer)){
      let ring = schildRinge[r];
      if (!ring){ ring = new THREE.Mesh(schildGeo, schildMat); szene.add(ring); schildRinge.push(ring); }
      const tief = Math.min(Math.floor((menge - 1) / 3), 9) * 0.62 / 2;
      ring.position.set(p.x - p.rx * tief, 0, p.z - p.rz * tief);
      ring.scale.setScalar(1 + Math.min(menge, 30) / 30 * 0.8 + Math.sin(t * 6) * 0.05);
      ring.visible = true; r++;
    }
  }
  for (let i = r; i < schildRinge.length; i++) schildRinge[i].visible = false;
  for (const m of [koerper, koepfe, speere]){ m.count = n; m.instanceMatrix.needsUpdate = true; }
  if (koerper.instanceColor) koerper.instanceColor.needsUpdate = true;
}

/* ---------- Effekte: Pfeile, Wolken, Fähigkeiten ---------- */
const pfeile = [], wolken = [];
const pfeilGeo = new THREE.BoxGeometry(0.06, 0.06, 0.8), wolkeGeo = flach(new THREE.IcosahedronGeometry(0.5, 0));
function pfeil(von, nach, verz = 0, dauer = 0.35, hoehe = 2.2){
  let p = pfeile.find(p => !p.aktiv);
  if (!p){ p = { m:new THREE.Mesh(pfeilGeo, mat('#3b2a18')) }; szene.add(p.m); pfeile.push(p); }
  Object.assign(p, { aktiv:true, t:0, von, nach, verz, dauer, hoehe });
  p.m.visible = verz <= 0;
}
function wolke(x, zz, gross, y = 0.5, farbe = '#f3ece0'){
  let w = wolken.find(w => !w.aktiv);
  if (!w){ w = { m:new THREE.Mesh(wolkeGeo, new THREE.MeshLambertMaterial({ color:'#ffffff', transparent:true, depthWrite:false })) }; szene.add(w.m); wolken.push(w); }
  Object.assign(w, { aktiv:true, t:0, gross:gross === true ? 2.4 : gross || 1.2 });
  w.m.material.color.set(farbe);
  w.m.position.set(x + (Math.random() - 0.5) * 0.6, y, zz + (Math.random() - 0.5) * 0.6);
  w.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  w.m.visible = true;
}
const tmpV = new THREE.Vector3();
function bahn(p, t, ziel){
  ziel.lerpVectors(p.von, p.nach, t);
  ziel.y += Math.sin(Math.PI * t) * p.hoehe;
  return ziel;
}
function effekteZeichnen(dt){
  for (const p of pfeile){
    if (!p.aktiv) continue;
    if (p.verz > 0){ p.verz -= dt; continue; }
    p.m.visible = true;
    p.t += dt / p.dauer;
    if (p.t >= 1){ p.aktiv = false; p.m.visible = false; continue; }
    bahn(p, p.t, p.m.position);
    p.m.lookAt(bahn(p, Math.min(1, p.t + 0.05), tmpV));
  }
  for (const w of wolken){
    if (!w.aktiv) continue;
    w.t += dt / 0.6;
    if (w.t >= 1){ w.aktiv = false; w.m.visible = false; continue; }
    w.m.scale.setScalar(0.4 + w.t * w.gross);
    w.m.material.opacity = 0.85 * (1 - w.t);
    w.m.position.y += dt * 1.2;
  }
}

// Sichtbare Dauer-Effekte (Segen, Schutzkuppel, Mauer), passend zu z.effekte
const effektObj = new Map();
const EG = {
  strahl: new THREE.CylinderGeometry(2.3, 2.6, 9, 24, 1, true).translate(0, 4.5, 0),
  kuppel: new THREE.SphereGeometry(3.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  mauer:  flach(new THREE.BoxGeometry(0.7, 1.2, 3.2)).translate(0, 0.6, 0),
  zinne:  flach(new THREE.BoxGeometry(0.72, 0.28, 0.4)).translate(0, 1.34, 0)
};
function effektMesh(e){
  if (e.typ === 'segen' || e.typ === 'schutz'){
    const s = z.staedte[e.stadt];
    const m = new THREE.Mesh(e.typ === 'segen' ? EG.strahl : EG.kuppel, new THREE.MeshBasicMaterial({
      color:e.typ === 'segen' ? '#ffd35a' : '#bfe4ff', transparent:true, opacity:0.3, depthWrite:false, side:THREE.DoubleSide,
      blending:e.typ === 'segen' ? THREE.AdditiveBlending : THREE.NormalBlending
    }));
    m.position.set(s.x, 0, s.z);
    return m;
  }
  if (e.typ === 'mauer'){
    const A = z.staedte[e.weg[0]], Bs = z.staedte[e.weg[1]];
    const g = new THREE.Group();
    g.add(netz(EG.mauer, mat('#b9b0a0')));
    for (const s of [-1.2, -0.4, 0.4, 1.2]){ const zi = netz(EG.zinne, mat('#b9b0a0')); zi.position.z = s; g.add(zi); }
    const fahne = new THREE.Mesh(G.fahne, new THREE.MeshLambertMaterial({ color:farbeVon(e.sp), side:THREE.DoubleSide }));
    fahne.position.set(0, 2.1, 0); fahne.scale.setScalar(0.8); g.add(fahne);
    const mast = netz(G.mast, mat(HOLZ)); mast.scale.set(1, 0.65, 1); g.add(mast);
    ausrichten(g, A, Bs); g.position.y = 0;
    return g;
  }
  return null;
}
function effekteSync(t){
  const gesehen = new Set();
  for (const e of z.effekte){
    const k = e.id ?? e;          // online kommen mit jedem Stand neue Objekte, die id bleibt gleich
    gesehen.add(k);
    let m = effektObj.get(k);
    if (!m && !effektObj.has(k)){ m = effektMesh(e); effektObj.set(k, m); if (m) szene.add(m); }
    if (!m) continue;
    const rest = e.bis - z.zeit, ausblenden = Math.min(1, rest / 0.6);
    if (e.typ === 'segen') m.material.opacity = (0.22 + Math.sin(t * 5) * 0.08) * ausblenden;
    else if (e.typ === 'schutz') m.material.opacity = (0.26 + Math.sin(t * 3) * 0.06) * ausblenden;
    else if (e.typ === 'mauer') m.scale.y = Math.min(1, ausblenden * 1.5);
  }
  for (const [e, m] of effektObj) if (!gesehen.has(e)){ if (m) szene.remove(m); effektObj.delete(e); }
}
function effekteLeeren(){ for (const m of effektObj.values()) if (m) szene.remove(m); effektObj.clear(); }

/* ---------- Kamera ---------- */
const kam = { x:0, z:0, d:55, dreh:0, neigung:0.95 };
function kameraSetzen(){
  const f = z ? z.form : { rx:40, rz:28 };
  kam.d = Math.max(16, Math.min(160, kam.d));
  kam.x = Math.max(-f.rx - 2, Math.min(f.rx + 2, kam.x));
  kam.z = Math.max(-f.rz - 2, Math.min(f.rz + 2, kam.z));
  const c = Math.cos(kam.neigung) * kam.d;
  kamera.position.set(kam.x + Math.sin(kam.dreh) * c, Math.sin(kam.neigung) * kam.d, kam.z + Math.cos(kam.dreh) * c);
  kamera.lookAt(kam.x, 0, kam.z);
  szene.fog.near = kam.d + 30; szene.fog.far = kam.d + 170;
}
function kameraEinpassen(){
  const hoch = innerHeight > innerWidth;
  // Die eigene Startstadt soll unten auf dem Bildschirm liegen
  const start = ICH >= 0 ? z.staedte.find(s => s.besitzer === ICH) : z.staedte.find(s => s.besitzer === 0);
  const sx = start ? start.x : -24, sz = start ? start.z : 10;
  if (z.form.rund) kam.dreh = Math.atan2(sx, sz);
  else kam.dreh = hoch ? (sx < 0 ? -Math.PI / 2 : Math.PI / 2) : (sz > 0 ? 0 : Math.PI);
  // Ausdehnung der Städte quer und längs zur Blickrichtung
  const rechts = [Math.cos(kam.dreh), -Math.sin(kam.dreh)], vorn = [Math.sin(kam.dreh), Math.cos(kam.dreh)];
  let quer = 0, laengs = 0;
  for (const s of z.staedte){
    quer = Math.max(quer, Math.abs(s.x * rechts[0] + s.z * rechts[1]));
    laengs = Math.max(laengs, Math.abs(s.x * vorn[0] + s.z * vorn[1]));
  }
  const tanV = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2)), asp = innerWidth / innerHeight;
  const breit = quer + (hoch ? 5 : 12), tief = laengs + 8;
  kam.d = Math.max(breit / (tanV * asp), tief * Math.sin(kam.neigung) / tanV) * 1.08;
  // Die nahe Inselhälfte braucht wegen der Perspektive etwas mehr Platz
  kam.x = Math.sin(kam.dreh) * 3; kam.z = Math.cos(kam.dreh) * 3;
  kameraSetzen();
}
function groesseAnpassen(){
  renderer.setSize(innerWidth, innerHeight);
  kamera.aspect = innerWidth / innerHeight;
  kamera.updateProjectionMatrix();
}
addEventListener('resize', () => { groesseAnpassen(); kameraSetzen(); });
groesseAnpassen();

const raycaster = new THREE.Raycaster(), boden = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
function bodenPunkt(x, y){
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, kamera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(boden, p) ? p : null;
}

/* ---------- Schilder mit Truppenzahlen ---------- */
const schilderEl = $('#schilder');
let stadtSchilder = [], truppSchilder = [];
const bild = []; // Bildschirmposition jeder Stadt: { x, y, r, sichtbar }
const SYMBOL = { turm:'♜', schmiede:'⚒', kaserne:'⚔' };
function schilderBauen(){
  schilderEl.innerHTML = '';
  truppSchilder = [];
  bild.length = 0;
  stadtSchilder = z.staedte.map(() => {
    const el = document.createElement('div');
    el.className = 'schild';
    schilderEl.appendChild(el);
    return { el, text:'', klasse:'', farbe:'' };
  });
}
const proj = new THREE.Vector3();
function aufSchirm(x, y, zz){
  proj.set(x, y, zz).project(kamera);
  return { x:(proj.x + 1) / 2 * innerWidth, y:(1 - proj.y) / 2 * innerHeight, sichtbar:proj.z < 1 };
}
function schilderZeichnen(){
  z.staedte.forEach((s, i) => {
    const p = aufSchirm(s.x, s.typ === 'turm' ? 4.6 : s.stufe === 3 && s.typ === 'stadt' ? 3.6 : 3.1, s.z);
    const rand = aufSchirm(s.x, 0, s.z), r0 = aufSchirm(s.x + 2.9, 0, s.z);
    bild[i] = { x:rand.x, y:rand.y, r:Math.max(26, Math.hypot(r0.x - rand.x, r0.y - rand.y)), sichtbar:rand.sichtbar };
    const sch = stadtSchilder[i];
    const zeichen = SYMBOL[s.typ] || '•'.repeat(s.stufe);
    const text = `${Math.floor(s.truppen)}<small>${zeichen}</small>`;
    if (text !== sch.text){ sch.el.innerHTML = text; sch.text = text; }
    const klasse = 'schild' + (s.besitzer < 0 ? ' neutral' : '') + (s.besitzer === ICH && ICH >= 0 ? ' mein' : '');
    const farbe = s.besitzer >= 0 ? farbeVon(s.besitzer) : '';
    if (klasse !== sch.klasse || farbe !== sch.farbe){ sch.el.className = klasse; sch.klasse = klasse; sch.el.style.background = farbe; sch.farbe = farbe; }
    sch.el.style.display = p.sichtbar ? '' : 'none';
    sch.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
  });
  let n = 0;
  for (const zug of z.zuege){
    if (zug.anzahl < 1) continue;
    let sch = truppSchilder[n];
    if (!sch){ const el = document.createElement('div'); el.className = 'trupp'; schilderEl.appendChild(el); sch = truppSchilder[n] = { el, text:'', farbe:'' }; }
    const pos = L.zugPos(z, zug), p = aufSchirm(pos.x, 1.3, pos.z);
    const text = String(Math.round(zug.anzahl)), farbe = farbeVon(zug.besitzer);
    if (text !== sch.text){ sch.el.textContent = text; sch.text = text; }
    if (farbe !== sch.farbe){ sch.el.style.background = farbe; sch.farbe = farbe; }
    sch.el.style.display = p.sichtbar ? '' : 'none';
    sch.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
    n++;
  }
  for (let i = n; i < truppSchilder.length; i++) truppSchilder[i].el.style.display = 'none';
}

/* ---------- Ton ---------- */
let audio = null;
function tonStart(){
  if (audio || !window.AudioContext) return;
  audio = new AudioContext();
}
function ton(noten, { typ = 'triangle', laut = 0.07, dauer = 0.14, abstand = 0.1 } = {}){
  if (!audio || !wahl.ton) return;
  const t0 = audio.currentTime + 0.01;
  noten.forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = typ; o.frequency.value = f;
    const t = t0 + i * abstand;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(laut, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, t + dauer);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dauer + 0.02);
  });
}
const KLANG = {
  senden:   () => ton([392, 523], { dauer:0.12, abstand:0.07, laut:0.05 }),
  erobert:  () => ton([523, 659, 784, 1047], { typ:'square', laut:0.035, dauer:0.18, abstand:0.09 }),
  verloren: () => ton([392, 311, 262], { typ:'sawtooth', laut:0.03, dauer:0.22, abstand:0.12 }),
  ausbau:   () => ton([440, 554, 659], { dauer:0.16, abstand:0.07, laut:0.05 }),
  schuss:   () => ton([1400], { typ:'square', laut:0.012, dauer:0.05 }),
  kraft:    () => ton([330, 440, 554, 659, 880], { typ:'sawtooth', laut:0.035, dauer:0.25, abstand:0.06 }),
  kraftFeind: () => ton([220, 208, 196], { typ:'square', laut:0.025, dauer:0.25, abstand:0.1 }),
  bereit:   () => ton([659, 880], { dauer:0.2, abstand:0.1, laut:0.04 }),
  sieg:     () => ton([523, 659, 784, 1047, 784, 1047], { typ:'square', laut:0.04, dauer:0.3, abstand:0.14 }),
  niederlage: () => ton([392, 370, 330, 262], { typ:'sawtooth', laut:0.035, dauer:0.4, abstand:0.2 })
};

/* ---------- Meldungen ---------- */
let meldungUhr = 0;
function melden(text){
  const el = $('#meldung');
  tippAus();
  el.textContent = text; el.classList.add('an');
  clearTimeout(meldungUhr); meldungUhr = setTimeout(() => el.classList.remove('an'), 2400);
}

/* ---------- Ereignisse aus der Logik ---------- */
function faehigkeitZeigen(e){
  const f = L.REICH[e.reich].faehigkeit;
  if (e.reich === 'mongolen'){
    const r = f.radius;
    for (let k = 0; k < 36; k++){
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const nach = new THREE.Vector3(e.x + Math.cos(a) * d, 0.2, e.z + Math.sin(a) * d);
      const von = nach.clone().add(new THREE.Vector3(-4 + Math.random(), 14, 3 + Math.random()));
      pfeil(von, nach, Math.random() * 0.7, 0.55, 0);
    }
    setTimeout(() => { for (let k = 0; k < 6; k++) wolke(e.x + (Math.random() - 0.5) * r, e.z + (Math.random() - 0.5) * r, 1.4); }, 550);
  } else if (e.reich === 'wikinger'){
    const s = z.staedte[e.stadt];
    for (let k = 0; k < 7; k++) wolke(s.x, s.z, 2.2, 0.8, '#6d635a');
    stadtObj[e.stadt].pop = 1;
  } else if (e.stadt != null){
    stadtObj[e.stadt].pop = 1;
  }
  if (ICH < 0) return;
  if (e.sp === ICH){
    KLANG.kraft();
    melden(e.reich === 'wikinger' ? `${f.name}: −${e.menge} Verteidiger!` : `${f.name}!`);
  } else {
    KLANG.kraftFeind();
    melden(`${menschlich(e.sp) ? z.spieler[e.sp].name : 'Die ' + z.spieler[e.sp].name}: ${f.name}!`);
  }
}
function ereignisse(){
  for (const e of z.ereignisse){
    if (e.typ === 'erobert'){
      const s = z.staedte[e.stadt];
      for (let k = 0; k < 4; k++) wolke(s.x, s.z, true);
      stadtObj[e.stadt].pop = 1;
      if (e.nach === ICH){ KLANG.erobert(); }
      else if (e.von === ICH){ KLANG.verloren(); melden('Eine deiner Städte wurde erobert!'); }
    } else if (e.typ === 'abgewehrt'){
      const s = z.staedte[e.stadt];
      wolke(s.x, s.z, false); wolke(s.x, s.z, false);
    } else if (e.typ === 'kampf'){
      wolke(e.x, e.z, false); wolke(e.x, e.z, false);
    } else if (e.typ === 'schuss'){
      const t = e.turm != null ? z.staedte[e.turm] : null;
      const von = t ? new THREE.Vector3(t.x, 3.2, t.z) : new THREE.Vector3(e.vonX, 1.5, e.vonZ);
      pfeil(von, new THREE.Vector3(e.x, 0.4, e.z));
      if (ICH >= 0) KLANG.schuss();
    } else if (e.typ === 'ausbau'){
      stadtObj[e.stadt].pop = 1;
      if (e.sp === ICH) KLANG.ausbau();
    } else if (e.typ === 'senden' && e.sp === ICH){
      KLANG.senden();
    } else if (e.typ === 'faehigkeit'){
      faehigkeitZeigen(e);
    } else if (e.typ === 'weg' && ICH >= 0){
      melden(`${z.spieler[e.sp].name} ist weg – ein Computer übernimmt.`);
    } else if (e.typ === 'raus' && ICH >= 0){
      if (e.sp === ICH){ beendet = true; setTimeout(endeZeigen, 1400); }
      else melden(`${satz(e.sp, 'ist', 'sind')} besiegt!`);
    } else if (e.typ === 'ende'){
      if (ICH >= 0){ if (!beendet){ beendet = true; setTimeout(endeZeigen, 1400); } }
      else setTimeout(zuschauen, 4000);
    }
  }
  z.ereignisse.length = 0;
}

/* ---------- Städte-Animation ---------- */
function staedteZeichnen(dt, t){
  z.staedte.forEach((s, i) => {
    const o = stadtObj[i];
    const schluessel = `${s.besitzer}|${s.besitzer >= 0 ? z.spieler[s.besitzer].reich : ''}|${s.stufe}|${s.typ}`;
    if (schluessel !== o.schluessel){ stadtInhalt(o, s); o.schluessel = schluessel; }
    if (o.pop > 0){
      o.pop = Math.max(0, o.pop - dt * 2.2);
      const k = 1 - o.pop;
      o.inhalt.scale.setScalar(0.75 + 0.25 * k + Math.sin(k * Math.PI) * 0.18);
    } else o.inhalt.scale.setScalar(1);
    o.fahne.rotation.y = Math.sin(t * 2.6 + i) * 0.35;
    o.ring.material.opacity = s.besitzer < 0 ? 0.35 : (auswahl.includes(i) || ziel === i ? 1 : 0.8);
    // Rauch aus der Schmiede
    if (o.rauch && s.besitzer >= 0 && !pausiert){
      o.rauchUhr -= dt;
      if (o.rauchUhr <= 0){ o.rauchUhr = 0.7; wolke(s.x + o.rauch.x, s.z + o.rauch.z, 0.9, o.rauch.y, '#8d8780'); }
    }
  });
}

/* ---------- HUD ---------- */
let hudUhr = 0, warBereit = false;
function hudZeichnen(){
  if (ICH < 0 || !z) return;
  kraftZeichnen();
  if (performance.now() - hudUhr < 200) return;
  hudUhr = performance.now();
  const summe = z.spieler.map(() => 0);
  for (const s of z.staedte) if (s.besitzer >= 0) summe[s.besitzer] += s.truppen;
  for (const zug of z.zuege) summe[zug.besitzer] += zug.anzahl;
  const neutral = z.staedte.filter(s => s.besitzer < 0).reduce((a, s) => a + s.truppen, 0);
  const gesamt = summe.reduce((a, b) => a + b, 0) + neutral || 1;
  const alle = z.spieler.map((_, i) => i);
  const freunde = alle.filter(i => i !== ICH && !L.istFeind(z, ICH, i));
  const gegner = alle.filter(i => L.istFeind(z, ICH, i));
  // Reihenfolge im Balken: du, Verbündete, neutral, Gegner
  const reihe = [ICH, ...freunde, -1, ...gegner];
  const balken = $('#balken');
  if (balken.children.length !== reihe.length){
    balken.innerHTML = reihe.map(i => `<i style="background:${i < 0 ? '#efe6d2' : farbeVon(i)}"></i>`).join('');
  }
  reihe.forEach((i, k) => (balken.children[k].style.width = ((i < 0 ? neutral : summe[i]) / gesamt * 100) + '%'));
  const punkt = g => `<span class="spielerpunkt" style="background:${farbeVon(g)}"></span>${Math.round(summe[g])}`;
  $('#nameA').innerHTML = `Du ${Math.round(summe[ICH])}` + freunde.map(punkt).join('');
  $('#nameB').innerHTML = gegner.length === 1
    ? `${Math.round(summe[gegner[0]])} ${z.spieler[gegner[0]].name}`
    : gegner.map(g => z.spieler[g].raus ? '' : punkt(g)).join('');
  if (z.zeit > 12 || z.ende) tippAus();
  const sek = Math.floor(z.zeit);
  $('#uhr').textContent = `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`;
}
function kraftZeichnen(){
  const S = z.spieler[ICH], e = Math.floor(S.energie), knopf = $('#kraftKnopf');
  knopf.style.setProperty('--f', e + '%');
  const bereit = e >= 100 && !S.raus;
  knopf.classList.toggle('bereit', bereit);
  if (bereit && !warBereit && z.zeit > 1) KLANG.bereit();
  warBereit = bereit;
}

/* ---------- Befehle: lokal an die Logik, online an den Server ---------- */
let verbindung = null;         // { senden } während eines Online-Spiels
function aktion(art, d = {}){
  if (verbindung){
    // Offensichtlich Unmögliches gar nicht erst schicken, damit Knöpfe ehrlich reagieren
    const s = z.staedte[d.stadt];
    if (art === 'ausbauen' && !(s && s.truppen >= L.ausbauKosten(z, s))) return false;
    if (art === 'umbauen' && !(s && s.truppen >= L.umbauKosten(z, s, d.typ))) return false;
    if (art === 'faehigkeit' && z.spieler[ICH].energie < 100) return false;
    verbindung.senden(art === 'aufgeben' ? { t:'aufgeben' } : { t:'befehl', art, ...d });
    return true;
  }
  switch (art){
    case 'senden':     return L.senden(z, ICH, d.von, d.ziel, d.anteil) > 0;
    case 'ausbauen':   return L.ausbauen(z, ICH, d.stadt);
    case 'umbauen':    return L.umbauen(z, ICH, d.stadt, d.typ);
    case 'faehigkeit': return L.faehigkeitNutzen(z, ICH, d.ziel);
    case 'aufgeben':   L.aufgeben(z, ICH); return true;
  }
  return false;
}

/* ---------- Steuerung ---------- */
let anteil = 0.5;
let modus = null;              // 'senden' | 'schwenken' | 'drehen' | 'zwei'
let auswahl = [], ziel = -1, startStadt = -1, bewegt = false;
let griff = null, zweiStart = null, zeigerPos = { x:0, y:0 };
let zielen = null;             // Art des Ziels, während eine Fähigkeit auf ein Ziel wartet
let beendet = false, pausiert = false;
const zeiger = new Map();
const linien = $('#linien');
const spielLaeuft = () => z && ICH >= 0 && !z.ende && !pausiert && !beendet;

function stadtBei(x, y){
  let beste = -1, bd = Infinity;
  bild.forEach((b, i) => {
    if (!b || !b.sichtbar) return;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < Math.max(b.r * 1.05, 30) && d < bd){ bd = d; beste = i; }
  });
  // Auch das Zahlenschild über der Stadt zählt
  if (beste < 0) stadtSchilder.forEach((sch, i) => {
    const r = sch.el.getBoundingClientRect();
    if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) beste = i;
  });
  return beste;
}
function wegBei(x, y){
  const p = bodenPunkt(x, y);
  if (!p) return -1;
  let beste = -1, bd = 3;
  z.wege.forEach(([a, b], i) => {
    const d = abstandZuStrecke(p.x, p.z, z.staedte[a], z.staedte[b]);
    if (d < bd){ bd = d; beste = i; }
  });
  return beste;
}
function linienZeichnen(){
  if (zielen){ zielVorschau(); return; }
  if (modus !== 'senden' || !bewegt){ linien.innerHTML = ''; return; }
  const farbe = farbeVon(ICH);
  const zielPunkt = ziel >= 0 ? bild[ziel] : zeigerPos;
  let html = '';
  for (const i of auswahl){
    if (i === ziel) continue;
    const b = bild[i];
    html += `<line x1="${b.x}" y1="${b.y}" x2="${zielPunkt.x}" y2="${zielPunkt.y}" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".75"/>`
          + `<line x1="${b.x}" y1="${b.y}" x2="${zielPunkt.x}" y2="${zielPunkt.y}" stroke="${farbe}" stroke-width="4" stroke-linecap="round" stroke-dasharray="10 8"/>`;
    html += `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>`;
  }
  if (ziel >= 0){
    const b = bild[ziel];
    const menge = auswahl.filter(i => i !== ziel).reduce((a, i) => a + (anteil >= 1 ? Math.floor(z.staedte[i].truppen) : Math.floor(z.staedte[i].truppen * anteil)), 0);
    html += `<circle cx="${b.x}" cy="${b.y}" r="${b.r + 4}" fill="none" stroke="${farbe}" stroke-width="4"/>`;
    if (menge > 0) html += `<text x="${b.x}" y="${b.y + b.r + 24}" text-anchor="middle" font-size="18" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" font-family="Palatino Linotype, Georgia, serif">→ ${menge}</text>`;
  }
  linien.innerHTML = html;
}

// Vorschau beim Zielen: Kreis fürs Zielgebiet, Markierung für Stadt oder Straße
function zielVorschau(){
  if (!zielen || !zeigerPos.aktiv){ linien.innerHTML = ''; return; }
  const { x, y } = zeigerPos;
  let html = '';
  if (zielen === 'punkt'){
    const p = bodenPunkt(x, y);
    if (p){
      const r = L.REICH[z.spieler[ICH].reich].faehigkeit.radius, pts = [];
      for (let k = 0; k <= 40; k++){ const a = k / 40 * Math.PI * 2, q = aufSchirm(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r); pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); }
      html = `<polygon points="${pts.join(' ')}" fill="rgba(226,60,40,.18)" stroke="#e23c28" stroke-width="3" stroke-dasharray="9 6"/>`;
    }
  } else if (zielen === 'weg'){
    const w = wegBei(x, y);
    if (w >= 0){ const [a, b] = z.wege[w]; html = `<line x1="${bild[a].x}" y1="${bild[a].y}" x2="${bild[b].x}" y2="${bild[b].y}" stroke="#ffd35a" stroke-width="9" stroke-linecap="round" opacity=".8"/>`; }
  } else {
    const s = stadtBei(x, y);
    if (s >= 0 && (zielen === 'eigene' ? z.staedte[s].besitzer === ICH : L.istFeind(z, ICH, z.staedte[s].besitzer))){
      const b = bild[s]; html = `<circle cx="${b.x}" cy="${b.y}" r="${b.r + 5}" fill="none" stroke="#ffd35a" stroke-width="5"/>`;
    }
  }
  linien.innerHTML = html;
}
const ZIEL_TEXT = { eigene:'Tippe auf eine deiner Städte.', fremde:'Tippe auf eine fremde Stadt.', punkt:'Tippe auf das Zielgebiet.', weg:'Tippe auf eine Straße.' };
function kraftDruecken(){
  if (!spielLaeuft()) return;
  const S = z.spieler[ICH], f = L.REICH[S.reich].faehigkeit;
  if (zielen){ zielEnde(); return; }
  if (S.energie < 100){ melden(`${f.name}: noch nicht bereit (${Math.floor(S.energie)} %)`); return; }
  if (!f.ziel){ aktion('faehigkeit', { ziel:{} }); return; }
  zielen = f.ziel;
  ringSchliessen();
  $('#zielHinweis span').textContent = `${f.name}: ${ZIEL_TEXT[f.ziel]}`;
  $('#zielHinweis').hidden = false;
}
function zielEnde(){ zielen = null; $('#zielHinweis').hidden = true; linien.innerHTML = ''; }
function zielAusfuehren(x, y){
  const art = zielen;
  let ok = false;
  if (art === 'eigene' || art === 'fremde'){
    const s = stadtBei(x, y);
    if (s >= 0 && (art === 'eigene' ? z.staedte[s].besitzer === ICH : L.istFeind(z, ICH, z.staedte[s].besitzer))) ok = aktion('faehigkeit', { ziel:{ stadt:s } });
  } else if (art === 'punkt'){
    const p = bodenPunkt(x, y);
    if (p) ok = aktion('faehigkeit', { ziel:{ x:p.x, z:p.z } });
  } else if (art === 'weg'){
    const w = wegBei(x, y);
    if (w >= 0) ok = aktion('faehigkeit', { ziel:{ weg:w } });
  }
  if (ok) zielEnde(); else melden(ZIEL_TEXT[art]);
}

const leinwand = renderer.domElement;
leinwand.addEventListener('contextmenu', e => e.preventDefault());
leinwand.addEventListener('pointerdown', e => {
  tonStart();
  leinwand.setPointerCapture(e.pointerId);
  zeiger.set(e.pointerId, { x:e.clientX, y:e.clientY });
  ringSchliessen();
  tippAus();
  if (zeiger.size === 2){
    const [a, b] = [...zeiger.values()];
    modus = 'zwei'; auswahl = []; ziel = -1; linienZeichnen();
    zweiStart = { d:Math.hypot(a.x - b.x, a.y - b.y), w:Math.atan2(b.y - a.y, b.x - a.x), kd:kam.d, dreh:kam.dreh };
    return;
  }
  if (zeiger.size > 2) return;
  zeigerPos = { x:e.clientX, y:e.clientY, aktiv:true };
  if (e.button === 2 || e.button === 1){ modus = 'drehen'; griff = { x:e.clientX, dreh:kam.dreh }; return; }
  const s = stadtBei(e.clientX, e.clientY);
  if (!zielen && spielLaeuft() && s >= 0 && z.staedte[s].besitzer === ICH){
    modus = 'senden'; auswahl = [s]; startStadt = s; ziel = -1; bewegt = false;
    griff = { x:e.clientX, y:e.clientY };
  } else {
    modus = 'schwenken'; griff = bodenPunkt(e.clientX, e.clientY); bewegt = false;
    griff && (griff.sx = e.clientX, griff.sy = e.clientY);
    startStadt = s;
  }
  if (zielen) zielVorschau();
});
leinwand.addEventListener('pointermove', e => {
  if (zielen && (e.pointerType === 'mouse' || zeiger.has(e.pointerId))){ zeigerPos = { x:e.clientX, y:e.clientY, aktiv:true }; zielVorschau(); }
  if (!zeiger.has(e.pointerId)) return;
  zeiger.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (modus === 'zwei' && zeiger.size >= 2){
    const [a, b] = [...zeiger.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), w = Math.atan2(b.y - a.y, b.x - a.x);
    kam.d = zweiStart.kd * zweiStart.d / Math.max(d, 1);
    kam.dreh = zweiStart.dreh - (w - zweiStart.w);
    kameraSetzen();
  } else if (modus === 'drehen'){
    kam.dreh = griff.dreh - (e.clientX - griff.x) * 0.008;
    kameraSetzen();
  } else if (modus === 'senden'){
    zeigerPos = { x:e.clientX, y:e.clientY };
    if (Math.hypot(e.clientX - griff.x, e.clientY - griff.y) > 10) bewegt = true;
    const s = stadtBei(e.clientX, e.clientY);
    ziel = bewegt ? s : -1;
    if (bewegt && s >= 0 && z.staedte[s].besitzer === ICH && !auswahl.includes(s)) auswahl.push(s);
    linienZeichnen();
  } else if (modus === 'schwenken' && griff){
    if (Math.hypot(e.clientX - griff.sx, e.clientY - griff.sy) > 8) bewegt = true;
    const p = bodenPunkt(e.clientX, e.clientY);
    if (p){ kam.x += griff.x - p.x; kam.z += griff.z - p.z; kameraSetzen(); }
  }
});
function zeigerEnde(e){
  if (!zeiger.has(e.pointerId)) return;
  zeiger.delete(e.pointerId);
  if (modus === 'zwei'){ if (zeiger.size === 0) modus = null; return; }
  if (modus === 'senden'){
    const s = stadtBei(e.clientX, e.clientY);
    if (!bewegt && s === startStadt) ringOeffnen(s);
    else if (bewegt && s >= 0 && spielLaeuft()){
      const quellen = auswahl.filter(i => i !== s);
      if (quellen.length) aktion('senden', { von:quellen, ziel:s, anteil });
    }
  } else if (modus === 'schwenken' && !bewegt && spielLaeuft()){
    if (zielen) zielAusfuehren(e.clientX, e.clientY);
    else if (startStadt >= 0){
      // Tippen auf fremde Stadt: kurze Info
      const s = z.staedte[startStadt];
      const art = s.typ === 'stadt' ? `Stufe ${s.stufe}` : L.GEBAEUDE[s.typ].name;
      melden(s.besitzer < 0 ? `Neutrale Stadt · ${Math.floor(s.truppen)} Verteidiger`
        : `${z.spieler[s.besitzer].name} · ${art} · ${Math.floor(s.truppen)} Verteidiger${L.geschuetzt(z, s) ? ' · unbesiegbar!' : ''}`);
    }
  }
  modus = null; auswahl = []; ziel = -1; griff = null;
  if (e.pointerType !== 'mouse') zeigerPos.aktiv = false;
  linienZeichnen();
}
leinwand.addEventListener('pointerup', zeigerEnde);
leinwand.addEventListener('pointercancel', zeigerEnde);
leinwand.addEventListener('pointerleave', () => { if (zielen){ zeigerPos.aktiv = false; zielVorschau(); } });
leinwand.addEventListener('wheel', e => {
  e.preventDefault();
  kam.d *= Math.exp(e.deltaY * 0.0012);
  kameraSetzen();
}, { passive:false });

function anteilSetzen(a){
  anteil = a;
  document.querySelectorAll('#anteil button').forEach(b => b.classList.toggle('aktiv', Number(b.dataset.a) === a));
}
document.querySelectorAll('#anteil button').forEach(b => b.addEventListener('click', () => anteilSetzen(Number(b.dataset.a))));
$('#kraftKnopf').addEventListener('click', () => { tonStart(); kraftDruecken(); });
$('#zielAbbrechen').addEventListener('click', zielEnde);
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === '1') anteilSetzen(0.25);
  else if (e.key === '2') anteilSetzen(0.5);
  else if (e.key === '3') anteilSetzen(1);
  else if (e.key === ' '){ e.preventDefault(); kraftDruecken(); }
  else if (e.key === 'q' || e.key === 'Q'){ kam.dreh += 0.2; kameraSetzen(); }
  else if (e.key === 'e' || e.key === 'E'){ kam.dreh -= 0.2; kameraSetzen(); }
  else if (e.key === 'Escape'){
    if (zielen) zielEnde();
    else if (!$('#ring').hidden) ringSchliessen();
    else if (ICH >= 0 && z && !z.ende && !beendet) pauseUmschalten();
  }
});

/* ---------- Ringmenü ---------- */
const RING = [
  { id:'ausbau', zeichen:'⬆', name:'Ausbauen' },
  { id:'turm', zeichen:'♜', name:'Turm' },
  { id:'schmiede', zeichen:'⚒', name:'Schmiede' },
  { id:'kaserne', zeichen:'⚔', name:'Kaserne' }
];
const ringKnoepfe = {};
for (const r of RING){
  const b = document.createElement('button');
  b.innerHTML = `<span>${r.zeichen} ${r.name}</span><small></small>`;
  b.title = r.id === 'ausbau' ? 'Mehr Platz und schnellere Ausbildung' : L.GEBAEUDE[r.id].text;
  b.addEventListener('click', () => {
    if (ringStadt < 0) return;
    const ok = r.id === 'ausbau' ? aktion('ausbauen', { stadt:ringStadt }) : aktion('umbauen', { stadt:ringStadt, typ:r.id });
    if (ok) ringSchliessen();
  });
  $('#ringKnoepfe').appendChild(b);
  ringKnoepfe[r.id] = b;
}
let ringStadt = -1;
function ringOeffnen(i){ ringStadt = i; $('#ring').hidden = false; ringAktualisieren(); }
function ringSchliessen(){ ringStadt = -1; $('#ring').hidden = true; }
function ringAktualisieren(){
  if (ringStadt < 0) return;
  const s = z.staedte[ringStadt], b = bild[ringStadt];
  if (s.besitzer !== ICH || !spielLaeuft()){ ringSchliessen(); return; }
  const ring = $('#ring');
  ring.style.left = Math.max(115, Math.min(innerWidth - 115, b.x)) + 'px';
  ring.style.top = Math.max(150, b.y - b.r * 0.6) + 'px';
  for (const r of RING){
    const k = r.id === 'ausbau' ? L.ausbauKosten(z, s) : L.umbauKosten(z, s, r.id);
    const knopf = ringKnoepfe[r.id];
    knopf.hidden = !isFinite(k);
    knopf.disabled = s.truppen < k;
    knopf.querySelector('small').textContent = `kostet ${k}`;
  }
  const prod = L.prodVon(z, s);
  $('#ringInfo').textContent = s.typ === 'stadt'
    ? `Stufe ${s.stufe} · +${prod.toFixed(1).replace('.', ',')} pro Sek. · max. ${L.platzVon(z, s)}`
    : `${L.GEBAEUDE[s.typ].name}: ${L.GEBAEUDE[s.typ].text}`;
}

/* ---------- Tipp beim ersten Spiel ---------- */
let tippUhr = 0;
function tippAus(){ const t = $('#tipp'); if (!t.hidden && t.style.opacity !== '0' && ICH >= 0 && z && z.zeit > 1.5){ t.style.opacity = 0; clearTimeout(tippUhr); tippUhr = setTimeout(() => (t.hidden = true), 500); } }

/* ---------- Spielablauf ---------- */
function mischen(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function passendeKarten(spieler){ return L.KARTEN.filter(k => k.starts.length >= spieler); }
function neueWelt(opt){
  effekteLeeren();
  z = L.neuesSpiel(opt);
  weltBauen(); schilderBauen(); kameraEinpassen();
}
function spielStarten(){
  const n = Math.max(1, Math.min(3, wahl.anzahl));
  const gegner = mischen(L.REICHE.filter(r => r.id !== wahl.reich)).slice(0, n);
  const karten = passendeKarten(n + 1);
  const karte = karten.find(k => k.id === wahl.karte) || karten[Math.floor(Math.random() * karten.length)];
  verbindung = null;
  spielBeginnen({
    karte:karte.id, seed:Math.floor(Math.random() * 1e9),
    spieler:[{ reich:wahl.reich, name:'Du' }, ...gegner.map(r => ({ reich:r.id, name:r.name, bot:wahl.stufe }))]
  }, 0);
}
function spielBeginnen(opt, du){
  ICH = du; pausiert = false; beendet = false; warBereit = false;
  zielEnde();
  neueWelt(opt);
  $('#menue').hidden = true; $('#ende').hidden = true; $('#pause').hidden = true; $('#online').hidden = true;
  $('#nochmal').textContent = verbindung ? 'Zurück zum Raum' : 'Nochmal';
  $('#pauseText').hidden = !verbindung;
  $('#spielUi').hidden = false;
  const tipp = $('#tipp'); tipp.hidden = false; tipp.style.opacity = 1;
  $('#balken').innerHTML = '';
  const r = reichVon(ICH);
  $('#kraftKnopf span').textContent = r.zeichen;
  $('#kraftKnopf').style.setProperty('--reich', r.farbe);
  $('#kraftKnopf').title = `${r.faehigkeit.name}: ${r.faehigkeit.text}`;
  $('#kraftName').textContent = r.faehigkeit.name;
  ringSchliessen();
}
// Im Hauptmenü kämpfen Computergegner im Hintergrund
function zuschauen(){
  if (ICH >= 0) return;
  const karte = L.KARTEN[Math.floor(Math.random() * L.KARTEN.length)];
  const reiche = mischen(L.REICHE.slice()).slice(0, karte.starts.length);
  neueWelt({ karte:karte.id, seed:Math.floor(Math.random() * 1e9), spieler:reiche.map(r => ({ reich:r.id, bot:2 })) });
  kam.d *= 0.92; kameraSetzen();
}
function zumMenue(){
  if (verbindung){ verbindung = null; window.Online && window.Online.verlassen(); }
  ICH = -1; pausiert = false; beendet = false;
  zielEnde();
  $('#spielUi').hidden = true; $('#ende').hidden = true; $('#pause').hidden = true; $('#menue').hidden = false;
  ringSchliessen();
  zuschauen();
}
function pauseUmschalten(){
  if (verbindung){ $('#pause').hidden = !$('#pause').hidden; return; }   // online läuft das Spiel weiter
  pausiert = !pausiert;
  $('#pause').hidden = !pausiert;
  if (pausiert){ ringSchliessen(); zielEnde(); }
}
function endeZeigen(){
  if (ICH < 0) return;
  const sieg = !!z.ende && z.ende.team === z.spieler[ICH].team;
  const koop = z.spieler.filter(s => s.team === z.spieler[ICH].team).length > 1;
  (sieg ? KLANG.sieg : KLANG.niederlage)();
  zielEnde(); ringSchliessen();
  $('#endeTitel').textContent = sieg ? 'Sieg!' : 'Niederlage';
  const sek = Math.floor(z.zeit), zeit = `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`;
  const sieger = z.ende && z.spieler[z.ende.sieger];
  $('#endeText').textContent = sieg ? (koop ? `Gemeinsam habt ihr die Insel erobert – nach ${zeit} Minuten.` : `Die ganze Insel gehört dir – nach ${zeit} Minuten.`)
    : sieger ? `${satz(z.ende.sieger, 'hat', 'haben')} die Insel erobert.` : `Dein Reich ist nach ${zeit} Minuten gefallen.`;
  const sp = z.spieler, reihen = [
    ['Städte erobert', s => s.stats.erobert], ['Städte verloren', s => s.stats.verloren],
    ['Truppen ausgebildet', s => Math.round(s.stats.ausgebildet)], ['Fähigkeiten', s => s.stats.faehigkeiten]
  ];
  const el = $('#endeStats');
  el.style.gridTemplateColumns = `1fr repeat(${sp.length}, auto)`;
  el.innerHTML = '<span></span>' + sp.map((s, i) => `<b style="color:${farbeVon(i)}">${i === ICH ? 'Du' : s.name}</b>`).join('')
    + reihen.map(([name, f]) => `<span>${name}</span>` + sp.map(s => `<b>${f(s)}</b>`).join('')).join('');
  $('#ende').hidden = false;
}

$('#pauseKnopf').addEventListener('click', pauseUmschalten);
$('#weiter').addEventListener('click', () => (verbindung ? ($('#pause').hidden = true) : pauseUmschalten()));
$('#aufgeben').addEventListener('click', () => {
  if (verbindung){ aktion('aufgeben'); $('#pause').hidden = true; return; }
  L.aufgeben(z, ICH); zumMenue();
});
$('#nochmal').addEventListener('click', () => {
  if (!verbindung) return spielStarten();
  // Online: zurück in den Raum, dort kann der Gastgeber neu starten
  const n = verbindung; verbindung = null; ICH = -1; beendet = false;
  $('#spielUi').hidden = true; $('#ende').hidden = true; $('#pause').hidden = true;
  zuschauen();
  window.Online && window.Online.zumRaum(n);
});
$('#zumMenue').addEventListener('click', zumMenue);
$('#start').addEventListener('click', () => { tonStart(); spielStarten(); });
function tonKnopf(){ $('#tonKnopf').textContent = wahl.ton ? '🔊' : '🔇'; }
$('#tonKnopf').addEventListener('click', () => { wahl.ton = !wahl.ton; speicher.schreiben('ton', wahl.ton); tonKnopf(); });
tonKnopf();

/* ---------- Hauptmenü ---------- */
function menueBauen(){
  $('#reichWahl').innerHTML = L.REICHE.map(r => `
    <button class="reich${r.id === wahl.reich ? ' aktiv' : ''}" data-r="${r.id}" aria-pressed="${r.id === wahl.reich}" title="${r.faehigkeit.name}: ${r.faehigkeit.text}">
      <span class="wappen" style="background:${r.farbe}">${r.zeichen}</span>
      <span><b>${r.name}</b><small>${r.passiv}<br><i>★ ${r.faehigkeit.name}</i></small></span>
    </button>`).join('');
  document.querySelectorAll('.reich').forEach(b => b.addEventListener('click', () => {
    wahl.reich = b.dataset.r; speicher.schreiben('reich', wahl.reich); menueBauen();
  }));
  document.querySelectorAll('#stufeWahl .wahl').forEach(b => {
    b.classList.toggle('aktiv', Number(b.dataset.s) === wahl.stufe);
    b.onclick = () => { wahl.stufe = Number(b.dataset.s); speicher.schreiben('stufe', wahl.stufe); menueBauen(); };
  });
  document.querySelectorAll('#anzahlWahl .wahl').forEach(b => {
    b.classList.toggle('aktiv', Number(b.dataset.n) === wahl.anzahl);
    b.onclick = () => { wahl.anzahl = Number(b.dataset.n); speicher.schreiben('anzahl', wahl.anzahl); menueBauen(); };
  });
  const passend = passendeKarten(wahl.anzahl + 1).map(k => k.id);
  if (wahl.karte !== 'zufall' && !passend.includes(wahl.karte)) wahl.karte = 'zufall';
  $('#karteWahl').innerHTML = [{ id:'zufall', name:'Zufall', starts:null }, ...L.KARTEN].map(k => `
    <button class="wahl${k.id === wahl.karte ? ' aktiv' : ''}" data-k="${k.id}" ${k.starts && !passend.includes(k.id) ? 'disabled' : ''}>
      ${k.name}<small>${k.starts ? `bis ${k.starts.length} Reiche` : 'passende Karte'}</small></button>`).join('');
  document.querySelectorAll('#karteWahl .wahl').forEach(b => {
    b.onclick = () => { wahl.karte = b.dataset.k; speicher.schreiben('karte', wahl.karte); menueBauen(); };
  });
}
menueBauen();

/* ---------- Hauptschleife ---------- */
const SCHRITT = 1 / 60;
let letzte = performance.now(), rest = 0;
function schleife(jetzt){
  requestAnimationFrame(schleife);
  const dt = Math.min(0.1, (jetzt - letzte) / 1000);
  letzte = jetzt;
  const t = jetzt / 1000;
  if (z && verbindung && ICH >= 0) L.vorhersage(z, dt);
  else if (z && !pausiert && !beendet){
    rest += dt;
    while (rest >= SCHRITT){ L.schritt(z, SCHRITT); rest -= SCHRITT; }
  }
  if (ICH < 0){
    kam.dreh += dt * 0.03; kameraSetzen();
    if (z && z.zeit > 420 && !z.ende) zuschauen();     // festgefahrene Vorführung neu starten
  }
  wellen(t);
  if (z){
    ereignisse();
    staedteZeichnen(dt, t);
    soldatenZeichnen(t);
    effekteSync(t);
    effekteZeichnen(pausiert ? 0 : dt);
    schilderZeichnen();
    ringAktualisieren();
    hudZeichnen();
    if (modus === 'senden') linienZeichnen();
    else if (zielen && modus === 'schwenken' && bewegt) zielVorschau();
  }
  renderer.render(szene, kamera);
}
zuschauen();
requestAnimationFrame(schleife);

/* ---------- Online-Schnittstelle (für online.js) ---------- */
function standAnwenden(m){
  if (!z || !verbindung) return;
  z.zeit = m.zeit;
  m.s.forEach(([b, tr, st, typ], i) => { const s = z.staedte[i]; s.besitzer = b; s.truppen = tr; s.stufe = st; s.typ = typ; });
  L.schmiedenZaehlen(z);
  z.zuege = m.q.map(([id, b, n, pfad, i, d, w]) => ({ id, besitzer:b, anzahl:n, pfad, i, d, wartet:!!w }));
  m.p.forEach(([e, raus, bot], i) => { const sp = z.spieler[i]; sp.energie = e; sp.raus = !!raus; sp.bot = bot ? 1 : null; });
  z.effekte = m.fx || [];
  if (m.e && m.e.length) z.ereignisse.push(...m.e);
  if (m.ende && !z.ende){
    z.ende = m.ende;
    if (!z.ereignisse.some(e => e.typ === 'ende')) z.ereignisse.push({ typ:'ende', sieger:m.ende.sieger, team:m.ende.team });
  }
}
const online = {
  starten(opt, du, senden){ verbindung = { senden }; spielBeginnen(opt, du); },
  stand: standAnwenden,
  ende(m){ if (z && verbindung){ if (!z.ende) z.ende = m.ende; m.stats.forEach((s, i) => { if (z.spieler[i]) z.spieler[i].stats = s; }); } },
  getrennt(){ if (verbindung){ melden('Verbindung zum Server verloren.'); verbindung = null; setTimeout(zumMenue, 1500); } },
  get aktiv(){ return !!verbindung; }
};

// Zum Testen in der Browser-Konsole
window.weltreiche = {
  online,
  get zustand(){ return z; }, get ich(){ return ICH; }, szene, renderer,
  sim(sek){ for (let i = 0; i < sek * 60 && z && !z.ende; i++) L.schritt(z, SCHRITT); },
  start: spielStarten, menue: zumMenue, wahl,
  kamera(x, zz, d){ Object.assign(kam, { x, z:zz, d }); kameraSetzen(); },
  aufSchirm, bild
};
})();
