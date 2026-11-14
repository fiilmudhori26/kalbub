/**
 * Layar Statistik — pola siklus haid Kalbub.
 *
 * Isi:
 * - Jumlah siklus lengkap tercatat, rata-rata panjang siklus & durasi haid
 *   (rata-rata dari DATA bila sudah ada; fallback pengaturan/bawaan 28/5
 *   sebelum ada data — dibulatkan untuk display, tidak pernah NaN).
 * - Grafik bar sederhana (View biasa, tanpa library chart) untuk 6 siklus
 *   terakhir.
 * - Top 3 gejala paling sering dari daily_logs.
 * - Pola mood & nyeri: ringkasan per bucket (saat haid / sebelum haid /
 *   sisanya) — mood teratas, jumlah catatan, rata-rata nyeri 0–10.
 *   Muncul bila ada minimal 3 daily log.
 * - Empty state hangat bila belum ada periode tercatat.
 */

import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, spacing, type ThemeColors } from '../../src/theme';
import { useAppTheme } from '../../src/lib/useAppTheme';
import {
  getSetting,
  listDailyLogs,
  listPeriods,
  type DailyLog,
  type Period,
} from '../../src/lib/db';
import { diffDaysISO, parseISO } from '../../src/lib/dates';
import { computeStats } from '../../src/lib/predictions';
import { summarizeMood, type MoodBucket } from '../../src/lib/moodStats';
import { MOOD_OPTIONS } from '../../src/components/MoodPicker';

const CHART_DAYS_HEIGHT = 110;

function parsePositiveNumber(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Label ringkas "d/m" untuk sumbu grafik. */
function shortDateLabel(iso: string): string {
  try {
    const { d, m } = parseISO(iso);
    return `${d}/${m}`;
  } catch {
    return '';
  }
}

interface CycleBar {
  length: number;
  label: string;
}

/** Pasangkan panjang siklus dengan label tanggal start siklus berikutnya. */
function buildCycleBars(periods: Period[]): CycleBar[] {
  const sorted = [...periods].sort(
    (a, b) => a.start.localeCompare(b.start) || a.id - b.id
  );
  const bars: CycleBar[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i].start;
    bars.push({
      length: diffDaysISO(sorted[i - 1].start, cur),
      label: shortDateLabel(cur),
    });
  }
  return bars;
}

/** Emoji untuk label mood (MoodPicker); mood tak dikenal → tanpa emoji. */
function moodEmoji(mood: string): string {
  return MOOD_OPTIONS.find((option) => option.value === mood)?.emoji ?? '';
}

const BUCKET_ROWS: { key: MoodBucket; label: string }[] = [
  { key: 'haid', label: 'Saat haid' },
  { key: 'sebelum', label: 'Sebelum haid' },
  { key: 'sisanya', label: 'Sisanya' },
];

