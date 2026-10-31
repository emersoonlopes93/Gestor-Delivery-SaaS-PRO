// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ApiResponse, TenantUserSession } from '@gestor/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { OnboardingWizard } from './OnboardingWizard';
import { getOnboardingStorageKey } from './useOnboardingState';

vi.mock('./steps/Step1Identity', () => ({ Step1Identity: () => <div>Identidade segura</div> }));
vi.mock('./steps/Step2Location', () => ({ Step2Location: () => <div>Localizacao segura</div> }));
vi.mock('./steps/Step3Delivery', () => ({ Step3Delivery: () => <div>Entrega segura</div> }));
vi.mock('./steps/Step3Hours', () => ({ Step3Hours: () => <div>Horarios seguros</div> }));
vi.mock('./steps/Step4Payments', () => ({ Step4Payments: () => <div>Pagamentos seguros</div> }));
vi.mock('./steps/Step5Product', () => ({ Step5Product: () => <div>Produtos seguros</div> }));
vi.mock('./steps/Step6Rules', () => ({ Step6Rules: () => <div>Regras seguras</div> }));
vi.mock('./steps/Step7Storefront', () => ({ Step7Storefront: () => <div>Vitrine segura</div> }));
vi.mock('./steps/Step8Ifood', () => ({ Step8Ifood: () => <div>iFood seguro</div> }));
vi.mock('./steps/Step8Review', () => ({ Step8Review: () => <div>Revisao segura</div> }));

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

const user: TenantUserSession = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  email: 'owner@example.test',
  name: 'Owner',
  roles: ['owner'],
  permissions: [],
  onboardingCompletedAt: null,
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('accessToken', 'test-token');
  useAuthStore.setState({ user, isAuthenticated: true, isLoading: false });
  vi.spyOn(api, 'get').mockImplementation(async <T,>(endpoint: string): Promise<ApiResponse<T>> => {
    if (endpoint === '/tenant/onboarding') return success({}) as ApiResponse<T>;
    if (endpoint === '/tenant/me') return success({ name: '', settings: {} }) as ApiResponse<T>;
    if (endpoint === '/tenant/operating-hours' || endpoint === '/catalog/products') return success([]) as ApiResponse<T>;
    if (endpoint === '/delivery/coverage') return success(null) as ApiResponse<T>;
    throw new Error(`Unexpected onboarding request: ${endpoint}`);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('OnboardingWizard persisted presentation state', () => {
  it('renders safely when storage contains out-of-range and malformed navigation values', async () => {
    localStorage.setItem(getOnboardingStorageKey(user.tenantId, user.userId), JSON.stringify({
      version: 2,
      currentStep: 999,
      visitedSteps: [-1, 1.5, 999],
      ifoodChoice: 'corrupted',
    }));

    render(<MemoryRouter><OnboardingWizard /></MemoryRouter>);

    expect(await screen.findByText('Identidade segura')).toBeTruthy();
    expect(screen.getByText('Passo 1 de 10')).toBeTruthy();
  });

  it('resumes a valid persisted presentation step after authoritative backend reconciliation', async () => {
    localStorage.setItem(getOnboardingStorageKey(user.tenantId, user.userId), JSON.stringify({
      version: 2,
      currentStep: 8,
      visitedSteps: [0, 8],
      ifoodChoice: 'skipped',
    }));
    vi.mocked(api.get).mockImplementation(async <T,>(endpoint: string): Promise<ApiResponse<T>> => {
      if (endpoint === '/tenant/onboarding') {
        return success({
          stepBasicInfo: true,
          stepAddress: true,
          stepDelivery: true,
          stepOperatingHours: true,
          stepPayments: true,
          stepCatalog: true,
        }) as ApiResponse<T>;
      }
      if (endpoint === '/tenant/me') return success({ name: 'Loja', settings: {} }) as ApiResponse<T>;
      if (endpoint === '/tenant/operating-hours' || endpoint === '/catalog/products') return success([]) as ApiResponse<T>;
      if (endpoint === '/delivery/coverage') return success(null) as ApiResponse<T>;
      throw new Error(`Unexpected onboarding request: ${endpoint}`);
    });

    render(<MemoryRouter><OnboardingWizard /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('iFood seguro')).toBeTruthy());
    expect(screen.getByText('Passo 9 de 10')).toBeTruthy();
  });
});
