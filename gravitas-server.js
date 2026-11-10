// Gravitas Arena · módulo de servidor (Socket.io) para o hub central
//
// COMO LIGAR NO HUB (wavecombat-hub, Node/Socket.io no Render):
//   1) coloque este arquivo ao lado do server.js do hub
//   2) no server.js, depois de criar o `io`:
//        require('./gravitas-server')(io);
//      (opcional) integrar com a presença do hub:
//        require('./gravitas-server')(io, {
//          onStatus: p => meuHub.setStatus(p.id, p),   // p = {id, nick, game, st, online}
//          presence: id => meuHub.getStatus(id),       // devolve {st, game} ou null
//        });
//   3) CORS: se o HTML do jogo ficar em outro domínio, o Server do hub precisa liberar essa origem:
//        new Server(httpServer, { cors: { origin: 'https://seu-site.com' } })
//   4) o jogo conecta em  https://wavecombat-hub.onrender.com  no namespace  /gravitas
//      (todos os eventos são isolados nesse namespace e começam com "ga:")
//
// RODAR SOZINHO (teste local):  npm i socket.io  &&  node gravitas-server.js     (PORT=3000)
//   serve gravitas-arena-v2.html em "/" e o Socket.io em /gravitas
//
// Variável: CORS_ORIGIN (ex.: https://meusite.com; padrão "*")
'use strict';

const GAME = 'gravitas-arena';
const TIPOS = new Set(['init', 'aim', 'shot', 'snap']);   // mensagens trocadas durante a partida
const NEED = { '1v1': 2, '2v2': 4 };                      // jogadores por modo
const STATUS = new Set(['lobby', 'fila', 'sala', 'partida']);
const MAX_BYTES = 60000;                                  // limite por mensagem (o mapa tem ~8 KB)
const MAX_EVT_SEG = 60;                                   // anti-flood por socket

