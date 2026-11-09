const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve todos os arquivos estáticos (HTMLs, imagens, scripts) da pasta raiz
app.use(express.static(__dirname));

// Aqui você importa ou define a lógica de socket para cada jogo separadamente se precisar
io.on('connection', (socket) => {
  console.log('Um jogador se conectou ao hub');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor do Hub rodando na porta ${PORT}`);
});