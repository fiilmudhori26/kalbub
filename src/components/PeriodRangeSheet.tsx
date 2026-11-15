/**
 * PeriodRangeSheet — modal bottom-sheet untuk mencatat rentang haid.
 *
 * Mode `range` (default): judul "Haid mulai kapan, selesai kapan?" — ketuk
 * tanggal mulai, lalu tanggal selesai di kisi kalender kecil di dalam sheet.
 * Mode `single`: hanya mulai (dipakai alur "Sudah datang, Bububb?" — tanggal
 * selesai dihitung pemanggil dari rata-rata durasi haid).
 *
 * Sheet bersifat terkontrol: penyimpanan (addPeriod + rescheduleReminders)
 * dilakukan pemanggil lewat `onSubmit(start, end)`. Bila `onSubmit` melempar,
 * pesan error ditampilkan di dalam sheet (Bahasa Indonesia) dan sheet tetap
 * terbuka. `end === start` pada mode single.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { radius, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../lib/useAppTheme';
import { formatID, parseISO, todayISO } from '../lib/dates';
import { OverlappingPeriodError } from '../lib/db';

/** Pesan error yang aman ditampilkan ke pengguna — pesan native SQLite tidak pernah lolos. */
function friendlySaveError(err: unknown): string {
  if (err instanceof OverlappingPeriodError) {
    return err.message; // sudah Bahasa Indonesia & ramah
  }
  if (
    err instanceof Error &&
    err.message &&
    !/sqlite|SQL|native|database|constraint/i.test(err.message)
  ) {
    // Error validasi buatan sendiri (validateRange/parseISO) memang Bahasa Indonesia.
    return err.message;
  }
  return 'Gagal menyimpan haidmu. Coba lagi ya.';
}

export interface PeriodRangeSheetProps {
  visible: boolean;
  mode?: 'range' | 'single';
  /** Tanggal yang langsung dipilih saat sheet dibuka (valid `YYYY-MM-DD`). */
  initialDate?: string | null;
  onClose: () => void;
  onSubmit: (start: string, end: string) => Promise<void>;
}

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const WEEKDAY_LETTERS = ['S', 'S', 'R', 'K', 'J', 'S', 'M'] as const;

interface DayCell {
  iso: string;
  day: number;
}

