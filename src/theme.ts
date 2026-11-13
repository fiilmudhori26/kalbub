/**
 * Tema dasar Kalbub — arah desain A · Soft Floral + C · Bold & Playful.
 * Dasar krem/rose, aksen kuning #FFD23F & merah-pink #FF5D8F, tanpa border
 * neo-brutalist. Dipakai oleh semua layar.
 */

export const colors = {
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
} as const;

export type ColorToken = keyof typeof colors;

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
