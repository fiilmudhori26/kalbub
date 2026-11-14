import type { Period } from '../src/lib/db';
import {
  computeStats,
  predictNext,
  lateStatus,
} from '../src/lib/predictions';
import { diffDaysISO } from '../src/lib/dates';

let nextId = 1;
function period(start: string, end: string): Period {
  return { id: nextId++, start, end };
}

beforeEach(() => {
  nextId = 1;
});

describe('computeStats', () => {
  it('tanpa data → fallback 28/5, tanpa NaN', () => {
    expect(computeStats([])).toEqual({
      avgCycleLength: 28,
      avgPeriodLength: 5,
      cycleLengths: [],
      cyclesLogged: 0,
    });
  });

  it('fallback bisa dikustomisasi', () => {
    const stats = computeStats([], 30, 6);
    expect(stats.avgCycleLength).toBe(30);
    expect(stats.avgPeriodLength).toBe(6);
    expect(stats.cyclesLogged).toBe(0);
  });

  it('dua siklus 27 & 29 hari → avg 28', () => {
    const stats = computeStats([
      period('2026-08-01', '2026-08-05'),
      period('2026-08-28', '2026-09-01'),
      period('2026-09-26', '2026-09-30'),
    ]);
    expect(stats.cycleLengths).toEqual([27, 29]);
    expect(stats.avgCycleLength).toBe(28);
    expect(stats.cyclesLogged).toBe(2);
  });

  it('rata-rata durasi haid dari (end − start + 1), inklusif', () => {
    const stats = computeStats([
      period('2026-08-01', '2026-08-05'), // 5 hari
      period('2026-08-28', '2026-09-02'), // 6 hari
    ]);
    expect(stats.avgPeriodLength).toBe(5.5);
  });

  it('satu periode → belum ada siklus lengkap, rata-rata fallback', () => {
    const stats = computeStats([period('2026-10-01', '2026-10-05')]);
    expect(stats.cycleLengths).toEqual([]);
    expect(stats.cyclesLogged).toBe(0);
    expect(stats.avgCycleLength).toBe(28);
    expect(stats.avgPeriodLength).toBe(5);
  });

  it('input tidak terurut tetap dihitung benar', () => {
    const stats = computeStats([
      period('2026-09-26', '2026-09-30'),
      period('2026-08-01', '2026-08-05'),
      period('2026-08-28', '2026-09-01'),
    ]);
    expect(stats.cycleLengths).toEqual([27, 29]);
    expect(stats.avgCycleLength).toBe(28);
  });
});

