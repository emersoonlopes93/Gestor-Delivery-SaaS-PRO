import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
const socketUrl = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');

export const socket = io(`${socketUrl}/delivery`, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});
