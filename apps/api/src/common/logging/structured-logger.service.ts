import type { LoggerService } from '@nestjs/common';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

type StructuredLogBase = {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'verbose';
  context?: string;
  message?: string;
  data?: unknown;
};

type StructuredError = {
  name?: string;
  message?: string;
  stack?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeLevel(level: LogLevel): StructuredLogBase['level'] {
  switch (level) {
    case 'log':
      return 'info';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    case 'debug':
      return 'debug';
    case 'verbose':
      return 'verbose';
  }
}

function extractError(value: unknown): StructuredError | undefined {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return undefined;
}

export class StructuredLoggerService implements LoggerService {
  constructor(private readonly enabledLevels: Set<LogLevel>) {}

  log(message: unknown, context?: string) {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    const error = trace ? { stack: trace } : undefined;
    this.write('error', message, context, error);
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string, extraError?: { stack?: string }) {
    if (!this.enabledLevels.has(level)) return;

    const timestamp = new Date().toISOString();

    const base: StructuredLogBase = {
      timestamp,
      level: normalizeLevel(level),
      ...(context ? { context } : {}),
    };

    const errFromMessage = extractError(message);

    if (isRecord(message)) {
      const { message: msg, ...rest } = message;
      const out: Record<string, unknown> = {
        ...base,
        ...(typeof msg === 'string' ? { message: msg } : {}),
        ...(Object.keys(rest).length ? { data: rest } : {}),
        ...(errFromMessage ? { error: errFromMessage } : {}),
      };
      process.stdout.write(`${JSON.stringify(out)}\n`);
      return;
    }

    const out: Record<string, unknown> = {
      ...base,
      message: safeString(message),
      ...(errFromMessage ? { error: errFromMessage } : {}),
      ...(extraError?.stack ? { error: { ...(errFromMessage ?? {}), stack: extraError.stack } } : {}),
    };

    process.stdout.write(`${JSON.stringify(out)}\n`);
  }

  static fromEnv(): StructuredLoggerService {
    const nodeEnv = process.env.NODE_ENV ?? 'development';

    const defaultLevels: LogLevel[] =
      nodeEnv === 'production'
        ? ['log', 'warn', 'error']
        : ['log', 'warn', 'error', 'debug', 'verbose'];

    const enabledLevels = new Set<LogLevel>(defaultLevels);
    return new StructuredLoggerService(enabledLevels);
  }
}
