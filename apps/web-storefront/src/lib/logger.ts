/**
 * Utilitário de Observabilidade (Frontend)
 * Pronto para conectar com Sentry, LogRocket ou Datadog.
 */

type LogLevel = 'info' | 'warn' | 'error';

class Logger {
  private isProd = import.meta.env.PROD;

  log(message: string, data?: any, level: LogLevel = 'info') {
    if (!this.isProd) {
      const colors = {
        info: '#2563eb',
        warn: '#d97706',
        error: '#dc2626',
      };
      console.log(
        `%c[${level.toUpperCase()}] %c${message}`,
        `color: ${colors[level]}; font-weight: bold;`,
        'color: inherit;',
        data || ''
      );
    } else {
      // Em produção, poderíamos enviar o payload para um serviço externo
      // const logPayload = { ... };
      if (level === 'error') {
        // Exemplo: Sentry.captureException(data);
      }
    }
  }

  error(message: string, error?: any) {
    this.log(message, error, 'error');
  }

  warn(message: string, data?: any) {
    this.log(message, data, 'warn');
  }
}

export const logger = new Logger();