function buildWeeks(year: number, month: number): Array<Array<DayCell | null>> {
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: Array<DayCell | null> = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(null);
  }
  const mm = String(month).padStart(2, '0');
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: `${year}-${mm}-${String(d).padStart(2, '0')}`, day: d });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: Array<Array<DayCell | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function prevMonth(y: number, m: number) {
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

function nextMonth(y: number, m: number) {
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

function isValidISO(value: string): boolean {
  try {
    parseISO(value);
    return true;
  } catch {
    return false;
  }
}

export function PeriodRangeSheet({
  visible,
  mode = 'range',
  initialDate,
  onClose,
  onSubmit,
}: PeriodRangeSheetProps) {
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [view, setView] = useState(() => {
    const parts = parseISO(todayISO());
    return { year: parts.y, month: parts.m };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Reset state SECARA SINKRON saat sheet membuka/menutup (adjust-state-
  // during-render), bukan setelah paint — tidak ada frame dengan state basi.
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    const preselect =
      visible && initialDate && isValidISO(initialDate) ? initialDate : null;
    const parts = parseISO(preselect ?? todayISO());
    setView({ year: parts.y, month: parts.m });
    setStart(preselect);
    setEnd(null);
    setSaving(false);
    setError(null);
  }

  const weeks = useMemo(
    () => buildWeeks(view.year, view.month),
    [view.year, view.month]
  );

  const todayStr = todayISO();
  const complete = start !== null && (mode === 'single' || end !== null);

  const handleDayPress = (iso: string) => {
    if (saving) {
      return;
    }
    // Tanggal masa depan tidak boleh dipilih sebagai hari haid.
    if (iso > todayStr) {
      return;
    }
    setError(null);
    if (mode === 'single') {
      setStart(iso);
      return;
    }
    if (!start || (start && end)) {
      setStart(iso);
      setEnd(null);
      return;
    }
    if (iso < start) {
      setStart(iso);
      return;
    }
    setEnd(iso);
  };

  const handleSave = async () => {
    if (!start || !complete || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(start, mode === 'single' ? start : (end as string));
      // Berhasil — pastikan sheet bersih untuk pembukaan berikutnya.
      setSaving(false);
    } catch (err) {
      setError(friendlySaveError(err));
      setSaving(false);
    }
  };

  const title =
    mode === 'single'
      ? 'Haid mulai kapan, Bububb?'
      : 'Haid mulai kapan, selesai kapan?';
  const subtitle =
    mode === 'single'
      ? 'Ketuk tanggal mulai haidmu yang sebenarnya.'
      : 'Ketuk tanggal mulai dulu, lalu tanggal selesai.';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!saving) {
          onClose();
        }
      }}
    >
      <View style={styles.backdropWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup"
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!saving) {
              onClose();
            }
          }}
        />
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Ringkasan pilihan */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryLabel}>MULAI</Text>
              <Text style={styles.summaryValue}>
                {start ? formatID(start) : '—'}
              </Text>
            </View>
            {mode === 'range' && (
              <>
                <Text style={styles.summaryArrow}>→</Text>
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryLabel}>SELESAI</Text>
                  <Text style={styles.summaryValue}>
                    {end ? formatID(end) : '—'}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Kisi bulan */}
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bulan sebelumnya"
              onPress={() => setView((v) => prevMonth(v.year, v.month))}
              style={({ pressed }) => [
                styles.navButton,
                pressed && styles.navPressed,
              ]}
              hitSlop={8}
            >
              <Text style={styles.navChevron}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {MONTHS_ID[view.month - 1]} {view.year}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bulan berikutnya"
              onPress={() => setView((v) => nextMonth(v.year, v.month))}
              style={({ pressed }) => [
                styles.navButton,
                pressed && styles.navPressed,
              ]}
              hitSlop={8}
            >
              <Text style={styles.navChevron}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LETTERS.map((letter, index) => (
              <View key={`wd-${index}`} style={styles.weekdayCell}>
                <Text style={styles.weekdayText}>{letter}</Text>
              </View>
            ))}
          </View>

          <View>
            {weeks.map((week, weekIndex) => (
              <View key={`w-${weekIndex}`} style={styles.weekRow}>
                {week.map((cell, dayIndex) => {
                  if (!cell) {
                    return <View key={`empty-${dayIndex}`} style={styles.dayCell} />;
                  }
                  const isStart = cell.iso === start;
                  const isEnd = cell.iso === end;
                  const inRange =
                    start !== null && end !== null
                      ? cell.iso > start && cell.iso < end
                      : false;
                  const isToday = cell.iso === todayStr;
                  const isFuture = cell.iso > todayStr;
                  return (
                    <Pressable
                      key={cell.iso}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: isStart || isEnd,
                        disabled: isFuture,
                      }}
                      accessibilityLabel={`${cell.day} ${MONTHS_ID[view.month - 1]}${
                        isFuture ? ', tidak tersedia' : ''
                      }`}
                      disabled={isFuture}
                      onPress={() => handleDayPress(cell.iso)}
                      style={({ pressed }) => [
                        styles.dayCell,
                        inRange && styles.dayInRange,
                        pressed && !isFuture && styles.dayPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          (isStart || isEnd) && styles.dayEndpoint,
                          isToday && !(isStart || isEnd) && styles.todayRing,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            (isStart || isEnd) && styles.dayTextEndpoint,
                            isFuture && styles.dayTextFuture,
                          ]}
                        >
                          {cell.day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Aksi */}
          <View style={styles.footerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Batal"
              disabled={saving}
              onPress={onClose}
              style={({ pressed }) => [
                styles.buttonGhost,
                pressed && styles.buttonGhostPressed,
                saving && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.buttonGhostText}>Batal</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Simpan"
              accessibilityState={{ disabled: !complete || saving }}
              disabled={!complete || saving}
              onPress={handleSave}
              style={({ pressed }) => [
                styles.buttonPrimary,
                (!complete || saving) && styles.buttonDisabled,
                pressed && complete && !saving && styles.buttonPrimaryPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.buttonPrimaryText}>Simpan</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.backdrop,
  },
  sheet: {
    backgroundColor: colors.krem,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: '92%',
  },
  dragHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.dragHandle,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: 'Georgia',
    fontSize: 21,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: colors.roseDark,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryChip: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 118,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.roseDark,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 2,
  },
  summaryArrow: {
    fontSize: 16,
    color: colors.roseDark,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navFill,
  },
  navPressed: {
    backgroundColor: colors.navFillPressed,
  },
  navChevron: {
    fontSize: 20,
    lineHeight: 22,
    color: colors.roseDark,
    fontWeight: '700',
  },
  monthTitle: {
    fontFamily: 'Georgia',
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
  },
  weekdayText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.roseDark,
    letterSpacing: 1,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  dayInRange: {
    backgroundColor: colors.fertileFill,
  },
  dayPressed: {
    opacity: 0.6,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayEndpoint: {
    backgroundColor: colors.accent,
  },
  todayRing: {
    borderWidth: 1.5,
    borderColor: colors.roseDark,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  dayTextEndpoint: {
    color: colors.onAccentDark,
    fontWeight: '800',
  },
  dayTextFuture: {
    color: colors.futureDay,
    fontWeight: '500',
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  buttonGhost: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.ghostFill,
  },
  buttonGhostPressed: {
    backgroundColor: colors.ghostFillPressed,
  },
  buttonGhostText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 15,
  },
  buttonPrimary: {
    flex: 1.4,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  buttonPrimaryPressed: {
    backgroundColor: colors.roseDark,
  },
  buttonPrimaryText: {
    color: colors.onAccentDark,
    fontWeight: '800',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  });
}
