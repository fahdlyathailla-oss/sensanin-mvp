# SENSANIN — Smart Labelling (Interactive Web Prototype)

Website React + TypeScript + Vite yang meniru arah visual referensi SENSANIN: latar lilac-putih, aksen kuning, logo asli referensi, dan tiga layar ponsel yang interaktif.

## Menjalankan di Antigravity IDE / VS Code

1. Extract folder `sensanin-mvp` dari ZIP.
2. Buka folder ini di Antigravity IDE (File → Open Folder).
3. Buka terminal pada root project.
4. Jalankan:

```bash
npm install
npm run dev
```

5. Buka alamat localhost yang ditampilkan oleh Vite (biasanya `http://localhost:5173`).

Untuk cek produksi: `npm run build` dan untuk preview hasil build: `npm run preview`.

## File penting

- `src/App.tsx` — seluruh halaman, scanning kamera/QR, upload, ROI, analisis ΔE, tabel, chart.
- `src/style.css` — desain, komposisi tiga HP, warna, responsivitas.
- `src/data.ts` — tipe data, 18 data produk fiktif, transformasi RGB → Lab, fungsi ΔE.
- `public/assets/sensanin-mark.png` — simbol logo yang diekstrak dari *gambar referensi yang diunggah pengguna* (wordmark HTML/CSS supaya tajam dan mudah diedit).
- `public/assets/demo-beef.jpg` — potongan ilustrasi daging dari gambar referensi pengguna.
- `index.html` — HTML entry point.

## Fitur yang bisa dipakai

- Dashboard 3 layar sesuai visual referensi; tab Ringkasan/Riwayat di HP ketiga.
- Camera QR scanner dengan ZXing (`@zxing/browser`), perlu permission kamera dan biasanya localhost/HTTPS.
- Upload foto dan percobaan QR decode pada gambar; manual pilih produk jika QR bukan ID paket demo.
- Seleksi persegi panjang indikator (kuning) dan patch referensi (toska) di workspace.
- Ekstraksi rerata RGB, koreksi channel gain sederhana terhadap warna patch referensi, konversi ke CIELAB (D65), perhitungan ΔE*ab (CIE76).
- Ambang klasifikasi demonstrasi dapat diubah, hasil simpan scan mengubah data inventaris/dashboard/history.
- Pencarian, filter status, detail kemasan, ekspor CSV, reset demo, localStorage.

## Keterbatasan ilmiah (penting untuk lomba)

**Tidak ada validasi laboratorium.** Kategori Segar / Prioritas / Perlu Inspeksi adalah **simulasi**, diturunkan dari ambang demonstrasi yang dapat diubah dan *tidak* boleh diartikan sebagai keputusan keamanan pangan. Nilai ΔE dari foto merupakan perhitungan pixel teknis, bukan hubungan ilmiah tervalidasi dengan kesegaran. Koreksi channel gain bukan kalibrasi colorimetric standar. Data historis awal dan tren dari data demo bersifat ilustratif. Color QR tidak mendeteksi pembusukan; patchnya hanya menjadi referensi koreksi warna. Tidak tersedia estimasi TVB-N maupun sisa umur simpan karena perlu eksperimen terkontrol terhadap TVB-N dan TVC.

## Catatan logo

Mark/logo diambil dari referensi pengguna. Jika mempunyai file logo asli beresolusi tinggi (SVG/PNG transparan), ganti `public/assets/sensanin-mark.png` untuk hasil paling tajam. Wordmark berada di komponen `Brand` dalam `src/App.tsx`.

## Pembaruan v1.1 — UI / UX

- Navigasi tiga tahapan yang dapat diklik: Pindai Label, Hasil Analisis, Detail & Tren.
- Tombol **Mulai Scan** pada header untuk melompat ke workspace analisis.
- Efek garis pemindaian pada kamera mockup (animasi visual, bukan deteksi QR).
- Panel perbandingan warna baseline dan warna terukur setelah perhitungan ΔE.
- Penyempurnaan navigasi responsif di layar smartphone; animasi menghormati `prefers-reduced-motion`.
- Logo tetap memakai aset `public/assets/sensanin-mark.png` yang diekstraksi dari referensi desain sebelumnya.

Proyek v1.1 mempertahankan schema LocalStorage v2 agar data demo yang sudah tersimpan di browser pengguna tidak dihapus. Nilai ΔE dari piksel foto tetap hanya demonstrasi teknis, dan kategorisasi tetap simulasi. QR scanning menggunakan `@zxing/browser` dan membutuhkan izin kamera di localhost atau HTTPS.

Untuk menjalankan: `npm install`, lalu `npm run dev`. Untuk pengecekan produksi: `npm run build`.
