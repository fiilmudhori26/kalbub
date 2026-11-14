/**
 * Notifikasi lokal Kalbub - pengingat haid H-2 & hari-H, offline-first.
 *
 * Struktur modul ini mengikuti pola `db.ts`: fungsi MURNI (`shouldSchedule`)
 * tidak meng-import modul native apa pun sehingga bisa diuji di jest.
 * Wrapper (`ensurePermission`, `rescheduleReminders`) memakai
 * `expo-notifications` lewat dynamic import + side-effect yang idempotent
 * (notification handler & channel Android) supaya aman dipanggil berkali-kali.
 *
 * Kontrak:
 * - `ensurePermission()` dipanggil SAAT onboarding/selesai setup - BUKAN
 *   pada first paint.
 * - `rescheduleReminders(predictedStart)` meng-cancel SEMUA scheduled
 *   notification milik app ini (prefix id `kalbub.reminder.`), lalu
 *   menjadwalkan ulang H-2 & hari-H jam 09:00 waktu lokal. Jika
 *   `predictedStart` null / sudah lewat tanpa konfirmasi / pengingat
 *   dimatikan (`notificationsEnabled === 'false'`) - TIDAK ada yang
 *   dijadwalkan (setelah cancel).
 * - Tidak ada push/remote - hanya scheduled local notifications.
 * - Teks kunci layar boleh menampilkan teks asli (tanpa masking).
 */

import { Platform } from 'react-native';
import { addDaysISO, diffDaysISO, formatID, parseISO, todayISO } from './dates';
import { getSetting } from './db';

export type ShouldSchedule = 'none' | 'h-2' | 'h-0' | 'both';

/**
 * Keputusan murni: notifikasi mana yang layak dijadwalkan untuk satu
 * prediksi. `predictedStart` di masa lalu tanpa konfirmasi → 'none'
 * (hari-H sudah lewat; karena H-2 selalu sebelum hari-H, kasus
 * "hari-H lewat tapi H-2 belum" tidak mungkin terjadi - tetap ditangani
 * dengan 'none' di sini). 'h-2' tunggal juga tidak pernah dihasilkan oleh
 * logika ini dan hanya dipertahankan sebagai anggota tipe kontrak.
 *
 * Tanggal tidak valid diperlakukan sebagai 'none' (tidak menjadwalkan apa pun
 * lebih aman daripada melempar error dari jalur pengingat).
 */
export function shouldSchedule(
  predictedStart: string | null | undefined,
  todayISOStr: string
): ShouldSchedule {
  if (!predictedStart) {
    return 'none';
  }
  let diff: number;
  try {
    parseISO(predictedStart);
    parseISO(todayISOStr);
    diff = diffDaysISO(todayISOStr, predictedStart);
  } catch {
    return 'none';
  }
  if (diff < 0) {
    return 'none';
  }
  if (diff <= 1) {
    // Hari ini: hari-H tinggal menunggu; H-2 sudah lewat.
    // Besok: H-2 kemarin, hanya hari-H tersisa.
    return 'h-0';
  }
  return 'both';
}

/** Channel Android 8+ (wajib sebelum menjadwalkan). id stabil - jangan diubah. */
const CHANNEL_ID = 'kalbub-reminders';
const CHANNEL_NAME = 'Pengingat Haid';
export const REMINDER_ID_PREFIX = 'kalbub.reminder.';
const H2_ID = `${REMINDER_ID_PREFIX}h-2`;
const H0_ID = `${REMINDER_ID_PREFIX}h-0`;
const NOTIFICATION_TITLE = 'Kalbub';

/** Tipe modul native hanya sebagai type - dynamic import terjadi di runtime. */
type NotificationsModule = typeof import('expo-notifications');

/**
 * Dynamic import + setup idempotent (handler foreground & channel Android).
 * Handler diperlukan agar notifikasi yang tiba SAAT app dibuka tetap tampil
 * sebagai banner di Android.
 */
async function getNotifications(): Promise<NotificationsModule> {
  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: CHANNEL_NAME,
      importance: Notifications.AndroidImportance.HIGH,
      description: 'Pengingat sebelum perkiraan tanggal haid',
      lightColor: '#FF5D8F',
    });
  }

  return Notifications;
}

/** Batalkan semua scheduled notification milik app ini (prefix id). */
async function cancelAppReminders(
  Notifications: NotificationsModule
): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

/**
 * Minta izin notifikasi. Panggil saat onboarding / selesai setup -
 * BUKAN pada first paint. Mengembalikan true bila diizinkan.
 * Kegagalan (mis. platform tidak mendukung) → false, tidak melempar.
 */
export async function ensurePermission(): Promise<boolean> {
  try {
    const Notifications = await getNotifications();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    console.warn('[kalbub] Gagal meminta izin notifikasi:', error);
    return false;
  }
}

/** Date lokal jam 09:00 untuk `iso`. */
function atNineAM(iso: string): Date {
  const { y, m, d } = parseISO(iso);
  return new Date(y, m - 1, d, 9, 0, 0, 0);
}

function buildBody(predictedStart: string, which: 'h-2' | 'h-0'): string {
  if (which === 'h-2') {
    return `Bububb, haid diperkirakan akan datang sekitar ${formatID(
      predictedStart
    )}. Siapkan pembalut ♡`;
  }
  return 'Bububb, haid diperkirakan datang hari ini. Semoga lancar ya ♡';
}

/**
 * Cancel semua reminder milik app, lalu jadwalkan ulang H-2 & hari-H (09:00
 * lokal) berdasarkan `predictedStart`. Jika `predictedStart` null / sudah
 * lewat tanpa konfirmasi / pengingat dimatikan di pengaturan → hanya cancel,
 * tidak menjadwalkan apa pun.
 *
 * Trigger yang sudah lewat (mis. H-2 hari ini tapi jam 09:00 sudah lewat)
 * dilewati agar notifikasi tidak tiba-tiba muncul / gagal dijadwalkan.
 * Kegagalan native tidak melempar - pengingat tidak boleh merusak alur
 * catat-periode; error dilog lewat console.warn.
 */
export async function rescheduleReminders(
  predictedStart: string | null
): Promise<void> {
  try {
    const Notifications = await getNotifications();
    await cancelAppReminders(Notifications);

    const notificationsEnabled = await getSetting('notificationsEnabled');
    if (notificationsEnabled === 'false') {
      return;
    }

    const today = todayISO();
    const decision = shouldSchedule(predictedStart, today);
    if (decision === 'none' || predictedStart === null) {
      return;
    }

    const jobs: Array<'h-2' | 'h-0'> =
      decision === 'both' ? ['h-2', 'h-0'] : [decision];

    for (const which of jobs) {
      const dateISO =
        which === 'h-2' ? addDaysISO(predictedStart, -2) : predictedStart;
      const triggerDate = atNineAM(dateISO);
      if (triggerDate.getTime() <= Date.now()) {
        continue;
      }
      await Notifications.scheduleNotificationAsync({
        identifier: which === 'h-2' ? H2_ID : H0_ID,
        content: {
          title: NOTIFICATION_TITLE,
          body: buildBody(predictedStart, which),
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      });
    }
  } catch (error) {
    console.warn('[kalbub] Gagal menjadwalkan pengingat:', error);
  }
}
