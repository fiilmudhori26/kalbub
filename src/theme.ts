/**
 * Tema dasar Kalbub — arah desain A · Soft Floral + C · Bold & Playful.
 * Dasar krem/rose, aksen kuning #FFD23F & merah-pink #FF5D8F, tanpa border
 * neo-brutalist. Dipakai oleh semua layar lewat `useAppTheme()`
 * (src/lib/useAppTheme.ts) — jangan import palet statis di layar.
 *
 * Dua palet: `lightColors` (bawaan, krem) dan `darkColors` (plum-cokelat
 * gelap). Keduanya berbagi `radius` & `spacing`. `colors` tetap diekspor
 * sebagai alias palet terang untuk kompatibilitas, tapi layar baru harus
 * memakai hook.
 */

const lightColors = {
  /** Dasar krem — background layar */
  krem: '#FBF3F4',
  /** Rose lembut — elemen sekunder, chip, ilustrasi */
  rose: '#E88AA0',
  /** Rose gelap — aksen teks/ikon di atas krem, pressed state */
  roseDark: '#C46A82',
  /** Aksen utama — highlight & prediksi */
  accent: '#FF5D8F',
  /** Aksen kuning — highlight kedua, badge ceria */
  accentYellow: '#FFD23F',
  /** Tinta — teks utama (bukan hitam pekat) */
  ink: '#4A2C34',
  /** Kartu — permukaan di atas background krem */
  card: '#FFFFFF',

  /** Teks tubuh sekunder */
  muted: '#6B4A55',
  /** Teks hint kecil */
  subtle: '#A07080',
  /** Teks caption/placeholder samar */
  faint: '#B79AA3',
  /** Isi rose lembut — chip, tombol lingkaran, badge lembut */
  chipFill: '#FCE4EA',
  /** Teks di atas aksen/rose solid */
  onAccent: '#FFFFFF',
  /** Teks di atas kuning */
  onYellow: '#5A3A00',
  /** Warna bayangan kartu */
  shadow: '#C46A82',

  /** Divider & garis tab */
  divider: 'rgba(196,106,130,0.18)',
  /** Border input/chip standar */
  borderDefault: 'rgba(196,106,130,0.35)',
  /** Border input lembut (strip tanggal, mood opsi) */
  borderInput: 'rgba(196,106,130,0.3)',
  /** Garis lebih tegas (divider kartu prediksi) */
  borderStrong: 'rgba(196,106,130,0.28)',

  /** Isi masa subur di kalender/sheet */
  fertileFill: 'rgba(255,93,143,0.18)',
  /** Titik legenda masa subur */
  fertileSoft: 'rgba(255,93,143,0.3)',
  /** Tombol navigasi bulan (isian) */
  navFill: 'rgba(232,138,160,0.16)',
  /** Tombol navigasi bulan (ditekan) */
  navFillPressed: 'rgba(232,138,160,0.32)',
  /** Tombol ghost (isian) */
  ghostFill: 'rgba(74,44,52,0.08)',
  /** Tombol ghost (ditekan) */
  ghostFillPressed: 'rgba(74,44,52,0.16)',
  /** Handle drag bottom sheet */
  dragHandle: 'rgba(74,44,52,0.18)',
  /** Backdrop modal */
  backdrop: 'rgba(74,44,52,0.45)',

  /** Kartu panggilan kuning (LateCard) */
  calloutBg: '#FFF4CF',
  /** Bayangan & border titik panggilan kuning */
  calloutShadow: '#B98A1E',
  /** Label kecil di atas panggilan kuning */
  calloutText: '#8A6A00',
  /** Teks penjelas di panggilan kuning */
  calloutSubtext: '#6B5530',

  /** Hijau umpan balik sukses */
  ok: '#3E7D46',
  /** Merah tombol bahaya */
  danger: '#D6455B',
  /** Merah tombol bahaya (ditekan) */
  dangerPressed: '#B73A4E',
  /** Teks error di atas kartu */
  dangerText: '#B3261E',
  /** Track Switch saat mati */
  switchOff: '#EAD3D9',
  /** Angka tanggal masa depan (nonaktif) */
  futureDay: '#CBB3BB',
  /** Teks fakta sekunder (kartu prediksi) */
  factText: '#5C3A44',
  /** Teks disclaimer kecil */
  disclaimer: '#A87B88',
};

export type ThemeColors = typeof lightColors;

export const darkColors: ThemeColors = {
  krem: '#241A1E',
  rose: '#E88AA0',
  roseDark: '#D98A9E',
  accent: '#FF5D8F',
  accentYellow: '#FFD23F',
  ink: '#F3E4E8',
  card: '#2E2228',

  muted: '#D8BEC7',
  subtle: '#B3939E',
  faint: '#A08594',
  chipFill: '#3B2A32',
  onAccent: '#FFFFFF',
  onYellow: '#5A3A00',
  shadow: '#000000',

  divider: 'rgba(217,138,158,0.25)',
  borderDefault: 'rgba(217,138,158,0.4)',
  borderInput: 'rgba(217,138,158,0.38)',
  borderStrong: 'rgba(217,138,158,0.35)',

  fertileFill: 'rgba(255,93,143,0.3)',
  fertileSoft: 'rgba(255,93,143,0.4)',
  navFill: 'rgba(232,138,160,0.18)',
  navFillPressed: 'rgba(232,138,160,0.34)',
  ghostFill: 'rgba(243,228,232,0.08)',
  ghostFillPressed: 'rgba(243,228,232,0.15)',
  dragHandle: 'rgba(243,228,232,0.22)',
  backdrop: 'rgba(0,0,0,0.6)',

  calloutBg: '#3A2D1C',
  calloutShadow: '#000000',
  calloutText: '#E7C169',
  calloutSubtext: '#C8B08A',

  ok: '#8CD09B',
  danger: '#D6455B',
  dangerPressed: '#B73A4E',
  dangerText: '#F2A89C',
  switchOff: '#45333C',
  futureDay: '#6F5B64',
  factText: '#D8BEC7',
  disclaimer: '#9F828D',
};

/** Alias palet terang (dipakai useAppTheme). Layar baru pakai hook. */
export const colors = lightColors;

export const radius = {
  /** Chip kecil, input */
  sm: 12,
  /** Tombol, badge */
  md: 16,
  /** Kartu */
  lg: 24,
  /** Kartu besar / bottom sheet */
  xl: 32,
  /** Pil penuh (chip bulat, avatar) */
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;
