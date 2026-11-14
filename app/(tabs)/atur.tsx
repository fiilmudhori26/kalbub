/**
 * Layar Atur — pengaturan Kalbub.
 *
 * Isi:
 * - Tampilan — mode tema: Ikuti sistem / Terang / Gelap (setting `themeMode`,
 *   bawaan ikut sistem). Langsung berlaku lewat useAppTheme.
 * - Rata-rata siklus (default 28) & durasi haid (default 5) — stepper,
 *   tersimpan otomatis. Nilai ini HANYA fallback sebelum ada data
 *   tercatat; setelah itu rata-rata dihitung dari catatanmu.
 * - Notifikasi — toggle pengingat (default: aktif), jam pengingat H-2 &
 *   hari-H (`notifHour`/`notifMinute`, bawaan 09:00), gaya pesan
 *   (`notifCopy`: hangat/singkat, bawaan hangat) + pratinjau pesan hidup.
 *   "Kirim notifikasi tes" menjadwalkan notifikasi sekali ±5 detik.
 * - Reset semua data dengan konfirmasi 2 langkah → resetAll() + batalkan
 *   semua pengingat + kembalikan semua pengaturan ke bawaan.
 * - Tentang: Kalbub dibuat khusus untuk Bububb ♡ + versi app.
 */

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

import { radius, spacing, type ThemeColors } from '../../src/theme';
import { useAppTheme, type ThemeMode } from '../../src/lib/useAppTheme';
import {
  getSetting,
  listPeriods,
  resetAll,
  setSetting,
} from '../../src/lib/db';
import { addDaysISO, parseISO, todayISO } from '../../src/lib/dates';
import {
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
  predictNext,
} from '../../src/lib/predictions';
import {
  buildBody,
  ensurePermission,
  parseNotifClock,
  parseNotifCopy,
  rescheduleReminders,
  type NotifCopy,
} from '../../src/lib/notifications';

// Versi app — samakan dengan "version" di app.json.
const APP_VERSION = '1.0.0';

const CYCLE_MIN = 20;
const CYCLE_MAX = 45;
const PERIOD_MIN = 2;
const PERIOD_MAX = 10;
const HOUR_MIN = 0;
const HOUR_MAX = 23;
const DEFAULT_NOTIF_HOUR = 9;
const DEFAULT_NOTIF_MINUTE = 0;
const DEFAULT_NOTIF_COPY: NotifCopy = 'hangat';

const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'system', label: 'Ikuti sistem', hint: 'Menyesuaikan pengaturan perangkat' },
  { value: 'light', label: 'Terang', hint: 'Krem & rose lembut' },
  { value: 'dark', label: 'Gelap', hint: 'Plum-cokelat pekat, nyaman di malam hari' },
];

