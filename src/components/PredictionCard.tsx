/**
 * PredictionCard — kartu prediksi haid berikutnya di beranda.
 *
 * `prediction: null` → empty state ("belum ada data — catat haid pertamamu").
 * Semua tanggal diformat lewat `formatID`; confidence diberi label ramah.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { formatID } from '../lib/dates';
import type { Prediction } from '../lib/predictions';

export interface PredictionCardProps {
  prediction: Prediction | null;
}

const CONFIDENCE_LABEL: Record<Prediction['confidence'], string> = {
  rendah: 'Keyakinan masih rendah',
  cukup: 'Keyakinan cukup',
  tinggi: 'Keyakinan tinggi',
};

function daysUntilLabel(daysUntil: number): string {
  if (daysUntil > 1) {
    return `${daysUntil} hari lagi`;
  }
  if (daysUntil === 1) {
    return 'besok diperkirakan';
  }
  if (daysUntil === 0) {
    return 'diperkirakan hari ini';
  }
  const late = Math.abs(daysUntil);
  return `${late} hari lewat`;
}

export function PredictionCard({ prediction }: PredictionCardProps) {
  if (!prediction) {
    return (
      <View style={styles.card}>
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>PREDIKSI HAID</Text>
        </View>
        <Text style={styles.emptyTitle}>Belum ada data, Bububb</Text>
        <Text style={styles.emptyBody}>
          Catat haid pertamamu dulu lewat tombol “+ Haid” — prediksi &
          pengingat akan muncul di sini setelahnya.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`Prediksi haid ${formatID(prediction.predictedStart)}`}
    >
      <View style={styles.eyebrowRow}>
        <Text style={styles.eyebrow}>PREDIKSI HAID</Text>
        <View style={styles.confidencePill}>
          <Text style={styles.confidenceText}>
            {CONFIDENCE_LABEL[prediction.confidence]}
          </Text>
        </View>
      </View>

      <Text style={styles.dateBig}>{formatID(prediction.predictedStart)}</Text>
      <Text style={styles.daysUntil}>
        {daysUntilLabel(prediction.daysUntil)} ♡
      </Text>

      <View style={styles.divider} />

      <View style={styles.factRow}>
        <Text style={styles.factIcon}>🌸</Text>
        <Text style={styles.factText}>
          Masa subur{' '}
          <Text style={styles.factStrong}>
            {formatID(prediction.fertileStart)} – {formatID(prediction.fertileEnd)}
          </Text>
        </Text>
      </View>
      <View style={styles.factRow}>
        <Text style={styles.factIcon}>🥚</Text>
        <Text style={styles.factText}>
          Ovulasi sekitar{' '}
          <Text style={styles.factStrong}>{formatID(prediction.ovulation)}</Text>
        </Text>
      </View>
      <View style={styles.factRow}>
        <Text style={styles.factIcon}>🗓️</Text>
        <Text style={styles.factText}>
          Berakhir sekitar{' '}
          <Text style={styles.factStrong}>{formatID(prediction.predictedEnd)}</Text>
        </Text>
      </View>

      <Text style={styles.disclaimer}>Perkiraan kalender, bukan kepastian medis.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FCE4EA',
    borderRadius: radius.xl,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.md,
    shadowColor: '#C46A82',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 5,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.roseDark,
  },
  confidencePill: {
    backgroundColor: colors.accentYellow,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5A3A00',
    letterSpacing: 0.3,
  },
  dateBig: {
    fontFamily: 'Georgia',
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 38,
  },
  daysUntil: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(196,106,130,0.28)',
    marginVertical: spacing.sm,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  factIcon: {
    fontSize: 14,
    width: 26,
  },
  factText: {
    fontSize: 13,
    color: '#5C3A44',
    flexShrink: 1,
  },
  factStrong: {
    fontWeight: '800',
    color: colors.ink,
  },
  disclaimer: {
    marginTop: spacing.sm,
    fontSize: 10,
    color: '#A87B88',
    fontStyle: 'italic',
  },
  emptyTitle: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6B4A55',
  },
});
