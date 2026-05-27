declare global {
  interface Window {
    __CHAT_SOCKET?: import('socket.io-client').Socket | null;
    __CHAT_SOCKET_CONNECTED?: boolean;
  }
}

export {};
