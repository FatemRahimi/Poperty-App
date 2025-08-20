import io from 'socket.io-client';

// Create socket connection
const socket = io('http://localhost:5050', {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

// Socket event handlers
socket.on('connect', () => {
  console.log('🟢 Socket.IO connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('🔴 Socket.IO disconnected');
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket.IO connection error:', error);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 Socket.IO reconnected after', attemptNumber, 'attempts');
});

socket.on('reconnect_error', (error) => {
  console.error('❌ Socket.IO reconnection error:', error);
});

export { socket }; 