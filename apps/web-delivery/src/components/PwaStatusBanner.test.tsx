import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PwaStatusBanner } from './PwaStatusBanner';

describe('PwaStatusBanner', () => {
  it('offers the captured browser install prompt', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt');
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    render(<PwaStatusBanner />);
    act(() => window.dispatchEvent(event));

    fireEvent.click(await screen.findByRole('button', { name: 'Instalar' }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  });

  it('shows an honest offline status', async () => {
    render(<PwaStatusBanner />);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(await screen.findByText(/Sem conexão/)).toBeTruthy();
  });
});
