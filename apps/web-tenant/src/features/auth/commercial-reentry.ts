import type { TenantUserSession } from '@gestor/types';

type AllowedReturnTo = '/billing' | '/billing/contract' | '/onboarding';

function isAllowedReturnTo(value: string | null): value is AllowedReturnTo {
  return value === '/billing' || value === '/billing/contract' || value === '/onboarding';
}

/** The server is authoritative for new Commercial V1 accounts after login. */
export function resolvePostLoginDestination(user: TenantUserSession, requestedReturnTo: string | null): string {
  if (user.commercialSignupState && user.commercialSignupState !== 'legacy') {
    return user.commercialNextStep ?? '/billing/contract';
  }

  if (isAllowedReturnTo(requestedReturnTo)) return requestedReturnTo;
  return user.onboardingCompletedAt ? '/dashboard' : '/onboarding';
}

/** Restricts only accounts explicitly created by Commercial V1, never legacy tenants. */
export function resolveCommercialGuardDestination(user: TenantUserSession, pathname: string): string | null {
  if (user.commercialSignupState === 'contract_required') {
    return pathname === '/billing/contract' ? null : '/billing/contract';
  }
  if (user.commercialSignupState === 'payment_pending') {
    return pathname === '/billing' ? null : '/billing';
  }
  return null;
}
