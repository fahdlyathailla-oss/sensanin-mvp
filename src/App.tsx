import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Camera, ChartNoAxesCombined, Check, ChevronRight, ClipboardList, Download, Info, LockKeyhole, LogOut, Package, ScanLine, Search, ShieldAlert, X } from 'lucide-react';
import { actions, dateTime, initial, readStore, rgbString, rgbToLab } from './data';
import type { Product, Scan, Status } from './data';
import { analyzeLiveFrame } from './autoScan';
import { ActivityPage, ReceivingPage, LocationBadge } from './OperationsPages';
import { emptyOperations, placePackages, registerBatch, scanActivity } from './operations';
import type { Batch, Location, Operations } from './operations';
import { ClipboardCheck, History, PackagePlus, ArrowRightLeft } from 'lucide-react';
import './style.css';

const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;
const disclaimer = 'Klasifikasi kesegaran pada prototipe ini merupakan simulasi dan belum divalidasi terhadap pengukuran laboratorium. SENSANIN adalah alat pendukung keputusan, bukan pengganti pengujian mikrobiologi atau inspeksi keamanan pangan.';
type Tab = 'summary' | 'receiving' | 'scan' | 'inventory' | 'activity';
const labels: Record<Status,string> = { FRESH:'Segar', PRIORITY:'Prioritas Penjualan', 'INSPECTION REQUIRED':'Perlu Inspeksi' };
const colors:Record<Status,string> = {FRESH:'green',PRIORITY:'yellow','INSPECTION REQUIRED':'red'};
const demoHistory:Scan[] = initial.slice(0,9).map((p,i)=>({id:`DEMO-${i+1}`,productId:p.id,time:p.lastScannedAt,rgb:p.currentColor,lab:rgbToLab(p.currentColor),deltaE:p.deltaE,type:'SIMULATED'}));

