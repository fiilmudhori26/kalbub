/**
 * Lapisan penyimpanan Kalbub — expo-sqlite (offline-first, semua data di perangkat).
 *
 * Tanggal disimpan sebagai string lokal `YYYY-MM-DD` dan dibandingkan
 * secara leksikografis (aman untuk format ISO) — jangan pernah `new Date(str)`.
 *
 * Fungsi murni (`validateRange`, `rangesOverlapOrTouch`, `mergePeriods`,
 * `clampPain`) diekspor terpisah agar bisa diuji di jest tanpa native module.
 * Repository (`addPeriod`, dst.) memakai expo-sqlite lewat dynamic import
 * supaya modul ini tetap bisa di-import di lingkungan test.
 *
 * Kontrak periode: rentang disimpan inklusif (start..end). `addPeriod`
 * menggabung (merge) rentang yang tumpang-tindih ATAU bersebelahan dengan
 * periode existing menjadi satu periode. `updatePeriod` menolak (throw
 * `OverlappingPeriodError`) bila rentang baru menabrak periode LAIN.
 */

import { addDaysISO, parseISO } from './dates';

export interface Period {
  id: number;
  start: string; // YYYY-MM-DD, inklusif
  end: string; // YYYY-MM-DD, inklusif
}

export type FlowLevel = 'none' | 'spotting' | 'light' | 'medium' | 'heavy';

export interface DailyLog {
  date: string; // YYYY-MM-DD
  flow: FlowLevel;
  symptoms: string[];
  mood: string | null;
  pain: number; // 0–10 (di-clamp di upsertDailyLog)
  note: string;
}

const VALID_FLOW: readonly FlowLevel[] = [
  'none',
  'spotting',
  'light',
  'medium',
  'heavy',
];

export class OverlappingPeriodError extends Error {
  constructor(
    message = 'Rentang periode tumpang-tindih atau bersebelahan dengan periode yang sudah ada'
  ) {
    super(message);
    this.name = 'OverlappingPeriodError';
  }
}

// ---------------------------------------------------------------------------
// Fungsi murni (diekspor untuk test)
// ---------------------------------------------------------------------------

export interface PeriodRange {
  start: string;
  end: string;
}

/**
 * Validasi rentang tanggal. Melempar Error bila format salah atau
 * `start` setelah `end`. `start === end` valid (haid 1 hari).
 */
export function validateRange(start: string, end: string): void {
  // parseISO melempar untuk format/ tanggal tidak valid
  parseISO(start);
  parseISO(end);
  if (start > end) {
    throw new Error(
      `Tanggal mulai (${start}) tidak boleh setelah tanggal selesai (${end})`
    );
  }
}

/**
 * true bila dua rentang inklusif tumpang-tindih ATAU bersebelahan
 * (selisih 0 hari di antaranya, mis. a.end = 05, b.start = 06).
 */
export function rangesOverlapOrTouch(a: PeriodRange, b: PeriodRange): boolean {
  return a.start <= addDaysISO(b.end, 1) && b.start <= addDaysISO(a.end, 1);
}

/**
 * Gabungkan daftar rentang (tidak harus terurut) menjadi daftar minimal
 * rentang yang saling tumpang-tindih/bersebelahan, terurut by start.
 * Input tidak dimutasi.
 */
export function mergePeriods(periods: PeriodRange[]): PeriodRange[] {
  if (periods.length === 0) {
    return [];
  }
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const merged: PeriodRange[] = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (rangesOverlapOrTouch(last, cur)) {
      if (cur.end > last.end) {
        last.end = cur.end;
      }
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }
  return merged;
}

/** Clamp nyeri ke integer 0–10. Input non-finite → 0. */
export function clampPain(pain: number): number {
  if (!Number.isFinite(pain)) {
    return 0;
  }
  return Math.min(10, Math.max(0, Math.round(pain)));
}

