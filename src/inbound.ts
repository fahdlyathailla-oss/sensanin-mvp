import type { Operations, Activity } from './operations';
import type { LabelStock } from './labelInventory';
export type ManifestItem={labelId:string;productName:string;beefType:string;supplierBatch:string;productionDate:string;expirationDate:string;sourcePackageId?:string};
export type InboundShipment={id:string;supplier:string;supermarketId:string;deliveryReference:string;importedAt:string;items:ManifestItem[];batchId?:string;verified:Record<string,{packageId:string;at:string;by:string}>};
export type InboundState={shipments:InboundShipment[]};
export const emptyInbound:InboundState={shipments:[]};
const upper=(s:string)=>s.trim().toUpperCase();
export function qrLabelId(raw:string):string{
  let value=raw.trim();
  try{const o=JSON.parse(value);if(typeof o==='object'&&o)value=String(o.labelId||o.label_id||o.id||value)}catch{ /* plain QR */ }
  try{const url=new URL(value);value=url.searchParams.get('labelId')||url.searchParams.get('label_id')||url.pathname.split('/').filter(Boolean).pop()||value}catch{ /* non-URL */ }
  return upper(value);
}
function readCSV(raw:string):string[][] {
  const out:string[][]=[];let cell='',row:string[]=[],quoted=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(c==='"'){if(quoted&&raw[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
    else if(!quoted&&(c===','||c===';'||c==='\t')){row.push(cell.trim());cell=''}
    else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))out.push(row);row=[];cell=''}
    else cell+=c;
  }
  if(quoted)throw Error('CSV memiliki tanda kutip yang tidak ditutup.');
  row.push(cell.trim());if(row.some(Boolean))out.push(row);
  return out;
}
export function parseInboundManifest(raw:string):ManifestItem[]{
  const rows=readCSV(raw.replace(/^\uFEFF/,''));if(rows.length<2)throw Error('CSV harus memiliki header dan minimal satu kemasan.');
  const head=rows[0].map(x=>x.toLowerCase().replace(/[ -]/g,'_'));
  const col=(names:string[])=>names.map(n=>head.indexOf(n)).find(i=>i>=0)??-1;
  const keys={labelId:col(['label_id','labelid']),productName:col(['product_name','product']),beefType:col(['beef_type','cut']),supplierBatch:col(['supplier_batch','batch_supplier','batch']),productionDate:col(['production_date','packaging_date']),expirationDate:col(['expiration_date','expiry_date']),sourcePackageId:col(['source_package_id','supplier_package_id'])};
  for(const name of ['labelId','productName','supplierBatch','productionDate','expirationDate'] as const)if(keys[name]<0)throw Error(`Header wajib tidak ditemukan: ${name}.`);
  const items=rows.slice(1).map((r,i)=>{
    const get=(idx:number)=>idx<0?'':(r[idx]||'').trim();
    const item:ManifestItem={labelId:upper(get(keys.labelId)),productName:get(keys.productName),beefType:get(keys.beefType)||get(keys.productName),supplierBatch:get(keys.supplierBatch),productionDate:get(keys.productionDate),expirationDate:get(keys.expirationDate),sourcePackageId:get(keys.sourcePackageId)||undefined};
    if(!/^[A-Z0-9][A-Z0-9._:-]{2,79}$/.test(item.labelId))throw Error(`Label ID baris ${i+2} tidak valid.`);
    if(!item.productName||!item.supplierBatch||!item.productionDate||!item.expirationDate)throw Error(`Data produk/batch/tanggal belum lengkap di baris ${i+2}.`);
    if(!/^\d{4}-\d\d-\d\d$/.test(item.productionDate)||!/^\d{4}-\d\d-\d\d$/.test(item.expirationDate)||item.productionDate>item.expirationDate)throw Error(`Tanggal salah di baris ${i+2}; gunakan YYYY-MM-DD.`);
    return item;
  });
  if(new Set(items.map(i=>i.labelId)).size!==items.length)throw Error('Label ID duplikat dalam manifest.');
  if(items.length>500)throw Error('Untuk MVP, maksimal 500 kemasan per manifest.');
  const first=items[0];
  if(items.some(x=>x.productName!==first.productName||x.beefType!==first.beefType||x.supplierBatch!==first.supplierBatch||x.productionDate!==first.productionDate||x.expirationDate!==first.expirationDate))throw Error('Prototipe memerlukan satu jenis produk dan batch supplier per manifest. Pisahkan manifest untuk batch berbeda.');
  return items;
}
export function addInboundManifest(old:InboundState,ops:Operations,stock:LabelStock,raw:string,shipmentId:string,supplier:string,store:string,deliveryReference:string,by:string){
  const id=upper(shipmentId),supermarketId=upper(store),items=parseInboundManifest(raw);
  if(!id||!supplier.trim()||!supermarketId)throw Error('Shipment ID, supermarket, dan pengemas wajib diisi.');
  if(old.shipments.some(s=>s.id===id))throw Error('Shipment ID sudah terdaftar.');
  const all=new Set(old.shipments.flatMap(s=>s.items.map(i=>i.labelId)));
  if(items.some(i=>all.has(i.labelId)))throw Error('Ada Label ID yang sudah tercatat pada manifest pengiriman lain.');
  if(items.some(i=>stock.labels.some(l=>l.id===i.labelId&&l.status==='ASSIGNED')))throw Error('Ada Label ID yang sudah digunakan pada paket sebelumnya.');
  const at=new Date().toISOString();
  const shipment:InboundShipment={id,supplier:supplier.trim(),supermarketId,deliveryReference:deliveryReference.trim(),importedAt:at,items,verified:{}};
  const activity:Activity={id:crypto.randomUUID(),type:'Shipment Manifest Imported',reference:id,description:`Manifest ${id}: ${items.length} kemasan ${items[0].productName} dari ${supplier.trim()} diterima sebagai data pra-kedatangan.`,by,at,metadata:{store:supermarketId,quantity:items.length}};
  return {inbound:{shipments:[shipment,...old.shipments]},operations:{...ops,activities:[activity,...ops.activities]}};
}
export function linkReceivingBatch(old:InboundState,shipmentId:string,batchId:string):InboundState{
  const shipment=old.shipments.find(s=>s.id===shipmentId);if(!shipment)throw Error('Manifest tidak ditemukan.');
  if(shipment.batchId)throw Error('Pengiriman ini sudah memiliki batch penerimaan.');
  return {shipments:old.shipments.map(s=>s.id===shipmentId?{...s,batchId}:s)};
}
export function verifyReceivedLabel(inbound:InboundState,ops:Operations,stock:LabelStock,qr:string,shipmentId:string,by:string){
  const id=qrLabelId(qr),shipment=inbound.shipments.find(s=>s.id===shipmentId);
  if(!shipment||!shipment.batchId)throw Error('Daftarkan batch berdasarkan manifest sebelum scanning.');
  const itemIndex=shipment.items.findIndex(i=>i.labelId===id);
  if(itemIndex<0){const elsewhere=inbound.shipments.find(s=>s.items.some(i=>i.labelId===id));throw Error(elsewhere?'Label berasal dari pengiriman lain atau supermarket lain.':'Label ID tidak tercantum di manifest pengiriman.');}
  if(shipment.verified[id])throw Error(`Label ${id} sudah diverifikasi dalam penerimaan ini.`);
  if(stock.labels.some(l=>l.id===id&&l.status==='ASSIGNED'))throw Error('Label sudah terkait dengan paket lain.');
  const batch=ops.batches.find(b=>b.id===shipment.batchId);
  if(!batch)throw Error('Batch penerimaan tidak ditemukan.');
  if((batch.supermarketId||'SUPERMARKET-A')!==shipment.supermarketId)throw Error('Supermarket batch dan manifest tidak cocok.');
  const packageId=batch.packageIds[itemIndex];if(!packageId)throw Error('Package ID tidak tersedia untuk label ini.');
  if(Object.values(shipment.verified).some(v=>v.packageId===packageId))throw Error('Paket sudah diverifikasi dengan label lain.');
  const at=new Date().toISOString();
  const updated={...shipment,verified:{...shipment.verified,[id]:{packageId,at,by}}};
  const activity:Activity={id:crypto.randomUUID(),type:'Package Verification',reference:packageId,batchId:batch.id,packageIds:[packageId],description:`Kemasan berlabel ${id} diverifikasi dari pengiriman ${shipment.id} → ${packageId}.`,by,at,metadata:{labelId:id,shipmentId:shipment.id}};
  const labels=stock.labels.filter(l=>l.id!==id);
  labels.push({id,status:'ASSIGNED',packageId,receivedAt:at,assignedAt:at,supermarketId:shipment.supermarketId,shipmentId:shipment.id});
  return {inbound:{shipments:inbound.shipments.map(s=>s.id===shipment.id?updated:s)},ops:{...ops,activities:[activity,...ops.activities]},stock:{...stock,labels}};
}
export function receivingDiscrepancy(old:Operations,shipmentId:string,reason:string,by:string){
  const at=new Date().toISOString();
  const activity:Activity={id:crypto.randomUUID(),type:'Receiving Exception',reference:shipmentId,description:`Ketidaksesuaian penerimaan ${shipmentId}: ${reason}`,by,at};
  return {...old,activities:[activity,...old.activities]};
}
