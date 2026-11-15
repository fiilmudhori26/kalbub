/**
 * useAppTheme — hook tema Kalbub (terang/gelap/ikut sistem).
 *
 * Menyimpan `themeMode` ('system' | 'light' | 'dark', bawaan 'system')
 * sebagai string di settings. Teks gelap aktif bila themeMode === 'dark',
 * atau 'system' dan skema sistem gelap.
 *
 * Desain:
 * - Nilai settings dibaca SEKALI saat mount dan SETIAP layar kembali fokus
 *   (lewat useFocusEffect). Di luar navigation context (mis. test
 *   react-test-renderer) focus-read diam-diam dilewati — mount-read &
 *   langganan global tetap bekerja.
 * - `setThemeMode` menulis settings + memperbarui SATU cache modul &
 *   memberi tahu semua instance hook yang sedang hidup, jadi pergantian
 *   tema langsung berlaku tanpa menunggu tab dibuka lagi.
 */

import { useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { colors as lightColors, darkColors, type ThemeColors } from '../theme';
import { getSetting, setSetting } from './db';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_MODE_KEY = 'themeMode';

function parseThemeMode(raw: string | null): ThemeMode {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

// Cache modul + daftar pelanggan — supaya setThemeMode langsung terlihat
// di seluruh layar/komponen yang ter-mount.
let cachedMode: ThemeMode | null = null;
type Listener = (mode: ThemeMode) => void;
const listeners = new Set<Listener>();

function broadcast(mode: ThemeMode) {
  cachedMode = mode;
  listeners.forEach((listener) => {
    try {
      listener(mode);
    } catch {
      // Pelanggan yang error tidak boleh menggagalkan yang lain.
    }
  });
}

async function readThemeMode(): Promise<ThemeMode> {
  try {
    const raw = await getSetting(THEME_MODE_KEY);
    const mode = parseThemeMode(raw);
    cachedMode = mode;
    return mode;
  } catch {
    // Gagal membaca settings → bertahan di nilai cache/bawaan.
    return cachedMode ?? 'system';
  }
}

/**
 * useFocusEffect yang aman di luar navigation context: di test atau saat
 * dipakai komponen non-navigasi, `useNavigation` melempar — kita tangkap
 * dan lewati fokus-read (mount-read tetap jalan).
 */
function useSafeFocusEffect(effect: () => void | (() => void)) {
  try {
    // Hook dipanggil dalam urutan konsisten: kegagalan deterministik per
    // render (selalu throw di titik yang sama di luar navigator).
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useFocusEffect(useCallback(effect, []));
  } catch {
    // Bukan di dalam navigator — abaikan.
  }
}

/**
 * Simpan mode tema: tersinkronkan ke semua instance SEKETIKA (broadcast),
 * lalu tulis ke settings. Bila penulisan gagal — kembalikan broadcast ke
 * mode terakhir yang diketahui valid dan lempar ulang error, supaya UI
 * pemanggil bisa membatalkan pilihan & memberi tahu pengguna.
 */
async function persistThemeMode(mode: ThemeMode): Promise<void> {
  const previous = cachedMode ?? 'system';
  broadcast(mode);
  try {
    await setSetting(THEME_MODE_KEY, mode);
  } catch (error) {
    // Rollback ke mode terakhir yang diketahui valid.
    broadcast(previous);
    throw error;
  }
}

export interface AppTheme {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

export function useAppTheme(): AppTheme {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(
    () => cachedMode ?? 'system'
  );

  // Baca settings saat mount.
  useEffect(() => {
    let cancelled = false;
    void readThemeMode().then((mode) => {
      if (!cancelled) {
        setThemeModeState(mode);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Berlangganan perubahan dari instance lain (mis. Atur).
  useEffect(() => {
    const listener: Listener = (mode) => setThemeModeState(mode);
    listeners.add(listener);
    // Selaraskan dengan cache terbaru (mungkin berubah sebelum subscribe).
    if (cachedMode !== null && cachedMode !== themeMode) {
      setThemeModeState(cachedMode);
    }
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Baca ulang saat layar kembali fokus (mis. setelah reset / ubah settings).
  useSafeFocusEffect(() => {
    let cancelled = false;
    void readThemeMode().then((mode) => {
      if (!cancelled) {
        setThemeModeState(mode);
        broadcast(mode);
      }
    });
    return () => {
      cancelled = true;
    };
  });

  const isDark =
    themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark');
  const colors = isDark ? darkColors : lightColors;

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    await persistThemeMode(mode);
  }, []);

  return { colors, isDark, themeMode, setThemeMode };
}
