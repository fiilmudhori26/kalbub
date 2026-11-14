/**
 * Mesin prediksi siklus haid Kalbub — fungsi murni, offline-first.
 *
 * Semua tanggal adalah string lokal `YYYY-MM-DD` dan dihitung HANYA lewat
 * helper di `dates.ts` (`addDaysISO`, `diffDaysISO`, `parseISO`). Modul ini
 * sengaja TIDAK memanggil `new Date()` / `todayISO()` di dalam fungsi —
 * hari ini selalu menjadi parameter supaya hasilnya deterministik & testable.
 *
 * Confidence prediksi diturunkan dari jumlah siklus lengkap yang tercatat
 * (jumlah jarak antar start haid, `cycleLengths.length`):
 *   0 siklus → 'rendah', 1–2 → 'cukup', ≥3 → 'tinggi'.
 */

import { addDaysISO, diffDaysISO, parseISO } from './dates';
import type { Period } from './db';

export type Confidence = 'rendah' | 'cukup' | 'tinggi';

/**
 * Setting yang relevan untuk prediksi. Semua opsional/nullable — pemanggil
 * boleh mengisi sebagian (mis. hanya `lastPeriodStart` dari onboarding)
 * atau `{}` bila belum ada pengaturan.
 *
 * PENTING: `avgCycleLength`/`avgPeriodLength` HANYA dipakai sebagai fallback
 * saat belum ada data siklus tercatat (lalu menggantikan default 28/5).
 * Setelah ada ≥1 periode tercatat, nilai rata-rata dihitung DARI DATA dan
 * nilai pengaturan ini diabaikan sepenuhnya.
 */
export interface PredictionSettings {
  /** Tanggal haid terakhir dari onboarding (`YYYY-MM-DD`). Dipakai sebagai acuan saat belum ada periode tercatat. String kosong/tidak valid diperlakukan seolah belum diisi. */
  lastPeriodStart?: string | null;
  /** Rata-rata panjang siklus (hari) dari pengaturan. Hanya dipakai saat belum ada data siklus tercatat; setelah ada data, nilai dari data yang dipakai. */
  avgCycleLength?: number | null;
  /** Rata-rata durasi haid (hari) dari pengaturan. Hanya dipakai saat belum ada data periode tercatat; setelah ada data, nilai dari data yang dipakai. */
  avgPeriodLength?: number | null;
}

export interface CycleStats {
  /** Rata-rata jarak antar start haid (hari). Fallback bila belum ada siklus lengkap tercatat. */
  avgCycleLength: number;
  /** Rata-rata durasi haid (`end − start + 1`, inklusif). Fallback bila belum ada periode tercatat. */
  avgPeriodLength: number;
  /** Jarak antar start haid berturut-turut, urut waktu — panjangnya = jumlah siklus lengkap. */
  cycleLengths: number[];
  /** Jumlah siklus lengkap tercatat (= `cycleLengths.length`). */
  cyclesLogged: number;
}

export interface Prediction {
  predictedStart: string;
  predictedEnd: string;
  fertileStart: string;
  fertileEnd: string;
  ovulation: string;
  /** Selisih hari dari hari ini ke predictedStart (negatif bila prediksi sudah lewat). */
  daysUntil: number;
  confidence: Confidence;
}

export interface LateStatus {
  isLate: boolean;
  /** Jumlah hari keterlambatan; 0 bila tidak terlambat. */
  daysLate: number;
}

/**
 * Default siklus (hari) bila tidak ada pengaturan & belum ada data siklus tercatat.
 * Hanya fallback no-data — bukan override atas data yang tercatat.
 */
export const DEFAULT_CYCLE_LENGTH = 28;
/**
 * Default durasi haid (hari) bila tidak ada pengaturan & belum ada data periode tercatat.
 * Hanya fallback no-data — bukan override atas data yang tercatat.
 */
export const DEFAULT_PERIOD_LENGTH = 5;

/** Salinan terurut by start (tie-break id) — input tidak dimutasi. */
function sortedByStart(periods: Period[]): Period[] {
  return [...periods].sort(
    (a, b) => a.start.localeCompare(b.start) || a.id - b.id
  );
}

/** Angka setting valid = finite & > 0; selain itu fallback dipakai. */
function positiveOr(
  value: number | null | undefined,
  fallback: number
): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/**
 * `lastPeriodStart` dari settings hanya dipakai bila string non-kosong DAN
 * valid menurut `parseISO`; selain itu undefined (seolah belum diisi).
 */
