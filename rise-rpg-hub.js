// RISE RPG · módulo de servidor (Socket.io), namespace /rise
// No server.js do hub, depois de criar o `io`:   require('./rise-rpg-hub')(io);
// Teste/hospedagem sozinho (Render):              npm install && npm start   (serve rise-rpg.html em "/")
// Variável opcional: CORS_ORIGIN (padrão "*")
'use strict';

const HS = 1900, TICK = 100, VIEW = 350;

function attach(io) {
  const nsp = io.of('/rise');
  const players = new Map();   // socket.id -> estado do jogador
  const byId = new Map();      // id do jogador -> socket.id
  const clamp = (v) => Math.max(-HS, Math.min(HS, Number(v) || 0));
  const limpa = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  const col = (v) => Math.max(0, Math.min(0xffffff, v | 0));
  const pub = (p) => ({ id: p.id, nick: p.nick, cls: p.cls, traje: p.traje, det: p.det, pele: p.pele, lv: p.lv, eq: p.eq, x: p.x, z: p.z });
  const online = () => { let n = 0; players.forEach((p) => { if (p.on) n++; }); return n; };

  // grupos (até 4 jogadores): convite, aceitar, sair; vida e posição dos membros são repassadas 1x por segundo
  const parties = new Map(), partyOf = new Map(), inv = new Map();
  let pseq = 0;
  const pdata = (pid) => [...parties.get(pid)].map((id) => {
    const sid = byId.get(id), p = sid && players.get(sid);
    return p ? { id, nick: p.nick, lv: p.lv, hp: p.hp || 0, max: p.max || 1, x: p.x, z: p.z, on: p.on ? 1 : 0 } : null;
  }).filter(Boolean);
  const sendParty = (pid) => { const m = pdata(pid); parties.get(pid).forEach((id) => { const sid = byId.get(id); if (sid) nsp.to(sid).emit('rise:party', { members: m }); }); };
  const leaveParty = (id) => {
    const pid = partyOf.get(id); if (!pid) return;
    partyOf.delete(id); const set = parties.get(pid); set.delete(id);
    const sid = byId.get(id); if (sid) nsp.to(sid).emit('rise:party', { members: [] });
    if (set.size < 2) { set.forEach((o) => { partyOf.delete(o); const ts = byId.get(o); if (ts) nsp.to(ts).emit('rise:party', { members: [] }); }); parties.delete(pid); }
    else sendParty(pid);
  };

  nsp.on('connection', (s) => {
    let me = null, bt = 0, bn = 0;
    const flood = () => { const t = Date.now(); if (t - bt > 1000) { bt = t; bn = 0; } return ++bn > 40; };

    s.on('rise:hello', (d, cb) => {
      if (flood()) return;
      d = d || {};
      const id = limpa(d.id, 40);
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return typeof cb === 'function' && cb({ err: 'ID inválido' });
      const old = byId.get(id);
      if (old && old !== s.id) { const os = nsp.sockets.get(old); if (os) os.disconnect(true); }
      me = players.get(s.id) || {};
      Object.assign(me, {
        id, sid: s.id, nick: limpa(d.nick, 20) || 'Jogador', cls: Math.max(0, Math.min(4, d.cls | 0)),
        traje: col(d.traje), det: col(d.det), pele: col(d.pele), lv: Math.max(1, Math.min(999, d.lv | 0)),
        x: clamp(d.x), z: clamp(d.z), r: 0, a: 0, on: !d.lobby, hp: 0, max: 1,
        eq: Array.isArray(d.eq) ? d.eq.slice(0, 7).map((v) => Math.max(0, Math.min(2, v | 0))) : [],
      });
      players.set(s.id, me); byId.set(id, s.id);
      if (me.on) s.broadcast.emit('rise:join', pub(me));
      if (typeof cb === 'function') cb({ ok: 1, n: online(), players: [...players.values()].filter((p) => p.on && p.sid !== s.id).map(pub) });
      nsp.emit('rise:n', online());
    });

    s.on('rise:pos', (d) => {
      if (!me || !me.on || !d || flood()) return;
      me.x = clamp(d.x); me.z = clamp(d.z); me.r = Number(d.r) || 0; me.a = d.a ? 1 : 0;
    });

    s.on('rise:bye', () => {
      if (me && me.on) { me.on = false; nsp.emit('rise:leave', me.id); nsp.emit('rise:n', online()); }
    });

    s.on('rise:hp', (d) => { if (!me || !d || flood()) return; me.hp = Math.max(0, Number(d.hp) || 0); me.max = Math.max(1, Number(d.max) || 1); });

    s.on('rise:party:invite', (d, cb) => {
      const ack = (o) => { if (typeof cb === 'function') cb(o); };
      if (!me || flood()) return;
      const to = limpa(d && d.to, 40), ts = byId.get(to);
      if (!ts || to === me.id) return ack({ err: 'Jogador offline ou ID inválido.' });
      if (partyOf.has(to)) return ack({ err: 'Esse jogador já está em um grupo.' });
      const pid = partyOf.get(me.id); if (pid && parties.get(pid).size >= 4) return ack({ err: 'Grupo cheio.' });
      inv.set(to + ':' + me.id, Date.now());
      nsp.to(ts).emit('rise:party:invite', { from: me.id, nick: me.nick });
      ack({ ok: 1 });
    });

    s.on('rise:party:accept', (d, cb) => {
      const ack = (o) => { if (typeof cb === 'function') cb(o); };
      if (!me || flood()) return;
      const from = limpa(d && d.from, 40), at = inv.get(me.id + ':' + from);
      if (!at || Date.now() - at > 60000 || !byId.get(from)) return ack({ err: 'Convite expirado.' });
      inv.delete(me.id + ':' + from);
      if (partyOf.has(me.id)) return ack({ err: 'Você já está em um grupo.' });
      let pid = partyOf.get(from);
      if (!pid) { pid = 'g' + (++pseq); parties.set(pid, new Set([from])); partyOf.set(from, pid); }
      if (parties.get(pid).size >= 4) return ack({ err: 'Grupo cheio.' });
      parties.get(pid).add(me.id); partyOf.set(me.id, pid); sendParty(pid); ack({ ok: 1 });
    });

    s.on('rise:party:leave', () => { if (me) leaveParty(me.id); });

    s.on('disconnect', () => {
      if (!me) return;
      if (byId.get(me.id) === s.id) leaveParty(me.id);
      players.delete(s.id);
      if (byId.get(me.id) === s.id) byId.delete(me.id);
      if (me.on) nsp.emit('rise:leave', me.id);
      nsp.emit('rise:n', online());
    });
  });

  // difusão: cada jogador recebe só quem está por perto (10x por segundo)
  setInterval(() => {
    const list = [...players.values()].filter((p) => p.on);
    if (list.length < 2) return;
    list.forEach((a) => {
      const near = list.filter((b) => b !== a && Math.abs(b.x - a.x) < VIEW && Math.abs(b.z - a.z) < VIEW)
        .map((b) => ({ id: b.id, x: b.x, z: b.z, r: b.r, a: b.a }));
      if (near.length) nsp.to(a.sid).volatile.emit('rise:state', near);
    });
  }, TICK);

  setInterval(() => parties.forEach((_, pid) => sendParty(pid)), 1000);

  return nsp;
}

module.exports = attach;

if (require.main === module) {
  const http = require('http'), fs = require('fs'), path = require('path');
  const { Server } = require('socket.io');
  const PORT = process.env.PORT || 3000;
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/health') { res.writeHead(200); return res.end('ok'); }
    if (u === '/' || u === '/rise-rpg.html') {
      return fs.readFile(path.join(__dirname, 'rise-rpg.html'), (e, d) => {
        if (e) { res.writeHead(404); return res.end('rise-rpg.html não encontrado'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d);
      });
    }
    res.writeHead(404); res.end();
  });
  attach(new Server(srv, { cors: { origin: process.env.CORS_ORIGIN || '*' } }));
  srv.listen(PORT, () => console.log('RISE RPG online na porta ' + PORT));
}
