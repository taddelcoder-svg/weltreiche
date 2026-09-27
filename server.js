'use strict';
// Weltreiche – Server: liefert das Spiel aus und betreibt die Online-Räume (raeume.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const zugang = require('./zugang')({ titel:'Weltreiche' });

const PORT = Number(process.env.PORT) || 10300;
const TYPEN = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.txt':'text/plain; charset=utf-8'
};
// Nur diese Dateien werden ausgeliefert
const DATEIEN = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/spiel.js', 'spiel.js'], ['/logik.js', 'logik.js'], ['/bauten.js', 'bauten.js'], ['/online.js', 'online.js'],
  ['/datenschutz', 'datenschutz.html'], ['/datenschutz.html', 'datenschutz.html']
]);

function senden(res, datei, cache){
  const voll = path.join(__dirname, datei);
  if (!fs.existsSync(voll)){ res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
  res.writeHead(200, { 'Content-Type':TYPEN[path.extname(voll)] || 'application/octet-stream', 'Cache-Control':cache });
  fs.createReadStream(voll).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname.startsWith('/datenschutz')) return senden(res, 'datenschutz.html', 'no-cache');
  if (req.method === 'GET' && url.pathname === '/healthz'){
    res.writeHead(200, { 'Content-Type':'application/json' }); return res.end('{"ok":true}');
  }
  if (zugang.pruefen(req, res)) return;
  // Selbst ausgeliefertes three.js (keine Verbindung zu CDNs)
  const vendor = /^\/vendor\/([\w-]+(?:\.[\w-]+)*\.(js|txt))$/.exec(url.pathname);
  if (req.method === 'GET' && vendor) return senden(res, path.join('vendor', vendor[1]), 'public, max-age=604800');
  if (req.method === 'GET' && DATEIEN.has(url.pathname)) return senden(res, DATEIEN.get(url.pathname), 'no-cache');
  res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

require('./raeume')(server, zugang);

server.listen(PORT, () => console.log(`Weltreiche läuft auf http://localhost:${PORT}`));
