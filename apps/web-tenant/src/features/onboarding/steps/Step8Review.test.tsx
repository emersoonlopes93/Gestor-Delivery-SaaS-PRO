// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiResponse, OnboardingCompletionCheck } from '@gestor/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api-client';
import { Step8Review } from './Step8Review';

vi.mock('../../../hooks/useReadinessScore', () => ({
  useReadinessScore: () => ({ data: null, loading: false }),
}));

const validation = {
  hasStoreName: true,
  hasAddress: true,
  hasOperatingHours: true,
  hasPaymentMethod: true,
  hasOperationalModes: true,
  hasProduct: true,
};

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Step8Review authoritative completion check', () => {
  it('fails closed on check errors and enables activation only after a successful retry', async () => {
    const check: OnboardingCompletionCheck = {
      canComplete: true,
      missingRequirements: [],
      warnings: [],
      nextRecommendedStep: null,
      completedAt: null,
    };
    const get = vi.spyOn(api, 'get')
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(success(check));
    const onActivate = vi.fn().mockResolvedValue(undefined);
    render(<Step8Review validation={validation} onActivate={onActivate} onPrev={vi.fn()} goToStep={vi.fn()} />);

    expect((await screen.findByRole('alert')).textContent).toContain('Nao foi possivel confirmar');
    expect((screen.getByRole('button', { name: /Complete os itens obrigatorios/i }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Ativar Loja!' }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Ativar Loja!' }));

    expect(get).toHaveBeenCalledTimes(2);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('maps backend missing requirements to the corrective onboarding step', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(success<OnboardingCompletionCheck>({
      canComplete: false,
      missingRequirements: ['catalog'],
      warnings: [],
      nextRecommendedStep: 'catalog',
      blockingMessage: 'Cadastre pelo menos um produto ativo.',
      completedAt: null,
    }));
    const goToStep = vi.fn();
    render(<Step8Review validation={validation} onActivate={vi.fn()} onPrev={vi.fn()} goToStep={goToStep} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Pelo menos 1 produto ativo' }));
    expect(goToStep).toHaveBeenCalledWith(5);
    expect((screen.getByRole('button', { name: /Complete os itens obrigatorios/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ['products', 5, 'Produtos'],
    ['location', 1, 'Localizacao da loja'],
  ])('maps the backend recommended step %s independently from requirement codes', async (recommended, expectedStep, label) => {
    vi.spyOn(api, 'get').mockResolvedValue(success<OnboardingCompletionCheck>({
      canComplete: false,
      missingRequirements: [],
      warnings: [],
      nextRecommendedStep: recommended,
      completedAt: null,
    }));
    const goToStep = vi.fn();
    render(<Step8Review validation={validation} onActivate={vi.fn()} onPrev={vi.fn()} goToStep={goToStep} />);

    await userEvent.click(await screen.findByRole('button', { name: `Ir para ${label}` }));
    expect(goToStep).toHaveBeenCalledWith(expectedStep);
  });

  it('renders an honest non-navigable fallback for an unknown recommended step', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(success<OnboardingCompletionCheck>({
      canComplete: false,
      missingRequirements: [],
      warnings: [],
      nextRecommendedStep: 'future_step',
      completedAt: null,
    }));
    render(<Step8Review validation={validation} onActivate={vi.fn()} onPrev={vi.fn()} goToStep={vi.fn()} />);

    expect(await screen.findByText('Proximo passo recomendado: future_step')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /future_step/i })).toBeNull();
  });
});
