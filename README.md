# SENSANIN v2.7 — Smart Freshness Monitoring

React + TypeScript + Vite mobile-friendly supermarket MVP.

## Workflow
- **Ringkasan**: inventory summary and demo classification.
- **Penerimaan**: import **supplier manifest for beef already packed in SENSANIN packaging**; register arrival; scan and verify QR; assign chiller/rack/level; confirm.
- **Mulai Scan**: QR identifies the label associated with a registered package, then performs experimental frame-based color sampling.
- **Data Inventory**: packages, batches, labels, locations, relocation, history.
- **Aktivitas**: operational trace logs including manifest imports, verification, exceptions and freshness scans.

## Setup

```sh
npm install
npm run build
npm run dev
```

## Deploy
`vite.config.ts` uses `base: '/sensanin-mvp/'` for the existing GitHub Pages project.
Push to `main` only after `npm run build` succeeds. GitHub Actions in `.github/workflows/deploy.yml` builds and deploys automatically.

## Import supplier manifest
Upload CSV with headings:

`label_id,product_name,beef_type,supplier_batch,production_date,expiration_date,source_package_id`

Each CSV currently represents one homogeneous supplier batch, not a mixed-item delivery. The supermarket doesn't create/print QR codes or manage unattached label stock.

See `V2_7_CHANGELOG.md` for technical and scientific limitations. Demo store is `SUPERMARKET-A` and storage is browser `LocalStorage`, not a production database.
