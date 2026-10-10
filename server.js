const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, '../client')));

const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', ({ room, username }) => {
    socket.join(room);
    socket.data.username = username || `User_${socket.id.substr(0, 4)}`;
    socket.data.room = room;

    if (!rooms[room]) {
      rooms[room] = { users: [], history: [] };
    }

    rooms[room].users.push({ id: socket.id, username: socket.data.username });

    socket.emit('load-history', rooms[room].history);
    io.to(room).emit('update-users', rooms[room].users);
  });

  // Unified Draw Handler with socketId tracking
  socket.on('draw', (data) => {
    const room = socket.data.room;
    if (room && rooms[room]) {
      const strokeData = { ...data, socketId: socket.id };
      rooms[room].history.push(strokeData);
      socket.to(room).emit('draw', strokeData);
    }
  });

  socket.on('cursor-move', (pos) => {
    const room = socket.data.room;
    if (room) {
      socket.to(room).emit('cursor-move', {
        id: socket.id,
        username: socket.data.username,
        x: pos.x,
        y: pos.y
      });
    }
  });

  socket.on('clear-canvas', () => {
    const room = socket.data.room;
    if (room && rooms[room]) {
      rooms[room].history = [];
      io.to(room).emit('clear-canvas');
    }
  });

  // Handle Undo Request
  socket.on('undo', () => {
    const room = socket.data.room;
    if (room && rooms[room]) {
      const history = rooms[room].history;

      // Find the index of the last stroke drawn by this specific user
      let lastIndex = -1;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].socketId === socket.id) {
          lastIndex = i;
          break;
        }
      }

      // If found, remove it and broadcast the refreshed canvas history
      if (lastIndex !== -1) {
        history.splice(lastIndex, 1);
        io.to(room).emit('refresh-canvas', history);
      }
    }
  });

  // Handle Latency Ping Measurement
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback();
    }
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (room && rooms[room]) {
      rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
      io.to(room).emit('update-users', rooms[room].users);
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running smoothly on http://localhost:${PORT}`);
});