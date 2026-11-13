# Kalbub — Desain App Kalender Haid

Tanggal: 2026-11-13 · Status: menunggu persetujuan pemilik

## Intent & latar

App pribadi (bukan produk publik) untuk **pacar pembuat ("Bububb")** yang selama ini
mencatat siklus haid secara **manual**. Masalah yang diselesaikan: mencatat jadi
merepotkan. App ini memindahkan catatan siklus ke HP Android dengan cara yang
sesedikit mungkin effort, terasa seperti hadiah pribadi, bukan alat medis.

## Tujuan

- Memudahkan mencatat haid, gejala, mood, dan nyeri — harian, cepat, tanpa login.
- Memprediksi haid berikutnya, masa subur/ovulasi, berdasarkan data yang diisi.
- Mengingatkan hari-H/H-2 sebelum prediksi haid (notifikasi lokal).
- Semua data tersimpan **hanya di HP dia** — tanpa akun, tanpa server.

## Bukan tujuan (non-goals)

- Bukan app publik/multi-user; tidak ada toko aplikasi, onboarding publik, atau akun.
- Tidak ada fitur medis/diagnosis/edukasi kesehatan yang mendalam ("semua tentang haid"
  dibatasi pada pencatatan + prediksi + pengingat, dikonfirmasi pemilik).
- Tidak ada sinkronisasi cloud, backup online, atau akses dari perangkat lain.
- iOS/web tidak dikerjakan pada tahap ini.

## Kendala & batasan

- Platform: **Android** (APK), dibangun dengan **Expo (React Native)**, build APK lewat **EAS Build** (tier gratis).
- **Offline-first**: semua fitur harus jalan tanpa internet; notifikasi lokal harus tetap terjadwal.
- Data sensitif (kesehatan reproduksi): tidak keluar dari perangkat; tidak ada analytics/telemetry pihak ketiga.
- Bahasa UI: **Bahasa Indonesia**.
- Perangkat: HP Android Bububb (versi Android tidak diketahui — targetkan Android 8+/API 26+).

## Pendekatan yang dipertimbangkan

| Pendekatan | Trade-off | Keputusan |
|---|---|---|
| Expo + EAS Build + storage lokal | Build APK cloud gratis; iterasi cepat; notifikasi lokal perlu dev build/EAS | **Dipilih** |
| Expo build lokal penuh (Android SDK) | Tanpa akun cloud, tapi berat & lambat setup | Ditolak (kemudahan) |
| WebView/PWA dibungkus APK | Cepat, tapi notifikasi & rasa native lemah | Ditolak (dipakai harian) |
| Flutter native | Bagus, tapi user memilih Expo/RN | Ditolak (pilihan user) |

## Identitas & tampilan (keputusan sudah final)

- **Nama app**: Kalbub (singkatan "Kalender Bububb").
- **Sapaan beranda**: "Hai, Bububb".
- **Arah desain**: gabungan **A · Soft Floral** (dasar krem/rose, serif hangat, romantis,
  personal) dengan aksen **C · Bold & Playful** (aksen kuning #FFD23F / merah-pink #FF5D8F
  untuk highlight & prediksi, sudut membulat, elemen ceria) — tanpa border tebal/neo-brutalist penuh.
- Referensi mockup gabungan ada di `.superpowers/brainstorm/20261113212358-10696/content/design-gabungan.html`.
- Tone copy: hangat, personal (sebagai pacar), Bahasa Indonesia, tidak klinis.

## Fitur (lingkup disetujui pemilik: "itu dulu")

1. **Kalender bulanan** — haid ditandai dengan memilih **tanggal mulai & selesai** (bukan ketuk per hari); warna berbeda untuk hari haid, hari prediksi, hari ovulasi/subur.
2. **Catatan harian** — per tanggal: aliran (tidak ada/spotting/ringan/sedang/berat),
   gejala (kram, nyeri payudara, sakit kepala, kembung, jerawat, lelah, mood swing — pilih
   beberapa), mood (pilih emoji-ish set sederhana), skala nyeri 0–10, catatan bebas (teks).
   Hari haid ditandai di kalender sebagai **rentang mulai–selesai** (pilih tanggal mulai &
   selesai; data periode disimpan sebagai rentang, durasi dihitung dari rentang tersebut).
