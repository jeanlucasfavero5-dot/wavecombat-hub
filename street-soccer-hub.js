// street-soccer-hub.js
// Módulo do jogo "Street Soccer" para o servidor central (Node + Socket.io v4).
// Uso no servidor do hub:   require('./street-soccer-hub')(io);
// Eventos isolados com prefixo "street:" no namespace padrão.
// Só atende sockets que se conectam com auth.jogo === 'street-soccer'.
//
// Modelo de partida online: o primeiro jogador (slot 0) é o ANFITRIÃO e simula a partida.
// Os outros jogadores enviam comandos ('street:in') e recebem estados ('street:snap'),
// que o servidor apenas repassa. Slots: 0 e 2 = time 0, 1 e 3 = time 1. Vagas vazias = bots.
//
// Cliente -> servidor                 Servidor -> cliente
// street:ident {nick, ver}            street:presenca {id, estado}   (estado '' = offline)
// street:status {estado}              street:fila {n, max, seg}
// street:amigos {ids} + ack           street:partida {mid, host, slot, jog, dur}
// street:fila:entrar / :sair          street:chat {id, nick, v, txt, ts}
// street:chat {txt}                   street:sala {cod, host, cfg, mem}
// street:sala:criar / :entrar + ack   street:sala:chat {id, nick, v, txt, ts}
// street:sala:sair {cod}              street:sala:kick
// street:sala:cfg {cod, dur}          street:in {slot, ...}      (cliente -> anfitrião)
// street:sala:expulsar {cod, id}      street:snap {...}          (anfitrião -> clientes)
// street:sala:iniciar {cod, dur}      street:ev {t: 'gol'|'fim'|'saiu'|'host-saiu', ...}
// street:sala:chat {cod, txt}
// street:in / street:snap / street:ev / street:sair (durante a partida)
//
// Obs.: a presença aqui só conhece quem está com este jogo aberto. Se o hub já
// tem um mapa de presença do site, use-o dentro de 'street:amigos'.
module.exports = function (io) {
  const JOGO = 'street-soccer';
  const MAX = 4;            // jogadores por partida
  const ESPERA = 90000;     // espera máxima da fila: 1:30
  const pres = {};          // id -> { n: conexões abertas, e: estado }
  const fila = [];          // [{ id, nick, ver, sid }]
  const salas = {};         // cod -> { host, cfg, mem: [{ id, nick, ver, sid }] }
  const partidas = {};      // mid -> { host: sid, mem: [{ id, nick, ver, sid, slot }] }
  let t0 = 0;               // início da espera da fila

  const limpa = (t) => String(t || '').replace(/[<>]/g, '').slice(0, 120);
  const novoCod = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  const pub = (m) => ({ id: m.id, nick: m.nick, ver: m.ver });
  const sock = (sid) => io.sockets.sockets.get(sid);

  const setE = (id, e) => {
    if (!id) return;
    pres[id] = pres[id] || { n: 0, e: '' };
    pres[id].e = e;
    io.emit('street:presenca', { id, estado: e });
  };
  const emitFila = () =>
    io.to('street:fila').emit('street:fila', { n: fila.length, max: MAX, seg: t0 ? Math.floor((Date.now() - t0) / 1000) : 0 });
  const emitSala = (c) => {
    const r = salas[c];
    if (r) io.to('street:sala:' + c).emit('street:sala', { cod: c, host: r.host, cfg: r.cfg, mem: r.mem.map(pub) });
  };
  const sairFila = (sid) => {
    const i = fila.findIndex((f) => f.sid === sid);
    if (i >= 0) { fila.splice(i, 1); emitFila(); }
  };
  const sairSala = (s, c) => {
    const r = salas[c];
    if (!r || !r.mem.some((m) => m.sid === s.id)) return;
    r.mem = r.mem.filter((m) => m.sid !== s.id);
    s.leave('street:sala:' + c);
    if (!r.mem.length) { delete salas[c]; return; }
    if (!r.mem.some((m) => m.id === r.host)) r.host = r.mem[0].id;
    emitSala(c);
  };

  // cria uma partida compartilhada: o primeiro membro é o anfitrião (slot 0)
  const criaPartida = (membros, dur) => {
    const mid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const mem = membros.slice(0, MAX).map((m, i) => ({ id: m.id, nick: m.nick, ver: m.ver, sid: m.sid, slot: i }));
    if (!mem.length) return;
    partidas[mid] = { host: mem[0].sid, mem };
    const jog = mem.map(({ id, nick, ver, slot }) => ({ id, nick, ver, slot }));
    mem.forEach((m) => {
      const sk = sock(m.sid);
      if (!sk) return;
      sk.join('street:m:' + mid);
      sk.data.mid = mid;
      sk.emit('street:partida', { mid, host: mem[0].id, slot: m.slot, jog, dur: dur || 180 });
    });
  };
  const saiPartida = (s) => {
    const mid = s.data.mid;
    if (!mid) return;
    s.data.mid = '';
    s.leave('street:m:' + mid);
    const p = partidas[mid];
    if (!p) return;
    const i = p.mem.findIndex((m) => m.sid === s.id);
    if (i < 0) return;
    const m = p.mem[i];
    p.mem.splice(i, 1);
    if (p.host === s.id) {
      io.to('street:m:' + mid).emit('street:ev', { t: 'host-saiu' });
      p.mem.forEach((x) => { const sk = sock(x.sid); if (sk) { sk.leave('street:m:' + mid); sk.data.mid = ''; } });
      delete partidas[mid];
    } else {
      io.to(p.host).emit('street:ev', { t: 'saiu', slot: m.slot });
      if (!p.mem.length) delete partidas[mid];
    }
  };

  // fila: sala cheia (4/4) ou 1:30 de espera => começa junto com quem estiver online
  setInterval(() => {
    if (!fila.length) { t0 = 0; return; }
    emitFila();
    if (fila.length >= MAX || Date.now() - t0 >= ESPERA) {
      const g = fila.splice(0, MAX);
      g.forEach((f) => { const sk = sock(f.sid); if (sk) sk.leave('street:fila'); });
      criaPartida(g, 180);
      t0 = fila.length ? Date.now() : 0;
    }
  }, 1000);

  io.on('connection', (s) => {
    const a = s.handshake.auth || {};
    if (a.jogo !== JOGO) return;
    const me = { id: String(a.id || ''), nick: limpa(a.nick) || 'Jogador', ver: !!a.ver };
    s.join('street:geral');
    if (me.id) {
      pres[me.id] = pres[me.id] || { n: 0, e: '' };
      pres[me.id].n++;
      setE(me.id, JOGO);
    }

    s.on('street:status', (d) => setE(me.id, d && d.estado ? JOGO + ':' + d.estado : JOGO));
    s.on('street:ident', (d) => {
      if (!d) return;
      if (d.nick) me.nick = limpa(d.nick) || me.nick;
      me.ver = !!d.ver;
    });

    s.on('street:amigos', (d, cb) => {
      if (typeof cb !== 'function') return;
      const online = {};
      ((d && d.ids) || []).slice(0, 500).forEach((id) => {
        const p = pres[String(id)];
        if (p && p.n > 0) online[id] = p.e || 'hub';
      });
      cb({ online });
    });

    // ---- fila 3v3 ----
    s.on('street:fila:entrar', () => {
      if (s.data.mid) return;
      if (!fila.some((f) => f.sid === s.id)) fila.push({ id: me.id, nick: me.nick, ver: me.ver, sid: s.id });
      if (!t0) t0 = Date.now();
      s.join('street:fila');
      emitFila();
    });
    s.on('street:fila:sair', () => { s.leave('street:fila'); sairFila(s.id); });

    // ---- chat geral ----
    s.on('street:chat', (d) =>
      io.to('street:geral').emit('street:chat', { id: me.id, nick: me.nick, v: me.ver, txt: limpa(d && d.txt), ts: Date.now() }));

    // ---- salas personalizadas ----
    s.on('street:sala:criar', (d, cb) => {
      let c;
      do { c = novoCod(); } while (salas[c]);
      salas[c] = { host: me.id, cfg: { dur: 180 }, mem: [{ ...me, sid: s.id }] };
      s.join('street:sala:' + c);
      setE(me.id, JOGO + ':sala');
      if (typeof cb === 'function') cb({ ok: true, sala: { cod: c, host: me.id, cfg: salas[c].cfg, mem: [pub(me)] } });
    });
    s.on('street:sala:entrar', (d, cb) => {
      const c = String((d && d.cod) || '').toUpperCase();
      const r = salas[c];
      if (!r || r.mem.length >= MAX) return typeof cb === 'function' && cb({ ok: false });
      if (!r.mem.some((m) => m.sid === s.id)) r.mem.push({ ...me, sid: s.id });
      s.join('street:sala:' + c);
      setE(me.id, JOGO + ':sala');
      emitSala(c);
      if (typeof cb === 'function') cb({ ok: true, sala: { cod: c, host: r.host, cfg: r.cfg, mem: r.mem.map(pub) } });
    });
    s.on('street:sala:sair', (d) => sairSala(s, String((d && d.cod) || '').toUpperCase()));
    s.on('street:sala:cfg', (d) => {
      const c = String((d && d.cod) || '').toUpperCase();
      const r = salas[c];
      if (!r || r.host !== me.id) return;
      const dur = Number(d.dur);
      if ([90, 180, 300].includes(dur)) r.cfg.dur = dur;
      emitSala(c);
    });
    s.on('street:sala:expulsar', (d) => {
      const c = String((d && d.cod) || '').toUpperCase();
      const r = salas[c];
      if (!r || r.host !== me.id) return;
      const m = r.mem.find((x) => x.id === String(d.id) && x.id !== me.id);
      if (!m) return;
      const sk = sock(m.sid);
      if (sk) { sairSala(sk, c); sk.emit('street:sala:kick'); }
    });
    s.on('street:sala:iniciar', (d) => {
      const c = String((d && d.cod) || '').toUpperCase();
      const r = salas[c];
      if (!r || r.host !== me.id) return;
      const ordem = [...r.mem].sort((x, y) => (x.id === r.host ? -1 : y.id === r.host ? 1 : 0));
      criaPartida(ordem, Number(d.dur) || r.cfg.dur || 180);
    });
    s.on('street:sala:chat', (d) => {
      const c = String((d && d.cod) || '').toUpperCase();
      const r = salas[c];
      if (!r || !r.mem.some((m) => m.sid === s.id)) return;
      io.to('street:sala:' + c).emit('street:sala:chat', { id: me.id, nick: me.nick, v: me.ver, txt: limpa(d.txt), ts: Date.now() });
    });

    // ---- partida online (repasse entre anfitrião e clientes) ----
    s.on('street:in', (d) => {
      const p = partidas[s.data.mid];
      const m = p && p.mem.find((x) => x.sid === s.id);
      if (m && d) io.to(p.host).emit('street:in', { ...d, slot: m.slot });
    });
    s.on('street:snap', (d) => {
      const p = partidas[s.data.mid];
      if (p && p.host === s.id) s.to('street:m:' + s.data.mid).volatile.emit('street:snap', d);
    });
    s.on('street:ev', (d) => {
      const p = partidas[s.data.mid];
      if (p && p.host === s.id) s.to('street:m:' + s.data.mid).emit('street:ev', d);
    });
    s.on('street:sair', () => saiPartida(s));

    s.on('disconnect', () => {
      sairFila(s.id);
      saiPartida(s);
      Object.keys(salas).forEach((c) => sairSala(s, c));
      const p = me.id && pres[me.id];
      if (p && --p.n <= 0) { p.e = ''; io.emit('street:presenca', { id: me.id, estado: '' }); }
    });
  });
};
