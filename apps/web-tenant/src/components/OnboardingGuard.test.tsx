// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { TenantUserSession } from '@gestor/types';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../stores/auth.store';
import { OnboardingGuard } from './OnboardingGuard';

function session(overrides: Partial<TenantUserSession> = {}): TenantUserSession {
  return {
    userId: 'user-a', tenantId: 'tenant-a', email: 'owner@example.test', name: 'Owner',
    roles: ['owner'], permissions: [], onboardingCompletedAt: null,
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={(
          <OnboardingGuard>
            <Outlet />
          </OnboardingGuard>
        )}>
          <Route path="/onboarding" element={<div>Onboarding destination</div>} />
          <Route path="/billing" element={<div>Billing destination</div>} />
          <Route path="/billing/contract" element={<div>Contract destination</div>} />
          <Route path="/dashboard" element={<div>Dashboard destination</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('OnboardingGuard commercial and onboarding routing', () => {
  it('keeps an incomplete eligible account in onboarding instead of looping through dashboard', async () => {
    useAuthStore.setState({ user: session({ commercialSignupState: 'eligible' }), isAuthenticated: true, isLoading: false });
    renderAt('/dashboard');
    expect(await screen.findByText('Onboarding destination')).toBeTruthy();
  });

  it('preserves contract and payment commercial guards', async () => {
    useAuthStore.setState({ user: session({ commercialSignupState: 'contract_required' }), isAuthenticated: true, isLoading: false });
    const first = renderAt('/onboarding');
    expect(await screen.findByText('Contract destination')).toBeTruthy();
    first.unmount();

    useAuthStore.setState({ user: session({ commercialSignupState: 'payment_pending' }), isAuthenticated: true, isLoading: false });
    renderAt('/onboarding');
    expect(await screen.findByText('Billing destination')).toBeTruthy();
  });
});
