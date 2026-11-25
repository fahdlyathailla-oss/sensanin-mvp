import type { Operations, Activity } from './operations';

export type LabelStatus = 'AVAILABLE'|'ASSIGNED'|'DAMAGED'|'RETIRED';
export type SmartLabel = {id:string;status:LabelStatus;packageId?:string;receivedAt:string;assignedAt?:string;usedAt?:string;damageReason?:string;supermarketId?:string;shipmentId?:string};
export type LabelShipment={id:string;supermarketId:string;quantity:number;shipmentDate:string;deliveryReference:string;importedAt:string};
export type LabelStock = {labels:SmartLabel[];shipments?:LabelShipment[]};
export const emptyLabelStock:LabelStock={labels:[],shipments:[]};
export const DEMO_STORE='SUPERMARKET-A';
const timestamp=()=>new Date().toISOString();
const normalized=(s:string)=>s.trim().toUpperCase();
const event=(type:Activity['type'],ref:string,desc:string,by:string,metadata:Record<string,string|number|boolean|null>={}):Activity=>({id:crypto.randomUUID(),type,reference:ref,description:desc,by,at:timestamp(),metadata});

export function parseLabelManifest(raw:string):string[]{
  const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length)throw Error('File CSV/manifest kosong.');
  // Supports a one-column CSV or a CSV with a label_id / labelId column.
  const first=lines[0].split(/[,;\t]/).map(s=>s.replace(/^['"]|['"]$/g,'').trim().toLowerCase());
  const headerIndex=first.findIndex(x=>['label_id','labelid','label id','id'].includes(x));
  const codes=lines.slice(headerIndex>=0?1:0).map(line=>{
    const cells=line.split(/[,;\t]/).map(c=>c.replace(/^['"]|['"]$/g,'').trim());
    return normalized(cells[headerIndex>=0?headerIndex:0]||'');
  }).filter(Boolean);
  if(!codes.length)throw Error('Manifest tidak memuat Label ID.');
  if(codes.some(x=>!/^[A-Z0-9][A-Z0-9._:-]{2,79}$/.test(x)))throw Error('Format Label ID tidak valid.');
  if(new Set(codes).size!==codes.length)throw Error('Manifest memuat Label ID duplikat.');
  return codes;
}
export function importShipment(stock:LabelStock,ops:Operations,raw:string,shipmentId:string,supermarketId:string,deliveryReference:string,by:string){
  const codes=parseLabelManifest(raw);
  const shipment=normalized(shipmentId),supermarket=normalized(supermarketId);
  if(!shipment||!supermarket)throw Error('Shipment ID dan Supermarket wajib diisi.');
  if(stock.shipments?.some(s=>s.id===shipment))throw Error('Shipment ID sudah terdaftar.');
  if(codes.some(id=>stock.labels.some(l=>l.id===id)))throw Error('Ada Label ID yang sudah terdaftar di pengiriman lain.');
  const at=timestamp();
  const labels:SmartLabel[]=codes.map(id=>({id,status:'AVAILABLE',receivedAt:at,supermarketId:supermarket,shipmentId:shipment}));
  const shipmentRecord:LabelShipment={id:shipment,supermarketId:supermarket,quantity:codes.length,shipmentDate:at.slice(0,10),deliveryReference,importedAt:at};
  const entry=event('Label Intake',shipment,`Import ${codes.length} Label ID praproduksi dari shipment ${shipment} untuk ${supermarket}.`,by,{supermarketId:supermarket,quantity:codes.length});
  return {stock:{labels:[...labels,...stock.labels],shipments:[shipmentRecord,...(stock.shipments||[])]},ops:{...ops,activities:[entry,...ops.activities]}};
}
// Keep previous helper for migration/API compatibility. No QR is ever generated.
export function importSuppliedLabels(stock:LabelStock,ops:Operations,raw:string,by:string){
  return importShipment(stock,ops,raw,`LEGACY-${crypto.randomUUID().slice(0,8).toUpperCase()}`,DEMO_STORE,'Migrasi daftar label lama',by);
}
export function assignSuppliedLabel(stock:LabelStock,ops:Operations,labelId:string,packageId:string,by:string,supermarketId=DEMO_STORE){
  const id=normalized(labelId);
  const label=stock.labels.find(l=>l.id===id);
  if(!label)throw Error('Label ID tidak terdaftar dalam shipment.');
  if((label.supermarketId||DEMO_STORE)!==normalized(supermarketId))throw Error('Label ini dialokasikan untuk supermarket lain.');
  if(label.status!=='AVAILABLE')throw Error(`Label ${id} tidak tersedia (${label.status}).`);
  const batch=ops.batches.find(b=>b.packageIds.includes(packageId));
  if(!batch)throw Error('Package ID tidak terdaftar di Penerimaan.');
  if((batch.supermarketId||DEMO_STORE)!==normalized(supermarketId))throw Error('Paket tercatat untuk supermarket lain.');
  if(stock.labels.some(l=>l.packageId===packageId&&['ASSIGNED'].includes(l.status)))throw Error('Paket sudah memiliki label aktif.');
  const at=timestamp();
  const labels=stock.labels.map(l=>l.id===id?{...l,packageId,status:'ASSIGNED' as const,assignedAt:at}:l);
  const entry=event('Label Assignment',packageId,`Label fisik ${id} dipasangkan ke ${packageId}.`,by,{labelId:id,batchId:batch.id,supermarketId});
  return {stock:{...stock,labels},ops:{...ops,activities:[entry,...ops.activities]}};
}
export function markSuppliedLabelDamaged(stock:LabelStock,ops:Operations,labelId:string,reason:string,by:string){
  const id=normalized(labelId),label=stock.labels.find(l=>l.id===id);
  if(!label)throw Error('Label tidak ditemukan.');
  if(label.status==='RETIRED')throw Error('Label sudah retired.');
  if(!reason.trim())throw Error('Alasan kerusakan wajib diisi.');
  const labels=stock.labels.map(l=>l.id===id?{...l,status:'DAMAGED' as const,damageReason:reason.trim()}:l);
  const entry=event('Label Invalidated',id,`Label ${id} rusak: ${reason.trim()}`,by,{packageId:label.packageId||''});
  return {stock:{...stock,labels},ops:{...ops,activities:[entry,...ops.activities]}};
}
export function retireLabel(stock:LabelStock,ops:Operations,labelId:string,by:string){
  const id=normalized(labelId),label=stock.labels.find(l=>l.id===id);
  if(!label)throw Error('Label tidak ditemukan.');
  if(label.status==='ASSIGNED')throw Error('Label terpasang tidak bisa langsung di-retire.');
  if(label.status==='RETIRED')throw Error('Label sudah retired.');
  const entry=event('Label Retired',id,`Label ${id} ditarik permanen.`,by);
  return {stock:{...stock,labels:stock.labels.map(l=>l.id===id?{...l,status:'RETIRED' as const}:l)},ops:{...ops,activities:[entry,...ops.activities]}};
}
export function resolveLabelQR(raw:string,stock:LabelStock){
  let code=raw.trim();
  try{const parsed=JSON.parse(code);if(parsed&&typeof parsed==='object')code=String(parsed.labelId||parsed.label_id||parsed.id||code)}catch{/* plain code */}
  try{const url=new URL(code);code=url.searchParams.get('labelId')||url.pathname.split('/').filter(Boolean).pop()||code}catch{/* plain code */}
  return stock.labels.find(l=>l.id===normalized(code));
}
