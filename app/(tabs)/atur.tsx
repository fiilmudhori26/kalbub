/**
 * Layar Atur — pengaturan Kalbub.
 *
 * Isi:
 * - Rata-rata siklus (default 28) & durasi haid (default 5) — stepper,
 *   tersimpan otomatis. Nilai ini HANYA fallback sebelum ada data
 *   tercatat; setelah itu rata-rata dihitung dari catatanmu.
 * - Toggle notifikasi pengingat (default: aktif). Ditulis sebagai string
 *   'true' / 'false' per kontrak penyimpanan. "Kirim notifikasi tes"
 *   menjadwalkan notifikasi sekali ±5 detik.
 * - Reset semua data dengan konfirmasi 2 langkah → resetAll() + batalkan
 *   semua pengingat.
 * - Tentang: Kalbub dibuat khusus untuk Bububb ♡ + versi app.
 */

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../src/theme';
import {
  getSetting,
  listPeriods,
  resetAll,
  setSetting,
} from '../../src/lib/db';
import { parseISO, todayISO } from '../../src/lib/dates';
import {
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
  predictNext,
} from '../../src/lib/predictions';
import { ensurePermission, rescheduleReminders } from '../../src/lib/notifications';

// Versi app — samakan dengan "version" di app.json.
const APP_VERSION = '1.0.0';

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

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/** Parse tanggal onboarding untuk anchor prediksi; null bila kosong/tidak valid. */
function validISODate(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  try {
    parseISO(raw);
    return raw;
  } catch {
    return null;
  }
}

type TestNotifState = 'idle' | 'sending' | 'scheduled' | 'denied' | 'error';

