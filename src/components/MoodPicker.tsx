/**
 * MoodPicker — lima pilihan suasana hati berlabel Indonesia + emoji.
 *
 * Terkontrol: `value` adalah label (mis. 'Senang') atau `null`; menekan
 * opsi yang sedang aktif membatalkannya (kembali ke `null`). Terpilih
 * ber-highlight kuning ceria; tidak ada border neo-brutalist.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';

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

const styles = StyleSheet.create({
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
    borderColor: 'rgba(196,106,130,0.3)',
    shadowColor: '#C46A82',
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
    color: '#6B4A55',
    textAlign: 'center',
  },
  labelActive: {
    color: '#5A3A00',
    fontWeight: '800',
  },
});
