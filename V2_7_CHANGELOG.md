# SENSANIN v2.7 — Retail Receiving for Pre-labelled Meat

**Foundation:** SENSANIN v2.6. React, TypeScript, Vite, brand styling, five bottom navigation items, inventory screen, activity screen, and autoScan.ts retained.

## Business correction
SENSANIN develops smart packaging and digital color sensing. Packaging partners integrate supplied packaging into beef products on the packaging line. Supermarkets **receive retail-ready packages already bearing QR and anthocyanin indicators**.

Retail staff do NOT create, print, or apply labels. Supermarket receiving does NOT manage unused physical smart-label stock.

## Revised receiving process
1. Import supplier shipment CSV containing Label IDs, product name/cut, supplier batch, production and expiry dates.
2. Select imported shipment and register the arrival. The supermarket creates internal Batch and Package IDs, distinct from pre-existing Label IDs.
3. Scan the **existing QR on each packaged beef tray** to verify each Label ID against that specific supplier manifest. Continuous camera scanning and manual ID fallback are available. Duplicate or unknown labels are rejected.
4. Assign verified packages to Chiller/Rack/Level with dropdowns (multi-package, split locations supported).
5. Confirm full or partial receiving. Exceptions can be logged for QA.
6. Scans, receipts, placement and relabel-related legacy activity logs remain visible in Activity.

## CSV format
Required headers: `label_id,product_name,supplier_batch,production_date,expiration_date`.
Optional: `beef_type,source_package_id`.
One supplier batch/product type per manifest is supported in this MVP. Dates use `YYYY-MM-DD`.
See `supplier_manifest_example.csv` in the project root. The UI also provides a downloadable template.

## Technical scope and limitations
- Manifest import is a **prototype stand-in** for upstream packer-to-retailer integration.
- `LocalStorage` is used for persistence. No secure store login, external supplier sync, cross-device uniqueness, or tamper-proof audit log.
- Existing v2.6 data is not deleted; labels previously associated with packages remain usable in monitoring, but new retail-receiving records should use imported supplier manifests.
- `src/autoScan.ts` is preserved from v2.6. It samples the purple indicator using simple white-background normalization; **it does not yet implement calibrated color-reference values inside a true Color QR Code** as specified in the research proposal.
- ΔE is measured from digital colors in the camera prototype, but status thresholds are **simulation only**; do not infer microbiological safety or remaining shelf life.
- Scan test requires actual QR codes containing Label IDs listed in the imported manifest; the photograph supplied in the project is a layout reference, not necessarily a decodable QR.

## Acceptance scenario covered by logic-level tests
- Import shipment with 100 Label IDs.
- Register another shipment containing 20 products, auto-create 20 unique Package IDs.
- Verify 20 label codes and reject duplicates and codes from a different shipment.
- Place 10 packages in Chiller A / Rack A / Level 1, and 10 in Chiller A / Rack B / Level 2.
- Confirm receiving and verify event records.

**Build verification:** TypeScript/TSX syntax checked. Full `npm run build` and real physical-camera integration have not been validated in this environment. Run `npm install`, `npm run build`, and `npm run dev` before deployment.
