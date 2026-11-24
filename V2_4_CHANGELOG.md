# SENSANIN v2.4 — Minimal Incremental Update from v2.3

## Prinsip
Basis kode SENSANIN v2.3 tetap dipertahankan, termasuk logo, hero Ringkasan, live QR scanning dan `src/autoScan.ts`, pengukuran ΔE demonstrasi, dan tampilan Data Inventory. Tidak ada migrasi backend.

## File yang diubah atau ditambah
- `src/App.tsx`: menambah rute Penerimaan dan Aktivitas; menghubungkan registrasi paket ke inventory, menghubungkan hasil scan sukses ke log, menambah tombol ubah lokasi pada inventory, dan memperluas bottom nav ke lima menu. Memperbaiki lifecycle live scanner dengan ref agar perubahan state inventory tidak memulai ulang kamera.
- `src/style.css`: seluruh gaya v2.3 dipertahankan, gaya modul baru ditambahkan di akhir.
- `src/operations.ts`: logika operasi dan penyimpanan batch, paket, lokasi, aktivitas.
- `src/OperationsPages.tsx`: dua halaman baru, generator QR, penempatan, riwayat.
- `package.json`: menambah `qrcode` dan `@types/qrcode`.

## Tidak diubah
- `src/autoScan.ts` (algoritma scanning label asli v2.3).
- `src/data.ts` (tipe & data demo existing).
- `vite.config.ts` dan workflow GitHub Pages.
- `public/assets/current-label-reference.png` (label asli pengguna).

## Data / batasan
- `sensanin-products-v2` dan `sensanin-scans-v2` tetap digunakan; data scan/inventory v2 tidak di-reset.
- Modul baru menggunakan `sensanin-operations-v3` untuk kompatibilitas ketika v3 pernah dipasang. Ini hanya key storage lokal, bukan pergantian versi aplikasi.
- Registrasi dan QR dibuat per paket, tidak per lokasi. Relokasi tidak mengubah Package ID.
- Login demo dan LocalStorage **tidak aman untuk operasi produksi multiuser**; audit log hanya read-only di UI, bukan immutable secara kriptografis.
- Status freshness berdasarkan ΔE adalah simulasi dan tidak boleh dijadikan penentu keamanan daging.
- Untuk QR cetak, tempelkan QR identitas di area QR label asli tanpa menutupi indikator ungu. QR cetak yang dibuat aplikasi adalah identifier saja; bukan label kolorimetri terkalibrasi lengkap.

## Setup
1. Backup proyek lama termasuk file penting.
2. Salin isi folder `sensanin-mvp` dari ZIP ke proyek lama, jangan hapus `.git`.
3. `npm install`, kemudian `npm run build` dan `npm run dev`.
4. Cek kelima menu, buat satu batch demo, assign lokasi sebagian, scan QR pada label fisik, dan periksa Aktivitas.
5. Jika build berhasil, commit dan push ke branch `main`. Periksa GitHub Actions hijau.
