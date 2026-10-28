// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, TenantUserSession } from '@gestor/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { getOnboardingStorageKey, useOnboardingState } from './useOnboardingState';

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function session(tenantId: string, userId: string): TenantUserSession {
  return {
    tenantId,
    userId,
    email: `${userId}@example.test`,
    name: userId,
    roles: ['owner'],
    permissions: [],
    onboardingCompletedAt: null,
  };
}

function mockOnboardingRequests(status: Record<string, boolean>) {
  return vi.spyOn(api, 'get').mockImplementation(async <T,>(endpoint: string): Promise<ApiResponse<T>> => {
    if (endpoint === '/tenant/onboarding') return success(status) as ApiResponse<T>;
    if (endpoint === '/tenant/me') {
      return success({
        name: 'Loja teste',
        settings: {
          street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'Sao Paulo',
          state: 'SP', zipCode: '01000-000', lat: -23.5, lng: -46.6,
          paymentMethods: ['pix'], pickupEnabled: true,
        },
      }) as ApiResponse<T>;
    }
    if (endpoint === '/tenant/operating-hours') return success([{ isOpen: true }]) as ApiResponse<T>;
    if (endpoint === '/catalog/products') return success([{ id: 'product-1', isActive: true }]) as ApiResponse<T>;
    if (endpoint === '/delivery/coverage') return success(null) as ApiResponse<T>;
    if (endpoint === '/auth/tenant/me') return success(useAuthStore.getState().user) as ApiResponse<T>;
    throw new Error(`Unexpected onboarding request: ${endpoint}`);
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('accessToken', 'test-token');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('useOnboardingState persistence and server reconciliation', () => {
  it('scopes presentation state by tenant and user and discards the unsafe legacy key', async () => {
    localStorage.setItem('onboarding_state', JSON.stringify({ currentStep: 9 }));
    localStorage.setItem(getOnboardingStorageKey('tenant-a', 'user-a'), JSON.stringify({
      version: 2,
      currentStep: 8,
      visitedSteps: [0, 1, 8],
      ifoodChoice: 'skipped',
      validation: { hasStoreName: true },
    }));
    localStorage.setItem(getOnboardingStorageKey('tenant-b', 'user-b'), JSON.stringify({
      version: 2,
      currentStep: 7,
      visitedSteps: [0, 7],
    }));
    mockOnboardingRequests({
      stepBasicInfo: true,
      stepAddress: true,
      stepDelivery: true,
      stepOperatingHours: true,
      stepPayments: true,
      stepCatalog: true,
    });

    act(() => useAuthStore.setState({ user: session('tenant-a', 'user-a'), isAuthenticated: true, isLoading: false }));
    const first = renderHook(() => useOnboardingState());
    await waitFor(() => expect(first.result.current.isHydrating).toBe(false));
    expect(first.result.current.currentStep).toBe(8);
    expect(first.result.current.ifoodChoice).toBe('skipped');
    expect(localStorage.getItem('onboarding_state')).toBeNull();
    first.unmount();

    act(() => useAuthStore.setState({ user: session('tenant-b', 'user-b'), isAuthenticated: true, isLoading: false }));
    const second = renderHook(() => useOnboardingState());
    await waitFor(() => expect(second.result.current.isHydrating).toBe(false));
    expect(second.result.current.currentStep).toBe(7);
    expect(second.result.current.ifoodChoice).toBeNull();

    const persisted = JSON.parse(localStorage.getItem(getOnboardingStorageKey('tenant-a', 'user-a')) ?? '{}') as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('validation');
  });

  it('uses backend progress as authority instead of treating a locally visited step as completed', async () => {
    localStorage.setItem(getOnboardingStorageKey('tenant-a', 'user-a'), JSON.stringify({
      version: 2,
      currentStep: 8,
      visitedSteps: [0, 1, 2, 8],
    }));
    mockOnboardingRequests({ stepBasicInfo: true, stepAddress: true, stepDelivery: false });
    act(() => useAuthStore.setState({ user: session('tenant-a', 'user-a'), isAuthenticated: true, isLoading: false }));

    const { result } = renderHook(() => useOnboardingState());
    await waitFor(() => expect(result.current.isHydrating).toBe(false));

    expect(result.current.currentStep).toBe(2);
    expect(result.current.completedSteps).toEqual([0, 1]);
    expect(result.current.completedSteps).not.toContain(8);
  });

  it('returns the refreshed authoritative session after completion and never invents completedAt locally', async () => {
    const completedSession = { ...session('tenant-a', 'user-a'), onboardingCompletedAt: '2026-10-27T12:00:00.000Z' };
    const get = mockOnboardingRequests({});
    get.mockImplementation(async <T,>(endpoint: string): Promise<ApiResponse<T>> => {
      if (endpoint === '/auth/tenant/me') return success(completedSession) as ApiResponse<T>;
      if (endpoint === '/tenant/onboarding') return success({}) as ApiResponse<T>;
      if (endpoint === '/tenant/me') return success({ name: '', settings: {} }) as ApiResponse<T>;
      if (endpoint === '/tenant/operating-hours' || endpoint === '/catalog/products') return success([]) as ApiResponse<T>;
      if (endpoint === '/delivery/coverage') return success(null) as ApiResponse<T>;
      throw new Error(`Unexpected onboarding request: ${endpoint}`);
    });
    const post = vi.spyOn(api, 'post').mockResolvedValue(success({ completedAt: completedSession.onboardingCompletedAt }));
    act(() => useAuthStore.setState({ user: session('tenant-a', 'user-a'), isAuthenticated: true, isLoading: false }));
    const { result } = renderHook(() => useOnboardingState());
    await waitFor(() => expect(result.current.isHydrating).toBe(false));

    let authoritativeSession: TenantUserSession | undefined;
    await act(async () => {
      authoritativeSession = await result.current.completeOnboarding();
    });

    expect(post).toHaveBeenCalledWith('/tenant/onboarding-complete');
    expect(get).toHaveBeenCalledWith('/auth/tenant/me');
    expect(authoritativeSession?.onboardingCompletedAt).toBe(completedSession.onboardingCompletedAt);
    expect(useAuthStore.getState().user?.onboardingCompletedAt).toBeNull();
  });
});
