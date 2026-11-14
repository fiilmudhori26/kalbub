/**
 * Placeholder — layar Catat dibuat di tugas berikutnya.
 */

import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../src/theme';

export default function CatatScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <Text style={styles.emoji}>✏️</Text>
      <Text style={styles.title}>Catat</Text>
      <Text style={styles.body}>
        Layar catatan harian akan segera hadir di sini, Bububb.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.krem,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emoji: {
    fontSize: 44,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: 'Georgia',
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: 13,
    color: '#A07080',
    textAlign: 'center',
  },
});
