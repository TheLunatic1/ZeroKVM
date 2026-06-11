const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Map of socketId -> { roomId, deviceName }
const clients = {};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', (roomId, deviceName) => {
    socket.join(roomId);
    clients[socket.id] = { roomId, deviceName };
    console.log(`Socket ${socket.id} (${deviceName}) joined room ${roomId}`);
    
    // Get all other clients in the room to send to the new user
    const room = io.sockets.adapter.rooms.get(roomId);
    const existingPeers = [];
    if (room) {
      for (const id of room) {
        if (id !== socket.id) {
          existingPeers.push({ id, deviceName: clients[id]?.deviceName });
        }
      }
    }

    // Tell the new user about existing peers
    socket.emit('room-peers', existingPeers);

    // Notify others that a new user joined (they will initiate connection)
    socket.to(roomId).emit('user-joined', { id: socket.id, deviceName });
  });

  socket.on('offer', (targetId, offer) => {
    socket.to(targetId).emit('offer', socket.id, offer);
  });

  socket.on('answer', (targetId, answer) => {
    socket.to(targetId).emit('answer', socket.id, answer);
  });

  socket.on('ice-candidate', (targetId, candidate) => {
    socket.to(targetId).emit('ice-candidate', socket.id, candidate);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const client = clients[socket.id];
    if (client) {
      socket.to(client.roomId).emit('user-left', socket.id);
      delete clients[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