const COPY_OPTIONS: { value: NotifCopy; label: string }[] = [
  { value: 'hangat', label: 'Hangat' },
  { value: 'singkat', label: 'Singkat' },
];

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
  const { colors, isDark, themeMode, setThemeMode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [cycleAvg, setCycleAvg] = useState(DEFAULT_CYCLE_LENGTH);
  const [periodAvg, setPeriodAvg] = useState(DEFAULT_PERIOD_LENGTH);
  const [savingAvg, setSavingAvg] = useState(false);

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifHour, setNotifHour] = useState(DEFAULT_NOTIF_HOUR);
  const [notifMinute, setNotifMinute] = useState(DEFAULT_NOTIF_MINUTE);
  const [notifCopy, setNotifCopy] = useState<NotifCopy>(DEFAULT_NOTIF_COPY);
  const [notifTimeBusy, setNotifTimeBusy] = useState(false);
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
      getSetting('notifHour'),
      getSetting('notifMinute'),
      getSetting('notifCopy'),
    ])
      .then(([cycleRaw, periodRaw, notifRaw, hourRaw, minuteRaw, copyRaw]) => {
        if (cancelled) {
          return;
        }
        setCycleAvg(parsePositiveInt(cycleRaw, DEFAULT_CYCLE_LENGTH));
        setPeriodAvg(parsePositiveInt(periodRaw, DEFAULT_PERIOD_LENGTH));
        // Default AKTIF bila belum diset (null → true).
        setNotifEnabled(notifRaw !== 'false');
        const clock = parseNotifClock(hourRaw, minuteRaw);
        setNotifHour(clock.hour);
        setNotifMinute(clock.minute);
        setNotifCopy(parseNotifCopy(copyRaw));
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

  /**
   * Hitung prediksi dari data terkini & jadwalkan ulang pengingat.
   * Tanpa data sama sekali → rescheduleReminders(null) (membatalkan semua
   * pengingat — prediksi akan fiktif) dan kembalikan false.
   */
  const rescheduleFromData = useCallback(async (): Promise<boolean> => {
    const [periods, cycleRaw, periodRaw, lastRaw] = await Promise.all([
      listPeriods(),
      getSetting('avgCycleLength'),
      getSetting('avgPeriodLength'),
      getSetting('lastPeriodStart'),
    ]);
    const hasData = periods.length > 0 || validISODate(lastRaw) !== null;
    if (!hasData) {
      await rescheduleReminders(null);
      return false;
    }
    const prediction = predictNext(periods, todayISO(), {
      avgCycleLength: parsePositiveInt(cycleRaw, DEFAULT_CYCLE_LENGTH),
      avgPeriodLength: parsePositiveInt(periodRaw, DEFAULT_PERIOD_LENGTH),
      lastPeriodStart: validISODate(lastRaw),
    });
    await rescheduleReminders(prediction.predictedStart);
    return true;
  }, []);

  const handleToggleNotif = useCallback(
    async (value: boolean) => {
      setNotifBusy(true);
      setNotice(null);
      try {
        if (value) {
          // Nyalakan: minta izin DULU. Bila ditolak, jangan biarkan switch
          // menyala palsu tanpa pengingat terjadwal.
          const granted = await ensurePermission();
          if (!granted) {
            setNotifEnabled(false);
            setNotice('Izin notifikasi belum diberikan — aktifkan di Pengaturan Android');
            return;
          }
          setNotifEnabled(true);
          // Kontrak: string 'true' / 'false' — jangan boolean.
          await setSetting('notificationsEnabled', 'true');
          // Jadwalkan ulang dari data terkini — tapi JANGAN bila belum ada
          // data sama sekali: prediksi akan fiktif. Batalkan saja dan
          // beri tahu pengguna dengan lembut.
          const hasData = await rescheduleFromData();
          if (!hasData) {
            setNotice(
              'Belum ada data — pengingat akan aktif setelah catat haid pertamamu ♡'
            );
            return;
          }
        } else {
          setNotifEnabled(false);
          // Kontrak: string 'true' / 'false' — jangan boolean.
          await setSetting('notificationsEnabled', 'false');
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
    [rescheduleFromData]
  );

  const notifTimeLabel = `${String(notifHour).padStart(2, '0')}.${String(
    notifMinute
  ).padStart(2, '0')}`;
  // Tanggal contoh untuk pratinjau pesan (bukan prediksi pengguna).
  const previewExampleStart = addDaysISO(todayISO(), 14);

  const applyNotifClock = useCallback(
    async (hour: number, minute: number) => {
      setNotifTimeBusy(true);
      setNotice(null);
      setNotifHour(hour);
      setNotifMinute(minute);
      try {
        await setSetting('notifHour', String(hour));
        await setSetting('notifMinute', String(minute));
        // Jadwal mengikuti jam baru dengan segera.
        await rescheduleFromData();
      } catch {
        setNotice('Gagal menyimpan jam pengingat. Coba lagi ya.');
      } finally {
        setNotifTimeBusy(false);
      }
    },
    [rescheduleFromData]
  );

  const stepNotifHour = useCallback(
    (delta: number) => {
      const next = clampInt(notifHour + delta, HOUR_MIN, HOUR_MAX);
      if (next === notifHour || notifTimeBusy) {
        return;
      }
      void applyNotifClock(next, notifMinute);
    },
    [notifHour, notifMinute, notifTimeBusy, applyNotifClock]
  );

  const handleCopyChange = useCallback(
    async (copy: NotifCopy) => {
      if (copy === notifCopy) {
        return;
      }
      setNotifCopy(copy);
      setNotice(null);
      try {
        await setSetting('notifCopy', copy);
        await rescheduleFromData();
      } catch {
        setNotice('Gagal menyimpan gaya pesan. Coba lagi ya.');
      }
    },
    [notifCopy, rescheduleFromData]
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
      setNotifHour(DEFAULT_NOTIF_HOUR);
      setNotifMinute(DEFAULT_NOTIF_MINUTE);
      setNotifCopy(DEFAULT_NOTIF_COPY);
      // Tema kembali ikut sistem (settings themeMode ikut terhapus).
      void setThemeMode('system');
      setTestState('idle');
      setNotice('Semua data sudah dihapus. Sampai jumpa lagi, Bububb ♡');
    } catch {
      setNotice('Gagal menghapus data. Coba lagi ya.');
    } finally {
      setResetBusy(false);
    }
  }, [setThemeMode]);

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
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.roseDark} />
        <Text style={styles.loadingText}>Memuat pengaturan…</Text>
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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>PENGATURAN</Text>
        <Text style={styles.title}>Atur Kalbub ♡</Text>

        {/* Tampilan */}
        <Text style={styles.sectionLabel}>Tampilan</Text>
        <View style={styles.card}>
          {THEME_OPTIONS.map((option, index) => {
            const active = themeMode === option.value;
            return (
              <View key={option.value}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={`Tema ${option.label}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    void setThemeMode(option.value);
                  }}
                  style={({ pressed }) => [
                    styles.modeRow,
                    pressed && styles.modeRowPressed,
                  ]}
                >
                  <View
                    style={[styles.modeDot, active && styles.modeDotActive]}
                  >
                    {active ? <View style={styles.modeDotInner} /> : null}
                  </View>
                  <View style={styles.modeInfo}>
                    <Text style={styles.modeLabel}>{option.label}</Text>
                    <Text style={styles.modeHint}>{option.hint}</Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>

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
                H-2 & hari-H, jam {notifTimeLabel}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Pengingat haid"
              value={notifEnabled}
              disabled={notifBusy}
              onValueChange={(value) => {
                void handleToggleNotif(value);
              }}
              trackColor={{ false: colors.switchOff, true: colors.accent }}
              thumbColor={colors.onAccent}
            />
          </View>

          <View style={styles.divider} />

          {/* Jam pengingat */}
          <View style={styles.stepperRow}>
            <View style={styles.stepperInfo}>
              <Text style={styles.stepperLabel}>Jam pengingat</Text>
              <Text style={styles.stepperHint}>
                H-2 & hari-H dikirim pukul {notifTimeLabel}
              </Text>
            </View>
            <View style={styles.stepperControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mundurkan jam pengingat"
                accessibilityState={{ disabled: notifHour <= HOUR_MIN || notifTimeBusy }}
                disabled={notifHour <= HOUR_MIN || notifTimeBusy}
                onPress={() => stepNotifHour(-1)}
                style={({ pressed }) => [
                  styles.stepButton,
                  (notifHour <= HOUR_MIN || notifTimeBusy) && styles.stepButtonDisabled,
                  pressed && styles.stepButtonPressed,
                ]}
              >
                <Text style={styles.stepButtonText}>−</Text>
              </Pressable>
              <Text
                style={[styles.stepValue, styles.stepValueWide]}
                accessibilityLabel={`Jam pengingat pukul ${notifTimeLabel}`}
              >
                {notifTimeLabel}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Majukan jam pengingat"
                accessibilityState={{ disabled: notifHour >= HOUR_MAX || notifTimeBusy }}
                disabled={notifHour >= HOUR_MAX || notifTimeBusy}
                onPress={() => stepNotifHour(1)}
                style={({ pressed }) => [
                  styles.stepButton,
                  (notifHour >= HOUR_MAX || notifTimeBusy) && styles.stepButtonDisabled,
                  pressed && styles.stepButtonPressed,
                ]}
              >
                <Text style={styles.stepButtonText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Gaya pesan */}
          <Text style={styles.subLabel}>Gaya pesan</Text>
          <View style={styles.copyRow}>
            {COPY_OPTIONS.map((option) => {
              const active = notifCopy === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`Gaya pesan ${option.label}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    void handleCopyChange(option.value);
                  }}
                  style={({ pressed }) => [
                    styles.copyPill,
                    active && styles.copyPillActive,
                    pressed && styles.copyPillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.copyPillText,
                      active && styles.copyPillTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.previewCaption}>
            Pratinjau pesan (tanggal contoh saja)
          </Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>H-2</Text>
            <Text style={styles.previewText}>
              {buildBody(previewExampleStart, 'h-2', notifCopy)}
            </Text>
            <Text style={styles.previewLabelSpaced}>Hari-H</Text>
            <Text style={styles.previewText}>
              {buildBody(previewExampleStart, 'h-0', notifCopy)}
            </Text>
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
              <ActivityIndicator color={colors.onAccent} />
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  infoText: {
    fontSize: 12,
    color: colors.muted,
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
    color: colors.subtle,
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
    backgroundColor: colors.chipFill,
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
    backgroundColor: colors.divider,
  },
  stepValueWide: {
    minWidth: 60,
    fontVariant: ['tabular-nums'],
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  modeRowPressed: {
    opacity: 0.7,
  },
  modeDot: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  modeDotActive: {
    borderColor: colors.accent,
  },
  modeDotInner: {
    width: 11,
    height: 11,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  modeInfo: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  modeHint: {
    fontSize: 11,
    color: colors.subtle,
    marginTop: 1,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.subtle,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  copyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  copyPill: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: 10,
    backgroundColor: colors.chipFill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  copyPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  copyPillPressed: {
    opacity: 0.75,
  },
  copyPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  copyPillTextActive: {
    color: colors.onAccent,
    fontWeight: '800',
  },
  previewCaption: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.faint,
    marginBottom: spacing.xs,
  },
  previewBox: {
    backgroundColor: colors.chipFill,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  previewLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.subtle,
  },
  previewLabelSpaced: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.subtle,
    marginTop: spacing.sm,
  },
  previewText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 2,
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
    color: colors.subtle,
    marginTop: 1,
  },
  testButton: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  testButtonPressed: {
    backgroundColor: colors.chipFill,
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
    color: colors.ok,
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
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dangerButtonPressed: {
    backgroundColor: colors.dangerPressed,
  },
  dangerButtonDisabled: {
    opacity: 0.6,
  },
  dangerButtonText: {
    color: colors.onAccent,
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
    color: colors.subtle,
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
}
