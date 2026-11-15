/**
 * Layar Onboarding Kalbub — tiga pertanyaan singkat sebelum masuk app.
 *
 * Alur: tanggal haid terakhir mulai (default hari ini, tidak boleh masa
 * depan) → rata-rata siklus (20–45, bawaan 28) → durasi haid (2–10,
 * bawaan 5). Saat selesai: lastPeriodStart/avgCycleLength/avgPeriodLength
 * → ensurePermission() (izin notifikasi diminta di sini, BUKAN first
 * paint) → predictNext([], …) + rescheduleReminders → BARU setSetting
 * onboardingDone (paling terakhir, supaya kegagalan di langkah awal tidak
 * mengunci gate) → router.replace('/') ke tab Kalender.
 */

import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, spacing, type ThemeColors } from '../src/theme';
import { useAppTheme } from '../src/lib/useAppTheme';
import { setSetting } from '../src/lib/db';
import {
  addDaysISO,
  formatID,
  todayISO,
  weekdayID,
} from '../src/lib/dates';
import { predictNext } from '../src/lib/predictions';
import { ensurePermission, rescheduleReminders } from '../src/lib/notifications';

const CYCLE_MIN = 20;
const CYCLE_MAX = 45;
const PERIOD_MIN = 2;
const PERIOD_MAX = 10;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [today] = useState(() => todayISO());
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [lastPeriodStart, setLastPeriodStart] = useState<string>(today);
  const [cycleLength, setCycleLength] = useState(28);
  const [periodLength, setPeriodLength] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shiftLastPeriod = useCallback(
    (delta: number) => {
      setLastPeriodStart((prev) => {
        const next = addDaysISO(prev, delta);
        // Haid terakhir tidak mungkin di masa depan.
        return next > today ? prev : next;
      });
      setError(null);
    },
    [today]
  );

  const isToday = lastPeriodStart === today;

  const handleFinish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // Urutan penting: 'onboardingDone' ditulis PALING TERAKHIR. Bila ada
      // langkah sebelumnya yang gagal, pengguna tetap dianggap belum
      // onboarding — dan alur ini idempoten sehingga aman diulang.
      await setSetting('lastPeriodStart', lastPeriodStart);
      await setSetting('avgCycleLength', String(cycleLength));
      await setSetting('avgPeriodLength', String(periodLength));
      await ensurePermission();
      // Belum ada periode tercatat — prediksi berlabuh ke setting onboarding.
      const prediction = predictNext([], today, {
        lastPeriodStart,
        avgCycleLength: cycleLength,
        avgPeriodLength: periodLength,
      });
      await rescheduleReminders(prediction.predictedStart);
      await setSetting('onboardingDone', 'true');
      router.replace('/');
    } catch {
      setError('Gagal menyimpan. Coba lagi ya, Bububb.');
    } finally {
      setSaving(false);
    }
  }, [lastPeriodStart, cycleLength, periodLength, today, router]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heroEmoji}>🌸</Text>
        <Text style={styles.eyebrow}>KALBUB</Text>
        <Text style={styles.title}>Hai, Bububb ♡</Text>
        <Text style={styles.intro}>
          Seneng banget kamu pakai Kalbub — pendamping pribadi untuk siklus
          haidmu. Tiga pertanyaan sebentar dulu ya, biar Kalbub kenal kamu
          lebih dekat.
        </Text>

        {/* Pertanyaan 1 — tanggal haid terakhir */}
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>
            <Text style={styles.questionNumber}>1 · </Text>
            Kapan haid terakhirmu mulai?
          </Text>
          <View style={styles.dateStepperRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sehari sebelumnya"
              disabled={saving}
              onPress={() => shiftLastPeriod(-1)}
              style={({ pressed }) => [
                styles.dateStepButton,
                saving && styles.stepButtonDisabled,
                pressed && styles.stepButtonPressed,
              ]}
            >
              <Text style={styles.dateStepText}>−</Text>
            </Pressable>
            <View style={styles.dateCenter}>
              <Text style={styles.dateWeekday}>{weekdayID(lastPeriodStart)}</Text>
              <Text style={styles.dateBig}>{formatID(lastPeriodStart)}</Text>
              {isToday ? <Text style={styles.dateRel}>Hari ini ♡</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sehari setelahnya"
              accessibilityState={{ disabled: isToday || saving }}
              disabled={isToday || saving}
              onPress={() => shiftLastPeriod(1)}
              style={({ pressed }) => [
                styles.dateStepButton,
                (isToday || saving) && styles.stepButtonDisabled,
                pressed && styles.stepButtonPressed,
              ]}
            >
              <Text style={styles.dateStepText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* Pertanyaan 2 — rata-rata siklus */}
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>
            <Text style={styles.questionNumber}>2 · </Text>
            Rata-rata siklusmu berapa hari?
          </Text>
          <View style={styles.numberStepperRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kurangi rata-rata siklus"
              accessibilityState={{
                disabled: cycleLength <= CYCLE_MIN || saving,
              }}
              disabled={cycleLength <= CYCLE_MIN || saving}
              onPress={() =>
                setCycleLength((v) => clampInt(v - 1, CYCLE_MIN, CYCLE_MAX))
              }
              style={({ pressed }) => [
                styles.numberStepButton,
                (cycleLength <= CYCLE_MIN || saving) && styles.stepButtonDisabled,
                pressed && styles.stepButtonPressed,
              ]}
            >
              <Text style={styles.numberStepText}>−</Text>
            </Pressable>
            <View style={styles.numberCenter}>
              <Text
                style={styles.numberValue}
                accessibilityLabel={`Rata-rata siklus ${cycleLength} hari`}
              >
                {cycleLength}
              </Text>
              <Text style={styles.numberUnit}>hari</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tambah rata-rata siklus"
              accessibilityState={{
                disabled: cycleLength >= CYCLE_MAX || saving,
              }}
              disabled={cycleLength >= CYCLE_MAX || saving}
              onPress={() =>
                setCycleLength((v) => clampInt(v + 1, CYCLE_MIN, CYCLE_MAX))
              }
              style={({ pressed }) => [
                styles.numberStepButton,
                (cycleLength >= CYCLE_MAX || saving) && styles.stepButtonDisabled,
                pressed && styles.stepButtonPressed,
              ]}
            >
              <Text style={styles.numberStepText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.questionHint}>
            Biasanya 21–35 hari · bawaan 28
          </Text>
        </View>

        {/* Pertanyaan 3 — durasi haid */}
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>
            <Text style={styles.questionNumber}>3 · </Text>
            Durasi haidmu rata-rata berapa hari?
          </Text>
          <View style={styles.numberStepperRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kurangi durasi haid"
              accessibilityState={{
                disabled: periodLength <= PERIOD_MIN || saving,
              }}
              disabled={periodLength <= PERIOD_MIN || saving}
              onPress={() =>
                setPeriodLength((v) => clampInt(v - 1, PERIOD_MIN, PERIOD_MAX))
              }
              style={({ pressed }) => [
                styles.numberStepButton,
                (periodLength <= PERIOD_MIN || saving) && styles.stepButtonDisabled,
                pressed && styles.stepButtonPressed,
              ]}
            >
              <Text style={styles.numberStepText}>−</Text>
            </Pressable>
            <View style={styles.numberCenter}>
              <Text
                style={styles.numberValue}
                accessibilityLabel={`Durasi haid ${periodLength} hari`}
              >
                {periodLength}
              </Text>
              <Text style={styles.numberUnit}>hari</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tambah durasi haid"
              accessibilityState={{
                disabled: periodLength >= PERIOD_MAX || saving,
              }}
              disabled={periodLength >= PERIOD_MAX || saving}
              onPress={() =>
                setPeriodLength((v) => clampInt(v + 1, PERIOD_MIN, PERIOD_MAX))
              }
              style={({ pressed }) => [
                styles.numberStepButton,
                (periodLength >= PERIOD_MAX || saving) && styles.stepButtonDisabled,
                pressed && styles.stepButtonPressed,
              ]}
            >
              <Text style={styles.numberStepText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.questionHint}>Umumnya 3–7 hari · bawaan 5</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mulai"
          disabled={saving}
          onPress={() => {
            void handleFinish();
          }}
          style={({ pressed }) => [
            styles.finishButton,
            saving && styles.finishButtonDisabled,
            pressed && !saving && styles.finishButtonPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.finishButtonText}>Mulai ♡</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Semua datamu tersimpan hanya di perangkat ini.
        </Text>
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    alignItems: 'stretch',
  },
  heroEmoji: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.roseDark,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: 'Georgia',
    fontSize: 34,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  intro: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  questionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  questionNumber: {
    color: colors.accent,
    fontWeight: '800',
  },
  questionHint: {
    fontSize: 11,
    color: colors.subtle,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  dateStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateStepButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.chipFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateStepText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.roseDark,
    lineHeight: 28,
  },
  stepButtonPressed: {
    opacity: 0.7,
  },
  stepButtonDisabled: {
    opacity: 0.3,
  },
  dateCenter: {
    alignItems: 'center',
    flex: 1,
  },
  dateWeekday: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.subtle,
    textTransform: 'uppercase',
  },
  dateBig: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 2,
  },
  dateRel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 1,
  },
  numberStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  numberStepButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.chipFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberStepText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.roseDark,
    lineHeight: 28,
  },
  numberCenter: {
    alignItems: 'center',
    flex: 1,
  },
  numberValue: {
    fontFamily: 'Georgia',
    fontSize: 40,
    fontWeight: '700',
    color: colors.accent,
    lineHeight: 44,
  },
  numberUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.subtle,
    letterSpacing: 0.5,
  },
  finishButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: spacing.sm,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  finishButtonPressed: {
    backgroundColor: colors.roseDark,
  },
  finishButtonDisabled: {
    opacity: 0.7,
  },
  finishButtonText: {
    color: colors.onAccentDark,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.roseDark,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  footnote: {
    fontSize: 11,
    color: colors.faint,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  bottomSpacer: {
    height: spacing.lg,
  },
  });
}
