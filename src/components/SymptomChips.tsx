/**
 * SymptomChips — multi-select chip gejala di layar Catat.
 *
 * Terkontrol: pemanggil memegang `selected`; `onToggle(gejala)` dipanggil
 * saat chip ditekan. Chip terpilih terisi rose lembut; tidak ada border
 * neo-brutalist — hanya fill dan bayangan halus.
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../lib/useAppTheme';

export const SYMPTOM_OPTIONS = [
  'Kram',
  'Nyeri payudara',
  'Sakit kepala',
  'Kembung',
  'Jerawat',
  'Lelah',
  'Mood swing',
  'Nyeri punggung',
] as const;

export interface SymptomChipsProps {
  selected: string[];
  onToggle: (symptom: string) => void;
}

export function SymptomChips({ selected, onToggle }: SymptomChipsProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      {SYMPTOM_OPTIONS.map((symptom) => {
        const active = selected.includes(symptom);
        return (
          <Pressable
            key={symptom}
            accessibilityRole="button"
            accessibilityLabel={symptom}
            accessibilityState={{ selected: active }}
            onPress={() => onToggle(symptom)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {symptom}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },
  chipActive: {
    backgroundColor: colors.rose,
    borderColor: colors.rose,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.onAccent,
    fontWeight: '700',
  },
  });
}
