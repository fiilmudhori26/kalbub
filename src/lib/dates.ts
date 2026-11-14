/**
 * Utilitas tanggal lokal untuk Kalbub.
 *
 * Tanggal disimpan & dibandingkan sebagai string lokal `YYYY-MM-DD`.
 * JANGAN pernah `new Date(str)` untuk logika hari — string ISO akan
 * diparse sebagai UTC dan bisa bergeser satu hari di zona waktu lokal.
 * Aritmetika memakai `new Date(y, m - 1, d)` (konstruktor lokal) atau
 * kalkulasi kalender murni.
 */

export interface DateParts {
  y: number;
  m: number; // 1–12
  d: number; // 1–31
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const BULAN_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

const HARI_ID = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
] as const;

function daysInMonth(y: number, m: number): number {
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini (konstruktor lokal).
  return new Date(y, m, 0).getDate();
}

/** Parse `YYYY-MM-DD` menjadi komponen lokal. Melempar Error bila tidak valid. */
export function parseISO(s: string): DateParts {
  const match = ISO_RE.exec(s);
  if (!match) {
    throw new Error(`Format tanggal tidak valid (harus YYYY-MM-DD): ${s}`);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new Error(`Tanggal tidak valid: ${s}`);
  }
  return { y, m, d };
}

/** Susun komponen menjadi `YYYY-MM-DD` (zero-padded). */
export function toISO(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** Tanggal hari ini sebagai `YYYY-MM-DD` lokal. */
export function todayISO(): string {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Tambah `n` hari kalender (boleh negatif) ke tanggal ISO. */
export function addDaysISO(iso: string, n: number): string {
  const { y, m, d } = parseISO(iso);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return toISO(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Selisih hari: `b - a`. Positif bila b setelah a. */
export function diffDaysISO(a: string, b: string): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  // UTC dipakai hanya untuk mengukur jarak antar komponen kalender,
  // bukan untuk mem-parse string ISO.
  const utcA = Date.UTC(pa.y, pa.m - 1, pa.d);
  const utcB = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((utcB - utcA) / 86_400_000);
}

/** Format Indonesia singkat, mis. "18 Nov 2026". */
export function formatID(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${d} ${BULAN_ID[m - 1]} ${y}`;
}

/** Nama hari Indonesia, mis. "Rabu". */
export function weekdayID(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return HARI_ID[new Date(y, m - 1, d).getDay()];
}
