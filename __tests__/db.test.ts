import {
  validateRange,
  mergePeriods,
  clampPain,
  rangesOverlapOrTouch,
  planPeriodMerge,
  OverlappingPeriodError,
} from '../src/lib/db';

describe('validateRange', () => {
  it('melempar error bila start setelah end', () => {
    expect(() => validateRange('2026-11-10', '2026-11-08')).toThrow();
  });

  it('menerima start sama dengan end (haid 1 hari)', () => {
    expect(() => validateRange('2026-11-10', '2026-11-10')).not.toThrow();
  });

  it('menerima start sebelum end', () => {
    expect(() => validateRange('2026-11-08', '2026-11-10')).not.toThrow();
  });

  it('melempar error untuk format tanggal tidak valid', () => {
    expect(() => validateRange('10-11-2026', '2026-11-12')).toThrow();
    expect(() => validateRange('2026-11-08', 'bukan-tanggal')).toThrow();
  });
});

describe('rangesOverlapOrTouch', () => {
  const a = { start: '2026-10-01', end: '2026-10-05' };

  it('true untuk overlap sebagian', () => {
    expect(rangesOverlapOrTouch(a, { start: '2026-10-04', end: '2026-10-07' })).toBe(true);
  });

  it('true untuk containment (keduanya arah)', () => {
    expect(rangesOverlapOrTouch(a, { start: '2026-10-02', end: '2026-10-03' })).toBe(true);
    expect(rangesOverlapOrTouch(a, { start: '2026-09-30', end: '2026-10-07' })).toBe(true);
  });

  it('true untuk bersebelahan tepat 1 hari setelahnya', () => {
    expect(rangesOverlapOrTouch(a, { start: '2026-10-06', end: '2026-10-09' })).toBe(true);
  });

  it('true untuk bersebelahan tepat 1 hari sebelumnya', () => {
    expect(rangesOverlapOrTouch(a, { start: '2026-09-28', end: '2026-09-30' })).toBe(true);
  });

  it('false untuk rentang yang berjarak', () => {
    expect(rangesOverlapOrTouch(a, { start: '2026-10-07', end: '2026-10-09' })).toBe(false);
    expect(rangesOverlapOrTouch(a, { start: '2026-09-25', end: '2026-09-29' })).toBe(false);
  });
});

describe('mergePeriods', () => {
  it('overlap → merge menghasilkan {start,end} gabungan', () => {
    expect(
      mergePeriods([
        { start: '2026-10-01', end: '2026-10-05' },
        { start: '2026-10-04', end: '2026-10-07' },
      ])
    ).toEqual([{ start: '2026-10-01', end: '2026-10-07' }]);
  });

  it('periode bersebelahan (nempel) ikut digabung', () => {
    expect(
      mergePeriods([
        { start: '2026-10-01', end: '2026-10-05' },
        { start: '2026-10-06', end: '2026-10-10' },
      ])
    ).toEqual([{ start: '2026-10-01', end: '2026-10-10' }]);
  });

  it('tidak menggabung rentang yang berjarak 1+ hari', () => {
    expect(
      mergePeriods([
        { start: '2026-10-01', end: '2026-10-05' },
        { start: '2026-10-07', end: '2026-10-09' },
      ])
    ).toEqual([
      { start: '2026-10-01', end: '2026-10-05' },
      { start: '2026-10-07', end: '2026-10-09' },
    ]);
  });

  it('menggabung rantai rentang yang tidak berurutan & terurut hasilnya', () => {
    expect(
      mergePeriods([
        { start: '2026-10-10', end: '2026-10-12' },
        { start: '2026-10-01', end: '2026-10-05' },
        { start: '2026-10-04', end: '2026-10-11' },
      ])
    ).toEqual([{ start: '2026-10-01', end: '2026-10-12' }]);
  });

  it('menyerap rentang yang terkandung di dalam rentang lain', () => {
    expect(
      mergePeriods([
        { start: '2026-10-01', end: '2026-10-10' },
        { start: '2026-10-03', end: '2026-10-05' },
      ])
    ).toEqual([{ start: '2026-10-01', end: '2026-10-10' }]);
  });

  it('input campuran: hanya sebagian yang digabung', () => {
    expect(
      mergePeriods([
        { start: '2026-01-01', end: '2026-01-05' },
        { start: '2026-03-01', end: '2026-03-03' },
        { start: '2026-01-04', end: '2026-01-08' },
      ])
    ).toEqual([
      { start: '2026-01-01', end: '2026-01-08' },
      { start: '2026-03-01', end: '2026-03-03' },
    ]);
  });

  it('array kosong menghasilkan array kosong', () => {
    expect(mergePeriods([])).toEqual([]);
  });

  it('tidak memutasi input', () => {
    const input = [
      { start: '2026-10-04', end: '2026-10-07' },
      { start: '2026-10-01', end: '2026-10-05' },
    ];
    const snapshot = JSON.parse(JSON.stringify(input)) as typeof input;
    mergePeriods(input);
    expect(input).toEqual(snapshot);
  });
});