/** Top N gejala terbanyak dari semua daily logs (urut frekuensi, lalu nama). */
function topSymptoms(
  logs: DailyLog[],
  count: number
): { name: string; times: number }[] {
  const freq = new Map<string, number>();
  for (const log of logs) {
    for (const symptom of log.symptoms) {
      freq.set(symptom, (freq.get(symptom) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .map(([name, times]) => ({ name, times }))
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name))
    .slice(0, count);
}

export default function StatistikScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [fallbackCycle, setFallbackCycle] = useState<number | undefined>(
    undefined
  );
  const [fallbackPeriod, setFallbackPeriod] = useState<number | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      listPeriods(),
      listDailyLogs(),
      getSetting('avgCycleLength'),
      getSetting('avgPeriodLength'),
    ])
      .then(([periodRows, logRows, cycleRaw, periodRaw]) => {
        if (cancelled) {
          return;
        }
        setPeriods(periodRows);
        setLogs(logRows);
        setFallbackCycle(parsePositiveNumber(cycleRaw) ?? undefined);
        setFallbackPeriod(parsePositiveNumber(periodRaw) ?? undefined);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Gagal memuat statistik. Coba lagi ya.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  // Muat ulang saat tab kembali fokus (data bisa berubah di tab Catat).
  // Fokus pertama setelah mount dilewati — useEffect di atas sudah memuat.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setReloadToken((t) => t + 1);
    }, [])
  );

  // Hook sebelum conditional return — urutan hook harus stabil.
  const moodSummary = useMemo(
    () => summarizeMood(logs, periods),
    [logs, periods]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.roseDark} />
        <Text style={styles.loadingText}>Memuat statistik…</Text>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Text style={styles.errorEmoji}>🌧️</Text>
        <Text style={styles.errorTitle}>Ups, gagal memuat</Text>
        <Text style={styles.errorBody}>{loadError}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Coba lagi"
          onPress={reload}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.retryButtonPressed,
          ]}
        >
          <Text style={styles.retryButtonText}>Coba lagi</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const stats = computeStats(periods, fallbackCycle, fallbackPeriod);
  const hasData = periods.length > 0;
  const cycleBars = buildCycleBars(periods).slice(-6);
  const maxCycle = cycleBars.reduce((max, bar) => Math.max(max, bar.length), 1);
  const symptoms = topSymptoms(logs, 3);
  const cycleFallback = stats.cyclesLogged === 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>STATISTIK</Text>
        <Text style={styles.title}>Pola haidmu, Bububb ♡</Text>

        {!hasData ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🌷</Text>
            <Text style={styles.emptyTitle}>
              Belum ada data cukup, catat siklus pertamamu dulu ♡
            </Text>
            <Text style={styles.emptyBody}>
              Begitu kamu mulai mencatat haid, di sini muncul rata-rata siklus,
              grafik 6 siklus terakhir, dan gejala yang paling sering kamu
              rasakan.
            </Text>
          </View>
        ) : (
          <>
            {/* Kartu ringkasan */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryNumber}>{stats.cyclesLogged}</Text>
                <Text style={styles.summaryLabel}>
                  siklus lengkap{'\n'}tercatat
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryNumber}>
                  ~{Math.round(stats.avgCycleLength)}
                </Text>
                <Text style={styles.summaryLabel}>rata-rata{'\n'}siklus (hari)</Text>
                {cycleFallback ? (
                  <Text style={styles.summaryHint}>perkiraan</Text>
                ) : null}
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryNumber}>
                  ~{Math.round(stats.avgPeriodLength)}
                </Text>
                <Text style={styles.summaryLabel}>durasi haid{'\n'}(hari)</Text>
              </View>
            </View>

            {/* Grafik 6 siklus terakhir */}
            <Text style={styles.sectionLabel}>6 siklus terakhir</Text>
            <View style={styles.chartCard}>
              {cycleBars.length === 0 ? (
                <Text style={styles.chartEmpty}>
                  Grafikmu akan muncul setelah ada minimal 2 haid tercatat —
                  satu siklus dihitung dari jarak antar haid.
                </Text>
              ) : (
                <>
                  <View style={styles.chartRow}>
                    {cycleBars.map((bar, index) => {
                      const height = Math.max(
                        14,
                        Math.round((bar.length / maxCycle) * CHART_DAYS_HEIGHT)
                      );
                      return (
                        <View
                          key={`${bar.label}-${index}`}
                          style={styles.chartColumn}
                        >
                          <Text style={styles.chartValue}>{bar.length}</Text>
                          <View
                            style={[
                              styles.chartBar,
                              { height },
                              index === cycleBars.length - 1 &&
                                styles.chartBarLatest,
                            ]}
                          />
                          <Text style={styles.chartLabel}>{bar.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.chartCaption}>
                    Dalam hari · label = tanggal haid dimulai
                  </Text>
                </>
              )}
            </View>

            {/* Gejala paling sering */}
            <Text style={styles.sectionLabel}>Gejala paling sering</Text>
            <View style={styles.symptomsCard}>
              {symptoms.length === 0 ? (
                <Text style={styles.symptomsEmpty}>
                  Belum ada gejala tercatat. Coba isi di tab Catat ya ♡
                </Text>
              ) : (
                symptoms.map((item, index) => (
                  <View key={item.name} style={styles.symptomRow}>
                    <View
                      style={[
                        styles.symptomRank,
                        index === 0 && styles.symptomRankTop,
                      ]}
                    >
                      <Text style={styles.symptomRankText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.symptomName}>{item.name}</Text>
                    <View style={styles.symptomBadge}>
                      <Text style={styles.symptomBadgeText}>
                        {item.times}×
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* Pola mood & nyeri */}
        <Text style={styles.sectionLabel}>Pola mood & nyeri</Text>
        <View style={styles.symptomsCard}>
          {logs.length < 3 ? (
            <Text style={styles.symptomsEmpty}>
              Belum cukup catatan — catat mood & nyeri beberapa hari dulu ♡
            </Text>
          ) : (
            <>
              {BUCKET_ROWS.map((row, index) => {
                const summary = moodSummary[row.key];
                const pain = summary.avgPain;
                return (
                  <View key={row.key}>
                    {index > 0 ? <View style={styles.moodDivider} /> : null}
                    <View style={styles.moodRowHeader}>
                      <Text style={styles.moodBucket}>{row.label}</Text>
                      <Text style={styles.moodCount}>
                        {summary.count} catatan
                      </Text>
                    </View>
                    <View style={styles.moodRowBody}>
                      <Text style={styles.moodTop} numberOfLines={1}>
                        {summary.topMood
                          ? `${moodEmoji(summary.topMood)} ${summary.topMood}`
                          : '— belum ada mood'}
                      </Text>
                      <View
                        style={styles.painBarTrack}
                        accessibilityRole="progressbar"
                        accessibilityLabel={`Rata-rata nyeri ${row.label}`}
                        accessibilityValue={{
                          min: 0,
                          max: 10,
                          now: pain ?? 0,
                        }}
                      >
                        <View
                          style={[
                            styles.painBarFill,
                            { width: `${((pain ?? 0) / 10) * 100}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.painBarValue}>
                        {pain === null ? '–' : pain.toFixed(1)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.moodCaption}>
                Rata-rata nyeri · skala 0–10
              </Text>
            </>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.krem,
  },
  center: {
    flex: 1,
    backgroundColor: colors.krem,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.roseDark,
    fontWeight: '600',
  },
  errorEmoji: {
    fontSize: 44,
    marginBottom: spacing.sm,
  },
  errorTitle: {
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  errorBody: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  retryButtonPressed: {
    backgroundColor: colors.roseDark,
  },
  retryButtonText: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 15,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.roseDark,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: 'Georgia',
    fontSize: 26,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.roseDark,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontFamily: 'Georgia',
    fontSize: 19,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 27,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  summaryNumber: {
    fontFamily: 'Georgia',
    fontSize: 28,
    fontWeight: '700',
    color: colors.accent,
    lineHeight: 32,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.subtle,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryHint: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.roseDark,
    marginTop: 3,
    backgroundColor: colors.chipFill,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    minHeight: CHART_DAYS_HEIGHT + 44,
  },
  chartColumn: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  chartValue: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.ink,
  },
  chartBar: {
    width: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.rose,
  },
  chartBarLatest: {
    backgroundColor: colors.accent,
  },
  chartLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.subtle,
  },
  chartCaption: {
    fontSize: 10,
    color: colors.faint,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  chartEmpty: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    paddingVertical: spacing.md,
  },
  symptomsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  symptomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  symptomRank: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.chipFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symptomRankTop: {
    backgroundColor: colors.accentYellow,
  },
  symptomRankText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
  symptomName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  symptomBadge: {
    backgroundColor: colors.chipFill,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  symptomBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.roseDark,
  },
  symptomsEmpty: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
  },
  moodRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  moodBucket: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  moodCount: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.subtle,
  },
  moodRowBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  moodTop: {
    width: 132,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  painBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.chipFill,
    overflow: 'hidden',
  },
  painBarFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  painBarValue: {
    width: 30,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  moodDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },
  moodCaption: {
    fontSize: 10,
    color: colors.faint,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
  });
}
