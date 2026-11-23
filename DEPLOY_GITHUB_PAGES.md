# Deploy SENSANIN v2.1 Live Scanner ke GitHub Pages

Paket ini sudah mencakup konfigurasi Vite untuk repository `sensanin-mvp`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: '/sensanin-mvp/' });
```

`src/vite-env.d.ts` mengaktifkan type `import.meta.env.BASE_URL`. Aset publik ada di `public/assets`, dan `src/App.tsx` mengaksesnya melalui `BASE_URL`.

## Memperbarui repository yang sudah ada

1. Backup proyek lama di VS Code.
2. Copy **isi** folder `sensanin-mvp` dari ZIP ini ke folder proyek lokal lama `sensanin-mvp`, replace file yang sama. Jangan hapus folder `.git` milik repository lokal.
3. Dari terminal di root proyek jalankan `npm install`, `npm run build`, lalu `npm run dev` untuk tes.
4. Bila siap, jalankan `git add .`, `git commit -m "Upgrade SENSANIN v2.1 live scanner"`, dan `git push origin main`.
5. GitHub Actions akan mem-build dan deploy. URL: `https://fahdlyathailla-oss.github.io/sensanin-mvp/`.

Jika nanti repository diubah namanya, ubah `base` di `vite.config.ts` mengikuti path repository. Jangan gunakan `base: '/'` kecuali untuk repository root `username.github.io`.

Akses kamera browser HP membutuhkan HTTPS dan izin pengguna. QR harus memuat ID produk demo yang dikenali. Data dan klasifikasi bersifat demonstrasi dan tidak boleh digunakan untuk menentukan keamanan pangan.
