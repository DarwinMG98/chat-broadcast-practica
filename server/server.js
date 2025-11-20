const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const SECRET = 'CAMBIA_ESTA_SECRETA_POR_PRODUCCION';
const app = express();
app.use(cors());
app.use(bodyParser.json());

// usuarios "simples" en memoria (username -> role)
const users = {
  'alice': 'admin',
  'bob': 'user',
  'carla': 'user'
};

// endpoint de login simple que devuelve JWT (solo para ejemplo)
app.post('/api/login', (req, res) => {
  const { username } = req.body;
  if (!username || !users[username]) return res.status(401).json({ error: 'Usuario inválido. Usa alice, bob o carla' });
  const role = users[username];
  const token = jwt.sign({ username, role }, SECRET, { expiresIn: '4h' });
  return res.json({ token, username, role });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// map socketId -> { username, role }
const clients = new Map();
// rooms set
const rooms = new Set(['general','random']);

// middleware de autenticación para sockets usando token en handshake.auth.token
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    const payload = jwt.verify(token, SECRET);
    socket.data.user = { username: payload.username, role: payload.role };
    return next();
  } catch (err) {
    return next(new Error('Token inválido'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  clients.set(socket.id, user);
  console.log(`Conectado ${socket.id} -> ${user.username} (${user.role})`);
  io.emit('presence', { clients: Array.from(clients).map(([id,u]) => ({ id, ...u })) });

  // Unirse a sala (la crea si no existe)
  socket.on('createOrJoinRoom', (room) => {
    if (!room) return;
    rooms.add(room);
    socket.join(room);
    io.to(room).emit('system', { msg: `${user.username} se unió a ${room}` });
    io.emit('rooms', Array.from(rooms));
  });

  socket.on('leaveRoom', (room) => {
    socket.leave(room);
    io.to(room).emit('system', { msg: `${user.username} salió de ${room}` });
  });

  // mensaje a sala
  socket.on('roomMessage', ({ room, message }) => {
    if (!room || !message) return;
    const payload = { room, from: user.username, message, ts: Date.now() };
    io.to(room).emit('roomMessage', payload);
  });

  // broadcast global (solo admin)
  socket.on('broadcast', (message) => {
    if (user.role !== 'admin') {
      socket.emit('error', { msg: 'No autorizado: solo admin' });
      return;
    }
    io.emit('broadcast', { from: user.username, message, ts: Date.now() });
  });

  // privado
  socket.on('privateMessage', ({ toSocketId, message }) => {
    if (!toSocketId || !message) return;
    const payload = { from: user.username, message, ts: Date.now() };
    io.to(toSocketId).emit('privateMessage', payload);
    // opcional: confirmar al emisor
    socket.emit('privateSent', { to: toSocketId, message });
  });

  // listar salas
  socket.on('listRooms', () => {
    socket.emit('rooms', Array.from(rooms));
  });

  // eliminar sala (solo admin)
  socket.on('deleteRoom', (room) => {
    if (user.role !== 'admin') {
      socket.emit('error', { msg: 'No autorizado: solo admin' });
      return;
    }
    rooms.delete(room);
    io.emit('rooms', Array.from(rooms));
  });

  socket.on('disconnect', (reason) => {
    clients.delete(socket.id);
    io.emit('presence', { clients: Array.from(clients).map(([id,u]) => ({ id, ...u })) });
    console.log(`Desconectado ${socket.id} (${reason})`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Servidor corriendo en http://localhost:' + PORT));