/**
 * pulse-fighter-hub.js (v2) — módulo do servidor central (WaveCombat Hub) para o Pulse Fighter.
 *
 * Instalação (server.js, logo depois de criar o `io` do Socket.io):
 *     require('./pulse-fighter-hub')(io);
 *
 * Não mexe nos eventos que você já tem (find_match, join_room, game_action, ...): só ADICIONA
 * eventos isolados com o prefixo do jogo ("pulse-fighter:<evento>"). Opções: require(...)(io,{botWait:15000,admins:'id1,id2'})
 *
 *  PRESENÇA / AMIGOS / CHAT GERAL (v1)
 *    pulse-fighter:presenca     {id, nick, st, v}        jogador abriu/está no jogo (st: menu|busca|sala|partida|offline)
 *    pulse-fighter:amigos       {id, amigos:[ids]} (+ack) status online dos amigos (lista vem do Supabase)
 *    pulse-fighter:chat_global  {text, nick, id, mid}    chat geral do jogo
 *    → amigo_status · amigos_status · chat_global · chat_hist
 *
 *  v2 — PARTIDA RÁPIDA (fila 1v1 / 2v2, completa com bots)
 *    pulse-fighter:hello        (+ack {v:2,caps,botWait})  o cliente descobre se o servidor já é v2
 *    pulse-fighter:fila         {mode:'1v1'|'2v2'} (+ack)  entra na fila → fila_status {mode,n,need}
 *    pulse-fighter:fila_sair                               sai da fila
 *       passou o tempo (botWait) e só havia 1 jogador → fila_bots {mode}  (o cliente joga contra bots, offline)
 *       passou o tempo e havia 2+ jogadores           → partida com bots nas vagas livres
 *
 *  v2 — SALAS PERSONALIZADAS (ID + senha escolhida pelo criador)
 *    sala_criar {mode,pass} (+ack {ok,code,...})   sala_entrar {code,pass} (+ack {ok|err})
 *    sala_sair · sala_remover {id} (só o dono) · sala_equipe {team} · sala_chat {text,mid} · sala_iniciar (só o dono, 1 cartão)
 *    → sala_estado {code,mode,host,started,max,members:[{id,nick,v,team,host}]} · sala_removido · sala_chat
 *      erros de entrar: nao_existe | senha | cheia | iniciada | removido | limite
 *
 *  v2 — PARTIDA (relay de quem está na mesma partida)
 *    → partida {room,mode,you,host,slots:[{s,id,nick,v,bot,team}],sala}
 *    pulse-fighter:rel {a:{...}}  → os outros recebem  rel {s:<vaga de quem enviou>,a:{...}}
 *    partida_sair  → os outros recebem partida_saiu {s} (e partida_host {s} se o host saiu)
 *
 * O chat das salas fica só entre os membros da sala (sala_chat), então é privado por construção.
 * A presença fica em io.wcPresence (Map id → {nick, game, st, v, sockets}).
 */
