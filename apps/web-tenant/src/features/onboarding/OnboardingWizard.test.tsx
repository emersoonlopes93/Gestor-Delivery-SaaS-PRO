// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { OnboardingWizard } from './OnboardingWizard';

const onboardingMocks = vi.hoisted(() => ({
  currentStep: 0,
  completeOnboarding: vi.fn(),
}));

vi.mock('./useOnboardingState', () => ({
  useOnboardingState: () => ({
    currentStep: onboardingMocks.currentStep,
    visitedSteps: [0],
    completedSteps: [],
    isHydrating: false,
    autoSaveStatus: 'idle',
    validation: {
      hasStoreName: false,
      hasAddress: false,
      hasOperatingHours: false,
      hasPaymentMethod: false,
      hasOperationalModes: false,
      hasProduct: false,
    },
    ifoodChoice: null,
    totalSteps: 10,
    goPrev: vi.fn(),
    goToStep: vi.fn(),
    saveStep: vi.fn(),
    markValidation: vi.fn(),
    setIfoodChoice: vi.fn(),
    completeOnboarding: onboardingMocks.completeOnboarding,
  }),
}));

vi.mock('./steps/Step1Identity', () => ({ Step1Identity: () => <div>Identidade da loja</div> }));
vi.mock('./steps/Step8Review', () => ({
  Step8Review: ({ onActivate }: { onActivate: () => Promise<void> }) => (
    <button type="button" onClick={() => void onActivate()}>Concluir onboarding</button>
  ),
}));

beforeEach(() => {
  onboardingMocks.currentStep = 0;
  onboardingMocks.completeOnboarding.mockReset();
  localStorage.setItem('accessToken', 'access');
  localStorage.setItem('refreshToken', 'refresh');
  useAuthStore.setState({
    user: {
      userId: 'user-a', tenantId: 'tenant-a', email: 'owner@example.test', name: 'Owner',
      roles: ['owner'], permissions: [], onboardingCompletedAt: null,
    },
    isAuthenticated: true,
    isLoading: false,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('OnboardingWizard continue later flow', () => {
  it('explains the consequence and logs out explicitly instead of navigating into the onboarding guard', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ success: true, data: undefined });
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingWizard />} />
          <Route path="/login" element={<div>Login seguro</div>} />
          <Route path="/dashboard" element={<div>Painel PedeHub</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getAllByRole('button', { name: /Continuar depois/i })[0]);
    expect(screen.getByRole('dialog').textContent).toContain('etapas confirmadas no servidor permanecem salvas');

    await userEvent.click(screen.getByRole('button', { name: 'Sair e continuar depois' }));

    expect(await screen.findByText('Login seguro')).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/auth/tenant/logout');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('shows a truthful completion confirmation before entering the allowed destination', async () => {
    onboardingMocks.currentStep = 9;
    onboardingMocks.completeOnboarding.mockResolvedValue({
      userId: 'user-a', tenantId: 'tenant-a', email: 'owner@example.test', name: 'Owner',
      roles: ['owner'], permissions: [], onboardingCompletedAt: '2026-10-27T12:00:00.000Z',
      commercialSignupState: 'eligible', commercialNextStep: '/dashboard',
    });
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingWizard />} />
          <Route path="/dashboard" element={<div>Painel PedeHub</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Concluir onboarding' }));
    expect(await screen.findByText('Configuracao inicial concluida')).toBeTruthy();
    expect(screen.getByText(/publicar o cardapio e receber a primeira venda/i)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Acessar o PedeHub' }));
    expect(await screen.findByText('Painel PedeHub')).toBeTruthy();
    expect(useAuthStore.getState().user?.onboardingCompletedAt).toBe('2026-10-27T12:00:00.000Z');
  });
});
