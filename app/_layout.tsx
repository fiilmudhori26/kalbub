/**
 * Root layout Kalbub — gerbang onboarding.
 *
 * Bila `onboardingDone` belum di-set ke 'true' di settings SAAT APP DIBUKA,
 * pengguna diarahkan ke /onboarding. Pengecekan hanya sekali saat mount:
 * sesi onboarding itu sendiri yang me-replace ke '/' saat selesai, jadi
 * gate tidak boleh menebak-nebak lagi di tengah sesi (kalau tidak, pengguna
 * akan mental kembali ke /onboarding tepat setelah selesai).
 *
 * Splash screen disembunyikan hanya setelah status gate diketahui supaya
 * tidak ada flash layar yang salah. Bila pembacaan settings gagal,
 * dianggap selesai (fail-open) agar pengguna tidak terperangkap.
 *
 * Setelah "Reset semua data" di Atur, settings terhapus — pada pembukaan
 * BERIKUTNYA gate aktif lagi dan onboarding tampil kembali (memang
 * seharusnya, karena seluruh data haid ikut terhapus).
 */

import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';

import { colors } from '../src/theme';
import { getSetting } from '../src/lib/db';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // Cek sekali saat mount — lihat catatan di atas mengapa bukan per-navigasi.
  useEffect(() => {
    let mounted = true;
    getSetting('onboardingDone')
      .then((value) => {
        if (mounted) {
          setOnboardingDone(value === 'true');
        }
      })
      .catch(() => {
        if (mounted) {
          setOnboardingDone(true);
        }
      });
    // Hanya saat mount — lihat catatan di atas mengapa bukan per-navigasi.
    return () => {
      mounted = false;
    };
  }, []);

  // Sembunyikan splash + putuskan redirect setelah status gate diketahui.
  useEffect(() => {
    if (onboardingDone === null) {
      return;
    }
    SplashScreen.hideAsync().catch(() => {});
    const inOnboarding = segments[0] === 'onboarding';
    if (!onboardingDone && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboardingDone && inOnboarding) {
      router.replace('/');
    }
  }, [onboardingDone]);

  // Layar kosong (splash masih tampil) sampai gate diketahui.
  if (onboardingDone === null) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.krem },
      }}
    />
  );
}
