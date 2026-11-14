/**
 * CalendarGrid — kisi kalender bulanan Kalbub.
 *
 * Menandai:
 * - hari haid (rentang periode tersimpan) → lingkaran rose terisi, teks putih
 * - hari prediksi haid                     → lingkaran kuning terisi, teks pekat
 * - hari ovulasi                           → lingkaran aksen #FF5D8F, teks putih
 * - masa subur (selain ovulasi)            → lingkaran pink lembut
 * - hari ini                               → cincin rose gelap
 *
 * Murni presentasional; daftar periode & prediksi datang dari props.
 * Ketuk hari memanggil `onDayPress(iso)`.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../lib/useAppTheme';
import { parseISO, todayISO } from '../lib/dates';
import type { Period } from '../lib/db';
import type { Prediction } from '../lib/predictions';

export interface CalendarGridProps {
  periods: Period[];
  prediction: Prediction | null;
  onDayPress?: (iso: string) => void;
  /** Override "hari ini" (untuk test/preview). */
  today?: string;
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

const WEEKDAY_LETTERS = ['S', 'S', 'R', 'K', 'J', 'S', 'M'] as const; // Sen…Min

interface GridCell {
  iso: string;
  day: number;
}

/** Susun minggu-minggu (Senin-pertama) berisi tanggal ISO; leading/trailing kosong = null. */
function buildWeeks(year: number, month: number): Array<Array<GridCell | null>> {
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Sen=0
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: Array<GridCell | null> = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(null);
  }
  const mm = String(month).padStart(2, '0');
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, '0');
    cells.push({ iso: `${year}-${mm}-${dd}`, day: d });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: Array<Array<GridCell | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

type DayMark = 'period' | 'predicted' | 'ovulation' | 'fertile' | 'normal';

function markFor(
  iso: string,
  periods: Period[],
  prediction: Prediction | null
): DayMark {
  for (const p of periods) {
    if (iso >= p.start && iso <= p.end) {
      return 'period';
    }
  }
  if (prediction) {
    if (iso >= prediction.predictedStart && iso <= prediction.predictedEnd) {
      return 'predicted';
    }
    if (iso === prediction.ovulation) {
      return 'ovulation';
    }
    if (iso >= prediction.fertileStart && iso <= prediction.fertileEnd) {
      return 'fertile';
    }
  }
  return 'normal';
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function CalendarGrid({
  periods,
  prediction,
  onDayPress,
  today,
}: CalendarGridProps) {
  const todayStr = useMemo(() => today ?? todayISO(), [today]);
  const todayParts = useMemo(() => parseISO(todayStr), [todayStr]);
  const [view, setView] = useState({ year: todayParts.y, month: todayParts.m });
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const weeks = useMemo(
    () => buildWeeks(view.year, view.month),
    [view.year, view.month]
  );

  const isCurrentMonth =
    view.year === todayParts.y && view.month === todayParts.m;

  return (
    <View style={styles.card}>
      {/* Header bulan */}
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bulan sebelumnya"
          onPress={() => setView((v) => prevMonth(v.year, v.month))}
          style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
          hitSlop={8}
        >
          <Text style={styles.navChevron}>‹</Text>
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={styles.monthTitle}>
            {MONTHS_ID[view.month - 1]} {view.year}
          </Text>
          {!isCurrentMonth && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kembali ke bulan ini"
              onPress={() => setView({ year: todayParts.y, month: todayParts.m })}
              hitSlop={6}
            >
              <Text style={styles.todayLink}>kembali ke bulan ini</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bulan berikutnya"
          onPress={() => setView((v) => nextMonth(v.year, v.month))}
          style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
          hitSlop={8}
        >
          <Text style={styles.navChevron}>›</Text>
        </Pressable>
      </View>

      {/* Huruf hari (Sen…Min) */}
      <View style={styles.weekdayRow}>
        {WEEKDAY_LETTERS.map((letter, index) => (
          <View key={`wd-${index}`} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{letter}</Text>
          </View>
        ))}
      </View>

      {/* Minggu-minggu */}
      {weeks.map((week, weekIndex) => (
        <View key={`w-${weekIndex}`} style={styles.weekRow}>
          {week.map((cell, dayIndex) => {
            if (!cell) {
              return <View key={`empty-${dayIndex}`} style={styles.dayCell} />;
            }
            const mark = markFor(cell.iso, periods, prediction);
            const isToday = cell.iso === todayStr;
            const markStyle =
              mark === 'period'
                ? styles.markPeriod
                : mark === 'predicted'
                  ? styles.markPredicted
                  : mark === 'ovulation'
                    ? styles.markOvulation
                    : mark === 'fertile'
                      ? styles.markFertile
                      : null;
            const textStyle =
              mark === 'period' || mark === 'ovulation'
                ? styles.dayTextOnSolid
                : mark === 'predicted'
                  ? styles.dayTextOnYellow
                  : mark === 'fertile'
                    ? styles.dayTextFertile
                    : styles.dayTextNormal;

            return (
              <Pressable
                key={cell.iso}
                accessibilityRole="button"
                accessibilityLabel={`${cell.day} ${MONTHS_ID[view.month - 1]}${
                  mark === 'period'
                    ? ', hari haid'
                    : mark === 'predicted'
                      ? ', perkiraan haid'
                      : mark === 'ovulation'
                        ? ', perkiraan ovulasi'
                        : mark === 'fertile'
                          ? ', masa subur'
                          : ''
                }${isToday ? ', hari ini' : ''}`}
                onPress={() => onDayPress?.(cell.iso)}
                style={({ pressed }) => [
                  styles.dayCell,
                  pressed && styles.dayPressed,
                ]}
              >
                <View
                  style={[
                    styles.dayCircle,
                    markStyle,
                    isToday && styles.todayRing,
                  ]}
                >
                  <Text style={[styles.dayText, textStyle]}>{cell.day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CIRCLE = 40;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginHorizontal: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  navButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navFill,
  },
  navPressed: {
    backgroundColor: colors.navFillPressed,
  },
  navChevron: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.roseDark,
    fontWeight: '700',
    marginTop: -2,
  },
  titleWrap: {
    alignItems: 'center',
  },
  monthTitle: {
    fontFamily: 'Georgia',
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.4,
  },
  todayLink: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 2,
    letterSpacing: 0.4,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 11,
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
  },
  dayPressed: {
    opacity: 0.6,
  },
  dayCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markPeriod: {
    backgroundColor: colors.rose,
  },
  markPredicted: {
    backgroundColor: colors.accentYellow,
  },
  markOvulation: {
    backgroundColor: colors.accent,
  },
  markFertile: {
    backgroundColor: colors.fertileFill,
  },
  todayRing: {
    borderWidth: 2,
    borderColor: colors.roseDark,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dayTextNormal: {
    color: colors.ink,
  },
  dayTextOnSolid: {
    color: colors.onAccent,
    fontWeight: '800',
  },
  dayTextOnYellow: {
    color: colors.onYellow,
    fontWeight: '800',
  },
  dayTextFertile: {
    color: colors.roseDark,
    fontWeight: '700',
  },
  });
}
