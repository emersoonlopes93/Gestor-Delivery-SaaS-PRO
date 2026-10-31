import { describe, expect, it } from 'vitest';
import type { TenantUserSession } from '@gestor/types';
import { resolveCommercialGuardDestination, resolvePostLoginDestination } from './commercial-reentry';

function session(overrides: Partial<TenantUserSession> = {}): TenantUserSession {
  return {
    userId: 'user-1', tenantId: 'tenant-1', email: 'owner@example.test', name: 'Owner',
    roles: ['owner'], permissions: ['billing.write'], onboardingCompletedAt: null,
    ...overrides,
  };
}

describe('Commercial V1 reentry routing', () => {
  it('returns interrupted commercial signups to the contract after a normal login', () => {
    const user = session({ commercialSignupState: 'contract_required', commercialNextStep: '/billing/contract' });
    expect(resolvePostLoginDestination(user, null)).toBe('/billing/contract');
    expect(resolveCommercialGuardDestination(user, '/onboarding')).toBe('/billing/contract');
  });

  it('keeps pending-payment accounts in the truthful billing state', () => {
    const user = session({ commercialSignupState: 'payment_pending', commercialNextStep: '/billing' });
    expect(resolvePostLoginDestination(user, '/onboarding')).toBe('/billing');
    expect(resolveCommercialGuardDestination(user, '/dashboard')).toBe('/billing');
  });

  it('sends eligible commercial accounts to onboarding or the dashboard from the server result', () => {
    expect(resolvePostLoginDestination(session({ commercialSignupState: 'eligible', commercialNextStep: '/onboarding' }), null)).toBe('/onboarding');
    expect(resolvePostLoginDestination(session({ onboardingCompletedAt: '2026-10-27T10:00:00.000Z', commercialSignupState: 'eligible', commercialNextStep: '/dashboard' }), null)).toBe('/dashboard');
  });

  it('keeps legacy tenants on the existing navigation policy', () => {
    const user = session({ commercialSignupState: 'legacy' });
    expect(resolvePostLoginDestination(user, null)).toBe('/onboarding');
    expect(resolveCommercialGuardDestination(user, '/catalog/products')).toBeNull();
  });
});
