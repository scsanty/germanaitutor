import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { AdminLogin } from './AdminLogin';

describe('AdminLogin', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows "Set admin password" when no password is set yet', async () => {
    (fetch as any).mockResolvedValueOnce({ json: async () => ({ passwordSet: false, authenticated: false }) });
    render(<AdminLogin />);
    await waitFor(() => expect(screen.getByText('Set admin password')).toBeInTheDocument());
  });

  it('shows an error on failed login', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ json: async () => ({ passwordSet: true, authenticated: false }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Incorrect password' }) });
    render(<AdminLogin />);
    await waitFor(() => expect(screen.getByText('Admin login')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Log in'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password'));
  });
});
