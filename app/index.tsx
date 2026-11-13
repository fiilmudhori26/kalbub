import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../src/theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>🌼</Text>
      </View>
      <Text style={styles.title}>Hai, Bububb</Text>
      <Text style={styles.subtitle}>Kalbub — kalender haidmu</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.krem,
    padding: spacing.lg,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.accentYellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  badgeText: {
    fontSize: 48,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.roseDark,
  },
});
