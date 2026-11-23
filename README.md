# SENSANIN v2 — Inventory-first Web Application

SENSANIN is a **mobile-friendly operational inventory prototype** for beef packaging freshness monitoring. Instead of a landing page it opens to a demo login, then the inventory summary. Fixed bottom navigation has: Ringkasan Inventory, elevated Mulai Scan, and Data Inventory.

## Start locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

Vite `base` is configured for `https://fahdlyathailla-oss.github.io/sensanin-mvp/` in `vite.config.ts` as `/sensanin-mvp/`. If using a different repo name, update it. Push to the same GitHub repository; existing GitHub Pages Actions workflow can deploy the build.

## Demo login

Type any staff name and click **Masuk ke SENSANIN**. This is a **demo session gate**, stored in `sessionStorage`, and is **not secure authentication**. Do not use it to protect confidential data. A production login requires an identity provider/backend and authorization rules.

## Functionality

- Inventory summary, provisional freshness statuses, recent activity and actionable items.
- Camera QR scanning via `@zxing/browser` (requires HTTPS or localhost and permission), camera capture and image upload.
- Select two regions of interest: anthocyanin indicator and color reference patch.
- Simplified RGB reference correction, CIELAB D65, CIE76 ΔE calculation.
- Save scan to browser LocalStorage, reflected in inventory summary and data table.
- Search, filter, product detail and CSV export.
- Mobile bottom navigation inspired by the supplied reference, with a raised center scan button.

## Scientific limitation

Color difference is calculated from photographed pixels. The mapping from ΔE to status is **only a configurable illustrative placeholder**, not validated beef freshness or food-safety determination. Color QR assists identity/calibration; it is not the sensor. The prototype does **not** estimate TVB-N, microbial counts, or remaining shelf life.

## Important data notes

This version reuses existing `sensanin-products-v2` and `sensanin-scans-v2` LocalStorage keys for continuity with previous versions. Scans made on separate devices do **not** sync. If synced data is needed, add a proper database/backend (e.g. Supabase) plus secured login.

## Files

- `src/App.tsx` — main application, navigation, scan logic, inventory and demo login.
- `src/style.css` — full responsive design.
- `src/data.ts` — demo model and color math.
- `public/assets` — SENSANIN mark and demo beef photo.
- `src/vite-env.d.ts` — Vite environment TypeScript declarations.


## v2.1 — QRIS-style live scanner

- Open **Mulai Scan** to activate the rear camera automatically (browser permission required; HTTPS or localhost).
- Keep the QR in the frame: the camera continuously decodes QR codes, without a shutter button.
- QR payload must contain a registered package ID, e.g. `SNS-1001`, or JSON `{"productId":"SNS-1001"}` using IDs found in the demo inventory.
- After recognition, the app automatically freezes a video frame **in browser memory** and stops the camera. Select the anthocyanin indicator ROI and the reference color patch ROI for the experimental color analysis workflow; QR recognition alone is not a calibrated freshness test.
- **Scan QR Lagi** resumes continuous decoding. Upload is an accessibility/fallback option if camera permission is unavailable.
- In-app session login is only a demo gate and does not protect a deployment.
