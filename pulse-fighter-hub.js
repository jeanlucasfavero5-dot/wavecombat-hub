/**
 * pulse-fighter-hub.js — módulo do servidor central (WaveCombat Hub) para o Pulse Fighter.
 *
 * Instalação (server.js, logo depois de criar o `io` do Socket.io):
 *     require('./pulse-fighter-hub')(io);
 *
 * Não mexe nos eventos que você já tem (find_match, join_room, game_action, ...): só ADICIONA
 * eventos isolados com o prefixo do jogo ("pulse-fighter:<evento>").
 *
 *  cliente → servidor
 *    pulse-fighter:presenca     {id, nick, st, v}        jogador abriu/está no jogo (st: menu|busca|sala|partida|offline)
 *    pulse-fighter:amigos       {id, amigos:[ids]} (+ack) pede o status online dos amigos (lista vem do Supabase)
 *    pulse-fighter:chat_global  {text, nick, id, mid}    mensagem do chat geral do jogo
 *  servidor → cliente
 *    pulse-fighter:amigo_status {id, on, game, st, nick, v}          mudança de status de um amigo (push)
 *    pulse-fighter:amigos_status {status:{id:{on,game,st,...}}}      resposta (também enviada via ack)
 *    pulse-fighter:chat_global  {nick, id, adm, text, mid, ts}       mensagem para todos os jogadores do jogo
 *    pulse-fighter:chat_hist    [mensagens]                          últimas mensagens ao entrar
 *
 * O chat das salas personalizadas NÃO passa por aqui: o jogo usa o game_action que você já tem
 * (relay só para quem está na sala), então ele já é privado por construção.
 *
 * A presença fica em io.wcPresence (Map id → {nick, game, st, v, sockets}); se os outros jogos do Hub
 * usarem este mesmo módulo com {game:'zombie-house'} etc., os amigos passam a ver em qual jogo cada um está.
 */
module.exports = function pulseFighterHub(io, opts) {
  opts = opts || {};
  const G = opts.game || 'pulse-fighter';
  const ev = n => G + ':' + n;
  const ROOM = 'game:' + G;
  const ADMINS = new Set(String(opts.admins || process.env.WC_ADMINS || '577082415,162028398').split(',').map(s => s.trim()).filter(Boolean));
  const REG = io.wcPresence || (io.wcPresence = new Map());   // id -> { nick, game, st, v, sockets:Set }
  const hist = [];
  const watchRoom = id => 'wc:watch:' + id;
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
  const pub = id => {
    const p = REG.get(id);
    return p && p.sockets.size ? { id, on: true, game: p.game, st: p.st, nick: p.nick, v: p.v } : { id, on: false };
  };

  io.on('connection', socket => {
    let pid = null, lastChat = 0, sentHist = false, watching = new Set();

    const leave = () => {
      if (!pid) return;
      const p = REG.get(pid);
      if (p) {
        p.sockets.delete(socket.id);
        if (!p.sockets.size) REG.delete(pid);
      }
      io.to(watchRoom(pid)).emit(ev('amigo_status'), pub(pid));
    };

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

    socket.on('disconnect', leave);
  });
};
