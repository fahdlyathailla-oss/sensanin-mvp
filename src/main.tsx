import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

/**
 * Three completed example receipts for SENSANIN v2.7.1.
 * One-file, idempotent LocalStorage seed. Existing inventory is never reset.
 * These are fictional receiving records, not real freshness measurements.
 */
function seedThreeReceiptsOnce(): void {
  const marker = 'sensanin-demo-receiving-3-v1';
  if (localStorage.getItem(marker) === 'done') return;

  const keys = {
    products: 'sensanin-products-v2',
    operations: 'sensanin-operations-v3',
    inbound: 'sensanin-inbound-v27',
    labels: 'sensanin-supplied-label-stock-v1',
  } as const;

  type StoreData = { [key: string]: unknown };
  const load = (key: string, fallback: StoreData): StoreData => {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error(`Data ${key} tidak valid`);
    return parsed as StoreData;
  };

  try {
    const existingProductsRaw = localStorage.getItem(keys.products);
    const existingProducts: StoreData[] = existingProductsRaw ? JSON.parse(existingProductsRaw) : [];
    if (!Array.isArray(existingProducts)) throw Error('Data produk bukan array');
    const operations = load(keys.operations, { batches: [], locations: {}, locationHistory: [], activities: [], nextPackage: 1, nextBatch: 1, confirmations: {} });
    const inbound = load(keys.inbound, { shipments: [] });
    const labelStock = load(keys.labels, { labels: [], shipments: [] });
    const batches = operations.batches as StoreData[];
    const activities = operations.activities as StoreData[];
    const locationHistory = operations.locationHistory as StoreData[];
    const locations = operations.locations as Record<string,unknown>;
    const confirmations = (operations.confirmations || {}) as Record<string,string>;
    const shipments = inbound.shipments as StoreData[];
    const labels = labelStock.labels as StoreData[];
    const labelShipments = (labelStock.shipments || []) as StoreData[];
    if (![batches,activities,locationHistory,shipments,labels,labelShipments].every(Array.isArray)) throw Error('Struktur data lokal tidak cocok');

    const now = new Date().toISOString();
    const by = 'SENSANIN Demo';
    const store = 'SUPERMARKET-A';
    const examples = [
      { i: 1, product: 'Fresh Beef Sirloin', cut: 'Sirloin', label: 'SN-10241', supplierBatch: 'SUP-DS-001', location: { chiller: 'Chiller A', rack: 'Rack A', level: 'Level 1' } },
      { i: 2, product: 'Fresh Beef Ribeye', cut: 'Ribeye', label: 'LBL-SN-000002', supplierBatch: 'SUP-DS-002', location: { chiller: 'Chiller A', rack: 'Rack B', level: 'Level 1' } },
      { i: 3, product: 'Fresh Beef Tenderloin', cut: 'Tenderloin', label: 'LBL-SN-000003', supplierBatch: 'SUP-DS-003', location: { chiller: 'Chiller B', rack: 'Rack A', level: 'Level 2' } },
    ];

    const activity = (type:string,reference:string,batchId:string,packageId:string,description:string) => ({
      id: `ACT-DEMO-3-${type.replace(/\s+/g,'-')}-${packageId}`,
      type, reference, batchId, packageIds:[packageId], description, by, at:now,
    });

    for (const e of examples) {
      const suffix = String(e.i).padStart(3,'0');
      const shipmentId = `SHP-DEMO-${suffix}`;
      const batchId = `B-DEMO-${suffix}`;
      const packageId = `PKG-DEMO-${suffix}`;
      // Never create half-linked duplicate examples over existing user-owned records.
      if (shipments.some(s => s.id === shipmentId) || batches.some(b => b.id === batchId)
          || existingProducts.some(p => p.id === packageId) || labels.some(l => l.id === e.label)) continue;

      const manifestItem = {
        labelId: e.label, productName:e.product, beefType:e.cut,
        supplierBatch:e.supplierBatch, productionDate:'2026-11-26', expirationDate:'2026-12-03',
        sourcePackageId:`PACKER-DEMO-${suffix}`,
      };
      shipments.unshift({
        id:shipmentId, supplier:'PT Mitra Pengemas Daging (Demo)', supermarketId:store,
        deliveryReference:`DO-DEMO-${suffix}`, importedAt:now,
        items:[manifestItem], batchId,
        verified:{ [e.label]:{ packageId, at:now, by } },
      });
      batches.unshift({
        id:batchId,productName:e.product,beefType:e.cut,supplier:'PT Mitra Pengemas Daging (Demo)',
        supplierBatch:e.supplierBatch,productionDate:'2026-11-26',expirationDate:'2026-12-03',
        quantity:1,receivedAt:now,createdBy:by,packageIds:[packageId],supermarketId:store,shipmentId,
      });
      existingProducts.unshift({
        id:packageId,productName:e.product,beefType:e.cut,batchNumber:batchId,
        productionDate:'2026-11-26',expirationDate:'2026-12-03',
        initialColorReference:[118,72,133],currentColor:[118,72,133],deltaE:0,
        freshnessStatus:'INSPECTION REQUIRED',lastScannedAt:'',
        recommendedAction:'Data demo penerimaan: indikator belum dipindai; perlu verifikasi/inspeksi',
      });
      labels.push({id:e.label,status:'ASSIGNED',packageId,receivedAt:now,assignedAt:now,supermarketId:store,shipmentId});
      labelShipments.unshift({id:shipmentId,supermarketId:store,quantity:1,shipmentDate:now.slice(0,10),deliveryReference:`DO-DEMO-${suffix}`,importedAt:now});
      locations[packageId] = e.location;
      confirmations[batchId] = 'Completed';
      locationHistory.unshift({id:`LOC-DEMO-${suffix}`,packageId,batchId,previous:null,next:e.location,by,at:now});
      activities.unshift(
        activity('Receiving Confirmation',batchId,batchId,packageId,`Demo: penerimaan ${e.product} selesai.`),
        activity('Product Placement',packageId,batchId,packageId,`Demo: paket ditempatkan di ${e.location.chiller} / ${e.location.rack} / ${e.location.level}.`),
        activity('Package Verification',packageId,batchId,packageId,`Demo: Label ID ${e.label} terverifikasi untuk ${packageId}.`),
        activity('Batch Registration',batchId,batchId,packageId,`Demo: batch ${batchId} terdaftar.`),
        activity('Shipment Manifest Imported',shipmentId,batchId,packageId,`Demo: manifest pengiriman ${shipmentId} dimuat.`),
      );
    }
    operations.confirmations = confirmations;
    operations.nextBatch = Math.max(Number(operations.nextBatch)||1, 1);
    operations.nextPackage = Math.max(Number(operations.nextPackage)||1, 1);
    labelStock.shipments = labelShipments;

    // Store snapshots first, marker last. No writes during later page refreshes.
    localStorage.setItem(keys.products,JSON.stringify(existingProducts));
    localStorage.setItem(keys.operations,JSON.stringify(operations));
    localStorage.setItem(keys.inbound,JSON.stringify(inbound));
    localStorage.setItem(keys.labels,JSON.stringify(labelStock));
    localStorage.setItem(marker,'done');
  } catch (error) {
    console.warn('SENSANIN: contoh penerimaan tidak bisa ditambahkan; data lama dipertahankan.',error);
  }
}

seedThreeReceiptsOnce();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