function Logo({inverse=false}:{inverse?:boolean}){return <div className={'logo '+(inverse?'inverse':'')}><img src={asset('sensanin-mark.png')} alt="Simbol SENSANIN"/><span><strong>SENSANIN</strong><small>— SMART LABELLING —</small></span></div>}
function StatusPill({status}:{status:Status}){return <span className={'pill '+colors[status]}><span className="status-dot"/>{labels[status]}</span>}
function lookupQR(s:string,items:Product[]){let id=s.trim();try{const v=JSON.parse(id);if(typeof v==='object'&&v!==null)id=String(v.packageId||v.productId||v.id||id)}catch{/* plain code */}const match=id.match(/(?:^|\/)p\/(SN-[0-9]+)(?:[/?#]|$)/i);if(match)id=match[1];return items.find(p=>p.id.toUpperCase()===id.toUpperCase())}

export default function App(){
  const [loggedIn,setLoggedIn]=useState(()=>sessionStorage.getItem('sensanin-demo-login')==='yes');
  const [loginName,setLoginName]=useState('');
  const [user,setUser]=useState(()=>sessionStorage.getItem('sensanin-demo-user')||'Staf Supermarket');
  const [tab,setTab]=useState<Tab>('summary');
  const [products,setProducts]=useState<Product[]>(()=>readStore('sensanin-products-v2',initial));
  const [history,setHistory]=useState<Scan[]>(()=>readStore('sensanin-scans-v2',demoHistory));
  const [operations,setOperations]=useState<Operations>(()=>readStore('sensanin-operations-v3',emptyOperations));
  const [inventorySelected,setInventorySelected]=useState<string[]>([]);
  const [moving,setMoving]=useState(false);
  const [moveLocation,setMoveLocation]=useState<Location>({chiller:'',rack:'',level:''});
  const [opNotice,setOpNotice]=useState('');
  const [selectedId,setSelectedId]=useState(initial[0].id);
  const [search,setSearch]=useState('');const [filter,setFilter]=useState('ALL');
  const [detail,setDetail]=useState<Product|null>(null);
  const [cameraOn,setCameraOn]=useState(false);const [cameraError,setCameraError]=useState('');const [scannedQR,setScannedQR]=useState(false);
  const [baseline,setBaseline]=useState<[number,number,number]>(initial[0].initialColorReference);
  const [priority]=useState(()=>readStore('sensanin-threshold-priority',12));
  const [inspection]=useState(()=>readStore('sensanin-threshold-inspection',25));
  const [result,setResult]=useState<Scan|null>(null);const [message,setMessage]=useState('');
  const videoRef=useRef<HTMLVideoElement>(null);const cameraControls=useRef<{stop:()=>void}|null>(null);const qrLocked=useRef(false);const recognizedFrames=useRef(0);
  const productsRef=useRef(products); productsRef.current=products;
  const userRef=useRef(user); userRef.current=user;
  const selected=products.find(p=>p.id===selectedId)||products[0];
  const count={total:products.length,fresh:products.filter(x=>x.freshnessStatus==='FRESH').length,priority:products.filter(x=>x.freshnessStatus==='PRIORITY').length,inspection:products.filter(x=>x.freshnessStatus==='INSPECTION REQUIRED').length};
  const displayed=result&&result.productId===selected.id?result:null;
  const status:Status=displayed?(displayed.deltaE>=inspection?'INSPECTION REQUIRED':displayed.deltaE>=priority?'PRIORITY':'FRESH'):selected.freshnessStatus;
  const matching=products.filter(p=>(filter==='ALL'||p.freshnessStatus===filter)&&`${p.id} ${p.productName} ${p.batchNumber} ${p.beefType}`.toLowerCase().includes(search.toLowerCase()));
  const chartProduct=detail||selected;
  const chartHistory=history.filter(h=>h.productId===chartProduct.id).slice(0,8).reverse();
  const chartData=chartHistory.length>=2?chartHistory.map((h,i)=>({name:`Scan ${i+1}`,de:h.deltaE})):Array.from({length:4},(_,i)=>({name:`Data ${i+1}`,de:chartProduct.deltaE*(.35+i*.21)}));
  useEffect(()=>{localStorage.setItem('sensanin-products-v2',JSON.stringify(products))},[products]);
  useEffect(()=>{localStorage.setItem('sensanin-scans-v2',JSON.stringify(history))},[history]);
  useEffect(()=>{localStorage.setItem('sensanin-operations-v3',JSON.stringify(operations))},[operations]);
  useEffect(()=>{localStorage.setItem('sensanin-threshold-priority',String(priority));localStorage.setItem('sensanin-threshold-inspection',String(inspection))},[priority,inspection]);
  // QR is decoded from live video. The calibrated demo LABEL GEOMETRY, not
  // arbitrary QR content, determines where both color patches are sampled.
  // No still photo, upload, manual ROI, or unverified fallback ΔE.
  useEffect(()=>{
    if(!loggedIn || tab!=='scan' || !cameraOn || !videoRef.current)return;
    let cancelled=false;
    const reader=new BrowserQRCodeReader();
    setCameraError('');
    setMessage('Kamera aktif. Arahkan label SENSANIN asli: QR di kiri, patch ungu di kanan.');
    (async()=>{
      try{
        const controls=await reader.decodeFromConstraints(
          {audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}},
          videoRef.current!, decoded=>{
            if(!decoded||cancelled||qrLocked.current)return;
            const product=lookupQR(decoded.getText(),productsRef.current);
            if(!product){setMessage('QR terdeteksi tetapi ID belum terdaftar dalam Data Inventory.');return;}
            const video=videoRef.current;
            if(!video?.videoWidth)return;
            const sample=analyzeLiveFrame(video,decoded,product.initialColorReference);
            if(!sample.ok){
              recognizedFrames.current=0;
              setMessage('QR '+product.id+' terdeteksi. '+sample.reason);
              return;
            }
            // Require repeated successful frames before accepting the scan.
            recognizedFrames.current+=1;
            if(recognizedFrames.current<2){setMessage('QR '+product.id+' terdeteksi. Tahan label sebentar untuk analisis warna otomatis...');return;}
            qrLocked.current=true;
            const de=sample.deltaE;
            const nextStatus:Status=de>=inspection?'INSPECTION REQUIRED':de>=priority?'PRIORITY':'FRESH';
            const scan:Scan={id:`SCAN-${Date.now()}`,productId:product.id,time:new Date().toISOString(),rgb:sample.rgb,lab:sample.lab,deltaE:de,type:'MEASURED DEMO',note:'Auto-sampled from current SENSANIN label geometry using QR + white label background. Not laboratory validated.'};
            setSelectedId(product.id);
            setBaseline(product.initialColorReference);
            setResult(scan);
            setProducts(old=>old.map(p=>p.id===product.id?{...p,currentColor:scan.rgb,deltaE:+de.toFixed(2),lastScannedAt:scan.time,freshnessStatus:nextStatus,recommendedAction:actions[nextStatus]}:p));
            setHistory(old=>[scan,...old]);
            setOperations(old=>scanActivity(old,product.id,userRef.current,de,'MEASURED DEMO',nextStatus));
            setScannedQR(true);
            setCameraOn(false);
            setMessage(`✓ Scan otomatis berhasil untuk ${product.id}. ΔE dihitung dari frame kamera dan riwayat tersimpan. Status tetap simulasi.`);
          });
        if(cancelled)controls.stop();else cameraControls.current=controls;
      }catch(e){if(!cancelled){setCameraError('Gagal mengakses kamera: periksa izin browser dan HTTPS. '+String(e));setCameraOn(false)}}
    })();
    return ()=>{cancelled=true;cameraControls.current?.stop();cameraControls.current=null};
  },[cameraOn,tab,loggedIn,priority,inspection]);
  function navigate(t:Tab){if(t!=='scan')setCameraOn(false);if(t==='scan'){qrLocked.current=false;recognizedFrames.current=0;setScannedQR(false);setResult(null);setCameraOn(true)}setTab(t);setMessage('');window.scrollTo({top:0,behavior:'smooth'})}
  function login(){const name=loginName.trim()||'Staf Supermarket';sessionStorage.setItem('sensanin-demo-login','yes');sessionStorage.setItem('sensanin-demo-user',name);setUser(name);setLoggedIn(true);setTab('summary')}
  function handleRegister(input:Omit<Batch,'id'|'receivedAt'|'createdBy'|'packageIds'>):string{
    const saved=registerBatch(operations,input,user,products);
    setOperations(saved.state);
    setProducts(old=>[...saved.newProducts,...old]);
    return saved.batch.id;
  }
  function handlePlace(batchId:string,ids:string[],loc:Location,mode:'placement'|'relocation'){
    const saved=placePackages(operations,batchId,ids,loc,user,mode);
    setOperations(saved);
  }
  function bulkRelocate(){
    if(!inventorySelected.length)return;
    try{
      const grouped=new Map<string,string[]>();
      for(const id of inventorySelected){const batch=operations.batches.find(b=>b.packageIds.includes(id));if(!batch)throw Error('Relokasi hanya tersedia bagi paket yang didaftarkan melalui Penerimaan.');if(!operations.locations[id])throw Error(`${id} belum ditempatkan.`);grouped.set(batch.id,[...(grouped.get(batch.id)||[]),id]);}
      let next=operations;
      for(const [batch,ids] of grouped)next=placePackages(next,batch,ids,moveLocation,user,'relocation');
      setOperations(next);setOpNotice(`${inventorySelected.length} paket berhasil dipindahkan dan dicatat dalam Aktivitas.`);setInventorySelected([]);setMoving(false);
    }catch(e){setOpNotice(String(e instanceof Error?e.message:e));}
  }
  function logout(){setCameraOn(false);sessionStorage.removeItem('sensanin-demo-login');sessionStorage.removeItem('sensanin-demo-user');setLoggedIn(false);setResult(null)}
  function csv(){const cols:(keyof Product)[]=['id','productName','beefType','batchNumber','productionDate','expirationDate','deltaE','freshnessStatus','lastScannedAt'];const text=[cols.join(','),...products.map(p=>cols.map(k=>'"'+String(p[k]).replace(/"/g,'""')+'"').join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='sensanin-inventory.csv';a.click();URL.revokeObjectURL(url)}

  if(!loggedIn)return <div className="login-page"><div className="login-orb one"/><div className="login-orb two"/><main className="login-panel"><Logo/><div className="login-art"><span className="login-art-icon"><ScanLine size={36}/></span><h1>Welcome to SENSANIN</h1><p>Smart Freshness Monitoring for Better Inventory Decisions.</p></div><div className="login-fields"><span className="eyebrow">AKSES WORKSPACE</span><h2>Masuk ke Dashboard</h2><p>Monitoring inventaris daging sapi berbasis indikator warna.</p><label htmlFor="username">Nama petugas</label><input id="username" autoComplete="name" placeholder="Contoh: Staf Supermarket" value={loginName} onChange={e=>setLoginName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}/><button className="primary wide" onClick={login}>Masuk ke SENSANIN <ChevronRight size={18}/></button><div className="demo-note"><LockKeyhole size={16}/> Mode demo — tidak menggunakan password atau server autentikasi. Bukan sistem login produksi.</div></div></main></div>;

  return <div className="app-shell">
    <header className="app-header"><Logo/><div className="header-right"><span className="demo-tag">● DEMO MODE</span><button className="user-chip" onClick={logout} title="Keluar dari mode demo"><span className="user-avatar">{user.slice(0,1).toUpperCase()}</span><span className="user-name">{user}</span><LogOut size={16}/></button></div></header>
    <main className="app-main">
      {tab==='summary'&&<><section className="page-heading"><div><span className="eyebrow">SUPERMARKET / INVENTORY OVERVIEW</span><h1>Ringkasan Inventory <span className="wave-emoji">✦</span></h1><p>Selamat datang, {user}. Pantau paket yang membutuhkan perhatian hari ini.</p></div><button className="primary desktop-action" onClick={()=>navigate('scan')}><ScanLine size={17}/> Mulai Scan</button></section>
      <section className="hero-card"><div><span className="hero-kicker">SENSANIN SMART LABELLING</span><h2>Freshness insights.<br/>Better decisions.</h2><p>Identifikasi paket, amati perubahan warna, dan kelola prioritas pemeriksaan dengan satu dashboard.</p><button onClick={()=>navigate('scan')}>Pindai Kemasan <ChevronRight size={17}/></button></div><div className="hero-design"><div className="hero-rings"><Package size={74}/></div></div></section>
      <section className="stat-grid"><div className="stat-card"><div className="stat-icon purple"><Package/></div><span>Total Paket</span><strong>{count.total}</strong><small>Terdaftar di inventaris</small></div><div className="stat-card"><div className="stat-icon green"><Check/></div><span>Segar</span><strong>{count.fresh}</strong><small>Status demo</small></div><div className="stat-card"><div className="stat-icon yellow"><ChartNoAxesCombined/></div><span>Prioritas</span><strong>{count.priority}</strong><small>Perlu ditinjau</small></div><div className="stat-card"><div className="stat-icon red"><ShieldAlert/></div><span>Perlu Inspeksi</span><strong>{count.inspection}</strong><small>Tindak lanjut staf</small></div></section>
      <div className="content-grid"><section className="surface-card"><div className="card-head"><div><span className="eyebrow">STATUS DISTRIBUTION</span><h3>Kondisi Inventaris</h3></div><span className="outline-badge">Data simulasi</span></div><div className="distribution"><div className="donut" style={{background:`conic-gradient(#29b67a 0 ${count.fresh/count.total*100}%,#ffbd4a ${count.fresh/count.total*100}% ${(count.fresh+count.priority)/count.total*100}%,#ef6976 ${(count.fresh+count.priority)/count.total*100}% 100%)`}}><div><strong>{count.total}</strong><span>Paket</span></div></div><div className="distribution-key">{([['FRESH',count.fresh],['PRIORITY',count.priority],['INSPECTION REQUIRED',count.inspection]] as [Status,number][]).map(([s,n])=><div key={s}><span className={'legend-dot '+colors[s]}/><span>{labels[s]}</span><strong>{n}</strong></div>)}</div></div></section><section className="surface-card"><div className="card-head"><div><span className="eyebrow">ACTIVITY</span><h3>Aktivitas Pemindaian</h3></div></div><div className="activity-list">{history.slice(0,5).map(h=>{const p=products.find(p=>p.id===h.productId);return <div className="activity" key={h.id}><div className="activity-icon"><ScanLine size={19}/></div><div><strong>{p?.productName||h.productId}</strong><span>{h.productId} · {dateTime(h.time)}</span></div><b>ΔE {h.deltaE.toFixed(1)}</b></div>})}</div></section></div>
      <section className="surface-card attention"><div className="card-head"><div><span className="eyebrow">ACTION REQUIRED</span><h3>Paket yang Perlu Perhatian</h3></div><button className="text-action" onClick={()=>navigate('inventory')}>Lihat semua <ChevronRight size={16}/></button></div>{products.filter(p=>p.freshnessStatus!=='FRESH').slice(0,5).map(p=><div className="attention-row" key={p.id}><div className="product-thumb"><Package size={20}/></div><div className="attention-copy"><strong>{p.productName}</strong><span>{p.id} · {p.batchNumber}</span></div><StatusPill status={p.freshnessStatus}/></div>)}</section><aside className="disclaimer"><Info size={18}/>{disclaimer}</aside></>}

      {tab==='receiving'&&<ReceivingPage operations={operations} products={products} user={user} onRegister={handleRegister} onPlace={handlePlace}/> }
      {tab==='activity'&&<ActivityPage operations={operations} products={products}/> }
      {tab==='scan'&&<><section className="page-heading"><div><span className="eyebrow">SMART LABELLING / AUTOMATIC SCAN</span><h1>Mulai Scan</h1><p>Seperti scan QRIS: kamera membaca label SENSANIN otomatis. QR dipakai untuk identifikasi produk, lalu patch ungu di kanan dianalisis tanpa foto atau seleksi manual.</p></div></section>
      <div className="scan-grid"><section className="surface-card"><div className="card-head"><div><span className="eyebrow">01 / LIVE CAMERA</span><h3>Pindai Label SENSANIN</h3></div><span className="outline-badge">{cameraOn?'● LIVE':scannedQR?'✓ SELESAI':'SIAP'}</span></div>
      <div className="camera-frame">{cameraOn?<video ref={videoRef} autoPlay muted playsInline className="video-feed"/>:<img src={asset('current-label-reference.png')} alt="Contoh label SENSANIN saat ini"/>}<div className="camera-shade"/><div className="scan-corners"><i/><i/><i/><i/><div className="scan-beam"/></div><span className="camera-caption">{cameraOn?'Tahan label lengkap di dalam bingkai':scannedQR?'✓ QR dan warna sudah dibaca':'Buka kamera untuk memindai'}</span></div>
      <div className="camera-buttons">{cameraOn?<button className="secondary" onClick={()=>setCameraOn(false)}><X size={17}/> Hentikan</button>:<button className="primary wide" onClick={()=>{qrLocked.current=false;recognizedFrames.current=0;setScannedQR(false);setResult(null);setCameraError('');setCameraOn(true)}}><ScanLine size={18}/> {scannedQR?'Scan Kemasan Lain':'Buka Live Scanner'}</button>}</div>
      {cameraError&&<p className="error-text">{cameraError}</p>}
      {message&&<div className="feedback" role="status" aria-live="polite">{message}</div>}
      <div className="live-scan-hint"><Info size={17}/><span><b>Label mengikuti desain SENSANIN saat ini.</b> QR di kiri dan indikator ungu besar di kanan. Sistem memakai area putih label sebagai referensi cahaya, jadi hindari bayangan dan pantulan berlebih.</span></div>
      <a className="label-download" href={asset('current-label-reference.png')} target="_blank" rel="noreferrer">Lihat contoh label SENSANIN saat ini →</a>
      <p className="helper">Untuk menguji kamera HP, gunakan label SENSANIN yang desainnya sama seperti contoh ini. QR perlu berisi ID produk yang terdaftar, sedangkan patch ungu harus terlihat utuh.</p></section>
      <section className="surface-card"><div className="card-head"><div><span className="eyebrow">02 / AUTO COLORIMETRY</span><h3>Hasil Pemindaian Otomatis</h3></div><span className="outline-badge">CIE76 · DEMO</span></div>
      {displayed?<><div className="scan-success"><Check size={22}/><div><strong>Berhasil dipindai dan disimpan</strong><span>{selected.productName} · {selected.id}</span></div></div>
      <div className="measurement-grid"><div><span>ΔE*ab</span><strong>{displayed.deltaE.toFixed(2)}</strong></div><div><span>RGB</span><strong className="result-sm">{displayed.rgb.join(', ')}</strong></div><div><span>CIELAB</span><strong className="result-sm">{displayed.lab.map(x=>x.toFixed(1)).join(' / ')}</strong></div></div>
      <div className="color-compare"><div><i style={{background:rgbString(baseline)}}/><span>Baseline</span></div><div><i style={{background:rgbString(displayed.rgb)}}/><span>Terukur (demo)</span></div></div>
      <div className="scan-status"><span>Kategori inventaris (simulasi)</span><StatusPill status={status}/></div><p className="helper">RGB berasal dari patch ungu yang dinormalisasi memakai area putih label. Hubungan ΔE dengan keamanan daging belum divalidasi.</p>
      <button className="primary wide" onClick={()=>navigate('summary')}><ChartNoAxesCombined size={18}/> Lihat Ringkasan Inventory</button></>:<div className="scan-pending"><ScanLine size={40}/><h3>Menunggu label terdeteksi</h3><p>Hasil QR, RGB, CIELAB, dan ΔE akan muncul otomatis. Tidak ada tombol foto atau seleksi ROI.</p></div>}
      <div className="section-divider"/><p className="helper">Ambang simulasi: Priority ≥ {priority}; Inspection ≥ {inspection}. Tidak merepresentasikan batas keamanan pangan atau umur simpan.</p>
      </section></div><aside className="disclaimer"><ShieldAlert size={18}/>{disclaimer}</aside></>}

      {tab==='inventory'&&<><section className="page-heading"><div><span className="eyebrow">PRODUCT & BATCH MANAGEMENT</span><h1>Data Inventory</h1><p>Kelola kemasan, lihat detail batch, dan riwayat perubahan warna.</p></div><button className="secondary desktop-action" onClick={csv}><Download size={17}/> Export CSV</button></section><div className="stat-grid compact"><div className="stat-card"><span>Total Paket</span><strong>{count.total}</strong></div><div className="stat-card"><span>Segar</span><strong>{count.fresh}</strong></div><div className="stat-card"><span>Prioritas</span><strong>{count.priority}</strong></div><div className="stat-card"><span>Perlu Inspeksi</span><strong>{count.inspection}</strong></div></div><section className="surface-card"><div className="card-head"><div><span className="eyebrow">REGISTERED PACKAGES</span><h3>Daftar Paket Daging</h3></div><button className="secondary export-mobile" onClick={csv}><Download size={16}/> CSV</button></div><div className="inventory-filters"><label className="search-field"><Search size={18}/><input placeholder="Cari ID, produk, atau batch..." value={search} onChange={e=>setSearch(e.target.value)}/></label><select className="field" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">Semua Status</option><option value="FRESH">Segar</option><option value="PRIORITY">Prioritas</option><option value="INSPECTION REQUIRED">Perlu Inspeksi</option></select></div><div className="op-inventory-actions">{opNotice&&<span className="op-notice">{opNotice}</span>}<span>{inventorySelected.length} paket dipilih</span><button className="secondary" disabled={!inventorySelected.length} onClick={()=>setMoving(true)}><ArrowRightLeft size={16}/> Ubah Lokasi ({inventorySelected.length})</button></div><div className="table-container"><table><thead><tr><th><input type="checkbox" aria-label="Pilih semua paket yang sudah ditempatkan" checked={matching.length>0&&matching.every(p=>inventorySelected.includes(p.id))} onChange={e=>setInventorySelected(e.target.checked?matching.map(p=>p.id):[])}/></th><th>PRODUK</th><th>ID / BATCH</th><th>LOKASI</th><th>TANGGAL PRODUKSI</th><th>ΔE</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>{matching.map(p=><tr key={p.id}><td><input type="checkbox" aria-label={`Pilih ${p.id}`} checked={inventorySelected.includes(p.id)} onChange={e=>setInventorySelected(e.target.checked?[...inventorySelected,p.id]:inventorySelected.filter(x=>x!==p.id))}/></td><td><strong>{p.productName}</strong><small>{p.beefType}</small></td><td>{p.id}<small>{p.batchNumber}</small></td><td><LocationBadge value={operations.locations[p.id]}/></td><td>{p.productionDate}</td><td>{p.deltaE.toFixed(2)}</td><td><StatusPill status={p.freshnessStatus}/></td><td><button className="text-action" onClick={()=>setDetail(p)}>Detail <ChevronRight size={15}/></button></td></tr>)}</tbody></table>{!matching.length&&<div className="empty-table">Produk tidak ditemukan.</div>}</div></section><aside className="disclaimer"><Info size={18}/>{disclaimer}</aside></>}
    </main>
    <nav className="bottom-nav" aria-label="Navigasi utama SENSANIN">
      <button className={tab==='summary'?'active':''} onClick={()=>navigate('summary')} aria-label="Ringkasan"><span className="nav-icon"><ChartNoAxesCombined size={22}/></span><small>Ringkasan</small></button>
      <button className={tab==='receiving'?'active':''} onClick={()=>navigate('receiving')} aria-label="Penerimaan"><span className="nav-icon"><PackagePlus size={22}/></span><small>Penerimaan</small></button>
      <button className={'scan-nav '+(tab==='scan'?'active':'')} onClick={()=>navigate('scan')} aria-label="Mulai Scan"><span className="scan-fab"><ScanLine size={30}/></span><small>Mulai Scan</small></button>
      <button className={tab==='inventory'?'active':''} onClick={()=>navigate('inventory')} aria-label="Data Inventory"><span className="nav-icon"><ClipboardList size={22}/></span><small>Data<br/>Inventory</small></button>
      <button className={tab==='activity'?'active':''} onClick={()=>navigate('activity')} aria-label="Aktivitas"><span className="nav-icon"><History size={22}/></span><small>Aktivitas</small></button>
    </nav>
    {moving&&<div className="modal-backdrop"><div className="detail-modal op-form"><button className="close-modal" onClick={()=>setMoving(false)}><X/></button><span className="eyebrow">BULK LOCATION UPDATE</span><h2>Ubah Lokasi ({inventorySelected.length} paket)</h2><p className="helper">Pilih lokasi tujuan. Perpindahan paket dicatat per Package ID.</p><div className="op-three"><label>Chiller<select value={moveLocation.chiller} onChange={e=>setMoveLocation({...moveLocation,chiller:e.target.value})}><option value="">Pilih chiller</option>{['Chiller A','Chiller B','Chiller C'].map(x=><option key={x}>{x}</option>)}</select></label><label>Rack<select value={moveLocation.rack} onChange={e=>setMoveLocation({...moveLocation,rack:e.target.value})}><option value="">Pilih rack</option>{['Rack A','Rack B','Rack C','Rack D'].map(x=><option key={x}>{x}</option>)}</select></label><label>Level<select value={moveLocation.level} onChange={e=>setMoveLocation({...moveLocation,level:e.target.value})}><option value="">Pilih level</option>{['Level 1','Level 2','Level 3'].map(x=><option key={x}>{x}</option>)}</select></label></div><button className="primary wide" disabled={!moveLocation.chiller||!moveLocation.rack||!moveLocation.level} onClick={bulkRelocate}><ClipboardCheck size={18}/> Konfirmasi Perpindahan</button>{opNotice&&<p className="helper">{opNotice}</p>}</div></div>}
    {detail&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setDetail(null)}><div className="detail-modal"><button className="close-modal" onClick={()=>setDetail(null)} aria-label="Tutup detail"><X/></button><span className="eyebrow">DETAIL PRODUK / {detail.id}</span><h2>{detail.productName}</h2><StatusPill status={detail.freshnessStatus}/><div className="detail-pairs"><div><span>Lokasi Sekarang</span><strong>{operations.locations[detail.id]?`${operations.locations[detail.id].chiller} / ${operations.locations[detail.id].rack} / ${operations.locations[detail.id].level}`:'Belum Ditempatkan'}</strong></div><div><span>ID Produk</span><strong>{detail.id}</strong></div><div><span>Nomor Batch</span><strong>{detail.batchNumber}</strong></div><div><span>Produksi</span><strong>{detail.productionDate}</strong></div><div><span>Kedaluwarsa tertera</span><strong>{detail.expirationDate}</strong></div><div><span>Pengukuran ΔE</span><strong>{detail.deltaE.toFixed(2)}</strong></div><div><span>Terakhir scan</span><strong>{dateTime(detail.lastScannedAt)}</strong></div></div><h3>Riwayat Lokasi</h3><div className="op-history">{operations.locationHistory.filter(x=>x.packageId===detail.id).map(x=><div key={x.id}>{dateTime(x.at)} · {x.by} · {x.previous?`${x.previous.chiller} / ${x.previous.rack} / ${x.previous.level}`:'Belum ditempatkan'} → {x.next.chiller} / {x.next.rack} / {x.next.level}</div>)}{!operations.locationHistory.some(x=>x.packageId===detail.id)&&<p className="helper">Belum ada riwayat penempatan.</p>}</div><h3>Tren Perubahan Warna (Ilustratif)</h3><div className="trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:10,bottom:0,left:-25}}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9136c8" stopOpacity={.35}/><stop offset="100%" stopColor="#9136c8" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9e4f2" strokeDasharray="4 4"/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={v=>[Number(v).toFixed(2),'ΔE']}/><Area dataKey="de" stroke="#9233c6" fill="url(#trendFill)" strokeWidth={3}/></AreaChart></ResponsiveContainer></div><p className="helper">Contoh tren: data simulasi atau riwayat scan yang tersedia di browser ini, bukan prediksi umur simpan.</p><button className="primary wide" onClick={()=>{setSelectedId(detail.id);setBaseline(detail.initialColorReference);setDetail(null);navigate('scan')}}><Camera size={17}/> Scan Produk Ini</button></div></div>}
  </div>
}
