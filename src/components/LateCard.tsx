/**
 * LateCard — kartu "Sudah datang, Bububb?" yang tampil di beranda saat
 * prediksi haid terlewat tanpa periode baru tercatat.
 *
 * Murni presentasional: logika addPeriod/rescheduleReminders ada di layar
 * beranda lewat callback `onSudah` / `onBelum`.
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../lib/useAppTheme';
import { formatID } from '../lib/dates';

export interface LateCardProps {
  /** Jumlah hari keterlambatan (dari `lateStatus`). */
  daysLate: number;
  /** Tanggal prediksi yang terlewat (`YYYY-MM-DD`). */
  predictedStart: string;
  onSudah: () => void;
  onBelum: () => void;
  /** true saat sedang menyimpan — tombol dinonaktifkan. */
  busy?: boolean;
}

export function LateCard({
  daysLate,
  predictedStart,
  onSudah,
  onBelum,
  busy = false,
}: LateCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card} accessibilityRole="none">
      <View style={styles.eyebrowRow}>
        <View style={styles.pulseDot} />
        <Text style={styles.eyebrow}>SIKLUS BARU?</Text>
      </View>

      <Text style={styles.title}>Sudah datang, Bububb?</Text>
      <Text style={styles.subtitle}>
        Perkiraan {formatID(predictedStart)} sudah lewat{' '}
        {daysLate > 0 ? `${daysLate} hari` : 'beberapa hari'}.
      </Text>

      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Belum"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onBelum}
          style={({ pressed }) => [
            styles.buttonGhost,
            pressed && styles.buttonGhostPressed,
            busy && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonGhostText}>Belum</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sudah"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onSudah}
          style={({ pressed }) => [
            styles.buttonPrimary,
            pressed && styles.buttonPrimaryPressed,
            busy && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonPrimaryText}>
            {busy ? 'Menyimpan…' : 'Sudah'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.calloutBg,
    borderRadius: radius.xl,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.md,
    shadowColor: colors.calloutShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accentYellow,
    borderWidth: 1.5,
    borderColor: colors.calloutShadow,
    marginRight: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.calloutText,
  },
  title: {
    fontFamily: 'Georgia',
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.calloutSubtext,
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonPrimaryPressed: {
    backgroundColor: colors.roseDark,
  },
  buttonPrimaryText: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  });
}