module.exports = function pulseFighterHub(io, opts) {
  opts = opts || {};
  const G = opts.game || 'pulse-fighter';
  const ev = n => G + ':' + n;
  const ROOM = 'game:' + G;
  const ADMINS = new Set(String(opts.admins || process.env.WC_ADMINS || '577082415,162028398').split(',').map(s => s.trim()).filter(Boolean));
  const BOT_WAIT = opts.botWait != null ? opts.botWait : 15000;   // ms até completar a partida com bots
  const REG = io.wcPresence || (io.wcPresence = new Map());   // id -> { nick, game, st, v, sockets:Set }
  const hist = [];
  const watchRoom = id => 'wc:watch:' + id;
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
  const pub = id => {
    const p = REG.get(id);
    return p && p.sockets.size ? { id, on: true, game: p.game, st: p.st, nick: p.nick, v: p.v } : { id, on: false };
  };

  // ---------- partida rápida + salas ----------
  const NEED = { '1v1': 2, '2v2': 4 };
  const ORDER = { '1v1': [0, 1], '2v2': [0, 2, 1, 3] };    // vagas preenchidas em ordem: equipes alternadas
  const Q = { '1v1': [], '2v2': [] };                       // [{socket,id,nick,v}]
  const QT = { '1v1': null, '2v2': null };
  const MATCHES = new Map();                                // room -> {room,mode,slots,socks,host,sala}
  const ROOMS = new Map();                                  // code -> {code,pass,mode,host,members,banned,match,started}
  let mseq = 0;
  const teamOf = (mode, s) => (s * 2 >= NEED[mode] ? 1 : 0);

  const qBroadcast = mode => {
    const q = Q[mode];
    q.forEach(e => e.socket.emit(ev('fila_status'), { mode, n: q.length, need: NEED[mode] }));
  };
  const qTimer = mode => {
    const q = Q[mode];
    if (!q.length) { if (QT[mode]) { clearTimeout(QT[mode]); QT[mode] = null; } return; }
    if (QT[mode]) return;
    QT[mode] = setTimeout(() => { QT[mode] = null; botFill(mode); }, BOT_WAIT);
  };
  const qRemove = (mode, socket) => {
    const q = Q[mode], i = q.findIndex(e => e.socket === socket);
    if (i >= 0) { q.splice(i, 1); qBroadcast(mode); qTimer(mode); }
  };
  const makeMatch = (mode, assign, sala) => {
    const need = NEED[mode];
    const room = 'pf:m:' + (++mseq).toString(36) + Math.random().toString(36).slice(2, 5);
    const slots = Array.from({ length: need }, (_, s) => ({ s, team: teamOf(mode, s), bot: true, id: '', nick: 'BOT', v: 0 }));
    const socks = new Map();
    assign.forEach(a => { Object.assign(slots[a.s], { bot: false, id: a.h.id, nick: a.h.nick, v: a.h.v ? 1 : 0 }); socks.set(a.s, a.h.socket); });
    const host = Math.min(...assign.map(a => a.s));
    const M = { room, mode, slots, socks, host, sala: sala || null };
    MATCHES.set(room, M);
    socks.forEach((sk, s) => {
      sk.join(room);
      sk.emit(ev('partida'), { room, mode, you: s, host, slots, sala: M.sala });
      sk.pfMatch = { room, slot: s };
    });
    return M;
  };
  const tryForm = mode => {
    const q = Q[mode], need = NEED[mode];
    while (q.length >= need) {
      const group = q.splice(0, need);
      group.forEach(e => { e.socket.pfQ = null; });
      makeMatch(mode, group.map((h, k) => ({ h, s: ORDER[mode][k] })));
    }
    qBroadcast(mode); qTimer(mode);
  };
  const botFill = mode => {
    const q = Q[mode];
    if (!q.length) return;
    if (q.length === 1) {                     // sozinho: o cliente joga contra bots (offline)
      const e = q.splice(0, 1)[0]; e.socket.pfQ = null;
      e.socket.emit(ev('fila_bots'), { mode });
    } else {                                  // 2+ jogadores: partida online, bots nas vagas livres
      const group = q.splice(0, q.length);
      group.forEach(e => { e.socket.pfQ = null; });
      makeMatch(mode, group.map((h, k) => ({ h, s: ORDER[mode][k] })));
    }
    qBroadcast(mode); qTimer(mode);
  };

  const newCode = () => { let c; do { c = String(Math.floor(10000 + Math.random() * 90000)); } while (ROOMS.has(c)); return c; };
  const pubRoom = R => ({
    code: R.code, mode: R.mode, host: R.host, started: !!R.started, max: NEED[R.mode],
    members: R.members.map(m => ({ id: m.id, nick: m.nick, v: m.v ? 1 : 0, team: m.team, host: m.id === R.host }))
  });
  const roomRoom = code => 'pf:sala:' + code;
  const bcastRoom = R => io.to(roomRoom(R.code)).emit(ev('sala_estado'), pubRoom(R));

  io.on('connection', socket => {
    let pid = null, lastChat = 0, lastSala = 0, sentHist = false, watching = new Set(), myRoom = null, relN = 0, relT = 0, tries = [];
    socket.pfQ = null; socket.pfMatch = null;

    const leave = () => {
      if (!pid) return;
      const p = REG.get(pid);
      if (p) {
        p.sockets.delete(socket.id);
        if (!p.sockets.size) REG.delete(pid);
      }
      io.to(watchRoom(pid)).emit(ev('amigo_status'), pub(pid));
    };
    const who = d => {
      const p = pid && REG.get(pid);
      return { id: pid || ('g' + String(socket.id).slice(0, 8)), nick: (p && p.nick) || clean(d && d.nick, 20) || 'Jogador', v: p ? p.v : 0 };
    };

    // ---- sair de fila / partida / sala ----
    const leaveQueue = () => { if (socket.pfQ) { const m = socket.pfQ; socket.pfQ = null; qRemove(m, socket); } };
    const leaveMatch = () => {
      const pm = socket.pfMatch; if (!pm) return;
      socket.pfMatch = null; socket.leave(pm.room);
      const M = MATCHES.get(pm.room); if (!M) return;
      M.socks.delete(pm.slot);
      if (!M.socks.size) {
        MATCHES.delete(pm.room);
        if (M.sala) { const R = ROOMS.get(M.sala); if (R) { R.started = false; R.match = null; bcastRoom(R); } }
        return;
      }
      io.to(pm.room).emit(ev('partida_saiu'), { s: pm.slot });
      if (M.host === pm.slot) { M.host = Math.min(...M.socks.keys()); io.to(pm.room).emit(ev('partida_host'), { s: M.host }); }
    };
    const leaveRoom = () => {
      if (!myRoom) return;
      const code = myRoom; myRoom = null; socket.leave(roomRoom(code));
      const R = ROOMS.get(code); if (!R) return;
      const me = who();
      R.members = R.members.filter(m => m.socket !== socket);
      if (!R.members.length) { ROOMS.delete(code); return; }
      if (R.host === me.id || !R.members.some(m => m.id === R.host)) R.host = R.members[0].id;
      bcastRoom(R);
    };
    const leaveAll = () => { leaveQueue(); leaveMatch(); leaveRoom(); };

    socket.on(ev('presenca'), d => {
      if (!d || typeof d !== 'object') return;
      const id = clean(d.id, 40);
      if (!id || id === 'convidado') return;
      if (pid && pid !== id) leave();                 // trocou de conta nesta conexão
      pid = id;
      socket.join(ROOM);
      if (d.st === 'offline') { leave(); return; }    // aba fechando
      let p = REG.get(id);
      if (!p) { p = { sockets: new Set() }; REG.set(id, p); }
      p.sockets.add(socket.id);
      p.nick = clean(d.nick, 20); p.game = G; p.st = clean(d.st, 12) || 'menu'; p.v = d.v ? 1 : 0;
      io.to(watchRoom(id)).emit(ev('amigo_status'), pub(id));
      if (!sentHist) { sentHist = true; socket.emit(ev('chat_hist'), hist); }
    });

    socket.on(ev('amigos'), (d, ack) => {
      const ids = Array.isArray(d && d.amigos) ? d.amigos.slice(0, 300).map(x => clean(x, 40)).filter(Boolean) : [];
      const next = new Set(ids);
      watching.forEach(id => { if (!next.has(id)) socket.leave(watchRoom(id)); });
      next.forEach(id => { if (!watching.has(id)) socket.join(watchRoom(id)); });
      watching = next;
      const status = {};
      ids.forEach(id => { status[id] = pub(id); });
      if (typeof ack === 'function') ack({ status });
      else socket.emit(ev('amigos_status'), { status });
    });

    socket.on(ev('chat_global'), d => {
      if (!d || typeof d !== 'object') return;
      const text = clean(d.text, 120).trim();
      if (!text) return;
      const now = Date.now();
      if (now - lastChat < 500) return;               // anti-spam
      lastChat = now;
      const p = pid && REG.get(pid);
      const id = pid || clean(d.id, 40);
      const msg = {
        nick: (p && p.nick) || clean(d.nick, 20) || 'Jogador',
        id,
        adm: ADMINS.has(id),
        text,
        mid: clean(d.mid, 60) || (id + '-' + now.toString(36)),
        ts: now
      };
      hist.push(msg); if (hist.length > 40) hist.shift();
      io.to(ROOM).emit(ev('chat_global'), msg);
    });

    // ================= v2 =================
    socket.on(ev('hello'), (d, ack) => { if (typeof ack === 'function') ack({ v: 2, caps: ['fila', 'salas', 'rel'], botWait: BOT_WAIT }); });

    // ---- fila ----
    socket.on(ev('fila'), (d, ack) => {
      const mode = d && d.mode === '2v2' ? '2v2' : '1v1';
      leaveAll();
      const me = who(d), q = Q[mode];
      q.push({ socket, id: me.id, nick: me.nick, v: me.v });
      socket.pfQ = mode;
      if (typeof ack === 'function') ack({ ok: true, mode, need: NEED[mode], n: q.length, botWait: BOT_WAIT });
      qBroadcast(mode); qTimer(mode); tryForm(mode);
    });
    socket.on(ev('fila_sair'), () => leaveQueue());

    // ---- partida (relay) ----
    socket.on(ev('rel'), d => {
      const pm = socket.pfMatch;
      if (!pm || !d || typeof d.a !== 'object' || d.a === null) return;
      const now = Date.now();
      if (now - relT > 1000) { relT = now; relN = 0; }
      if (++relN > 300) return;                       // anti-flood: 300 msgs/s
      socket.to(pm.room).emit(ev('rel'), { s: pm.slot, a: d.a });
    });
    socket.on(ev('partida_sair'), () => {
      const M = socket.pfMatch && MATCHES.get(socket.pfMatch.room), sala = M && M.sala;
      leaveMatch();
      const R = sala && ROOMS.get(sala);
      if (R && myRoom === sala) socket.emit(ev('sala_estado'), pubRoom(R));
    });

    // ---- salas personalizadas ----
    socket.on(ev('sala_criar'), (d, ack) => {
      const reply = r => { if (typeof ack === 'function') ack(r); };
      const mode = d && d.mode === '2v2' ? '2v2' : '1v1';
      const pass = clean(d && d.pass, 16).trim();
      if (!pass) return reply({ ok: false, err: 'senha' });
      leaveAll();
      const me = who(d), code = newCode();
      const R = { code, pass, mode, host: me.id, members: [], banned: new Set(), match: null, started: false };
      R.members.push({ id: me.id, nick: me.nick, v: me.v, team: 0, socket });
      ROOMS.set(code, R); myRoom = code; socket.join(roomRoom(code));
      reply(Object.assign({ ok: true }, pubRoom(R)));
    });
    socket.on(ev('sala_entrar'), (d, ack) => {
      const reply = r => { if (typeof ack === 'function') ack(r); };
      const now = Date.now(); tries = tries.filter(t => now - t < 30000);
      if (tries.length >= 8) return reply({ ok: false, err: 'limite' });
      tries.push(now);
      const code = clean(d && d.code, 10).replace(/[^\w]/g, ''), R = ROOMS.get(code);
      if (!R) return reply({ ok: false, err: 'nao_existe' });
      if (clean(d && d.pass, 16).trim() !== R.pass) return reply({ ok: false, err: 'senha' });
      const me = who(d);
      if (R.banned.has(me.id)) return reply({ ok: false, err: 'removido' });
      if (R.started) return reply({ ok: false, err: 'iniciada' });
      if (myRoom === code && R.members.some(m => m.socket === socket)) return reply(Object.assign({ ok: true }, pubRoom(R)));
      const per = NEED[R.mode] / 2, cnt = [0, 0];
      R.members.forEach(m => { cnt[m.team]++; });
      if (cnt[0] >= per && cnt[1] >= per) return reply({ ok: false, err: 'cheia' });
      leaveAll();
      const team = cnt[0] <= cnt[1] ? (cnt[0] < per ? 0 : 1) : (cnt[1] < per ? 1 : 0);
      R.members = R.members.filter(m => m.id !== me.id);     // mesmo jogador reconectando
      R.members.push({ id: me.id, nick: me.nick, v: me.v, team, socket });
      myRoom = code; socket.join(roomRoom(code));
      reply(Object.assign({ ok: true }, pubRoom(R)));
      bcastRoom(R);
    });
    socket.on(ev('sala_sair'), () => leaveRoom());
    socket.on(ev('sala_remover'), (d, ack) => {
      const reply = r => { if (typeof ack === 'function') ack(r); };
      const R = myRoom && ROOMS.get(myRoom), me = who();
      if (!R || R.host !== me.id) return reply({ ok: false, err: 'so_dono' });
      if (R.started) return reply({ ok: false, err: 'iniciada' });
      const tid = clean(d && d.id, 40), t = R.members.find(m => m.id === tid);
      if (!t || tid === me.id) return reply({ ok: false, err: 'invalido' });
      R.members = R.members.filter(m => m !== t); R.banned.add(tid);
      t.socket.leave(roomRoom(R.code)); t.socket.emit(ev('sala_removido'), { code: R.code });
      t.socket.pfRoomGone && t.socket.pfRoomGone();
      reply({ ok: true }); bcastRoom(R);
    });
    socket.on(ev('sala_equipe'), (d, ack) => {
      const reply = r => { if (typeof ack === 'function') ack(r); };
      const R = myRoom && ROOMS.get(myRoom); if (!R) return reply({ ok: false });
      if (R.started) return reply({ ok: false, err: 'iniciada' });
      const m = R.members.find(x => x.socket === socket); if (!m) return reply({ ok: false });
      const nt = 1 - m.team, per = NEED[R.mode] / 2;
      if (R.members.filter(x => x.team === nt).length >= per) return reply({ ok: false, err: 'cheia' });
      m.team = nt; reply({ ok: true }); bcastRoom(R);
    });
    socket.on(ev('sala_chat'), d => {
      const R = myRoom && ROOMS.get(myRoom); if (!R || !d) return;
      const text = clean(d.text, 120).trim(); if (!text) return;
      const now = Date.now(); if (now - lastSala < 400) return; lastSala = now;
      const me = who();
      io.to(roomRoom(R.code)).emit(ev('sala_chat'), { nick: me.nick, id: me.id, text, mid: clean(d.mid, 60) || (me.id + '-' + now.toString(36)), ts: now });
    });
    socket.on(ev('sala_iniciar'), (d, ack) => {
      const reply = r => { if (typeof ack === 'function') ack(r); };
      const R = myRoom && ROOMS.get(myRoom), me = who();
      if (!R || R.host !== me.id) return reply({ ok: false, err: 'so_dono' });
      if (R.started) return reply({ ok: false, err: 'iniciada' });
      const t0 = R.members.filter(m => m.team === 0), t1 = R.members.filter(m => m.team === 1);
      if (!t0.length || !t1.length) return reply({ ok: false, err: 'poucos' });
      const base = [0, NEED[R.mode] / 2], assign = [];
      [t0, t1].forEach((arr, t) => arr.forEach((m, k) => assign.push({ h: m, s: base[t] + k })));
      R.started = true;
      const M = makeMatch(R.mode, assign, R.code); R.match = M.room;
      reply({ ok: true }); bcastRoom(R);
    });

    socket.on('disconnect', () => { leaveAll(); leave(); });
  });
};
