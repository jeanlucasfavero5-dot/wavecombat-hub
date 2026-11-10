// street-soccer-hub.js
// Módulo do jogo "Street Soccer" para o servidor central (Node + Socket.io v4).
// Uso no servidor do hub:   require('./street-soccer-hub')(io);
// Eventos isolados com prefixo "street:" no namespace padrão.
// Só atende sockets que se conectam com auth.jogo === 'street-soccer'.
//
// Cliente -> servidor               Servidor -> cliente
// street:status {estado}            street:presenca {id, estado}   (estado '' = offline)
// street:ident {nick, ver}          (atualiza o nick e o selo V usados no chat)
// street:amigos {ids} + ack         street:fila {n, max}
// street:fila:entrar / :sair        street:partida {jogadores}
// street:chat {txt}                 street:chat {id, nick, v, txt, ts}
// street:sala:criar / :entrar + ack street:sala {cod, host, mem}
// street:sala:sair {cod}            street:sala:chat {id, nick, v, txt, ts}
// street:sala:chat {cod, txt}
//
// Obs.: a presença aqui só conhece quem está com este jogo aberto. Se o hub já
// tem um mapa de presença do site, use-o dentro de 'street:amigos'.
module.exports = function (io) {
  const JOGO = 'street-soccer';
  const pres = {};   // id -> { n: conexões abertas, e: estado }
  const fila = [];   // [{ id, nick, sid }]
  const salas = {};  // cod -> { host, mem: [{ id, nick, ver, sid }] }
  const limpa = (t) => String(t || '').replace(/[<>]/g, '').slice(0, 120);
  const novoCod = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  const pub = (m) => ({ id: m.id, nick: m.nick, ver: m.ver });

  const setE = (id, e) => {
    if (!id) return;
    pres[id] = pres[id] || { n: 0, e: '' };
    pres[id].e = e;
    io.emit('street:presenca', { id, estado: e });
  };
  const emitFila = () => io.to('street:fila').emit('street:fila', { n: fila.length, max: 4 });
  const emitSala = (c) => {
    const r = salas[c];
    if (r) io.to('street:sala:' + c).emit('street:sala', { cod: c, host: r.host, mem: r.mem.map(pub) });
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

    s.on('street:fila:entrar', () => {
      if (!fila.some((f) => f.sid === s.id)) fila.push({ id: me.id, nick: me.nick, sid: s.id });
      s.join('street:fila');
      emitFila();
      if (fila.length >= 4) {
        const g = fila.splice(0, 4);
        const jogadores = g.map(({ id, nick }) => ({ id, nick }));
        g.forEach((f) => {
          const sk = io.sockets.sockets.get(f.sid);
          if (sk) { sk.leave('street:fila'); sk.emit('street:partida', { jogadores }); }
        });
        emitFila();
      }
    });
    s.on('street:fila:sair', () => { s.leave('street:fila'); sairFila(s.id); });

    s.on('street:chat', (d) =>
      io.to('street:geral').emit('street:chat', { id: me.id, nick: me.nick, v: me.ver, txt: limpa(d && d.txt), ts: Date.now() }));

    s.on('street:sala:criar', (d, cb) => {
      let c;
      do { c = novoCod(); } while (salas[c]);
      salas[c] = { host: me.id, mem: [{ ...me, sid: s.id }] };
      s.join('street:sala:' + c);
      setE(me.id, JOGO + ':sala');
      if (typeof cb === 'function') cb({ ok: true, sala: { cod: c, host: me.id, mem: [pub(me)] } });
    });
    s.on('street:sala:entrar', (d, cb) => {
      const c = String((d && d.cod) || '').toUpperCase();
      const r = salas[c];
      if (!r || r.mem.length >= 12) return typeof cb === 'function' && cb({ ok: false });
      if (!r.mem.some((m) => m.sid === s.id)) r.mem.push({ ...me, sid: s.id });
      s.join('street:sala:' + c);
      setE(me.id, JOGO + ':sala');
      emitSala(c);
      if (typeof cb === 'function') cb({ ok: true, sala: { cod: c, host: r.host, mem: r.mem.map(pub) } });
    });
    s.on('street:sala:sair', (d) => sairSala(s, String((d && d.cod) || '').toUpperCase()));
    s.on('street:sala:chat', (d) => {
      const c = String((d && d.cod) || '').toUpperCase();
      const r = salas[c];
      if (!r || !r.mem.some((m) => m.sid === s.id)) return;
      io.to('street:sala:' + c).emit('street:sala:chat', { id: me.id, nick: me.nick, v: me.ver, txt: limpa(d.txt), ts: Date.now() });
    });

    s.on('disconnect', () => {
      sairFila(s.id);
      Object.keys(salas).forEach((c) => sairSala(s, c));
      const p = me.id && pres[me.id];
      if (p && --p.n <= 0) { p.e = ''; io.emit('street:presenca', { id: me.id, estado: '' }); }
    });
  });
};
