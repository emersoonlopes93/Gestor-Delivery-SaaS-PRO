/**
 * Logger estruturado para eventos de sessão de IA WhatsApp.
 * Fornece rastreamento consistente de ciclo de vida da sessão.
 */

export interface SessionLogContext {
  sessionId?: string;
  tenantId?: string;
  customerId?: string;
  customerPhone?: string;
  traceId?: string;
}

export class SessionLogger {
  private prefix = '[AI_SESSION]';

  /**
   * Log: Configuração de timeout carregada
   */
  configLoaded(ctx: SessionLogContext, sessionTimeoutMin: number): void {
    const tags = this.buildTags(ctx);
    console.log(
      `${this.prefix} config_loaded ${tags} sessionTimeoutMin=${sessionTimeoutMin}`,
    );
  }

  /**
   * Log: Sessão ativa encontrada
   */
  activeSessionFound(ctx: SessionLogContext): void {
    const tags = this.buildTags(ctx);
    console.log(`${this.prefix} active_session_found ${tags}`);
  }

  /**
   * Log: Sessão expirada
   */
  sessionExpired(ctx: SessionLogContext, reason: string = 'timeout'): void {
    const tags = this.buildTags(ctx);
    console.log(`${this.prefix} session_expired ${tags} reason="${reason}"`);
  }

  /**
   * Log: Contexto temporário limpado
   */
  temporaryContextCleared(ctx: SessionLogContext, fields: string[]): void {
    const tags = this.buildTags(ctx);
    console.log(
      `${this.prefix} temporary_context_cleared ${tags} fields=[${fields.join(', ')}]`,
    );
  }

  /**
   * Log: Nova sessão criada
   */
  newSessionCreated(ctx: SessionLogContext): void {
    const tags = this.buildTags(ctx);
    console.log(`${this.prefix} new_session_created ${tags}`);
  }

  /**
   * Log: Comando de saída recebido
   */
  exitCommandReceived(ctx: SessionLogContext, command: string): void {
    const tags = this.buildTags(ctx);
    console.log(
      `${this.prefix} exit_command_received ${tags} command="${command.trim()}"`,
    );
  }

  /**
   * Log: Sessão encerrada pelo cliente
   */
  sessionClosedByCustomer(ctx: SessionLogContext): void {
    const tags = this.buildTags(ctx);
    console.log(`${this.prefix} session_closed_by_customer ${tags}`);
  }

  /**
   * Log: Memória persistente preservada
   */
  persistentMemoryPreserved(ctx: SessionLogContext): void {
    const tags = this.buildTags(ctx);
    console.log(`${this.prefix} persistent_memory_preserved ${tags}`);
  }

  /**
   * Log: Expiração de handoff
   */
  handoffExpired(ctx: SessionLogContext): void {
    const tags = this.buildTags(ctx);
    console.log(`${this.prefix} handoff_expired ${tags}`);
  }

  /**
   * Log: Atualização de expiração
   */
  expirationUpdated(ctx: SessionLogContext, expiresAtMs: number): void {
    const tags = this.buildTags(ctx);
    const expiresAt = new Date(expiresAtMs).toISOString();
    console.log(
      `${this.prefix} expiration_updated ${tags} expiresAt="${expiresAt}"`,
    );
  }

  /**
   * Constrói string de tags para log
   */
  private buildTags(ctx: SessionLogContext): string {
    const parts: string[] = [];
    if (ctx.traceId) parts.push(`traceId=${ctx.traceId}`);
    if (ctx.tenantId) parts.push(`tenantId=${ctx.tenantId}`);
    if (ctx.customerId) parts.push(`customerId=${ctx.customerId}`);
    if (ctx.customerPhone) parts.push(`phone=${ctx.customerPhone}`);
    if (ctx.sessionId) parts.push(`sessionId=${ctx.sessionId}`);
    return parts.join(' ');
  }
}

// Singleton instance
export const sessionLogger = new SessionLogger();
