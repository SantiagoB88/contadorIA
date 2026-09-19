import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';

const push = vi.fn();
const login = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ login }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockReset();
    login.mockReset();
  });

  it('shows validation errors instead of submitting when the form is empty', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in with valid credentials and redirects to the dashboard', async () => {
    login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'demo@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'password123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({ email: 'demo@example.com', password: 'password123' });
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the API error message when login fails', async () => {
    const { ApiRequestError } = await import('@/lib/api');
    login.mockRejectedValue(new ApiRequestError(401, null, 'Invalid email or password'));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'demo@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
  });
});
