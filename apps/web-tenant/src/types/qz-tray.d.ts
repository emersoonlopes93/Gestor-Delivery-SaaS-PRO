declare module 'qz-tray' {
  type QzPromiseExecutor<T = unknown> = (
    resolve: (value?: T) => void,
    reject: (reason?: unknown) => void,
  ) => void;

  const qz: {
    websocket: {
      connect: () => Promise<void>;
      isActive: () => boolean;
      disconnect: () => Promise<void>;
    };
    printers: {
      find: (query?: string) => Promise<string[] | string>;
    };
    configs: {
      create: (printer: string, options?: Record<string, unknown>) => unknown;
    };
    print: (config: unknown, data: Array<string | Record<string, unknown>>) => Promise<void>;
    security: {
      setCertificatePromise: (
        handler: (
          resolve: (value?: string) => void,
          reject: (reason?: unknown) => void,
        ) => void,
      ) => void;
      setSignaturePromise: (factory: (dataToSign: string) => QzPromiseExecutor<string>) => void;
      setSignatureAlgorithm: (algorithm: string) => void;
    };
  };

  export default qz;
}
