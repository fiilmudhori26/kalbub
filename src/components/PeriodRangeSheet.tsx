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

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, spacing } from '../theme';
import { formatID, parseISO, todayISO } from '../lib/dates';

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
  const [view, setView] = useState({ year: 2026, month: 11 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state setiap sheet dibuka.
  useEffect(() => {
    if (!visible) {
      return;
    }
    const preselect =
      initialDate && isValidISO(initialDate) ? initialDate : null;
    const anchor = preselect ?? todayISO();
    const parts = parseISO(anchor);
    setView({ year: parts.y, month: parts.m });
    setStart(preselect);
    setEnd(null);
    setSaving(false);
    setError(null);
  }, [visible, initialDate]);

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
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Gagal menyimpan. Coba lagi ya.'
      );
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
                  return (
                    <Pressable
                      key={cell.iso}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isStart || isEnd }}
                      accessibilityLabel={`${cell.day} ${MONTHS_ID[view.month - 1]}`}
                      onPress={() => handleDayPress(cell.iso)}
                      style={({ pressed }) => [
                        styles.dayCell,
                        inRange && styles.dayInRange,
                        pressed && styles.dayPressed,
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
                <ActivityIndicator color="#FFFFFF" size="small" />
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

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(74,44,52,0.45)',
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
    backgroundColor: 'rgba(74,44,52,0.18)',
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
    shadowColor: '#C46A82',
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
    backgroundColor: 'rgba(232,138,160,0.16)',
  },
  navPressed: {
    backgroundColor: 'rgba(232,138,160,0.32)',
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
    backgroundColor: 'rgba(255,93,143,0.18)',
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
    color: '#FFFFFF',
    fontWeight: '800',
  },
  errorText: {
    color: '#B3261E',
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
    backgroundColor: 'rgba(74,44,52,0.08)',
  },
  buttonGhostPressed: {
    backgroundColor: 'rgba(74,44,52,0.16)',
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
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
