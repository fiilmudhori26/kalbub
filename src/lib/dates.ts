/**
 * Utilitas tanggal lokal untuk Kalbub.
 *
 * Tanggal disimpan & dibandingkan sebagai string lokal `YYYY-MM-DD`.
 * JANGAN pernah `new Date(str)` untuk logika hari — string ISO akan
 * diparse sebagai UTC dan bisa bergeser satu hari di zona waktu lokal.
 * Aritmetika memakai konstruktor lokal `new Date` dengan tahun penuh
 * diset via `setFullYear` (tahun 0–99 tidak dipetakan ke 1900–1999),
 * atau kalkulasi kalender murni.
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

/**
 * Konstruktor Date lokal yang aman untuk tahun 0–99:
 * `new Date(y, ...)` memetakan 0–99 ke 1900–1999, jadi tahun penuh
 * diset eksplisit dengan `setFullYear` setelah konstruksi.
 * Base year 2000 (kabisat) supaya 29 Feb tidak rollover sebelum
 * `setFullYear` dijalankan.
 */
function makeLocalDate(y: number, monthIndex: number, d: number): Date {
  const date = new Date(2000, monthIndex, d);
  date.setFullYear(y);
  return date;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function daysInMonth(y: number, m: number): number {
  if (m === 2) {
    return isLeapYear(y) ? 29 : 28;
  }
  return DAYS_IN_MONTH[m - 1];
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

/** Susun komponen menjadi `YYYY-MM-DD` (zero-padded). Melempar Error bila m/d di luar rentang. */
export function toISO(y: number, m: number, d: number): string {
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Bulan tidak valid (harus 1-12): ${m}`);
  }
  if (!Number.isInteger(d) || d < 1 || d > 31) {
    throw new Error(`Hari tidak valid (harus 1-31): ${d}`);
  }
  const yy = String(y).padStart(4, '0');
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Tanggal hari ini sebagai `YYYY-MM-DD` lokal. */
export function todayISO(): string {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Tambah `n` hari kalender (boleh negatif) ke tanggal ISO. */
export function addDaysISO(iso: string, n: number): string {
  const { y, m, d } = parseISO(iso);
  const date = makeLocalDate(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return toISO(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Selisih hari: `b - a`. Positif bila b setelah a. */
export function diffDaysISO(a: string, b: string): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  // UTC dipakai hanya untuk mengukur jarak antar komponen kalender,
  // bukan untuk mem-parse string ISO. Offset +400 tahun menghindari
  // pemetaan 0–99 → 1900–1999 pada Date.UTC; selisihnya tetap eksak.
  const utcA = Date.UTC(pa.y + 400, pa.m - 1, pa.d);
  const utcB = Date.UTC(pb.y + 400, pb.m - 1, pb.d);
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
  return HARI_ID[makeLocalDate(y, m - 1, d).getDay()];
}
