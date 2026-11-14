import {
  todayISO,
  parseISO,
  toISO,
  addDaysISO,
  diffDaysISO,
  formatID,
  weekdayID,
} from '../src/lib/dates';

describe('parseISO / toISO', () => {
  it('parses a valid ISO date string into components', () => {
    expect(parseISO('2026-11-18')).toEqual({ y: 2026, m: 11, d: 18 });
  });

  it('roundtrips toISO(parseISO(s)) === s', () => {
    const samples = ['2026-11-13', '2026-12-31', '2024-02-29', '2000-01-01', '1999-12-31'];
    for (const s of samples) {
      expect(toISO(parseISO(s).y, parseISO(s).m, parseISO(s).d)).toBe(s);
    }
  });

  it('toISO zero-pads month and day', () => {
    expect(toISO(2026, 1, 5)).toBe('2026-01-05');
  });

  it('rejects invalid input', () => {
    expect(() => parseISO('2026-13-01')).toThrow();
    expect(() => parseISO('2026-02-30')).toThrow();
    expect(() => parseISO('bukan-tanggal')).toThrow();
  });
});

describe('addDaysISO', () => {
  it('adds days within the same month', () => {
    expect(addDaysISO('2026-11-13', 5)).toBe('2026-11-18');
  });

  it('crosses month boundary', () => {
    expect(addDaysISO('2026-11-28', 5)).toBe('2026-12-03');
  });

  it('crosses year boundary forward', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('crosses month boundary backward', () => {
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('crosses year boundary backward', () => {
    expect(addDaysISO('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap day correctly', () => {
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysISO('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('adds zero days as identity', () => {
    expect(addDaysISO('2026-11-13', 0)).toBe('2026-11-13');
  });
});

describe('diffDaysISO', () => {
  it('computes b - a in days', () => {
    expect(diffDaysISO('2026-11-13', '2026-11-25')).toBe(12);
  });

  it('is negative when b is before a', () => {
    expect(diffDaysISO('2026-11-25', '2026-11-13')).toBe(-12);
  });

  it('is zero for identical dates', () => {
    expect(diffDaysISO('2026-11-13', '2026-11-13')).toBe(0);
  });

  it('counts across year boundary', () => {
    expect(diffDaysISO('2026-12-31', '2027-01-01')).toBe(1);
    expect(diffDaysISO('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('counts leap day', () => {
    expect(diffDaysISO('2024-02-28', '2024-03-01')).toBe(2);
  });
});

describe('todayISO', () => {
  it('returns a local YYYY-MM-DD string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatID', () => {
  it('formats as "D MMM YYYY" in Indonesian', () => {
    expect(formatID('2026-11-18')).toBe('18 Nov 2026');
    expect(formatID('2026-01-05')).toBe('5 Jan 2026');
  });
});

describe('weekdayID', () => {
  it('returns the Indonesian weekday name', () => {
    // 2026-11-14 adalah Sabtu
    expect(weekdayID('2026-11-14')).toBe('Sabtu');
    // 2026-11-18 adalah Rabu
    expect(weekdayID('2026-11-18')).toBe('Rabu');
    // 2026-11-15 adalah Minggu
    expect(weekdayID('2026-11-15')).toBe('Minggu');
  });
});
