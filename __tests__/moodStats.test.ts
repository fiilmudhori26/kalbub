import { bucketOf, summarizeMood } from '../src/lib/moodStats';
import type { DailyLog, Period } from '../src/lib/db';

const periods: Period[] = [
  { id: 1, start: '2026-10-01', end: '2026-10-05' },
  { id: 2, start: '2026-11-01', end: '2026-11-05' },
];

function log(date: string, mood: string | null, pain: number): DailyLog {
  return { date, flow: 'none', symptoms: [], mood, pain, note: '' };
}

describe('bucketOf', () => {
  it('tanggal di dalam rentang periode → haid', () => {
    expect(bucketOf('2026-10-01', periods)).toBe('haid');
    expect(bucketOf('2026-10-03', periods)).toBe('haid');
    expect(bucketOf('2026-10-05', periods)).toBe('haid');
    expect(bucketOf('2026-11-02', periods)).toBe('haid');
  });

  it('tanggal 1–7 hari sebelum periode mulai → sebelum', () => {
    expect(bucketOf('2026-09-24', periods)).toBe('sebelum'); // H-7
    expect(bucketOf('2026-09-30', periods)).toBe('sebelum'); // H-1
    expect(bucketOf('2026-10-25', periods)).toBe('sebelum'); // H-7 ke 01 Nov
    expect(bucketOf('2026-10-31', periods)).toBe('sebelum'); // H-1 ke 01 Nov
  });

  it('tanggal tepat 7 hari sebelum → sebelum; 8 hari sebelum → sisanya', () => {
    expect(bucketOf('2026-09-24', periods)).toBe('sebelum');
    expect(bucketOf('2026-09-23', periods)).toBe('sisanya');
  });

  it('tanggal jauh sebelum periode → sisanya', () => {
    expect(bucketOf('2026-09-01', periods)).toBe('sisanya');
    expect(bucketOf('2026-08-20', periods)).toBe('sisanya');
  });

  it('tanggal setelah semua periode → sisanya', () => {
    expect(bucketOf('2026-11-06', periods)).toBe('sisanya');
    expect(bucketOf('2026-12-31', periods)).toBe('sisanya');
  });

  it('tanpa periode → selalu sisanya', () => {
    expect(bucketOf('2026-10-03', [])).toBe('sisanya');
  });

  it('tanggal di dalam periode mengalahkan aturan sebelum', () => {
    // 2026-10-05 adalah akhir periode pertama; tidak ambigu.
    expect(bucketOf('2026-10-05', periods)).toBe('haid');
  });
});

describe('summarizeMood', () => {
  it('mengembalikan tiga bucket walau tanpa log', () => {
    const result = summarizeMood([], periods);
    expect(Object.keys(result).sort()).toEqual(['haid', 'sebelum', 'sisanya']);
    expect(result.haid.count).toBe(0);
    expect(result.haid.topMood).toBeNull();
    expect(result.haid.avgPain).toBeNull();
    expect(result.haid.moodCounts).toEqual({});
  });

  it('menghitung mood, top mood, rata-rata nyeri, dan jumlah per bucket', () => {
    const logs = [
      log('2026-10-02', 'Senang', 2), // haid
      log('2026-10-03', 'Senang', 4), // haid
      log('2026-10-04', 'Sedih', 6), // haid
      log('2026-10-29', 'Tenang', 1), // sebelum (H-3 ke 01 Nov)
      log('2026-10-30', 'Sedih', 3), // sebelum
      log('2026-10-12', 'Mood swing', 8), // sisanya
    ];
    const result = summarizeMood(logs, periods);

    expect(result.haid.count).toBe(3);
    expect(result.haid.moodCounts).toEqual({ Senang: 2, Sedih: 1 });
    expect(result.haid.topMood).toBe('Senang');
    expect(result.haid.avgPain).toBe(4); // (2+4+6)/3

    expect(result.sebelum.count).toBe(2);
    expect(result.sebelum.topMood).toBe('Sedih'); // tie-break: Sedih < Tenang secara alfabet? tidak — hitung: Sedih 1, Tenang 1 → tie → alfabet 'Sedih'
    expect(result.sebelum.avgPain).toBe(2);

    expect(result.sisanya.count).toBe(1);
    expect(result.sisanya.topMood).toBe('Mood swing');
    expect(result.sisanya.avgPain).toBe(8);
  });

  it('log tanpa mood diabaikan untuk mood, tapi tetap dihitung untuk nyeri & jumlah', () => {
    const logs = [
      log('2026-10-02', null, 2),
      log('2026-10-03', null, 6),
      log('2026-10-04', 'Senang', 4),
    ];
    const result = summarizeMood(logs, periods);
    expect(result.haid.count).toBe(3);
    expect(result.haid.moodCounts).toEqual({ Senang: 1 });
    expect(result.haid.topMood).toBe('Senang');
    expect(result.haid.avgPain).toBe(4);
  });

  it('rata-rata nyeri dibulatkan 1 desimal', () => {
    const logs = [
      log('2026-10-02', 'Senang', 1),
      log('2026-10-03', 'Senang', 2),
      log('2026-10-04', 'Senang', 2),
    ];
    const result = summarizeMood(logs, periods);
    expect(result.haid.avgPain).toBe(1.7); // 5/3 = 1.666… → 1.7
  });

  it('topMood tie-break deterministik (jumlah terbanyak, lalu alfabet)', () => {
    const logs = [
      log('2026-10-02', 'Tenang', 0),
      log('2026-10-03', 'Senang', 0),
      log('2026-10-04', 'Mudah marah', 0),
    ];
    const result = summarizeMood(logs, periods);
    // Semua 1× → alfabet: Mudah marah < Senang < Tenang
    expect(result.haid.topMood).toBe('Mudah marah');
  });

  it('nyeri di-clamp defensif ke 0–10', () => {
    const logs = [
      log('2026-10-02', 'Senang', 10),
      { ...log('2026-10-03', 'Senang', 0), pain: 99 },
    ];
    const result = summarizeMood(logs, periods);
    expect(result.haid.avgPain).toBe(10); // (10 + 10)/2 setelah clamp
  });
});
