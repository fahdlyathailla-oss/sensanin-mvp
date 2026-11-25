import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { Camera, Check, ChevronRight, FileUp, PackageCheck, Pause, Play, Search, ShieldAlert } from 'lucide-react';
import type { InboundState } from './inbound';
import { qrLabelId } from './inbound';
import type { Location, Operations } from './operations';
import { locationText } from './operations';
import { dateTime } from './data';

type Props={inbound:InboundState;operations:Operations;store:string;onImport:(raw:string,id:string,supplier:string,ref:string)=>void;onRegister:(shipmentId:string)=>string;onVerify:(qr:string,shipmentId:string)=>void;onPlace:(batchId:string,ids:string[],loc:Location)=>void;onConfirm:(batchId:string,partial:boolean)=>void;onException:(shipmentId:string,reason:string)=>void};
const steps=['Registrasi Kedatangan','Scan & Verifikasi','Penempatan','Konfirmasi'];
const today=()=>new Date().toISOString().slice(0,10).replaceAll('-','');
const template='label_id,product_name,beef_type,supplier_batch,production_date,expiration_date,source_package_id\nLBL-SN-000001,Beef Sirloin,Sirloin,SUP-2026-001,2026-11-24,2026-12-01,SUP-PKG-001\nLBL-SN-000002,Beef Sirloin,Sirloin,SUP-2026-001,2026-11-24,2026-12-01,SUP-PKG-002';
const choices=(prefix:string,n:number)=>Array.from({length:n},(_,i)=>`${prefix} ${prefix==='Level'?i+1:String.fromCharCode(65+i)}`);
export function InboundReceiving({inbound,operations,store,onImport,onRegister,onVerify,onPlace,onConfirm,onException}:Props){
  const [shipmentId,setShipmentId]=useState(`SHP-${today()}-001`);
  const [supplier,setSupplier]=useState('');const [reference,setReference]=useState('');const [raw,setRaw]=useState('');
  const [activeId,setActiveId]=useState('');const [step,setStep]=useState(0);
  const [cameraOn,setCameraOn]=useState(false);const video=useRef<HTMLVideoElement>(null);
  const last=useRef<{id:string;time:number}>({id:'',time:0});const scanCallback=useRef<(s:string)=>void>(()=>{});
  const [manual,setManual]=useState('');const [selected,setSelected]=useState<string[]>([]);
  const [loc,setLoc]=useState<Location>({chiller:'',rack:'',level:''});
  const [partial,setPartial]=useState(false);const [notice,setNotice]=useState('');const [error,setError]=useState('');
  const [search,setSearch]=useState('');const [exception,setException]=useState('');
  const shipment=inbound.shipments.find(s=>s.id===activeId&&s.supermarketId===store);
  const batch=operations.batches.find(b=>b.id===shipment?.batchId);
  const total=shipment?.items.length||0;
  const verified=shipment?Object.values(shipment.verified):[];
  const confirmed=Boolean(batch&&operations.confirmations?.[batch.id]==='Completed');
  const placed=batch?batch.packageIds.filter(id=>Boolean(operations.locations[id])).length:0;
  const awaiting=batch?.packageIds.filter(id=>shipment&&Object.values(shipment.verified).some(v=>v.packageId===id)&&!operations.locations[id])||[];
  const markError=(e:unknown)=>{const msg=e instanceof Error?e.message:String(e);setError(msg);setNotice('')};
  function scan(code:string){
    if(!shipment)return;
    try{onVerify(code,shipment.id);setNotice(`✓ ${qrLabelId(code)} berhasil diverifikasi.`);setError('');setManual('')}
    catch(e){markError(e)}
  }
  scanCallback.current=scan;
  useEffect(()=>{
    if(!cameraOn||step!==1||!shipment||!video.current)return;
    let active=true;let stop:(()=>void)|undefined;
    const reader=new BrowserQRCodeReader();
    (async()=>{try{
      const ctrl=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280}}},video.current!,r=>{
        if(!active||!r)return;
        const id=qrLabelId(r.getText()),time=Date.now();
        if(id===last.current.id&&time-last.current.time<1600)return;
        last.current={id,time};scanCallback.current(r.getText());
      });
      if(active)stop=()=>ctrl.stop();else ctrl.stop();
    }catch(e){if(active){setCameraOn(false);setError('Kamera gagal aktif. Periksa izin dan HTTPS. '+String(e))}}})();
    return ()=>{active=false;stop?.()};
  },[cameraOn,step,activeId]);
  function fileLoad(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;f.text().then(setRaw).catch(markError);e.target.value=''}
  function importManifest(){try{onImport(raw,shipmentId,supplier,reference);setNotice(`Manifest ${shipmentId.toUpperCase()} berhasil dimuat. Kemasan di manifest sudah berlabel dari fasilitas pengemasan.`);setError('');setRaw('');setActiveId(shipmentId.toUpperCase());setStep(0)}catch(e){markError(e)}}
  function register(){if(!shipment)return;try{onRegister(shipment.id);setNotice('Batch internal dan Package ID dibuat. Scan QR kemasan fisik yang baru datang.');setError('');setStep(1)}catch(e){markError(e)}}
  function placement(){if(!batch)return;try{onPlace(batch.id,selected,loc);setNotice(`${selected.length} kemasan ditempatkan di ${locationText(loc)}.`);setSelected([]);setError('')}catch(e){markError(e)}}
  function confirm(){if(!batch)return;try{onConfirm(batch.id,partial);setNotice(`Penerimaan ${batch.id} berhasil dikonfirmasi${partial?' sebagian':''}.`);setStep(0);setActiveId('');setCameraOn(false);setError('')}catch(e){markError(e)}}
  function logException(){if(!shipment||!exception.trim())return;try{onException(shipment.id,exception.trim());setNotice('Ketidaksesuaian dicatat dalam Aktivitas.');setException('');setError('')}catch(e){markError(e)}}
  function downloadTemplate(){const blob=new Blob([template],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='sensanin_supplier_manifest_template.csv';a.click();URL.revokeObjectURL(url)}
  return <>
    <section className="page-heading"><div><span className="eyebrow">RETAIL RECEIVING / PACKAGED BEEF</span><h1>Penerimaan Produk</h1><p>Verifikasi daging yang <b>sudah dikemas dan memiliki smart label SENSANIN</b> dari supplier.</p></div></section>
    <div className="op-notice"><ShieldAlert size={16}/> Mode demo satu browser: manifest pemasok diimpor CSV, belum sinkronisasi sistem supplier atau autentikasi supermarket sungguhan.</div>
    {notice&&<div className="op-notice" role="status"><Check size={16}/>{notice}</div>}{error&&<p className="error-text" role="alert">{error}</p>}
    <section className="surface-card"><div className="card-head"><div><span className="eyebrow">SUPPLIER SHIPMENT</span><h3>Manifest Produk Berlabel</h3></div><button className="secondary" onClick={downloadTemplate}>Contoh CSV</button></div>
      <p className="helper">Fasilitas pengemasan sudah memasang smart label dan memberikan manifest berisi Label ID serta informasi produk. Tidak ada proses membuat, mencetak, atau mengalokasikan stiker kosong di supermarket.</p>
      <div className="op-two"><label>Shipment ID<input value={shipmentId} onChange={e=>setShipmentId(e.target.value)}/></label><label>Supplier / Fasilitas pengemasan<input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Nama meat processor"/></label><label>No. surat jalan<input value={reference} onChange={e=>setReference(e.target.value)}/></label><label>Upload CSV dari supplier<input type="file" accept=".csv,text/csv,.txt" onChange={fileLoad}/></label></div>
      <label>Pratinjau isi CSV<textarea rows={3} value={raw} onChange={e=>setRaw(e.target.value)} placeholder={template.split('\n')[0]}/></label>
      <div className="op-actions"><button className="primary" disabled={!raw.trim()||!supplier.trim()||!shipmentId.trim()} onClick={importManifest}><FileUp size={16}/> Impor Manifest Pengiriman</button></div>
      <div className="op-label-list"><h3>Manifest Terdaftar</h3>{inbound.shipments.filter(s=>s.supermarketId===store).map(s=><button key={s.id} className="op-resume" onClick={()=>{setActiveId(s.id);setStep(s.batchId?1:0);setCameraOn(false);setError('');setSelected([])}}><strong>{s.id}</strong><span>{s.supplier} · {s.items.length} kemasan · terverifikasi {Object.keys(s.verified).length}/{s.items.length}{s.batchId?' · '+s.batchId:''}</span><ChevronRight size={16}/></button>)}{!inbound.shipments.some(s=>s.supermarketId===store)&&<p className="helper">Belum ada manifest untuk supermarket demo ini.</p>}</div>
    </section>
    <section className="surface-card"><div className="card-head"><div><span className="eyebrow">GUIDED RECEIVING</span><h3>Verifikasi Kedatangan</h3></div><span className="outline-badge">{shipment?.id||'Pilih manifest'}</span></div>
      <div className="receiving-steps">{steps.map((s,i)=><button key={s} className={i===step?'current':i<step?'complete':''} disabled={!shipment||(i>0&&!batch)} onClick={()=>{setCameraOn(false);setStep(i)}}><b>{i+1}</b><span>{s}</span></button>)}</div>
      {!shipment?<p className="helper">Impor atau pilih manifest untuk memulai penerimaan produk.</p>:<>
      {step===0&&<div className="guided-content"><h3>1. Registrasi Kedatangan</h3><div className="op-two"><div><span className="eyebrow">SUPPLIER</span><p><b>{shipment.supplier}</b></p></div><div><span className="eyebrow">NO. PENGIRIMAN</span><p><b>{shipment.id}</b></p></div><div><span className="eyebrow">PRODUK</span><p><b>{shipment.items[0].productName}</b></p></div><div><span className="eyebrow">BATCH SUPPLIER</span><p><b>{shipment.items[0].supplierBatch}</b></p></div><div><span className="eyebrow">JUMLAH KEMASAN</span><p><b>{shipment.items.length}</b></p></div></div><p className="helper">Data produk dari manifest supplier. Batch ID dan Package ID internal supermarket dibuat satu kali, tanpa membuat label baru.</p><button className="primary" onClick={batch?()=>setStep(1):register}><PackageCheck size={17}/>{batch?'Lanjut Verifikasi':'Daftarkan Batch Penerimaan'} <ChevronRight size={16}/></button></div>}
      {step===1&&batch&&<div className="guided-content"><h3>2. Scan QR pada Kemasan yang Sudah Berlabel</h3><p className="helper">Arahkan kamera ke QR fisik pada setiap tray daging. Sistem mengecek Label ID terhadap manifest pengiriman, menghindari duplikat, dan mengaitkannya ke Package ID internal. Tidak ada proses menempelkan label.</p><div className="op-progress"><strong>{verified.length} / {total} kemasan diverifikasi</strong><div><i style={{width:`${verified.length/Math.max(1,total)*100}%`}}/></div></div>
        <div className="guided-scan">{cameraOn?<video ref={video} autoPlay muted playsInline className="guided-video"/>:<div className="guided-camera-placeholder"><Camera size={42}/><span>Kamera siap scan kemasan</span></div>}<div className="op-actions"><button className="secondary" onClick={()=>setCameraOn(v=>!v)}>{cameraOn?<><Pause size={17}/> Hentikan</>:<><Play size={17}/> Mulai Scan Berurutan</>}</button></div></div>
        <div className="op-inline"><input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Label ID manual (fallback)" aria-label="Label ID manual" onKeyDown={e=>{if(e.key==='Enter')scan(manual)}}/><button className="secondary" disabled={!manual.trim()} onClick={()=>scan(manual)}>Verifikasi</button></div>
        <div className="op-package-grid">{shipment.items.map((item,i)=><div className="op-package" key={item.labelId}><strong>{item.labelId}</strong><small>{batch.packageIds[i]} · {shipment.verified[item.labelId]?'✓ Diterima':'Belum discan'}</small></div>)}</div>
        <button className="primary" onClick={()=>{setCameraOn(false);setStep(2)}}>Lanjut Penempatan <ChevronRight size={16}/></button>
      </div>}
      {step===2&&batch&&<div className="guided-content"><h3>3. Penempatan ke Chiller</h3><p className="helper">Pilih paket yang sudah diverifikasi; satu batch bisa dibagi ke beberapa lokasi.</p><div className="op-progress"><strong>{placed} / {total} paket ditempatkan</strong><div><i style={{width:`${placed/Math.max(1,total)*100}%`}}/></div></div>
        <label><input type="checkbox" checked={awaiting.length>0&&selected.length===awaiting.length} onChange={e=>setSelected(e.target.checked?awaiting:[])}/> Pilih semua kemasan terverifikasi yang belum ditempatkan ({awaiting.length})</label>
        <div className="op-package-grid">{awaiting.map(pid=><label key={pid} className="op-package"><input type="checkbox" checked={selected.includes(pid)} onChange={e=>setSelected(e.target.checked?[...selected,pid]:selected.filter(x=>x!==pid))}/><span><strong>{pid}</strong><small>Siap ditempatkan</small></span></label>)}</div>
        <div className="op-three">{([['chiller',choices('Chiller',3)],['rack',choices('Rack',4)],['level',choices('Level',3)]] as [keyof Location,string[]][]).map(([k,options])=><label key={k}>{k}<select value={loc[k]} onChange={e=>setLoc({...loc,[k]:e.target.value})}><option value="">Pilih {k}</option>{options.map(x=><option key={x}>{x}</option>)}</select></label>)}</div>
        <div className="op-actions"><button className="primary" disabled={!selected.length||!loc.chiller||!loc.rack||!loc.level} onClick={placement}><Check size={16}/> Tempatkan {selected.length} Paket</button><button className="secondary" onClick={()=>setStep(3)}>Lanjut Konfirmasi <ChevronRight size={16}/></button></div>
      </div>}
      {step===3&&batch&&<div className="guided-content"><h3>4. Konfirmasi Penerimaan</h3><div className="stat-grid compact"><div className="stat-card"><span>Manifest</span><strong>{total}</strong></div><div className="stat-card"><span>Terverifikasi</span><strong>{verified.length}</strong></div><div className="stat-card"><span>Sudah Ditempatkan</span><strong>{placed}</strong></div></div>
        <div className="table-container"><table><thead><tr><th>Label ID</th><th>Package ID</th><th>Verifikasi</th><th>Lokasi</th></tr></thead><tbody>{shipment.items.map((item,i)=><tr key={item.labelId}><td>{item.labelId}</td><td>{batch.packageIds[i]}</td><td>{shipment.verified[item.labelId]?'✓ Sesuai manifest':'Belum diverifikasi'}</td><td>{locationText(operations.locations[batch.packageIds[i]])}</td></tr>)}</tbody></table></div>
        {(verified.length!==total||placed!==total)&&<label className="op-partial"><input type="checkbox" checked={partial} onChange={e=>setPartial(e.target.checked)}/> Simpan penerimaan sebagian; masih ada kemasan yang belum diverifikasi / ditempatkan</label>}
        <button className="primary" disabled={confirmed||(verified.length!==total||placed!==total)&&!partial} onClick={confirm}><Check size={17}/> {confirmed?'Sudah Selesai':'Konfirmasi Penerimaan'}</button>
      </div>}
      <div className="section-divider"/><label>Catat ketidaksesuaian (kemasan rusak, QR gagal dibaca, selisih jumlah)<textarea rows={2} value={exception} onChange={e=>setException(e.target.value)} placeholder="Contoh: 1 kemasan dengan seal rusak, dipisahkan untuk QA"/></label><button className="secondary" disabled={!exception.trim()} onClick={logException}>Catat di Aktivitas</button>
      </>}
    </section>
    <section className="surface-card"><div className="card-head"><div><span className="eyebrow">RECEIVING HISTORY</span><h3>Riwayat Pengiriman</h3></div></div><label className="search-field"><Search size={16}/><input placeholder="Cari pengiriman, supplier, batch..." value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="table-container"><table><thead><tr><th>Shipment</th><th>Supplier</th><th>Jumlah</th><th>Verifikasi</th><th>Status</th><th>Diimpor</th></tr></thead><tbody>{inbound.shipments.filter(s=>s.supermarketId===store&&`${s.id} ${s.supplier} ${s.items[0]?.supplierBatch}`.toLowerCase().includes(search.toLowerCase())).map(s=><tr key={s.id}><td><button className="text-action" onClick={()=>{setActiveId(s.id);setStep(s.batchId?1:0);setCameraOn(false)}}>{s.id}</button></td><td>{s.supplier}</td><td>{s.items.length}</td><td>{Object.keys(s.verified).length}/{s.items.length}</td><td>{s.batchId?operations.confirmations?.[s.batchId]||'Dalam proses':'Belum diregistrasi'}</td><td>{dateTime(s.importedAt)}</td></tr>)}</tbody></table></div></section>
  </>;
}
