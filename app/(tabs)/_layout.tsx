/**
 * Tab bar Kalbub — Kalender · Catat · Statistik · Atur.
 * Layar Catat/Statistik/Atur dibuat di tugas berikutnya; untuk saat ini
 * berisi placeholder ringan agar navigasi tetap berfungsi.
 */

import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { colors } from '../../src/theme';

function tabIcon(emoji: string) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return (
      <Text
        style={{
          fontSize: focused ? 22 : 19,
          opacity: focused ? 1 : 0.55,
        }}
      >
        {emoji}
      </Text>
    );
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.krem },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: '#B79AA3',
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: 'rgba(196,106,130,0.18)',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Kalender', tabBarIcon: tabIcon('🗓️') }}
      />
      <Tabs.Screen
        name="catat"
        options={{ title: 'Catat', tabBarIcon: tabIcon('✏️') }}
      />
      <Tabs.Screen
        name="statistik"
        options={{ title: 'Statistik', tabBarIcon: tabIcon('📊') }}
      />
      <Tabs.Screen
        name="atur"
        options={{ title: 'Atur', tabBarIcon: tabIcon('⚙️') }}
      />
    </Tabs>
  );
}
