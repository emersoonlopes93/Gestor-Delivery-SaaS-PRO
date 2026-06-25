import { Logger } from '@nestjs/common';

export class SafeLogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  static maskCpfCnpj(value?: string): string {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `***.***.${cleaned.substring(6, 9)}-**`;
    }
    if (cleaned.length === 14) {
      return `**.***.***/****-**`;
    }
    return '***';
  }

  static maskEmail(value?: string): string {
    if (!value) return '';
    const parts = value.split('@');
    if (parts.length !== 2) return '[redacted]';
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) {
      return `${name[0]}***@${domain}`;
    }
    return `${name[0]}***${name[name.length - 1]}@${domain}`;
  }

  static maskPhone(value?: string): string {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length < 4) return '****';
    return `****${cleaned.substring(cleaned.length - 4)}`;
  }

  static maskAddress(value?: string): string {
    if (!value) return '';
    return `[masked address, len=${value.length}]`;
  }

  static redactToken(value?: string): string {
    if (!value) return '';
    return '[redacted]';
  }

  static maskObject(obj: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      const val = obj[key];

      if (val === null || val === undefined) {
        masked[key] = val;
        continue;
      }

      if (typeof val === 'object' && !Array.isArray(val)) {
        masked[key] = SafeLogger.maskObject(val as Record<string, unknown>);
        continue;
      }

      if (lowerKey.includes('cpf') || lowerKey.includes('cnpj')) {
        masked[key] = SafeLogger.maskCpfCnpj(String(val));
      } else if (lowerKey.includes('email')) {
        masked[key] = SafeLogger.maskEmail(String(val));
      } else if (lowerKey.includes('phone') || lowerKey.includes('celular') || lowerKey.includes('telefone')) {
        masked[key] = SafeLogger.maskPhone(String(val));
      } else if (lowerKey.includes('address') || lowerKey.includes('endereco') || lowerKey.includes('rua') || lowerKey.includes('street')) {
        masked[key] = SafeLogger.maskAddress(String(val));
      } else if (
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('senha') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('jwt') ||
        lowerKey.includes('auth')
      ) {
        masked[key] = SafeLogger.redactToken(String(val));
      } else {
        masked[key] = val;
      }
    }
    return masked;
  }

  log(message: string, metadata?: Record<string, unknown>) {
    if (metadata) {
      const masked = SafeLogger.maskObject(metadata);
      this.logger.log(`${message} | metadata=${JSON.stringify(masked)}`);
    } else {
      this.logger.log(message);
    }
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    if (metadata) {
      const masked = SafeLogger.maskObject(metadata);
      this.logger.warn(`${message} | metadata=${JSON.stringify(masked)}`);
    } else {
      this.logger.warn(message);
    }
  }

  error(message: string, error?: unknown, metadata?: Record<string, unknown>) {
    const errorMsg = error instanceof Error ? error.message : String(error ?? '');
    const metaStr = metadata ? ` | metadata=${JSON.stringify(SafeLogger.maskObject(metadata))}` : '';
    this.logger.error(`${message} | error=${errorMsg}${metaStr}`);
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    if (metadata) {
      const masked = SafeLogger.maskObject(metadata);
      this.logger.debug(`${message} | metadata=${JSON.stringify(masked)}`);
    } else {
      this.logger.debug(message);
    }
  }
}
