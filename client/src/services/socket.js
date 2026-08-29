import io from 'socket.io-client';

const resolveSocketUrl = () => {
  if (process.env.REACT_APP_BACKEND_URL) return process.env.REACT_APP_BACKEND_URL;
  return 'http://localhost:5050';
};

const socket = io(resolveSocketUrl(), {
  withCredentials: true,
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

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
