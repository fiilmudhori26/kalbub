/**
 * Beranda Kalbub — sapaan, kartu status (prediksi / "Sudah datang, Bububb?"),
 * kalender bulanan, legenda, dan tombol catat haid.
 *
 * Alur:
 * - Ketuk hari di kalender → PeriodRangeSheet dengan tanggal mulai terisi.
 * - "+ Haid" → PeriodRangeSheet (preselect `?date=YYYY-MM-DD` bila valid).
 * - "Sudah datang, Bububb?" → prompt tanggal mulai sebenarnya (default:
 *   tanggal prediksi) → addPeriod(durasi default dari computeStats) +
 *   rescheduleReminders. "Belum" → simpan `lateDismissedFor` + tampilkan
 *   baris "terlambat X hari".
 */

import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../src/theme';
import {
  addPeriod,
  getSetting,
  listPeriods,
  setSetting,
  type Period,
} from '../../src/lib/db';
import {
  addDaysISO,
  formatID,
  parseISO,
  todayISO,
  weekdayID,
} from '../../src/lib/dates';
import {
  computeStats,
  lateStatus,
  predictNext,
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
  type LateStatus,
  type Prediction,
  type PredictionSettings,
} from '../../src/lib/predictions';
import { rescheduleReminders } from '../../src/lib/notifications';
import { CalendarGrid } from '../../src/components/CalendarGrid';
import { PredictionCard } from '../../src/components/PredictionCard';
import { LateCard } from '../../src/components/LateCard';
import { PeriodRangeSheet } from '../../src/components/PeriodRangeSheet';

const MONTHS_ID = [
  'JANUARI',
  'FEBRUARI',
  'MARET',
  'APRIL',
  'MEI',
  'JUNI',
  'JULI',
  'AGUSTUS',
  'SEPTEMBER',
  'OKTOBER',
  'NOVEMBER',
  'DESEMBER',
] as const;

function isValidISO(value: string): boolean {
  try {
    parseISO(value);
    return true;
  } catch {
    return false;
  }
}

