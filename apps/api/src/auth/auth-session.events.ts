export const AUTH_SESSION_REVOKED_EVENT = 'auth.session.revoked';

export interface AuthSessionRevokedEvent {
  sessionId: string;
}
