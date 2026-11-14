# Kalbub — Kalender Haid Pribadi

Aplikasi Android offline-first (Expo / React Native) untuk mencatat siklus haid,
memprediksi haid berikutnya, dan menerima pengingat lokal. Tanpa backend, tanpa
analytics, tanpa login — semua data tersimpan di perangkat (`expo-sqlite`).

Package: `com.kalbub.app` · Versi: `1.0.0` · Target: Android API 26+

## Verifikasi lokal

```powershell
npx tsc --noEmit   # typecheck
npx jest           # unit test logika (prediksi, db, dll)
npx expo export --platform android   # pastikan bundle terbentuk (output: dist/)
```

## Prasyarat rilis (sekali saja, butuh akun Expo pemilik)

1. `npx eas-cli login` — login dengan akun Expo pemilik.
2. `npx eas-cli init` — membuat project EAS & mengisi `extra.eas.projectId`
   di `app.json` (saat ini masih placeholder `00000000-0000-0000-0000-000000000000`).
   Alternatif tanpa mengubah file yang dikomit: set env `EAS_PROJECT_ID`
   (lihat `app.config.js`), mis. di PowerShell:
   `$env:EAS_PROJECT_ID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`.
   `eas update`/`eas build` juga menolak berjalan dengan placeholder.
3. `npx eas-cli build --platform android --profile preview` — menghasilkan APK
   (profil `preview`: distribusi internal, `buildType: apk`, channel `preview`).
   Profil `production` tersedia di `eas.json` (channel `production`, APK).

Catatan: `runtimeVersion` memakai policy `appVersion` — runtime hanya cocok dengan
update OTA yang dirilis dari versi app (`version` di `app.json`) yang sama.
Konsekuensinya: setiap perubahan yang menuntut *native* (ganti dependency native,
edit plugin, bump SDK) **wajib** lewat build APK baru, bukan `eas update`; OTA
hanya untuk perubahan JS/aset. Menaikkan `version` memutus kompatibilitas OTA
dengan APK lama. `fallbackToCacheTimeout: 0` dipertahankan agar app langsung
memakai bundle OTA terbaru yang tersedia tanpa menunggu jaringan.

## Cara install APK di HP

1. Transfer file `.apk` ke HP (kabel USB, Google Drive, WhatsApp ke diri sendiri, dll).
2. Buka file APK dari File Manager. Android akan meminta izin
   "Install dari sumber tidak dikenal" — izinkan untuk aplikasi sumber tersebut.
3. Tap **Install**, lalu buka **Kalbub**.

## Cara update setelah rilis pertama

Perubahan JS/aset saja (tanpa dependency native baru):

```powershell
npx eas-cli update --branch production -m "pesan perubahan"
```

HP yang sudah terinstall APK akan menerima bundle baru pada peluncuran ke-2
(setelah download di peluncuran ke-1). Untuk perubahan native: build APK baru
(`npx eas-cli build --platform android --profile production`) dan install manual
seperti di atas.

## Yang belum terverifikasi (cek manual di perangkat oleh pemilik)

| Skenario | Status |
|---|---|
| Onboarding (pertanyaan pertama, gating ke tab) | Belum diuji di HP |
| Catat periode historis via rentang di kalender | Belum diuji di HP |
| Prediksi haid berikutnya tampil di beranda | Belum diuji di HP |
| Notifikasi H-2 dan hari-H (default 09:00, channel Android) | Belum diuji di HP |
| Catat "sudah datang, Bububb?" → jadwalkan ulang notifikasi | Belum diuji di HP |
| Statistik (0 / 1 / banyak siklus) | Belum diuji di HP |
| Offline penuh (mode pesawat: semua fitur jalan) | Belum diuji di HP |
| Persistensi data setelah tutup paksa & buka lagi | Belum diuji di HP |
| OTA update via `eas update --branch production` | Belum diuji di HP |
| Install APK "sumber tidak dikenal" di HP target | Belum diuji di HP |

Langkah tersisa setelah APK sukses di-build & ter-install di HP: uji end-to-end
memakai tabel di atas, baru buat tag `v1.0.0`.
