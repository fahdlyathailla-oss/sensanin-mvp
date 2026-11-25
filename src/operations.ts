import type { Product } from './data';
export type Batch = { id:string; productName:string; beefType:string; supplier:string; supplierBatch:string; productionDate:string; expirationDate:string; quantity:number; receivedAt:string; createdBy:string; packageIds:string[]; supermarketId?:string; shipmentId?:string };
export type Location = {chiller:string;rack:string;level:string};
export type LocationEvent = {id:string;packageId:string;batchId:string;previous:Location|null;next:Location;by:string;at:string};
export type ActivityType = 'Scanning'|'Batch Registration'|'Product Placement'|'Location Update'|'Label Intake'|'Label Assignment'|'Label Invalidated'|'Receiving Confirmation'|'Label Retired'|'Label Assignment Failure'|'Shipment Manifest Imported'|'Package Verification'|'Receiving Exception';
export type Activity = {id:string;type:ActivityType;reference:string;batchId?:string;packageIds?:string[];description:string;by:string;at:string;metadata?:Record<string,string|number|boolean|null>};
export type Operations = {batches:Batch[];locations:Record<string,Location>;locationHistory:LocationEvent[];activities:Activity[];nextPackage:number;nextBatch:number;confirmations?:Record<string,'Completed'|'Partially Completed'>};
export const emptyOperations:Operations={batches:[],locations:{},locationHistory:[],activities:[],nextPackage:1,nextBatch:1,confirmations:{}};
export const locationText=(loc?:Location|null)=>loc?`${loc.chiller} / ${loc.rack} / ${loc.level}`:'Belum ditempatkan';
export const batchPlacement=(b:Batch, locations:Record<string,Location>)=>{
  const placed=b.packageIds.filter(id=>Boolean(locations[id])).length;
  return {placed,awaiting:b.packageIds.length-placed,status:placed===0?'Awaiting Placement':placed===b.packageIds.length?'Fully Placed':'Partially Placed'};
};
export const addPackageToInventory=(batch:Batch,id:string):Product=>({
  id,productName:batch.productName,beefType:batch.beefType,batchNumber:batch.id,
  productionDate:batch.productionDate,expirationDate:batch.expirationDate,
  initialColorReference:[118,72,133],currentColor:[118,72,133],deltaE:0,freshnessStatus:'INSPECTION REQUIRED',
  lastScannedAt:'',recommendedAction:'Belum dilakukan analisis indikator; inspeksi manual diperlukan'
});
const pad=(v:number,n=3)=>String(v).padStart(n,'0');
const localDate=(date:Date)=>`${date.getFullYear()}${pad(date.getMonth()+1,2)}${pad(date.getDate(),2)}`;
export function registerBatch(old:Operations, input:Omit<Batch,'id'|'receivedAt'|'createdBy'|'packageIds'>,by:string, currentProducts:Product[]){
  if(!input.productName.trim()||!input.supplier.trim())throw Error('Produk dan supplier harus diisi.');
  if(!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>500)throw Error('Jumlah paket harus bilangan bulat 1–500.');
  if(!input.productionDate||!input.expirationDate||input.productionDate>input.expirationDate)throw Error('Tanggal produksi tidak boleh melewati tanggal kedaluwarsa.');
  const now=new Date(),stamp=now.toISOString(),date=localDate(now);
  let seq=Math.max(1,old.nextBatch);
  let id=`B-${date}-${pad(seq)}`;
  while(old.batches.some(b=>b.id===id)){seq++;id=`B-${date}-${pad(seq)}`;}
  let next=Math.max(1,old.nextPackage);
  const occupied=new Set([...currentProducts.map(p=>p.id),...old.batches.flatMap(b=>b.packageIds)]);
  const packageIds:string[]=[];
  while(packageIds.length<input.quantity){const candidate=`PKG-${pad(next,6)}`;next++;if(!occupied.has(candidate)){packageIds.push(candidate);occupied.add(candidate);}}
  const batch:Batch={...input,id,receivedAt:stamp,createdBy:by,packageIds};
  const activity:Activity={id:crypto.randomUUID(),type:'Batch Registration',reference:id,batchId:id,packageIds,description:`Mendaftarkan ${input.quantity} paket ${input.productName} dari ${input.supplier}`,by,at:stamp,metadata:{quantity:input.quantity,supplier:input.supplier}};
  return {batch,newProducts:packageIds.map(pid=>addPackageToInventory(batch,pid)),state:{...old,batches:[batch,...old.batches],activities:[activity,...old.activities],nextBatch:seq+1,nextPackage:next}};
}
export function placePackages(old:Operations, batchId:string,ids:string[],next:Location,by:string,mode:'placement'|'relocation'){
  if(!ids.length)throw Error('Pilih minimal satu paket.');
  if(!next.chiller||!next.rack||!next.level)throw Error('Lengkapi seluruh dropdown lokasi.');
  const batch=old.batches.find(b=>b.id===batchId);
  if(!batch)throw Error('Batch tidak ditemukan.');
  if(ids.some(id=>!batch.packageIds.includes(id)))throw Error('Ada Package ID yang bukan bagian dari batch ini.');
  if(mode==='placement'&&ids.some(id=>old.locations[id]))throw Error('Ada paket yang sudah ditempatkan. Gunakan Ubah Lokasi.');
  if(mode==='relocation'&&ids.some(id=>!old.locations[id]))throw Error('Paket belum ditempatkan. Gunakan Penempatan awal.');
  const now=new Date().toISOString();
  const changes=ids.filter(id=>locationText(old.locations[id])!==locationText(next));
  if(!changes.length)throw Error('Lokasi baru sama dengan lokasi sebelumnya.');
  const events=changes.map(id=>({id:crypto.randomUUID(),packageId:id,batchId,previous:old.locations[id]||null,next,by,at:now}));
  const activities=events.map(e=>({id:crypto.randomUUID(),type:mode==='placement'?'Product Placement':'Location Update' as ActivityType,reference:e.packageId,batchId,packageIds:[e.packageId],description:`${locationText(e.previous)} → ${locationText(next)}`,by,at:now,metadata:{previous:locationText(e.previous),next:locationText(next)}}));
  return {...old,locations:{...old.locations,...Object.fromEntries(changes.map(id=>[id,next]))},locationHistory:[...events,...old.locationHistory],activities:[...activities,...old.activities]};
}
export function scanActivity(old:Operations,id:string,by:string,deltaE:number,mode:string,classification:string,labelId?:string):Operations {
  const batch=old.batches.find(b=>b.packageIds.includes(id));
  const event:Activity={id:crypto.randomUUID(),type:'Scanning',reference:id,batchId:batch?.id,packageIds:[id],description:`Pemindaian indikator berhasil · ΔE ${deltaE.toFixed(2)} · ${classification} (${mode})`,by,at:new Date().toISOString(),metadata:{deltaE,mode,classification,labelId:labelId||''}};
  return {...old,activities:[event,...old.activities]};
}

export function confirmReceiving(old:Operations,batchId:string,assigned:number,placed:number,by:string,partial:boolean){
  const batch=old.batches.find(b=>b.id===batchId);
  if(!batch)throw Error('Batch tidak ditemukan.');
  const completed=assigned===batch.quantity&&placed===batch.quantity;
  if(!completed&&!partial)throw Error('Masih ada paket yang belum lengkap. Pilih simpan sebagian.');
  const status=completed?'Completed' as const:'Partially Completed' as const;
  const entry:Activity={id:crypto.randomUUID(),type:'Receiving Confirmation',reference:batchId,batchId,description:`Penerimaan ${status}. Label ${assigned}/${batch.quantity}, lokasi ${placed}/${batch.quantity}.`,by,at:new Date().toISOString(),metadata:{assigned,placed,total:batch.quantity,status}};
  return {...old,confirmations:{...(old.confirmations||{}),[batchId]:status},activities:[entry,...old.activities]};
}