describe('predictNext', () => {
  it('kosong + tanggal onboarding → prediksi = lastPeriodStart + 28', () => {
    const pred = predictNext([], '2026-10-05', {
      lastPeriodStart: '2026-10-01',
    });
    expect(pred.predictedStart).toBe('2026-10-29');
    expect(pred.daysUntil).toBe(diffDaysISO('2026-10-05', '2026-10-29'));
    expect(pred.confidence).toBe('rendah');
  });

  it('kosong tanpa onboarding/anchor → berlabuh ke today + fallback', () => {
    const pred = predictNext([], '2026-10-05', {});
    expect(pred.predictedStart).toBe('2026-11-02'); // 2026-10-05 + 28
    expect(pred.confidence).toBe('rendah');
  });

  it('tanpa data: avgCycleLength/avgPeriodLength dari pengaturan dipakai', () => {
    const pred = predictNext([], '2026-10-05', {
      lastPeriodStart: '2026-10-01',
      avgCycleLength: 30,
      avgPeriodLength: 6,
    });
    expect(pred.predictedStart).toBe('2026-10-31');
    expect(pred.predictedEnd).toBe('2026-11-05');
  });

  it('dua siklus 27 & 29 → avg 28, prediksi anchor ke haid terakhir', () => {
    const pred = predictNext(
      [
        period('2026-08-01', '2026-08-05'),
        period('2026-08-28', '2026-09-01'),
        period('2026-09-26', '2026-09-30'),
      ],
      '2026-10-20',
      {}
    );
    expect(pred.predictedStart).toBe('2026-10-24'); // 2026-09-26 + 28
    expect(pred.daysUntil).toBe(4);
    expect(pred.confidence).toBe('cukup'); // 2 siklus tercatat
  });

  it('predictedEnd = predictedStart + durasi haid − 1 (5 hari)', () => {
    const pred = predictNext(
      [period('2026-10-01', '2026-10-05')],
      '2026-10-10',
      {}
    );
    expect(pred.predictedEnd).toBe(
      // 2026-10-29 + 4
      '2026-11-02'
    );
    expect(pred.predictedStart).toBe('2026-10-29');
  });

  it('ovulasi = predictedStart − 14, fertileStart − 19, fertileEnd − 11', () => {
    const pred = predictNext(
      [
        period('2026-08-01', '2026-08-05'),
        period('2026-08-29', '2026-09-02'),
      ],
      '2026-09-10',
      {}
    );
    expect(pred.predictedStart).toBe('2026-09-26'); // 2026-08-29 + 28
    expect(pred.ovulation).toBe('2026-09-12');
    expect(pred.fertileStart).toBe('2026-09-07');
    expect(pred.fertileEnd).toBe('2026-09-15');
    expect(diffDaysISO(pred.ovulation, pred.predictedStart)).toBe(14);
    expect(diffDaysISO(pred.fertileStart, pred.predictedStart)).toBe(19);
    expect(diffDaysISO(pred.fertileEnd, pred.predictedStart)).toBe(11);
  });

  it('daysUntil negatif bila prediksi sudah lewat', () => {
    const pred = predictNext(
      [period('2026-08-01', '2026-08-05')],
      '2026-10-15',
      {}
    );
    expect(pred.daysUntil).toBeLessThan(0);
  });

  it('confidence: 0 siklus → rendah, 1–2 → cukup, ≥3 → tinggi', () => {
    const low = predictNext([period('2026-10-01', '2026-10-05')], '2026-10-10', {});
    expect(low.confidence).toBe('rendah'); // 0 siklus lengkap

    const cukup1 = predictNext(
      [
        period('2026-08-01', '2026-08-05'),
        period('2026-08-29', '2026-09-02'),
      ],
      '2026-09-10',
      {}
    );
    expect(cukup1.confidence).toBe('cukup'); // 1 siklus lengkap

    const cukup2 = predictNext(
      [
        period('2026-08-01', '2026-08-05'),
        period('2026-08-28', '2026-09-01'),
        period('2026-09-26', '2026-09-30'),
      ],
      '2026-10-10',
      {}
    );
    expect(cukup2.confidence).toBe('cukup'); // 2 siklus lengkap

    const high = predictNext(
      [
        period('2026-05-01', '2026-05-05'),
        period('2026-05-29', '2026-06-02'),
        period('2026-06-26', '2026-06-30'),
        period('2026-07-24', '2026-07-28'),
      ],
      '2026-08-10',
      {}
    );
    expect(high.confidence).toBe('tinggi'); // 3 siklus lengkap
    expect(high.predictedStart).toBe('2026-08-21');
  });
});

describe('lateStatus', () => {
  const twoCycles = () => [
    period('2026-08-01', '2026-08-05'),
    period('2026-08-29', '2026-09-02'),
  ]; // prediksi 2026-09-26

  it('hari ini SETELAH predictedStart tanpa periode baru → isLate: true, daysLate benar', () => {
    const late = lateStatus(twoCycles(), '2026-09-30', {});
    expect(late.isLate).toBe(true);
    expect(late.daysLate).toBe(4);
  });

  it('hari ini == predictedStart → belum terlambat', () => {
    const notLate = lateStatus(twoCycles(), '2026-09-26', {});
    expect(notLate.isLate).toBe(false);
    expect(notLate.daysLate).toBe(0);
  });

  it('hari ini sebelum predictedStart → isLate: false', () => {
    const notLate = lateStatus(twoCycles(), '2026-09-10', {});
    expect(notLate.isLate).toBe(false);
    expect(notLate.daysLate).toBe(0);
  });

  it('periode baru tercatat setelah predictedStart → tidak terlambat', () => {
    const periods = [
      ...twoCycles(),
      period('2026-10-01', '2026-10-05'),
    ];
    const late = lateStatus(periods, '2026-10-02', {});
    expect(late.isLate).toBe(false);
    expect(late.daysLate).toBe(0);
  });

  it('kosong + tanggal onboarding lewat → isLate: true, daysLate benar', () => {
    const late = lateStatus([], '2026-10-15', {
      lastPeriodStart: '2026-09-01', // prediksi 2026-09-29
    });
    expect(late.isLate).toBe(true);
    expect(late.daysLate).toBe(diffDaysISO('2026-09-29', '2026-10-15'));
    expect(late.daysLate).toBe(16);
  });
});
