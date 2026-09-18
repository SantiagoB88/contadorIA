import { canTransition, isTerminal } from './invoice-state-machine';

describe('invoice state machine', () => {
  it('allows DRAFT -> PENDING -> AUTHORIZED', () => {
    expect(canTransition('DRAFT', 'PENDING')).toBe(true);
    expect(canTransition('PENDING', 'AUTHORIZED')).toBe(true);
  });

  it('allows PENDING -> ERROR and ERROR -> PENDING (retry)', () => {
    expect(canTransition('PENDING', 'ERROR')).toBe(true);
    expect(canTransition('ERROR', 'PENDING')).toBe(true);
  });

  it('never allows AUTHORIZED back to DRAFT', () => {
    expect(canTransition('AUTHORIZED', 'DRAFT')).toBe(false);
    expect(isTerminal('AUTHORIZED')).toBe(true);
  });

  it('does not allow skipping straight from DRAFT to AUTHORIZED', () => {
    expect(canTransition('DRAFT', 'AUTHORIZED')).toBe(false);
  });

  it('does not allow authorizing a cancelled invoice', () => {
    expect(canTransition('CANCELLED', 'PENDING')).toBe(false);
    expect(isTerminal('CANCELLED')).toBe(true);
  });
});