describe('clampPain', () => {
  it('clampPain(13) === 10', () => {
    expect(clampPain(13)).toBe(10);
  });

  it('clampPain(-3) === 0', () => {
    expect(clampPain(-3)).toBe(0);
  });

  it('clampPain(0) === 0 dan clampPain(10) === 10', () => {
    expect(clampPain(0)).toBe(0);
    expect(clampPain(10)).toBe(10);
  });

  it('membiarkan nilai di dalam rentang apa adanya', () => {
    expect(clampPain(7)).toBe(7);
  });

  it('membulatkan nilai pecahan ke integer', () => {
    expect(clampPain(6.6)).toBe(7);
  });

  it('input non-finite menjadi 0', () => {
    expect(clampPain(Number.NaN)).toBe(0);
    expect(clampPain(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('planPeriodMerge', () => {
  it('tanpa periode existing → insert dengan rentang baru', () => {
    expect(planPeriodMerge([], '2026-10-01', '2026-10-05')).toEqual({
      action: 'insert',
      start: '2026-10-01',
      end: '2026-10-05',
    });
  });

  it('satu periode overlap → merge, id existing bertahan, union gabungan', () => {
    expect(
      planPeriodMerge(
        [{ id: 7, start: '2026-10-01', end: '2026-10-05' }],
        '2026-10-04',
        '2026-10-07'
      )
    ).toEqual({
      action: 'merge',
      keepId: 7,
      union: { start: '2026-10-01', end: '2026-10-07' },
      deleteIds: [],
    });
  });

  it('periode bersebelahan → merge juga (bukan insert)', () => {
    expect(
      planPeriodMerge(
        [{ id: 4, start: '2026-10-01', end: '2026-10-05' }],
        '2026-10-06',
        '2026-10-08'
      )
    ).toEqual({
      action: 'merge',
      keepId: 4,
      union: { start: '2026-10-01', end: '2026-10-08' },
      deleteIds: [],
    });
  });

  it('beberapa periode → keepId = start paling awal (tie-break id terkecil)', () => {
    const plan = planPeriodMerge(
      [
        { id: 9, start: '2026-10-03', end: '2026-10-05' },
        { id: 2, start: '2026-09-28', end: '2026-10-02' },
      ],
      '2026-10-01',
      '2026-10-07'
    );
    expect(plan).toEqual({
      action: 'merge',
      keepId: 2,
      union: { start: '2026-09-28', end: '2026-10-07' },
      deleteIds: [9],
    });
  });

  it('input tidak terurut → tetap keepId paling awal', () => {
    const plan = planPeriodMerge(
      [
        { id: 2, start: '2026-09-28', end: '2026-10-02' },
        { id: 9, start: '2026-10-03', end: '2026-10-05' },
      ],
      '2026-10-01',
      '2026-10-07'
    );
    expect(plan).toEqual({
      action: 'merge',
      keepId: 2,
      union: { start: '2026-09-28', end: '2026-10-07' },
      deleteIds: [9],
    });
  });

  it('keepId tie-break by id terkecil saat start sama', () => {
    const plan = planPeriodMerge(
      [
        { id: 8, start: '2026-10-01', end: '2026-10-02' },
        { id: 3, start: '2026-10-01', end: '2026-10-03' },
      ],
      '2026-10-02',
      '2026-10-04'
    );
    expect(plan).toMatchObject({ action: 'merge', keepId: 3, deleteIds: [8] });
  });

  it('melempar error untuk rentang terbalik', () => {
    expect(() =>
      planPeriodMerge([], '2026-10-05', '2026-10-01')
    ).toThrow();
  });
});

describe('OverlappingPeriodError', () => {
  it('adalah Error dengan name OverlappingPeriodError', () => {
    const err = new OverlappingPeriodError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OverlappingPeriodError');
  });
});