3. **Prediksi** — dari rata-rata panjang siklus & durasi haid yang tercatat; default 28/5
   hari sebelum ada data. Tampilkan: tanggal prediksi haid berikutnya, rentang subur &
   ovulasi, tingkat keyakinan sederhana (mis. berdasarkan jumlah siklus tercatat).
   **Siklus baru & prediksi lewat**: bila tanggal prediksi terlewat tanpa haid tercatat,
   beranda menampilkan kartu "Sudah datang, Bububb?" — jika ya, tanggal mulai digeser sesuai
   jawaban dan seluruh prediksi + notifikasi dijadwalkan ulang; jika belum, tampilkan status
   "terlambat X hari" dan biarkan prediksi tetap tampil. Notifikasi H-2/hari-H tidak
   dikirim ulang untuk siklus yang sudah lewat tanpa konfirmasi.
4. **Pengingat (notifikasi lokal)** — opsional, aktif default: H-2 sebelum prediksi & hari-H,
   dengan nada personal (mis. "Bububb, haid diperkirakan akan datang..."). Tidak ada pengingat
   "minum pil" (di luar lingkup).
5. **Onboarding singkat** — pertanyaan pertama-kali: tanggal haid terakhir, rata-rata durasi
   siklus (slider/angka, default 28), durasi haid (default 5). Bisa diubah di pengaturan.
   App **mulai dari kosong** (tidak ada impor riwayat); prediksi & statistik menguat seiring siklus tercatat.
6. **Riwayat & statistik sederhana** — panjang siklus per bulan (bar chart kecil), rata-rata,
   durasi haid, frekuensi gejala teratas. Tanpa grafik kompleks.

## Arsitektur & teknis (untuk builder)

- **Stack**: Expo SDK (terbaru stabil), React Native, TypeScript. Navigasi: `expo-router`
  (atau React Navigation — pilihan builder) dengan tab: Kalender · Catat · Statistik · Atur.
- **Penyimpanan**: lokal di perangkat. Boleh AsyncStorage/MMKV untuk preferensi; data siklus
  & catatan harian sebaiknya `expo-sqlite` (query riwayat/statistik lebih bersih) — pilihan
  final di builder, catat di PR/commit.
- **Notifikasi**: `expo-notifications` (local scheduled notifications), dijadwalkan ulang
  setiap kali data siklus berubah. Tidak ada kunci PIN/biometrik di app — mengandalkan
  kunci layar bawaan HP; teks notifikasi boleh menampilkan isi asli (keputusan pemilik).
- **Distribusi & pembaruan**: APK dibagikan langsung ke HP Bububb; setelah itu pembaruan
  lewat **EAS Update (OTA)** untuk perubahan JS/aset. Konfigurasi `expo-updates` termasuk
  sejak awal build. Perubahan native tetap butuh APK baru.
- **Build**: EAS Build profil `preview`/`production` → APK (bukan AAB) untuk dibagikan langsung.
- **Tanpa backend, tanpa analytics, tanpa login.** Dependensi minimal.
- **Penamaan & struktur**: package `com.kalbub.app` (atau serupa), nama tampil "Kalbub",
  ikon & splash sederhana (bunga/huruf K, selaras arah desain A+C).
- **Algoritma prediksi sederhana**: perkiraan = tglHaidTerakhir + rataPanjangSiklus; rentang
  subur = ovulasi ± beberapa hari (ovulasi ≈ 14 hari sebelum prediksi). Semakin banyak siklus
  tercatat, semakin akurat — tampilkan jumlah data sebagai indikator keyakinan. Tidak perlu ML.

## Yang ditinggalkan untuk pembuat (builder discretion)

- Library chart untuk statistik (boleh tanpa library, gambar dengan View/SVG).
- Struktur skema SQLite & format persistensi.
- Micro-interactions/animasi (jaga tetap ringan).
- Detail set gejala/mood final (boleh menyesuaikan set umum di app haid yang ada).

## Risiko & catatan

- Notifikasi lokal di Android 8+ perlu notification channel; jangan minta izin berlebihan di awal.
- Prediksi hanya estimasi — copy UI harus menghindari kesan kepastian medis.
- Data hanya di HP pengguna: bila HP hilang/ganti, data ikut hilang — sampaikan di onboarding.
- EAS Build gratis punya antrean; alternatif bila buntu: build APK lokal dengan `npx expo run:android`.

## Verifikasi

- `npx expo start` → app jalan di emulator/perangkat.
- Build APK via EAS; install di HP Android nyata; cek: onboarding, catat haid, prediksi muncul,
  notifikasi H-2/hari-H tersimulasi, statistik, matikan internet → app tetap berfungsi.
- Review kode sebelum APK final dibagikan ke Bububb.