function attach(io, opts) {
  opts = opts || {};
  const nsp = io.of('/gravitas');
  const filas = { '1v1': [], '2v2': [] };   // sockets esperando partida
  const partidas = new Map();               // id -> { id, socks:[...], mode }
  const salas = new Map();                  // salas personalizadas: id -> {...}
  const online = new Map();                 // id do jogador -> Set de sockets
  const histGeral = [];                     // últimas mensagens do chat geral
  let seq = 0, timerOnline = null;

  const limpa = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n || 24);
  const okId = (s) => /^[A-Za-z0-9_-]{3,40}$/.test(s);
  const eu = (s) => s.data.me;
  const pub = (s) => ({ nick: eu(s).nick, id: eu(s).id, tank: s.data.tk, tag: s.data.tag, lvl: s.data.lvl, v: eu(s).v ? 1 : 0 });
  const hook = (s, st, on) => {
    try { if (opts.onStatus && eu(s)) opts.onStatus({ id: eu(s).id, nick: eu(s).nick, game: GAME, st, online: on }); } catch (e) { /* o hub não pode derrubar o jogo */ }
  };
  const setSt = (s, st) => { s.data.st = st; hook(s, st, true); };
  const emUso = (id) => {
    for (const s of (online.get(id) || [])) if (s.data.pool || s.data.match) return true;
    return false;
  };
  const avisaOnline = () => {
    if (timerOnline) return;
    timerOnline = setTimeout(() => { timerOnline = null; nsp.emit('ga:online', { n: online.size }); }, 800);
  };
  const flood = (s) => {
    const t = Date.now();
    if (t - s.data.bt > 1000) { s.data.bt = t; s.data.bn = 0; }
    return ++s.data.bn > MAX_EVT_SEG;
  };

  // ---------- filas ----------
  const contaFila = (m) => filas[m].forEach((s) => s.emit('ga:q', { n: filas[m].length, need: NEED[m], mode: m }));
  const tiraFila = (s) => {
    const m = s.data.pool;
    if (!m) return;
    const f = filas[m], i = f.indexOf(s);
    if (i >= 0) f.splice(i, 1);
    s.data.pool = null;
    contaFila(m);
  };

  function criaPartida(socks, mode, cfg) {
    const id = 'm' + (++seq), n = socks.length;
    cfg = cfg || {};
    const map = Number.isInteger(cfg.map) && cfg.map >= 0 && cfg.map <= 7 ? cfg.map : Math.floor(Math.random() * 8);
    const stage = 1 + Math.floor(Math.random() * 3);
    const cfgOk = {
      time: [10, 15, 20].includes(cfg.time) ? cfg.time : 10,
      wind: ['n', 'off', 'hi'].includes(cfg.wind) ? cfg.wind : 'n',
      crates: cfg.crates ? 1 : 0,
    };
    const p = { id, socks: socks.slice(), mode, n };
    partidas.set(id, p);
    const players = socks.map(pub);                       // índice = posição canônica k (times alternados A,B,A,B)
    socks.forEach((s, k) => { s.data.pool = null; s.data.match = p; s.data.k = k; setSt(s, 'partida'); });
    socks.forEach((s, k) => s.emit('ga:match', { room: id, k, n, mode, players, map, stage, cfg: cfgOk }));
  }

  function pareia(mode) {
    const f = filas[mode], need = NEED[mode];
    while (f.length >= need) criaPartida(f.splice(0, need), mode);
    contaFila(mode);
  }

  function saiPartida(s, motivo) {
    const p = s.data.match;
    if (!p) return;
    const k = s.data.k;
    s.data.match = null; s.data.k = -1;
    p.socks[k] = null;
    p.socks.forEach((o) => { if (o && o.connected) o.emit('ga:left', { k, reason: motivo }); });
    const resto = p.socks.filter(Boolean);
    if (resto.length < 2) {                                // sobrou só um jogador: libera para uma nova fila
      resto.forEach((o) => { o.data.match = null; o.data.k = -1; if (o.connected && eu(o)) setSt(o, 'lobby'); });
      partidas.delete(p.id);
    }
    if (s.connected && eu(s)) setSt(s, 'lobby');
  }

  // ---------- salas personalizadas ----------
  const estadoSala = (r) => ({
    id: r.id, pw: r.pw, owner: eu(r.owner).id, cfg: r.cfg, chat: r.chat.slice(-30),
    members: r.members.map((s) => ({ id: eu(s).id, nick: eu(s).nick, v: eu(s).v ? 1 : 0, tank: s.data.tk, tag: s.data.tag })),
  });
  const emiteSala = (r) => { const st = estadoSala(r); r.members.forEach((s) => s.emit('ga:room', st)); };
  const cfgSala = (c) => {
    c = c || {};
    return {
      map: Number.isInteger(c.map) && c.map >= -1 && c.map <= 7 ? c.map : -1,
      mode: c.mode === '2v2' ? '2v2' : '1v1',
      df: [0, 1, 2].includes(c.df) ? c.df : 1,
      wind: ['n', 'off', 'hi'].includes(c.wind) ? c.wind : 'n',
      time: [10, 15, 20].includes(c.time) ? c.time : 10,
      crates: c.crates === 0 || c.crates === '0' ? 0 : 1,
    };
  };
  function saiSala(s) {
    const id = s.data.room;
    if (!id) return;
    s.data.room = null;
    const r = salas.get(id);
    if (!r) return;
    const dono = r.owner === s;
    r.members = r.members.filter((x) => x !== s);
    if (dono || !r.members.length) {                       // dono saiu: sala encerrada
      salas.delete(id);
      r.members.forEach((x) => { x.data.room = null; x.emit('ga:room:closed', { id }); if (eu(x)) setSt(x, 'lobby'); });
    } else {
      emiteSala(r);
    }
    if (s.connected && eu(s)) setSt(s, 'lobby');
  }

  // ---------- conexão ----------
  nsp.on('connection', (s) => {
    s.data = { me: null, st: 'lobby', tk: 0, tag: '', lvl: 1, pool: null, match: null, k: -1, room: null, bt: 0, bn: 0, ct: 0 };
    const logado = () => !!eu(s);
    const resp = (cb) => (o) => { if (typeof cb === 'function') cb(o); };

    s.on('ga:hello', (p, cb) => {
      if (flood(s)) return;
      p = p || {};
      const id = limpa(p.id, 40);
      if (!okId(id)) return resp(cb)({ err: 'ID inválido.' });
      s.data.me = { id, nick: limpa(p.nick) || 'Player_' + id.slice(0, 4), v: !!p.v };
      s.data.tk = Math.max(0, Math.min(5, p.tank | 0));
      s.data.tag = limpa(p.tag, 3);
      s.data.lvl = Math.max(1, Math.min(999, p.lvl | 0));
      if (!online.has(id)) online.set(id, new Set());
      online.get(id).add(s);
      s.join('geral');
      hook(s, 'lobby', true);
      avisaOnline();
      resp(cb)({ ok: 1, n: online.size, hist: histGeral.slice(-30) });
    });

    s.on('ga:status', (p) => {
      if (!logado() || flood(s)) return;
      const st = p && p.st;
      if (STATUS.has(st) && !s.data.match && !s.data.pool && !s.data.room) setSt(s, st);
    });

    s.on('ga:friends', (p, cb) => {
      if (typeof cb !== 'function' || flood(s)) return;
      const ids = Array.isArray(p && p.ids) ? p.ids.slice(0, 200).map((x) => limpa(x, 40)) : [];
      const list = {};
      const ordem = ['partida', 'fila', 'sala', 'lobby'];
      ids.forEach((id) => {
        const set = online.get(id);
        if (set && set.size) {
          let st = 'lobby';
          for (const x of set) if (ordem.indexOf(x.data.st) < ordem.indexOf(st)) st = x.data.st;
          list[id] = { st, game: GAME };
        } else if (opts.presence) {
          try { const r = opts.presence(id); if (r) list[id] = r; } catch (e) { /* ignora */ }
        }
      });
      cb({ list, n: online.size });
    });

    // ----- chat (geral e de sala) -----
    s.on('ga:chat', (p) => {
      if (!logado() || flood(s)) return;
      p = p || {};
      const t = limpa(p.t, 140);
      const agora = Date.now();
      if (!t || agora - s.data.ct < 700) return;
      s.data.ct = agora;
      const msg = { scope: p.scope === 'sala' ? 'sala' : 'geral', id: eu(s).id, n: eu(s).nick, v: eu(s).v ? 1 : 0, tag: s.data.tag, t, ts: agora };
      if (msg.scope === 'geral') {
        histGeral.push(msg); if (histGeral.length > 60) histGeral.shift();
        nsp.to('geral').emit('ga:chat', msg);
      } else {
        const r = salas.get(s.data.room);
        if (!r) return;
        r.chat.push(msg); if (r.chat.length > 50) r.chat.shift();
        r.members.forEach((x) => x.emit('ga:chat', msg));
      }
    });

    // ----- fila de partida -----
    s.on('ga:queue', (p, cb) => {
      const res = resp(cb);
      if (flood(s)) return;
      if (!logado()) return res({ err: 'Identifique-se primeiro.' });
      if (s.data.match || s.data.room) return res({ err: 'Você já está em uma partida ou sala.' });
      p = p || {};
      const mode = p.mode === '2v2' ? '2v2' : '1v1';
      s.data.tk = Math.max(0, Math.min(5, p.tank | 0));
      s.data.tag = limpa(p.tag, 3);
      s.data.lvl = Math.max(1, Math.min(999, p.lvl | 0));
      for (const o of (online.get(eu(s).id) || [])) {
        if (o !== s && (o.data.pool || o.data.match)) return res({ err: 'Este ID já está em uma fila ou partida.' });
      }
      tiraFila(s);
      s.data.pool = mode;
      filas[mode].push(s);
      setSt(s, 'fila');
      res({ ok: 1, mode, need: NEED[mode] });
      pareia(mode);
    });
    s.on('ga:cancel', () => { tiraFila(s); if (logado() && !s.data.match) setSt(s, s.data.room ? 'sala' : 'lobby'); });

    // ----- partida: relay entre os jogadores (o servidor só repassa) -----
    s.on('ga:msg', (m) => {
      const p = s.data.match;
      if (!p || !m || !TIPOS.has(m.t) || flood(s)) return;
      let bytes = 0;
      try { bytes = JSON.stringify(m.d === undefined ? 0 : m.d).length; } catch (e) { return; }
      if (bytes > MAX_BYTES) return;
      p.socks.forEach((o) => { if (o && o !== s && o.connected) o.emit('ga:msg', { t: m.t, d: m.d, from: s.data.k }); });
    });
    s.on('ga:leave', () => { saiPartida(s, 'leave'); saiSala(s); tiraFila(s); });

    // ----- salas personalizadas -----
    s.on('ga:room:create', (p, cb) => {
      const res = resp(cb);
      if (!logado() || flood(s)) return res({ err: 'Conecte-se primeiro.' });
      if (s.data.room || s.data.match) return res({ err: 'Você já está em uma sala ou partida.' });
      const pw = limpa(p && p.pw, 12);
      if (pw.length < 4) return res({ err: 'Escolha uma senha de 4 a 12 caracteres.' });
      let id;
      do id = String(Math.floor(100000 + Math.random() * 900000)); while (salas.has(id));
      tiraFila(s);
      const r = { id, pw, owner: s, members: [s], cfg: cfgSala(null), chat: [] };
      salas.set(id, r);
      s.data.room = id;
      setSt(s, 'sala');
      emiteSala(r);
      res({ ok: 1, id });
    });
    s.on('ga:room:join', (p, cb) => {
      const res = resp(cb);
      if (!logado() || flood(s)) return res({ err: 'Conecte-se primeiro.' });
      if (s.data.room || s.data.match) return res({ err: 'Você já está em uma sala ou partida.' });
      const r = salas.get(limpa(p && p.id, 12));
      if (!r || r.pw !== limpa(p && p.pw, 12)) return res({ err: 'ID ou senha incorretos.' });
      if (r.members.length >= 4) return res({ err: 'Sala cheia (máx. 4 jogadores).' });
      tiraFila(s);
      r.members.push(s);
      s.data.room = r.id;
      setSt(s, 'sala');
      emiteSala(r);
      res({ ok: 1, id: r.id });
    });
    s.on('ga:room:cfg', (p) => {
      const r = salas.get(s.data.room);
      if (!r || r.owner !== s || flood(s)) return;
      r.cfg = cfgSala(p && p.cfg);
      emiteSala(r);
    });
    s.on('ga:room:leave', () => saiSala(s));
    s.on('ga:room:start', (p, cb) => {
      const res = resp(cb);
      const r = salas.get(s.data.room);
      if (!r || r.owner !== s) return res({ err: 'Só o dono da sala inicia a partida.' });
      const need = NEED[r.cfg.mode];
      if (r.members.length !== need) {
        return res({ err: r.cfg.mode === '2v2' ? '2v2 exige exatamente 4 jogadores na sala.' : '1v1 exige exatamente 2 jogadores na sala.' });
      }
      salas.delete(r.id);
      r.members.forEach((x) => { x.data.room = null; });
      criaPartida(r.members, r.cfg.mode, r.cfg);
      res({ ok: 1 });
    });

    s.on('disconnect', () => {
      tiraFila(s);
      saiPartida(s, 'disconnect');
      saiSala(s);
      if (logado()) {
        const set = online.get(eu(s).id);
        if (set) { set.delete(s); if (!set.size) { online.delete(eu(s).id); hook(s, 'offline', false); } }
        avisaOnline();
      }
    });
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
