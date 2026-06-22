import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
const socketUrlBase = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
const socketPath = socketUrlBase ? `${socketUrlBase}/delivery` : '/delivery';

export const socket = io(socketPath, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});
