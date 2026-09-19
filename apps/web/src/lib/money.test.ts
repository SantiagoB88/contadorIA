import { describe, expect, it } from 'vitest';
import { formatMoney, minorUnitsToPesos, pesosToMinorUnits } from './money';

describe('formatMoney', () => {
  it('formats centavos as ARS currency', () => {
    expect(formatMoney(60500, 'ARS')).toContain('605');
  });

  it('accepts a string amount (as the API sends it)', () => {
    expect(formatMoney('121000', 'ARS')).toContain('1.210');
  });

  it('accepts a bigint amount', () => {
    expect(formatMoney(100_00n, 'ARS')).toContain('100');
  });
});

describe('pesosToMinorUnits / minorUnitsToPesos', () => {
  it('round-trips a decimal peso amount to centavos and back', () => {
    expect(pesosToMinorUnits('150.50')).toBe(15050);
    expect(minorUnitsToPesos(15050)).toBe(150.5);
  });

  it('rounds to the nearest centavo instead of truncating', () => {
    expect(pesosToMinorUnits('10.005')).toBe(1001); // 10.005 * 100 = 1000.5 -> rounds up
  });

  it('treats invalid input as zero instead of throwing', () => {
    expect(pesosToMinorUnits('not-a-number')).toBe(0);
  });
});
