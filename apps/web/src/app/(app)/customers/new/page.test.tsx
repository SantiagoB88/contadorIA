import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewCustomerPage from './page';

const push = vi.fn();
const mutateAsync = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/hooks/use-customers', () => ({
  useCreateCustomer: () => ({ mutateAsync }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('NewCustomerPage', () => {
  beforeEach(() => {
    push.mockReset();
    mutateAsync.mockReset();
  });

  it('creates a customer with the entered fields and redirects to its detail page', async () => {
    mutateAsync.mockResolvedValue({ id: 'cus-1' });
    const user = userEvent.setup();
    render(<NewCustomerPage />);

    await user.type(screen.getByLabelText(/^nombre/i), 'Cliente Demo SRL');
    await user.type(screen.getByLabelText(/número de documento/i), '20-12345678-3');
    await user.click(screen.getByRole('button', { name: /crear cliente/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Cliente Demo SRL', documentNumber: '20-12345678-3' }),
      );
    });
    expect(push).toHaveBeenCalledWith('/customers/cus-1');
  });

  it('requires a name before submitting', async () => {
    const user = userEvent.setup();
    render(<NewCustomerPage />);

    await user.type(screen.getByLabelText(/número de documento/i), '20-12345678-3');
    await user.click(screen.getByRole('button', { name: /crear cliente/i }));

    expect(await screen.findByText(/required|too_small|string must contain/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
