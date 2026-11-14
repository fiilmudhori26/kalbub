/**
 * Layar Catat — catatan harian Kalbub.
 *
 * Alur:
 * - Tanggal aktif dari state (default: hari ini; bisa di-preselect lewat
 *   query param `?date=YYYY-MM-DD` — hanya diterima bila tidak setelah hari ini).
 *   Navigasi −/+ hari di header + strip 14 hari terakhir; tombol "+" nonaktif
 *   untuk tanggal setelah hari ini. Pindah tanggal diblokir saat saving;
 *   bila form belum disimpan (dirty), tampil Alert konfirmasi dulu.
 * - Log existing untuk tanggal aktif dimuat otomatis saat mount/ganti tanggal.
 * - Sections: aliran (5 pilihan), gejala (multi-select chips), suasana hati
 *   (5 opsi), nyeri 0–10 (stepper), catatan bebas.
 * - Simpan eksplisit lewat "Simpan hari ini ♡" → upsertDailyLog → tombol
 *   berubah jadi "Tersimpan ♡" sebentar (inline check state).
 */

import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../src/theme';
import {
  getDailyLog,
  upsertDailyLog,
  type DailyLog,
  type FlowLevel,
} from '../../src/lib/db';
import {
  addDaysISO,
  diffDaysISO,
  formatID,
  parseISO,
  todayISO,
  weekdayID,
} from '../../src/lib/dates';
import { SymptomChips } from '../../src/components/SymptomChips';
import { MoodPicker } from '../../src/components/MoodPicker';

const FLOW_OPTIONS: { value: FlowLevel; label: string }[] = [
  { value: 'none', label: 'Tidak ada' },
  { value: 'spotting', label: 'Spotting' },
  { value: 'light', label: 'Ringan' },
  { value: 'medium', label: 'Sedang' },
  { value: 'heavy', label: 'Berat' },
];

const STRIP_DAYS = 14;

function isValidISO(value: string): boolean {
  try {
    parseISO(value);
    return true;
  } catch {
    return false;
  }
}

function clampPain(pain: number): number {
  if (!Number.isFinite(pain)) {
    return 0;
  }
  return Math.min(10, Math.max(0, Math.round(pain)));
}

function painLabel(pain: number): string {
  if (pain === 0) {
    return 'Tidak nyeri sama sekali';
  }
  if (pain <= 3) {
    return 'Ringan, masih nyaman';
  }
  if (pain <= 6) {
    return 'Cukup terasa';
  }
  if (pain <= 9) {
    return 'Berat, butuh istirahat';
  }
  return 'Sangat berat';
}

function relativeDayLabel(iso: string, today: string): string | null {
  const diff = diffDaysISO(iso, today);
  if (diff === 0) {
    return 'Hari ini';
  }
  if (diff === 1) {
    return 'Kemarin';
  }
  return null;
}

/** Perbandingan gejala sebagai himpunan (urutan penekanan tidak penting). */
function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setA = new Set(a);
  return b.every((s) => setA.has(s));
}