function validLastPeriodStart(
  value: string | null | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    parseISO(value);
    return value;
  } catch {
    return undefined;
  }
}

/**
 * Statistik siklus dari daftar periode. `fallbackCycle`/`fallbackPeriod`
 * HANYA dipakai saat belum ada data (atau belum ada siklus lengkap untuk
 * fallbackCycle); setelah ada data, rata-rata dihitung dari data. Pemanggil
 * dapat meneruskan nilai dari pengaturan, default 28/5.
 */
export function computeStats(
  periods: Period[],
  fallbackCycle: number = DEFAULT_CYCLE_LENGTH,
  fallbackPeriod: number = DEFAULT_PERIOD_LENGTH
): CycleStats {
  const sorted = sortedByStart(periods);

  const cycleLengths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    cycleLengths.push(diffDaysISO(sorted[i - 1].start, sorted[i].start));
  }

  const avgCycleLength =
    cycleLengths.length > 0
      ? cycleLengths.reduce((sum, n) => sum + n, 0) / cycleLengths.length
      : fallbackCycle;

  const avgPeriodLength =
    sorted.length > 0
      ? sorted.reduce((sum, p) => sum + diffDaysISO(p.start, p.end) + 1, 0) /
        sorted.length
      : fallbackPeriod;

  return {
    avgCycleLength,
    avgPeriodLength,
    cycleLengths,
    cyclesLogged: cycleLengths.length,
  };
}

function confidenceFor(cyclesLogged: number): Confidence {
  if (cyclesLogged >= 3) {
    return 'tinggi';
  }
  if (cyclesLogged >= 1) {
    return 'cukup';
  }
  return 'rendah';
}

/**
 * Prediksi siklus berikutnya.
 * - Acuan (anchor): start haid terakhir bila ada; selain itu `settings.lastPeriodStart`
 *   (onboarding; string kosong/tidak valid diabaikan); terakhir `todayISO` supaya
 *   prediksi tetap valid meski belum ada data sama sekali.
 * - `predictedStart` = anchor + rata-rata siklus (dibulatkan); `predictedEnd` = + durasi − 1.
 * - `ovulation` = predictedStart − 14, `fertileStart` = − 19, `fertileEnd` = − 11.
 */
export function predictNext(
  periods: Period[],
  todayISO: string,
  settings: PredictionSettings = {}
): Prediction {
  const sorted = sortedByStart(periods);
  const stats = computeStats(
    sorted,
    positiveOr(settings.avgCycleLength, DEFAULT_CYCLE_LENGTH),
    positiveOr(settings.avgPeriodLength, DEFAULT_PERIOD_LENGTH)
  );
  const avgCycle = Math.max(1, Math.round(stats.avgCycleLength));
  const avgPeriod = Math.max(1, Math.round(stats.avgPeriodLength));

  const anchor =
    sorted.length > 0
      ? sorted[sorted.length - 1].start
      : validLastPeriodStart(settings.lastPeriodStart) ?? todayISO;

  const predictedStart = addDaysISO(anchor, avgCycle);
  const predictedEnd = addDaysISO(predictedStart, avgPeriod - 1);
  const ovulation = addDaysISO(predictedStart, -14);
  const fertileStart = addDaysISO(predictedStart, -19);
  const fertileEnd = addDaysISO(predictedStart, -11);
  const daysUntil = diffDaysISO(todayISO, predictedStart);

  return {
    predictedStart,
    predictedEnd,
    fertileStart,
    fertileEnd,
    ovulation,
    daysUntil,
    confidence: confidenceFor(stats.cyclesLogged),
  };
}

/**
 * Status keterlambatan: hari ini SETELAH predictedStart. Karena prediksi
 * selalu berlabuh pada periode tercatat/onboarding, hari ini > predictedStart
 * berarti belum ada periode baru yang tercatat untuk siklus berjalan —
 * setiap periode baru yang dicatat akan menggeser predictedStart ke masa depan.
 */
export function lateStatus(
  periods: Period[],
  todayISO: string,
  settings: PredictionSettings = {}
): LateStatus {
  const prediction = predictNext(periods, todayISO, settings);
  const isLate = todayISO > prediction.predictedStart;
  return {
    isLate,
    daysLate: isLate ? diffDaysISO(prediction.predictedStart, todayISO) : 0,
  };
}