function parsePositiveNumber(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type SheetState = {
  visible: boolean;
  mode: 'range' | 'single';
  initialDate: string | null;
};

export default function HomeScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const preselectDate = useMemo(() => {
    const raw = Array.isArray(params.date) ? params.date[0] : params.date;
    return raw && isValidISO(raw) ? raw : null;
  }, [params.date]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<PredictionSettings>({});
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [late, setLate] = useState<LateStatus | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>({
    visible: false,
    mode: 'range',
    initialDate: null,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const applyFresh = useCallback(
    (freshPeriods: Period[], currentSettings: PredictionSettings) => {
      const today = todayISO();
      setPeriods(freshPeriods);
      setPrediction(predictNext(freshPeriods, today, currentSettings));
      setLate(lateStatus(freshPeriods, today, currentSettings));
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [freshPeriods, avgCycleRaw, avgPeriodRaw, lastStart, dismissed] =
        await Promise.all([
          listPeriods(),
          getSetting('avgCycleLength'),
          getSetting('avgPeriodLength'),
          getSetting('lastPeriodStart'),
          getSetting('lateDismissedFor'),
        ]);
      const currentSettings: PredictionSettings = {
        avgCycleLength: parsePositiveNumber(avgCycleRaw),
        avgPeriodLength: parsePositiveNumber(avgPeriodRaw),
        lastPeriodStart: lastStart && isValidISO(lastStart) ? lastStart : null,
      };
      setSettings(currentSettings);
      setDismissedFor(dismissed);
      applyFresh(freshPeriods, currentSettings);
    } catch (err) {
      setLoadError(
        err instanceof Error && err.message
          ? err.message
          : 'Gagal memuat data. Coba lagi ya.'
      );
    } finally {
      setLoading(false);
    }
  }, [applyFresh]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Simpan periode → baca ulang daftar → hitung prediksi baru → jadwalkan
   * pengingat. Melempar error ke pemanggil (sheet menampilkannya).
   */
  const savePeriod = useCallback(
    async (start: string, end: string) => {
      await addPeriod(start, end);
      const fresh = await listPeriods();
      const currentSettings = settings;
      const pred = predictNext(fresh, todayISO(), currentSettings);
      await rescheduleReminders(pred.predictedStart);
      applyFresh(fresh, currentSettings);
      setSheet((s) => ({ ...s, visible: false }));
      setNotice('Haid tercatat ♡');
    },
    [applyFresh, settings]
  );

  const handleSudahSubmit = useCallback(
    async (start: string) => {
      const stats = computeStats(
        periods,
        settings.avgCycleLength ?? DEFAULT_CYCLE_LENGTH,
        settings.avgPeriodLength ?? DEFAULT_PERIOD_LENGTH
      );
      const duration = Math.max(1, Math.round(stats.avgPeriodLength));
      await savePeriod(start, addDaysISO(start, duration - 1));
    },
    [periods, settings, savePeriod]
  );

  const handleBelum = useCallback(async () => {
    if (!prediction) {
      return;
    }
    setBusy(true);
    try {
      await setSetting('lateDismissedFor', prediction.predictedStart);
      setDismissedFor(prediction.predictedStart);
      setNotice('Oke, kami tunggu sampai haidnya datang ♡');
    } catch {
      setNotice('Gagal menyimpan. Coba lagi ya.');
    } finally {
      setBusy(false);
    }
  }, [prediction]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.roseDark} />
        <Text style={styles.loadingText}>Memuat…</Text>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <StatusBar style="dark" />
        <Text style={styles.errorEmoji}>🌧️</Text>
        <Text style={styles.errorTitle}>Ups, gagal memuat</Text>
        <Text style={styles.errorBody}>{loadError}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Coba lagi"
          onPress={load}
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

  const today = todayISO();
  const todayParts = parseISO(today);
  const hasData =
    periods.length > 0 ||
    (typeof settings.lastPeriodStart === 'string' &&
      isValidISO(settings.lastPeriodStart));
  const showLateCard =
    late?.isLate === true &&
    prediction !== null &&
    dismissedFor !== prediction.predictedStart;
  const showLateLine =
    late?.isLate === true &&
    prediction !== null &&
    dismissedFor === prediction.predictedStart;
  const cardPrediction = hasData ? prediction : null;
  const greetingSub = cardPrediction
    ? `Haid diperkirakan ${formatID(cardPrediction.predictedStart)}`
    : 'Catat haid pertamamu, Bububb';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Baris bulan + tanggal */}
        <View style={styles.topRow}>
          <Text style={styles.topMonth}>
            {MONTHS_ID[todayParts.m - 1]} {todayParts.y}
          </Text>
          <View style={styles.todayPill}>
            <Text style={styles.todayPillText}>
              {weekdayID(today).slice(0, 3).toUpperCase()}, {todayParts.d} ✨
            </Text>
          </View>
        </View>

        {/* Sapaan */}
        <Text style={styles.greeting}>Hai, Bububb ♡</Text>
        <Text style={styles.greetingSub}>{greetingSub}</Text>

        {/* Kartu status */}
        {showLateCard && prediction ? (
          <LateCard
            daysLate={late?.daysLate ?? 0}
            predictedStart={prediction.predictedStart}
            onSudah={() =>
              setSheet({
                visible: true,
                mode: 'single',
                initialDate: prediction.predictedStart,
              })
            }
            onBelum={handleBelum}
            busy={busy}
          />
        ) : (
          <PredictionCard prediction={cardPrediction} />
        )}
        {showLateLine && late ? (
          <Text style={styles.lateLine}>terlambat {late.daysLate} hari</Text>
        ) : null}

        {/* Kalender */}
        <View style={styles.sectionGap} />
        <CalendarGrid
          periods={periods}
          prediction={prediction}
          onDayPress={(iso) =>
            setSheet({ visible: true, mode: 'range', initialDate: iso })
          }
          today={today}
        />

        {/* Legenda */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotPeriod]} />
            <Text style={styles.legendText}>Haid</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotPredicted]} />
            <Text style={styles.legendText}>Prediksi</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotFertile]} />
            <Text style={styles.legendText}>Subur</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotOvulation]} />
            <Text style={styles.legendText}>Ovulasi</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotToday]} />
            <Text style={styles.legendText}>Hari ini</Text>
          </View>
        </View>

        {/* Tombol + Haid */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="+ Haid"
          onPress={() =>
            setSheet({ visible: true, mode: 'range', initialDate: preselectDate })
          }
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.addButtonPressed,
          ]}
        >
          <Text style={styles.addButtonText}>+ Haid</Text>
        </Pressable>

        {notice ? (
          <View style={styles.noticePill}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <PeriodRangeSheet
        visible={sheet.visible}
        mode={sheet.mode}
        initialDate={sheet.initialDate}
        onClose={() => setSheet((s) => ({ ...s, visible: false }))}
        onSubmit={sheet.mode === 'single' ? handleSudahSubmit : savePeriod}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    paddingTop: spacing.md,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.roseDark,
    fontWeight: '600',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  topMonth: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: colors.roseDark,
  },
  todayPill: {
    backgroundColor: colors.accentYellow,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5A3A00',
    letterSpacing: 1,
  },
  greeting: {
    fontFamily: 'Georgia',
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    marginBottom: 2,
  },
  greetingSub: {
    fontSize: 13,
    color: '#A07080',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionGap: {
    height: spacing.md,
  },
  lateLine: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: '700',
    color: colors.roseDark,
    letterSpacing: 0.3,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    shadowColor: '#C46A82',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 1,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    marginRight: 6,
  },
  legendDotPeriod: {
    backgroundColor: colors.rose,
  },
  legendDotPredicted: {
    backgroundColor: colors.accentYellow,
  },
  legendDotFertile: {
    backgroundColor: 'rgba(255,93,143,0.3)',
  },
  legendDotOvulation: {
    backgroundColor: colors.accent,
  },
  legendDotToday: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.roseDark,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  addButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  addButtonPressed: {
    backgroundColor: colors.roseDark,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  noticePill: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  noticeText: {
    color: colors.krem,
    fontSize: 12,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: spacing.xl,
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
    color: '#6B4A55',
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
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
