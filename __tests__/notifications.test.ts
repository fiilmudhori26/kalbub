import { shouldSchedule } from '../src/lib/notifications';

describe('shouldSchedule', () => {
  it('predictedStart null → none', () => {
    expect(shouldSchedule(null, '2026-11-14')).toBe('none');
  });

  it('predictedStart string kosong → none', () => {
    expect(shouldSchedule('', '2026-11-14')).toBe('none');
  });

  it('predictedStart tidak valid → none', () => {
    expect(shouldSchedule('bukan-tanggal', '2026-11-14')).toBe('none');
    expect(shouldSchedule('2026-13-99', '2026-11-14')).toBe('none');
  });

  it('predictedStart di masa lalu tanpa konfirmasi → none', () => {
    expect(shouldSchedule('2026-11-13', '2026-11-14')).toBe('none');
    expect(shouldSchedule('2026-10-01', '2026-11-14')).toBe('none');
  });

  it('predictedStart hari ini → h-0 saja (H-2 sudah lewat)', () => {
    expect(shouldSchedule('2026-11-14', '2026-11-14')).toBe('h-0');
  });

  it('predictedStart besok → h-0 saja (H-2 kemarin, sudah lewat)', () => {
    expect(shouldSchedule('2026-11-15', '2026-11-14')).toBe('h-0');
  });

  it('predictedStart 2 hari lagi → both (H-2 hari ini, hari-H nanti)', () => {
    expect(shouldSchedule('2026-11-16', '2026-11-14')).toBe('both');
  });

  it('predictedStart jauh di masa depan → both', () => {
    expect(shouldSchedule('2026-12-12', '2026-11-14')).toBe('both');
  });
});