export default function CatatScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const [today] = useState(() => todayISO());
  const preselect = useMemo(() => {
    const raw = Array.isArray(params.date) ? params.date[0] : params.date;
    if (!raw || !isValidISO(raw)) {
      return null;
    }
    // Tolak tanggal di masa depan — jatuh kembali ke hari ini.
    return raw > today ? null : raw;
  }, [params.date, today]);

  const [date, setDate] = useState<string>(() => preselect ?? today);
  const dateRef = React.useRef(date);
  dateRef.current = date;

  const [loadingLog, setLoadingLog] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [flow, setFlow] = useState<FlowLevel>('none');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [mood, setMood] = useState<string | null>(null);
  const [pain, setPain] = useState(0);
  const [note, setNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Snapshot form terakhir yang dimuat dari db (atau tersimpan) per tanggal —
  // dipakai untuk dirty-check saat pindah tanggal.
  const [baseline, setBaseline] = useState<DailyLog | null>(null);

  // Ikuti perubahan query param (mis. dibuka ulang dengan ?date=...).
  useEffect(() => {
    if (preselect) {
      setDate(preselect);
    }
  }, [preselect]);

  // Muat log existing setiap tanggal aktif berubah.
  useEffect(() => {
    let cancelled = false;
    setLoadingLog(true);
    setLoadError(null);
    setSaved(false);
    setSaveError(null);
    setBaseline(null);
    getDailyLog(date)
      .then((log) => {
        if (cancelled) {
          return;
        }
        const loaded: DailyLog = {
          date,
          flow: log?.flow ?? 'none',
          symptoms: log?.symptoms ?? [],
          mood: log?.mood ?? null,
          pain: log?.pain ?? 0,
          note: log?.note ?? '',
        };
        setFlow(loaded.flow);
        setSymptoms(loaded.symptoms);
        setMood(loaded.mood);
        setPain(loaded.pain);
        setNote(loaded.note);
        setBaseline(loaded);
      })
      .catch(() => {
        if (!cancelled) {
          setBaseline(null);
          setLoadError('Gagal memuat catatan tanggal ini. Coba lagi ya.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLog(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, reloadToken]);

  // Sembunyikan status "Tersimpan ♡" setelah sebentar.
  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  // Perbandingan form vs baseline — dipakai dirty-check saat pindah tanggal.
  const isDirty = useMemo(() => {
    if (!baseline) {
      return false;
    }
    return (
      baseline.flow !== flow ||
      baseline.mood !== mood ||
      baseline.pain !== pain ||
      baseline.note !== note.trim() ||
      !sameStringSet(baseline.symptoms, symptoms)
    );
  }, [baseline, flow, symptoms, mood, pain, note]);

  // Reset status "Tersimpan" + pesan error setiap kali form diedit setelah save.
  useEffect(() => {
    setSaved(false);
    setSaveError(null);
  }, [flow, symptoms, mood, pain, note]);

  // Pindah tanggal: diblokir saat saving; bila form dirty, minta konfirmasi
  // dulu (Alert) dan baru pindah bila pengguna memilih membuang perubahan.
  const requestDateChange = useCallback(
    (target: string) => {
      if (saving || target === date) {
        return;
      }
      if (isDirty) {
        Alert.alert(
          'Perubahan belum disimpan',
          'Pindah tanggal dan buang perubahan?',
          [
            { text: 'Tetap di sini', style: 'cancel' },
            {
              text: 'Buang & pindah',
              style: 'destructive',
              onPress: () => setDate(target),
            },
          ]
        );
        return;
      }
      setDate(target);
    },
    [saving, date, isDirty]
  );

  const stripDates = useMemo(
    () => Array.from({ length: STRIP_DAYS }, (_, i) => addDaysISO(today, i - (STRIP_DAYS - 1))),
    [today]
  );

  const toggleSymptom = useCallback((symptom: string) => {
    setSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]
    );
  }, []);

  const shiftDate = useCallback(
    (delta: number) => {
      const next = addDaysISO(date, delta);
      // Jangan izinkan tanggal setelah hari ini.
      if (next > today) {
        return;
      }
      requestDateChange(next);
    },
    [date, today, requestDateChange]
  );

  const isToday = date === today;
  const relLabel = relativeDayLabel(date, today);
  const canGoNext = date < today;

  const handleSave = useCallback(async () => {
    // Tangkap tanggal aktif saat save mulai — dipakai guard race bila
    // tanggal berubah sebelum upsert selesai.
    const saveDate = date;
    const log: DailyLog = {
      date: saveDate,
      flow,
      symptoms,
      mood,
      pain: clampPain(pain),
      note: note.trim(),
    };
    setSaving(true);
    setSaveError(null);
    try {
      await upsertDailyLog(log);
      // Jangan tampilkan "Tersimpan ♡" bila tanggal aktif sudah ganti
      // sejak save dimulai.
      if (dateRef.current === saveDate) {
        setBaseline(log);
        setSaved(true);
      }
    } catch {
      if (dateRef.current === saveDate) {
        setSaveError('Gagal menyimpan. Coba lagi ya, Bububb.');
      }
    } finally {
      setSaving(false);
    }
  }, [date, flow, symptoms, mood, pain, note]);

  if (loadingLog) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.roseDark} />
        <Text style={styles.loadingText}>Memuat catatan…</Text>
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
          onPress={() => setReloadToken((t) => t + 1)}
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
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>CATATAN HARIAN</Text>
        <Text style={styles.title}>Hari ini gimana, Bububb?</Text>

        {/* Pemilih tanggal */}
        <View style={styles.dateCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hari sebelumnya"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={() => shiftDate(-1)}
            style={({ pressed }) => [
              styles.dateNavButton,
              saving && styles.dateNavButtonDisabled,
              pressed && styles.dateNavButtonPressed,
            ]}
          >
            <Text style={styles.dateNavText}>‹</Text>
          </Pressable>
          <View style={styles.dateCenter}>
            <Text style={styles.dateWeekday}>{weekdayID(date)}</Text>
            <Text style={styles.dateBig}>{formatID(date)}</Text>
            {relLabel ? <Text style={styles.dateRel}>{relLabel} ♡</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hari berikutnya"
            accessibilityState={{ disabled: !canGoNext || saving }}
            disabled={!canGoNext || saving}
            onPress={() => shiftDate(1)}
            style={({ pressed }) => [
              styles.dateNavButton,
              (!canGoNext || saving) && styles.dateNavButtonDisabled,
              pressed && styles.dateNavButtonPressed,
            ]}
          >
            <Text style={styles.dateNavText}>›</Text>
          </Pressable>
        </View>

        {/* Strip 14 hari terakhir */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {stripDates.map((iso) => {
            const active = iso === date;
            const { d } = parseISO(iso);
            return (
              <Pressable
                key={iso}
                accessibilityRole="button"
                accessibilityLabel={`Pilih ${formatID(iso)}`}
                accessibilityState={{ selected: active, disabled: saving }}
                disabled={saving}
                onPress={() => requestDateChange(iso)}
                style={({ pressed }) => [
                  styles.stripPill,
                  active && styles.stripPillActive,
                  saving && styles.stripPillDisabled,
                  pressed && styles.stripPillPressed,
                ]}
              >
                <Text style={[styles.stripWeekday, active && styles.stripTextActive]}>
                  {weekdayID(iso).slice(0, 3)}
                </Text>
                <Text style={[styles.stripDay, active && styles.stripTextActive]}>
                  {d}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Aliran */}
        <Text style={styles.sectionLabel}>Aliran</Text>
        <View style={styles.flowRow}>
          {FLOW_OPTIONS.map((option) => {
            const active = flow === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={`Aliran ${option.label}`}
                accessibilityState={{ selected: active }}
                onPress={() => setFlow(option.value)}
                style={({ pressed }) => [
                  styles.flowPill,
                  active && styles.flowPillActive,
                  pressed && styles.flowPillPressed,
                ]}
              >
                <Text style={[styles.flowText, active && styles.flowTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Gejala */}
        <Text style={styles.sectionLabel}>Gejala</Text>
        <SymptomChips selected={symptoms} onToggle={toggleSymptom} />

        {/* Suasana hati */}
        <Text style={styles.sectionLabel}>Suasana hati</Text>
        <MoodPicker value={mood} onChange={setMood} />

        {/* Nyeri */}
        <Text style={styles.sectionLabel}>Nyeri haid</Text>
        <View style={styles.painCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kurangi nyeri"
            accessibilityState={{ disabled: pain === 0 }}
            disabled={pain === 0}
            onPress={() => setPain((p) => clampPain(p - 1))}
            style={({ pressed }) => [
              styles.painStepper,
              pain === 0 && styles.painStepperDisabled,
              pressed && styles.painStepperPressed,
            ]}
          >
            <Text style={styles.painStepperText}>−</Text>
          </Pressable>
          <View style={styles.painCenter}>
            <Text
              style={[
                styles.painNumber,
                pain >= 7 && styles.painNumberHigh,
                pain === 0 && styles.painNumberZero,
              ]}
              accessibilityLabel={`Nyeri ${pain} dari 10`}
            >
              {pain}
            </Text>
            <Text style={styles.painMax}>dari 10</Text>
            <Text style={styles.painCaption}>{painLabel(pain)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tambah nyeri"
            accessibilityState={{ disabled: pain === 10 }}
            disabled={pain === 10}
            onPress={() => setPain((p) => clampPain(p + 1))}
            style={({ pressed }) => [
              styles.painStepper,
              pain === 10 && styles.painStepperDisabled,
              pressed && styles.painStepperPressed,
            ]}
          >
            <Text style={styles.painStepperText}>+</Text>
          </Pressable>
        </View>

        {/* Catatan bebas */}
        <Text style={styles.sectionLabel}>Catatan bebas</Text>
        <TextInput
          accessibilityLabel="Catatan bebas"
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Tulis apa pun yang ingin kamu ingat hari ini…"
          placeholderTextColor="#B79AA3"
          multiline
          textAlignVertical="top"
        />

        {saveError ? (
          <Text style={styles.saveError}>{saveError}</Text>
        ) : null}

        {/* Simpan */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isToday ? 'Simpan hari ini' : 'Simpan'}
          disabled={saving}
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveButton,
            saved && styles.saveButtonSaved,
            pressed && !saving && styles.saveButtonPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.saveButtonText, saved && styles.saveButtonTextSaved]}>
              {saved ? 'Tersimpan ♡' : isToday ? 'Simpan hari ini ♡' : 'Simpan ♡'}
            </Text>
          )}
        </Pressable>

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
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    shadowColor: '#C46A82',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  dateNavButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: '#FCE4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavButtonPressed: {
    opacity: 0.7,
  },
  dateNavButtonDisabled: {
    opacity: 0.35,
  },
  dateNavText: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.roseDark,
    lineHeight: 28,
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
  },
  dateWeekday: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#A07080',
    textTransform: 'uppercase',
  },
  dateBig: {
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 1,
  },
  dateRel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 1,
  },
  strip: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
    marginBottom: spacing.sm,
  },
  stripPill: {
    width: 46,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(196,106,130,0.3)',
  },
  stripPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  stripPillPressed: {
    opacity: 0.75,
  },
  stripPillDisabled: {
    opacity: 0.5,
  },
  stripWeekday: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#A07080',
    textTransform: 'uppercase',
  },
  stripDay: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 1,
  },
  stripTextActive: {
    color: '#FFFFFF',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.roseDark,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  flowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flowPill: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(196,106,130,0.35)',
  },
  flowPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  flowPillPressed: {
    opacity: 0.75,
  },
  flowText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B4A55',
  },
  flowTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  painCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    shadowColor: '#C46A82',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  painStepper: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: '#FCE4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  painStepperPressed: {
    opacity: 0.7,
  },
  painStepperDisabled: {
    opacity: 0.35,
  },
  painStepperText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.roseDark,
    lineHeight: 30,
  },
  painCenter: {
    alignItems: 'center',
    flex: 1,
  },
  painNumber: {
    fontFamily: 'Georgia',
    fontSize: 44,
    fontWeight: '700',
    color: colors.roseDark,
    lineHeight: 48,
  },
  painNumberHigh: {
    color: colors.accent,
  },
  painNumberZero: {
    color: '#B79AA3',
  },
  painMax: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A07080',
    letterSpacing: 0.5,
  },
  painCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B4A55',
    marginTop: 2,
    textAlign: 'center',
  },
  noteInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(196,106,130,0.35)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 96,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  saveError: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: '600',
    color: colors.roseDark,
    textAlign: 'center',
  },
  saveButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  saveButtonPressed: {
    backgroundColor: colors.roseDark,
  },
  saveButtonSaved: {
    backgroundColor: colors.accentYellow,
    shadowColor: colors.accentYellow,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  saveButtonTextSaved: {
    color: '#5A3A00',
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
