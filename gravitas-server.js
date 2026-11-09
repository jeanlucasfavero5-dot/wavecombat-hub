// Gravitas Arena · servidor online (Socket.io)
//
// Rodar sozinho:   npm i socket.io   &&   node gravitas-server.js      (PORT=3000 por padrão)
//   - serve gravitas-arena-v2.html em "/" (deixe os dois arquivos na mesma pasta)
//   - Socket.io no namespace /gravitas
//
// Usar dentro de outro servidor Socket.io:   require('./gravitas-server')(io)
//
// Variáveis: PORT, CORS_ORIGIN (ex.: https://meusite.com; padrão "*")
'use strict';

const TIPOS = new Set(['init', 'aim', 'shot', 'snap']); // mensagens que o jogo troca
const MAX_BYTES = 60000;                                // limite por mensagem (o mapa tem ~8 KB)
const MAX_MSG_POR_SEG = 40;

function attach(io) {
  const nsp = io.of('/gravitas');
  const fila = [];            // sockets esperando oponente
  const salas = new Map();    // id da sala -> { a, b }
  let contador = 0;

  const limpa = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').slice(0, 24);
  const publico = (p) => ({ nick: p.nick, id: p.id, tank: p.tank, tag: p.tag, lvl: p.lvl });
  const tiraDaFila = (s) => { const i = fila.indexOf(s); if (i >= 0) fila.splice(i, 1); };

  function fechaSala(s, motivo, avisar) {
    const id = s.data.room;
    if (!id) return;
    s.data.room = null;
    const sala = salas.get(id);
    if (!sala) return;
    salas.delete(id);
    const outro = sala.a === s ? sala.b : sala.a;
    if (outro) {
      outro.data.room = null;
      if (avisar && outro.connected) outro.emit('ga:left', { reason: motivo });
    }
  }

  function pareia() {
    while (fila.length >= 2) {
      const a = fila.shift();
      const j = fila.findIndex((x) => x.data.p.id !== a.data.p.id);
      if (j < 0) { fila.unshift(a); return; }
      const b = fila.splice(j, 1)[0];
      const room = 'r' + (++contador);
      salas.set(room, { a, b });
      a.data.room = b.data.room = room;
      const map = Math.floor(Math.random() * 8);       // índice do bioma (BI[] do jogo)
      const stage = 1 + Math.floor(Math.random() * 3);  // define o período do dia
      a.emit('ga:match', { room, side: 0, opp: publico(b.data.p), map, stage }); // side 0 = anfitrião (gera o mapa)
      b.emit('ga:match', { room, side: 1, opp: publico(a.data.p), map, stage });
    }
  }

  nsp.on('connection', (s) => {
    s.data = { p: null, room: null, n: 0, t: Date.now() };

    s.on('ga:queue', (p) => {
      if (s.data.room) return;
      p = p || {};
      const id = limpa(p.id);
      if (!/^\d{3,12}$/.test(id)) return s.emit('ga:err', { msg: 'ID de jogador inválido.' });
      for (const o of nsp.sockets.values()) {
        if (o !== s && o.data && o.data.p && o.data.p.id === id && (o.data.room || fila.includes(o))) {
          return s.emit('ga:err', { msg: 'Este ID já está em uma fila ou partida.' });
        }
      }
      s.data.p = {
        nick: limpa(p.nick) || 'Player_' + id.slice(0, 4),
        id,
        tank: Math.max(0, Math.min(5, p.tank | 0)),
        tag: limpa(p.tag).slice(0, 3),
        lvl: Math.max(1, Math.min(999, p.lvl | 0)),
      };
      tiraDaFila(s);
      fila.push(s);
      pareia();
    });

    s.on('ga:cancel', () => tiraDaFila(s));

    s.on('ga:msg', (m) => {
      const sala = salas.get(s.data.room);
      if (!sala || !m || !TIPOS.has(m.t)) return;
      const agora = Date.now();
      if (agora - s.data.t > 1000) { s.data.t = agora; s.data.n = 0; }
      if (++s.data.n > MAX_MSG_POR_SEG) return;
      let bytes = 0;
      try { bytes = JSON.stringify(m.d === undefined ? 0 : m.d).length; } catch (e) { return; }
      if (bytes > MAX_BYTES) return;
      const outro = sala.a === s ? sala.b : sala.a;
      if (outro && outro.connected) outro.emit('ga:msg', { t: m.t, d: m.d });
    });

    s.on('ga:leave', () => fechaSala(s, 'leave', true));
    s.on('disconnect', () => { tiraDaFila(s); fechaSala(s, 'disconnect', true); });
  });

  return nsp;
}

module.exports = attach;

if (require.main === module) {
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  const { Server } = require('socket.io');
  const PORT = process.env.PORT || 3000;
  const HTML = path.join(__dirname, 'gravitas-arena-v2.html');

  const srv = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/health') { res.writeHead(200); return res.end('ok'); }
    if (url === '/' || url === '/index.html') {
      return fs.readFile(HTML, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Coloque gravitas-arena-v2.html na mesma pasta do servidor.'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    }
    res.writeHead(404);
    res.end();
  });
  const io = new Server(srv, { cors: { origin: process.env.CORS_ORIGIN || '*' } });
  attach(io);
  srv.listen(PORT, () => console.log('Gravitas Arena online em http://localhost:' + PORT));
}
