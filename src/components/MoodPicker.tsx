/**
 * MoodPicker — lima pilihan suasana hati berlabel Indonesia + emoji.
 *
 * Terkontrol: `value` adalah label (mis. 'Senang') atau `null`; menekan
 * opsi yang sedang aktif membatalkannya (kembali ke `null`). Terpilih
 * ber-highlight kuning ceria; tidak ada border neo-brutalist.
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../lib/useAppTheme';

export const MOOD_OPTIONS = [
  { value: 'Senang', emoji: '😊' },
  { value: 'Tenang', emoji: '😌' },
  { value: 'Sedih', emoji: '😢' },
  { value: 'Mood swing', emoji: '🎭' },
  { value: 'Mudah marah', emoji: '😤' },
] as const;

export interface MoodPickerProps {
  value: string | null;
  onChange: (mood: string | null) => void;
}

export function MoodPicker({ value, onChange }: MoodPickerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {MOOD_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={`Suasana hati ${option.value}`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(active ? null : option.value)}
            style={({ pressed }) => [
              styles.option,
              active && styles.optionActive,
              pressed && styles.optionPressed,
            ]}
          >
            <Text style={styles.emoji}>{option.emoji}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>
              {option.value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: colors.borderInput,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },
  optionActive: {
    backgroundColor: colors.accentYellow,
    borderColor: colors.accentYellow,
  },
  optionPressed: {
    opacity: 0.75,
  },
  emoji: {
    fontSize: 24,
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.onYellow,
    fontWeight: '800',
  },
  });
}
