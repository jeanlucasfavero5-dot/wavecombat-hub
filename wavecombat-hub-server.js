const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const SUPPORTED_GAMES = [
  'gravitas-arena',
  'zombie-house',
  'pulse-fighter',
  'riverbed-warfare',
  'supercar-circuit'
];

const MATCH_SIZE = 4;

const matchQueues = {
  'gravitas-arena': [],
  'zombie-house': [],
  'pulse-fighter': [],
  'riverbed-warfare': [],
  'supercar-circuit': []
};

const gameRooms = {
  'gravitas-arena': {},
  'zombie-house': {},
  'pulse-fighter': {},
  'riverbed-warfare': {},
  'supercar-circuit': {}
};

app.get('/', (req, res) => {
  res.send({ status: 'Online', games: SUPPORTED_GAMES });
});

// [NOVO] avisa quem está na fila quantos jogadores já esperam (contador "X/4" do cliente)
function broadcastQueue(gameId) {
  const q = matchQueues[gameId] || [];
  q.forEach((s) => s.emit('queue_update', { count: q.length, max: MATCH_SIZE }));
}

// [NOVO] tira o socket da fila e avisa os demais
function leaveQueue(socket) {
  const gameId = socket.gameId;
  if (gameId && matchQueues[gameId]) {
    matchQueues[gameId] = matchQueues[gameId].filter(s => s.id !== socket.id);
    broadcastQueue(gameId);
  }
}

io.on('connection', (socket) => {
  console.log(`[Socket] Conectado: ${socket.id}`);

  socket.on('find_match', ({ gameId, playerName }) => {
    if (!SUPPORTED_GAMES.includes(gameId)) {
      socket.emit('error_message', 'Jogo não reconhecido.');
      return;
    }

    socket.gameId = gameId;
    socket.playerName = playerName || 'Jogador';

    // [NOVO] não entra duas vezes na mesma fila
    if (!matchQueues[gameId].some(s => s.id === socket.id)) {
      matchQueues[gameId].push(socket);
    }
    console.log(`[Matchmaking] ${socket.playerName} entrou na fila de ${gameId}. Total: ${matchQueues[gameId].length}`);

    socket.emit('waiting_for_match', {
      message: 'Procurando oponentes...',
      count: matchQueues[gameId].length,   // [NOVO]
      max: MATCH_SIZE                      // [NOVO]
    });

    if (matchQueues[gameId].length >= MATCH_SIZE) {
      const roomPlayers = matchQueues[gameId].splice(0, MATCH_SIZE);
      const roomId = `auto_${Date.now()}`;

      gameRooms[gameId][roomId] = {};

      roomPlayers.forEach((playerSocket) => {
        playerSocket.roomId = roomId;
        const fullRoomId = `${gameId}_${roomId}`;
        playerSocket.join(fullRoomId);

        gameRooms[gameId][roomId][playerSocket.id] = {
          id: playerSocket.id,
          name: playerSocket.playerName
        };
      });

      io.to(`${gameId}_${roomId}`).emit('match_found', {
        roomId: roomId,
        players: gameRooms[gameId][roomId]
      });

      console.log(`[Matchmaking] Partida iniciada em ${gameId} | Sala: ${roomId} com ${MATCH_SIZE} jogadores.`);
    }

    broadcastQueue(gameId); // [NOVO]
  });

  socket.on('cancel_matchmaking', () => {
    leaveQueue(socket); // [NOVO] também avisa os demais da fila
  });

  socket.on('join_room', ({ gameId, roomId, playerName }) => {
    if (!SUPPORTED_GAMES.includes(gameId)) return;

    socket.gameId = gameId;
    socket.roomId = roomId;
    socket.playerName = playerName || 'Jogador';

    const fullRoomId = `${gameId}_${roomId}`;
    socket.join(fullRoomId);

    if (!gameRooms[gameId][roomId]) {
      gameRooms[gameId][roomId] = {};
    }

    gameRooms[gameId][roomId][socket.id] = {
      id: socket.id,
      name: socket.playerName
    };

    io.to(fullRoomId).emit('player_joined', {
      players: gameRooms[gameId][roomId],
      newPlayer: socket.id
    });
  });

  socket.on('game_action', (data) => {
    if (socket.gameId && socket.roomId) {
      const fullRoomId = `${socket.gameId}_${socket.roomId}`;
      socket.to(fullRoomId).emit('game_action', {
        playerId: socket.id,
        action: data
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Desconectado: ${socket.id}`);
    leaveQueue(socket); // [NOVO]
    if (socket.gameId && socket.roomId && gameRooms[socket.gameId]?.[socket.roomId]) {
      delete gameRooms[socket.gameId][socket.roomId][socket.id];
      const fullRoomId = `${socket.gameId}_${socket.roomId}`;
      io.to(fullRoomId).emit('player_left', { playerId: socket.id });
      // [NOVO] apaga a sala vazia da memória
      if (Object.keys(gameRooms[socket.gameId][socket.roomId]).length === 0) {
        delete gameRooms[socket.gameId][socket.roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