export default function AturScreen() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [cycleAvg, setCycleAvg] = useState(DEFAULT_CYCLE_LENGTH);
  const [periodAvg, setPeriodAvg] = useState(DEFAULT_PERIOD_LENGTH);
  const [savingAvg, setSavingAvg] = useState(false);

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifBusy, setNotifBusy] = useState(false);
  const [testState, setTestState] = useState<TestNotifState>('idle');

  const [resetBusy, setResetBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getSetting('avgCycleLength'),
      getSetting('avgPeriodLength'),
      getSetting('notificationsEnabled'),
    ])
      .then(([cycleRaw, periodRaw, notifRaw]) => {
        if (cancelled) {
          return;
        }
        setCycleAvg(parsePositiveInt(cycleRaw, DEFAULT_CYCLE_LENGTH));
        setPeriodAvg(parsePositiveInt(periodRaw, DEFAULT_PERIOD_LENGTH));
        // Default AKTIF bila belum diset (null → true).
        setNotifEnabled(notifRaw !== 'false');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Gagal memuat pengaturan. Coba lagi ya.');
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

  const saveAvg = useCallback(
    async (key: 'avgCycleLength' | 'avgPeriodLength', value: number) => {
      setSavingAvg(true);
      setNotice(null);
      try {
        await setSetting(key, String(value));
      } catch {
        setNotice('Gagal menyimpan. Coba lagi ya.');
      } finally {
        setSavingAvg(false);
      }
    },
    []
  );

  const stepCycle = useCallback(
    (delta: number) => {
      const next = clampInt(cycleAvg + delta, CYCLE_MIN, CYCLE_MAX);
      if (next === cycleAvg) {
        return;
      }
      setCycleAvg(next);
      void saveAvg('avgCycleLength', next);
    },
    [cycleAvg, saveAvg]
  );

  const stepPeriod = useCallback(
    (delta: number) => {
      const next = clampInt(periodAvg + delta, PERIOD_MIN, PERIOD_MAX);
      if (next === periodAvg) {
        return;
      }
      setPeriodAvg(next);
      void saveAvg('avgPeriodLength', next);
    },
    [periodAvg, saveAvg]
  );

  const handleToggleNotif = useCallback(
    async (value: boolean) => {
      setNotifEnabled(value);
      setNotifBusy(true);
      setNotice(null);
      try {
        // Kontrak: string 'true' / 'false' — jangan boolean.
        await setSetting('notificationsEnabled', value ? 'true' : 'false');
        if (value) {
          // Nyalakan: jadwalkan ulang dari data terkini (aman dipanggil kapan saja).
          const [periods, cycleRaw, periodRaw, lastRaw] = await Promise.all([
            listPeriods(),
            getSetting('avgCycleLength'),
            getSetting('avgPeriodLength'),
            getSetting('lastPeriodStart'),
          ]);
          const prediction = predictNext(periods, todayISO(), {
            avgCycleLength: parsePositiveInt(cycleRaw, DEFAULT_CYCLE_LENGTH),
            avgPeriodLength: parsePositiveInt(periodRaw, DEFAULT_PERIOD_LENGTH),
            lastPeriodStart: validISODate(lastRaw),
          });
          await rescheduleReminders(prediction.predictedStart);
        } else {
          // Matikan: rescheduleReminders(null) meng-cancel semua pengingat.
          await rescheduleReminders(null);
        }
      } catch {
        setNotifEnabled(!value); // rollback toggle bila gagal
        setNotice('Gagal mengubah pengaturan notifikasi. Coba lagi ya.');
      } finally {
        setNotifBusy(false);
      }
    },
    []
  );

  const sendTestNotification = useCallback(async () => {
    setTestState('sending');
    try {
      const granted = await ensurePermission();
      if (!granted) {
        setTestState('denied');
        return;
      }
      const Notifications = await import('expo-notifications');
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('kalbub-reminders', {
          name: 'Pengingat Haid',
          importance: Notifications.AndroidImportance.HIGH,
          description: 'Pengingat sebelum perkiraan tanggal haid',
          lightColor: '#FF5D8F',
        });
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Kalbub',
          body: 'Bububb, ini notifikasi tes dari Kalbub. Semuanya jalan ya ♡',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          ...(Platform.OS === 'android'
            ? { channelId: 'kalbub-reminders' }
            : {}),
        },
      });
      setTestState('scheduled');
    } catch {
      setTestState('error');
    }
  }, []);

  const performReset = useCallback(async () => {
    setResetBusy(true);
    setNotice(null);
    try {
      await resetAll();
      await rescheduleReminders(null);
      // resetAll menghapus settings — kembali ke bawaan.
      setCycleAvg(DEFAULT_CYCLE_LENGTH);
      setPeriodAvg(DEFAULT_PERIOD_LENGTH);
      setNotifEnabled(true);
      setTestState('idle');
      setNotice('Semua data sudah dihapus. Sampai jumpa lagi, Bububb ♡');
    } catch {
      setNotice('Gagal menghapus data. Coba lagi ya.');
    } finally {
      setResetBusy(false);
    }
  }, []);

  const requestReset = useCallback(() => {
    Alert.alert(
      'Reset semua data?',
      'Yakin? Semua data haid & catatan akan dihapus permanen',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, hapus',
          style: 'destructive',
          onPress: () => {
            // Langkah kedua — tidak bisa diurungkan.
            Alert.alert(
              'Yakin banget, Bububb?',
              'Data haid, catatan harian, dan semua pengaturan akan hilang selamanya dan tidak bisa dikembalikan.',
              [
                { text: 'Kembali', style: 'cancel' },
                {
                  text: 'Hapus permanen',
                  style: 'destructive',
                  onPress: () => {
                    void performReset();
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [performReset]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.roseDark} />
        <Text style={styles.loadingText}>Memuat pengaturan…</Text>
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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>PENGATURAN</Text>
        <Text style={styles.title}>Atur Kalbub ♡</Text>

        {/* Rata-rata siklus & durasi haid */}
        <Text style={styles.sectionLabel}>Rata-rata kamu</Text>
        <View style={styles.card}>
          <Text style={styles.infoText}>
            Dipakai hanya sebelum kamu punya data — setelah ada catatan haid,
            rata-rata dihitung dari catatanmu sendiri, bukan dari angka di sini.
          </Text>

          <View style={styles.stepperRow}>
            <View style={styles.stepperInfo}>
              <Text style={styles.stepperLabel}>Rata-rata siklus</Text>
              <Text style={styles.stepperHint}>hari · bawaan 28</Text>
            </View>
            <View style={styles.stepperControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kurangi rata-rata siklus"
                accessibilityState={{ disabled: cycleAvg <= CYCLE_MIN || savingAvg }}
                disabled={cycleAvg <= CYCLE_MIN || savingAvg}
                onPress={() => stepCycle(-1)}
                style={({ pressed }) => [
                  styles.stepButton,
                  (cycleAvg <= CYCLE_MIN || savingAvg) && styles.stepButtonDisabled,
                  pressed && styles.stepButtonPressed,
                ]}
              >
                <Text style={styles.stepButtonText}>−</Text>
              </Pressable>
              <Text
                style={styles.stepValue}
                accessibilityLabel={`Rata-rata siklus ${cycleAvg} hari`}
              >
                {cycleAvg}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tambah rata-rata siklus"
                accessibilityState={{ disabled: cycleAvg >= CYCLE_MAX || savingAvg }}
                disabled={cycleAvg >= CYCLE_MAX || savingAvg}
                onPress={() => stepCycle(1)}
                style={({ pressed }) => [
                  styles.stepButton,
                  (cycleAvg >= CYCLE_MAX || savingAvg) && styles.stepButtonDisabled,
                  pressed && styles.stepButtonPressed,
                ]}
              >
                <Text style={styles.stepButtonText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.stepperRow}>
            <View style={styles.stepperInfo}>
              <Text style={styles.stepperLabel}>Durasi haid</Text>
              <Text style={styles.stepperHint}>hari · bawaan 5</Text>
            </View>
            <View style={styles.stepperControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kurangi durasi haid"
                accessibilityState={{ disabled: periodAvg <= PERIOD_MIN || savingAvg }}
                disabled={periodAvg <= PERIOD_MIN || savingAvg}
                onPress={() => stepPeriod(-1)}
                style={({ pressed }) => [
                  styles.stepButton,
                  (periodAvg <= PERIOD_MIN || savingAvg) && styles.stepButtonDisabled,
                  pressed && styles.stepButtonPressed,
                ]}
              >
                <Text style={styles.stepButtonText}>−</Text>
              </Pressable>
              <Text
                style={styles.stepValue}
                accessibilityLabel={`Durasi haid ${periodAvg} hari`}
              >
                {periodAvg}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tambah durasi haid"
                accessibilityState={{ disabled: periodAvg >= PERIOD_MAX || savingAvg }}
                disabled={periodAvg >= PERIOD_MAX || savingAvg}
                onPress={() => stepPeriod(1)}
                style={({ pressed }) => [
                  styles.stepButton,
                  (periodAvg >= PERIOD_MAX || savingAvg) && styles.stepButtonDisabled,
                  pressed && styles.stepButtonPressed,
                ]}
              >
                <Text style={styles.stepButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Notifikasi */}
        <Text style={styles.sectionLabel}>Notifikasi</Text>
        <View style={styles.card}>
          <View style={styles.notifRow}>
            <View style={styles.notifInfo}>
              <Text style={styles.notifLabel}>Pengingat haid</Text>
              <Text style={styles.notifHint}>
                H-2 & hari-H, jam 09.00 pagi
              </Text>
            </View>
            <Switch
              accessibilityLabel="Pengingat haid"
              value={notifEnabled}
              disabled={notifBusy}
              onValueChange={(value) => {
                void handleToggleNotif(value);
              }}
              trackColor={{ false: '#EAD3D9', true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kirim notifikasi tes"
            disabled={testState === 'sending'}
            onPress={() => {
              void sendTestNotification();
            }}
            style={({ pressed }) => [
              styles.testButton,
              testState === 'sending' && styles.testButtonDisabled,
              pressed && styles.testButtonPressed,
            ]}
          >
            {testState === 'sending' ? (
              <ActivityIndicator color={colors.roseDark} />
            ) : (
              <Text style={styles.testButtonText}>Kirim notifikasi tes</Text>
            )}
          </Pressable>
          {testState === 'scheduled' ? (
            <Text style={styles.testFeedbackOk}>
              Notifikasi tes terjadwal — cek 5 detik lagi ♡
            </Text>
          ) : null}
          {testState === 'denied' ? (
            <Text style={styles.testFeedbackWarn}>
              Izin notifikasi belum diberikan. Aktifkan dulu di pengaturan
              perangkat ya.
            </Text>
          ) : null}
          {testState === 'error' ? (
            <Text style={styles.testFeedbackWarn}>
              Gagal mengirim notifikasi tes. Coba lagi ya.
            </Text>
          ) : null}
        </View>

        {/* Reset data */}
        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <Text style={styles.infoText}>
            Semua datamu tersimpan hanya di perangkat ini — tidak dikirim ke
            mana pun.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset semua data"
            accessibilityState={{ disabled: resetBusy }}
            disabled={resetBusy}
            onPress={requestReset}
            style={({ pressed }) => [
              styles.dangerButton,
              resetBusy && styles.dangerButtonDisabled,
              pressed && styles.dangerButtonPressed,
            ]}
          >
            {resetBusy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.dangerButtonText}>Reset semua data</Text>
            )}
          </Pressable>
        </View>

        {/* Tentang */}
        <Text style={styles.sectionLabel}>Tentang</Text>
        <View style={styles.card}>
          <Text style={styles.aboutHeart}>♡</Text>
          <Text style={styles.aboutText}>
            Kalbub dibuat khusus untuk Bububb ♡
          </Text>
          <Text style={styles.aboutVersion}>Versi {APP_VERSION}</Text>
        </View>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#C46A82',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  infoText: {
    fontSize: 12,
    color: '#6B4A55',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  stepperInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  stepperLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  stepperHint: {
    fontSize: 11,
    color: '#A07080',
    marginTop: 1,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: '#FCE4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonPressed: {
    opacity: 0.7,
  },
  stepButtonDisabled: {
    opacity: 0.35,
  },
  stepButtonText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.roseDark,
    lineHeight: 24,
  },
  stepValue: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    minWidth: 36,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(196,106,130,0.18)',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  notifInfo: {
    flex: 1,
    paddingRight: spacing.md,
  },
  notifLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  notifHint: {
    fontSize: 11,
    color: '#A07080',
    marginTop: 1,
  },
  testButton: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingVertical: 11,
    alignItems: 'center',
  },
  testButtonPressed: {
    backgroundColor: '#FCE4EA',
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
  },
  testFeedbackOk: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3E7D46',
    marginTop: spacing.sm,
  },
  testFeedbackWarn: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.roseDark,
    marginTop: spacing.sm,
    lineHeight: 17,
  },
  dangerButton: {
    backgroundColor: '#D6455B',
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dangerButtonPressed: {
    backgroundColor: '#B73A4E',
  },
  dangerButtonDisabled: {
    opacity: 0.6,
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  aboutHeart: {
    fontSize: 28,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  aboutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 22,
  },
  aboutVersion: {
    fontSize: 11,
    color: '#A07080',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  notice: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.roseDark,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