// ---------------------------------------------------------------------------
// Akses database (expo-sqlite, lazy supaya test jest tidak menyentuh native)
// ---------------------------------------------------------------------------

const DB_NAME = 'kalbub.db';

type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start TEXT NOT NULL,
  end TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_logs (
  date TEXT PRIMARY KEY,
  flow TEXT,
  symptoms TEXT,
  mood TEXT,
  pain INTEGER,
  note TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

let dbPromise: Promise<SQLiteDatabase> | null = null;

async function openDb(): Promise<SQLiteDatabase> {
  const { openDatabaseSync } = await import('expo-sqlite');
  const database = openDatabaseSync(DB_NAME);
  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync(SCHEMA);
  return database;
}

/** Buka (sekali) dan inisialisasi database. Idempoten. */
export async function initDb(): Promise<void> {
  if (!dbPromise) {
    dbPromise = openDb();
    // Bila gagal, jangan cache promise yang reject — coba lagi di pemanggilan berikutnya.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  await dbPromise;
}

async function requireDb(): Promise<SQLiteDatabase> {
  await initDb();
  // dbPromise pasti terisi setelah initDb() sukses
  return dbPromise as Promise<SQLiteDatabase>;
}

/** Periode yang tumpang-tindih atau bersebelahan dengan [start, end]. */
async function findIntersecting(
  database: SQLiteDatabase,
  start: string,
  end: string,
  excludeId?: number
): Promise<Period[]> {
  if (excludeId !== undefined) {
    return database.getAllAsync<Period>(
      `SELECT id, start, end FROM periods
       WHERE id != ? AND start <= ? AND end >= ?
       ORDER BY start ASC, id ASC`,
      [excludeId, addDaysISO(end, 1), addDaysISO(start, -1)]
    );
  }
  return database.getAllAsync<Period>(
    `SELECT id, start, end FROM periods
     WHERE start <= ? AND end >= ?
     ORDER BY start ASC, id ASC`,
    [addDaysISO(end, 1), addDaysISO(start, -1)]
  );
}

// ---------------------------------------------------------------------------
// Periode
// ---------------------------------------------------------------------------

/**
 * Tambah periode. Rentang yang tumpang-tindih atau bersebelahan dengan
 * periode existing digabung otomatis menjadi satu periode.
 */
export async function addPeriod(start: string, end: string): Promise<Period> {
  validateRange(start, end);
  const database = await requireDb();

  let created: Period | null = null;
  await database.withTransactionAsync(async () => {
    const intersecting = await findIntersecting(database, start, end);
    if (intersecting.length === 0) {
      const result = await database.runAsync(
        'INSERT INTO periods (start, end) VALUES (?, ?)',
        [start, end]
      );
      created = { id: result.lastInsertRowId, start, end };
      return;
    }
    // Semua yang intersect dengan rentang baru saling terhubung lewat rentang
    // itu, jadi hasil merge pasti satu rentang.
    const [union] = mergePeriods([...intersecting, { start, end }]);
    await database.runAsync(
      `DELETE FROM periods WHERE id IN (${intersecting.map(() => '?').join(',')})`,
      intersecting.map((p) => p.id)
    );
    const result = await database.runAsync(
      'INSERT INTO periods (start, end) VALUES (?, ?)',
      [union.start, union.end]
    );
    created = { id: result.lastInsertRowId, start: union.start, end: union.end };
  });
  if (!created) {
    throw new Error('Gagal menyimpan periode');
  }
  return created;
}

/**
 * Ubah rentang periode. Melempar `OverlappingPeriodError` bila rentang baru
 * tumpang-tindih atau bersebelahan dengan periode LAIN (bukan dirinya sendiri).
 */
export async function updatePeriod(
  id: number,
  start: string,
  end: string
): Promise<Period> {
  validateRange(start, end);
  const database = await requireDb();

  let updated: Period | null = null;
  await database.withTransactionAsync(async () => {
    const existing = await database.getFirstAsync<Period>(
      'SELECT id, start, end FROM periods WHERE id = ?',
      [id]
    );
    if (!existing) {
      throw new Error(`Periode dengan id ${id} tidak ditemukan`);
    }
    const others = await findIntersecting(database, start, end, id);
    if (others.length > 0) {
      throw new OverlappingPeriodError();
    }
    await database.runAsync('UPDATE periods SET start = ?, end = ? WHERE id = ?', [
      start,
      end,
      id,
    ]);
    updated = { id, start, end };
  });
  if (!updated) {
    throw new Error('Gagal memperbarui periode');
  }
  return updated;
}

/** Hapus periode. Tidak error bila id tidak ada. */
export async function deletePeriod(id: number): Promise<void> {
  const database = await requireDb();
  await database.runAsync('DELETE FROM periods WHERE id = ?', [id]);
}

/** Semua periode, urut start ASC. */
export async function listPeriods(): Promise<Period[]> {
  const database = await requireDb();
  return database.getAllAsync<Period>(
    'SELECT id, start, end FROM periods ORDER BY start ASC, id ASC'
  );
}

// ---------------------------------------------------------------------------
// Daily log
// ---------------------------------------------------------------------------

interface DailyLogRow {
  date: string;
  flow: string | null;
  symptoms: string | null;
  mood: string | null;
  pain: number | null;
  note: string | null;
}

function parseSymptoms(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    return [];
  }
}

function rowToDailyLog(row: DailyLogRow): DailyLog {
  const flow = VALID_FLOW.includes(row.flow as FlowLevel)
    ? (row.flow as FlowLevel)
    : 'none';
  return {
    date: row.date,
    flow,
    symptoms: parseSymptoms(row.symptoms),
    mood: row.mood ?? null,
    pain: clampPain(row.pain ?? 0),
    note: row.note ?? '',
  };
}

/** Ambil log untuk tanggal tertentu, atau null bila belum ada. */
export async function getDailyLog(date: string): Promise<DailyLog | null> {
  parseISO(date); // validasi format
  const database = await requireDb();
  const row = await database.getFirstAsync<DailyLogRow>(
    'SELECT date, flow, symptoms, mood, pain, note FROM daily_logs WHERE date = ?',
    [date]
  );
  return row ? rowToDailyLog(row) : null;
}

/** Simpan/timpa log untuk tanggal `log.date`. `pain` di-clamp 0–10. */
export async function upsertDailyLog(log: DailyLog): Promise<void> {
  parseISO(log.date); // validasi format
  const flow = VALID_FLOW.includes(log.flow) ? log.flow : 'none';
  const pain = clampPain(log.pain);
  const symptoms = JSON.stringify(
    Array.isArray(log.symptoms)
      ? log.symptoms.filter((s) => typeof s === 'string')
      : []
  );
  const database = await requireDb();
  await database.runAsync(
    `INSERT INTO daily_logs (date, flow, symptoms, mood, pain, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       flow = excluded.flow,
       symptoms = excluded.symptoms,
       mood = excluded.mood,
       pain = excluded.pain,
       note = excluded.note`,
    [log.date, flow, symptoms, log.mood ?? null, pain, log.note ?? '']
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Baca setting; null bila belum diset. Dipakai untuk avgCycleLength, avgPeriodLength, onboardingDone, notificationsEnabled. */
export async function getSetting(key: string): Promise<string | null> {
  const database = await requireDb();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

/** Simpan setting (insert atau timpa). */
export async function setSetting(key: string, value: string): Promise<void> {
  const database = await requireDb();
  await database.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

/** Hapus SEMUA data (periods, daily_logs, settings). Untuk tab Atur. */
export async function resetAll(): Promise<void> {
  const database = await requireDb();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM periods');
    await database.runAsync('DELETE FROM daily_logs');
    await database.runAsync('DELETE FROM settings');
  });
}
