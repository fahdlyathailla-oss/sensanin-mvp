# SENSANIN v2.3 — Current Label Auto Scan

Versi ini menyesuaikan scanner otomatis dengan **label SENSANIN yang sekarang**:
- QR / Color QR di sisi kiri
- Patch indikator ungu besar di sisi kanan
- Latar putih label dipakai sebagai referensi cahaya sederhana

## Perubahan utama
- Tidak lagi membutuhkan patch putih terpisah di kanan bawah.
- Kamera live scan tetap otomatis seperti QRIS.
- Setelah QR produk terbaca, sistem mengambil sampel warna patch ungu dan menormalisasi warna menggunakan area putih label.

## Catatan penting
- Ini masih prototipe teknis.
- QR yang dipakai harus valid dan berisi ID produk yang terdaftar (mis. `SN-10241`).
- Hasil ΔE masih dipengaruhi pencahayaan, sudut, fokus, dan kualitas kamera.
- Status freshness tetap simulasi dan belum tervalidasi laboratorium.
