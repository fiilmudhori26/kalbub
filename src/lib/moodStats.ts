/**
 * Mood/nyeri stats Kalbub — fungsi murni, offline-first.
 *
 * Mengelompokkan daily log berdasarkan hubungannya dengan periode tercatat:
 * - 'haid'    : tanggal log berada di dalam rentang periode (inklusif)
 * - 'sebelum' : tanggal log berada dalam 7 hari SEBELUM sebuah periode mulai
 *               (period.start ∈ (log, log + 7 hari])
 * - 'sisanya' : selain itu
 *
 * Semua tanggal adalah string lokal `YYYY-MM-DD` dan dibandingkan
 * leksikografis / lewat helper di `dates.ts` — jangan pernah `new Date(str)`.
 */

import { addDaysISO } from './dates';
import type { DailyLog, Period } from './db';

export type MoodBucket = 'haid' | 'sebelum' | 'sisanya';

export interface MoodBucketSummary {
  /** Jumlah log di bucket ini (dengan atau tanpa mood). */
  count: number;
  /** Frekuensi tiap mood (log tanpa mood tidak dihitung). */
  moodCounts: Record<string, number>;
  /** Mood terbanyak; tie-break alfabet; null bila belum ada mood tercatat. */
  topMood: string | null;
  /** Rata-rata nyeri 0–10, dibulatkan 1 desimal; null bila count = 0. */
  avgPain: number | null;
}

export type MoodSummary = Record<MoodBucket, MoodBucketSummary>;

/** Bucket relevansi sebuah tanggal terhadap daftar periode. */
export function bucketOf(date: string, periods: Period[]): MoodBucket {
  // 'haid': tanggal di dalam rentang (inklusif) periode mana pun.
  for (const period of periods) {
    if (date >= period.start && date <= period.end) {
      return 'haid';
    }
  }
  // 'sebelum': ada periode yang mulai dalam (date, date + 7 hari].
  const limit = addDaysISO(date, 7);
  for (const period of periods) {
    if (period.start > date && period.start <= limit) {
      return 'sebelum';
    }
  }
  return 'sisanya';
}

function clampPainValue(pain: number): number {
  if (!Number.isFinite(pain)) {
    return 0;
  }
  return Math.min(10, Math.max(0, pain));
}

function emptySummary(): MoodBucketSummary {
  return { count: 0, moodCounts: {}, topMood: null, avgPain: null };
}

/**
 * Rekap mood & nyeri per bucket. Input tidak dimutasi.
 * `avgPain` dibulatkan ke 1 desimal; `topMood` tie-break alfabet agar
 * deterministik.
 */
export function summarizeMood(logs: DailyLog[], periods: Period[]): MoodSummary {
  const acc: Record<
    MoodBucket,
    { count: number; painSum: number; moodCounts: Map<string, number> }
  > = {
    haid: { count: 0, painSum: 0, moodCounts: new Map() },
    sebelum: { count: 0, painSum: 0, moodCounts: new Map() },
    sisanya: { count: 0, painSum: 0, moodCounts: new Map() },
  };

  for (const log of logs) {
    // Tanggal rusak tidak boleh menggagalkan rekap — lewati diam-diam.
    let bucket: MoodBucket;
    try {
      bucket = bucketOf(log.date, periods);
    } catch {
      continue;
    }
    const slot = acc[bucket];
    slot.count += 1;
    slot.painSum += clampPainValue(log.pain);
    if (typeof log.mood === 'string' && log.mood.length > 0) {
      slot.moodCounts.set(log.mood, (slot.moodCounts.get(log.mood) ?? 0) + 1);
    }
  }

  const summarize = (bucket: MoodBucket): MoodBucketSummary => {
    const slot = acc[bucket];
    if (slot.count === 0) {
      return emptySummary();
    }
    const moodCounts: Record<string, number> = {};
    let topMood: string | null = null;
    for (const [mood, times] of slot.moodCounts) {
      moodCounts[mood] = times;
      if (
        topMood === null ||
        times > (slot.moodCounts.get(topMood) as number) ||
        (times === slot.moodCounts.get(topMood) && mood < topMood)
      ) {
        topMood = mood;
      }
    }
    const avgPain = Math.round((slot.painSum / slot.count) * 10) / 10;
    return { count: slot.count, moodCounts, topMood, avgPain };
  };

  return {
    haid: summarize('haid'),
    sebelum: summarize('sebelum'),
    sisanya: summarize('sisanya'),
  };
}
