require("dotenv").config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { ensureIntelligenceSchema } = require('./db/ensureIntelligenceSchema');

const PORT = process.env.PORT || 5050;

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // ✅ your React app
    credentials: true
  }
});

// ✅ Store connected admins & users
let onlineUsers = {};

io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id);

  // ✅ Register user role (admin/user)
  socket.on('register', (role, userId) => {
    onlineUsers[userId] = { socketId: socket.id, role };
    console.log(`🟢 ${role} connected:`, userId);
    console.log('📊 Online users:', Object.keys(onlineUsers));
  });

  // ✅ Listen for property updates
  socket.on('propertyEdited', (property) => {
    console.log('📢 Property updated:', property);

    // Notify admin dashboard
    io.emit('newPropertyUpdate', property);
    console.log('📢 Sent newPropertyUpdate to all clients');
  });

  socket.on('approveProperty', (property) => {
    console.log('✅ Property approved:', property);

    // Notify the user who owns the property
    if (onlineUsers[property.ownerId]) {
      console.log(`📢 Sending propertyApproved to user ${property.ownerId}`);
      io.to(onlineUsers[property.ownerId].socketId)
        .emit('propertyApproved', property);
    } else {
      console.log(`⚠️ User ${property.ownerId} not found in online users`);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected:', socket.id);
    Object.keys(onlineUsers).forEach(userId => {
      if (onlineUsers[userId].socketId === socket.id) {
        console.log(`🔴 User ${userId} disconnected`);
        delete onlineUsers[userId];
      }
    });
    console.log('📊 Remaining online users:', Object.keys(onlineUsers));
  });
});

(async () => {
  try {
    await ensureIntelligenceSchema();
  } catch (err) {
    console.error('⚠️ Intelligence schema check failed:', err.message);
  }
  try {
    const { getPrivateEvidenceCapability } = require('./services/evidence/privateEvidenceConfig');
    const evidence = getPrivateEvidenceCapability();
    if (!evidence.ingestAvailable) {
      console.warn('⚠️ Private evidence ingest unavailable. Property Intelligence continues without it.');
    }
  } catch {
    console.warn('⚠️ Private evidence capability check failed. Property Intelligence continues.');
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 Socket.IO server ready for real-time updates`);
  });
})();