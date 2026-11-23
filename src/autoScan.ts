import { deltaE, rgbToLab } from './data';

type QRResult = { getResultPoints(): Array<{getX():number;getY():number}> | null };
type RGB = [number,number,number];
type Bounds = {x:number;y:number;w:number;h:number};
export type AutoSample = {ok:true;rgb:RGB;lab:RGB;deltaE:number;reference:RGB;indicatorBounds:Bounds} | {ok:false;reason:string};
const clip=(v:number)=>Math.max(0,Math.min(255,v));
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
function meanPatch(ctx:CanvasRenderingContext2D,r:Bounds):RGB | null {
  const w=ctx.canvas.width,h=ctx.canvas.height;
  const x=Math.round(r.x),y=Math.round(r.y),pw=Math.round(r.w),ph=Math.round(r.h);
  if(x<0||y<0||pw<8||ph<8||x+pw>w||y+ph>h)return null;
  const data=ctx.getImageData(x,y,pw,ph).data;
  let sums=[0,0,0],n=0;
  for(let row=Math.floor(ph*.18);row<Math.ceil(ph*.82);row+=2){
    for(let col=Math.floor(pw*.18);col<Math.ceil(pw*.82);col+=2){
      const k=(row*pw+col)*4;
      for(let c=0;c<3;c++)sums[c]+=data[k+c];
      n++;
    }
  }
  return n?sums.map(v=>v/n) as RGB:null;
}
function locateIndicator(ctx:CanvasRenderingContext2D, zone:Bounds):Bounds | null {
  const x0=Math.max(0,Math.floor(zone.x)),y0=Math.max(0,Math.floor(zone.y));
  const x1=Math.min(ctx.canvas.width,Math.ceil(zone.x+zone.w)),y1=Math.min(ctx.canvas.height,Math.ceil(zone.y+zone.h));
  if(x1-x0<20||y1-y0<20)return null;
  const img=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,count=0;
  const width=x1-x0;
  for(let y=0;y<y1-y0;y+=2){
    for(let x=0;x<x1-x0;x+=2){
      const i=(y*width+x)*4;
      const r=img[i],g=img[i+1],b=img[i+2];
      const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max-min;
      const isPatch = max<250 && min>40 && sat>22 && ((r>g+10 && b>g+5) || (b>g+18));
      if(isPatch){
        count++;
        const gx=x0+x, gy=y0+y;
        if(gx<minX)minX=gx;if(gx>maxX)maxX=gx;if(gy<minY)minY=gy;if(gy>maxY)maxY=gy;
      }
    }
  }
  if(count<80||!isFinite(minX))return null;
  const w=maxX-minX,h=maxY-minY;
  if(w<20||h<20)return null;
  return {x:minX,y:minY,w,h};
}
function whitenessScore(rgb:RGB){
  const brightness=(rgb[0]+rgb[1]+rgb[2])/3;
  const spread=Math.max(...rgb)-Math.min(...rgb);
  return brightness - spread*1.8;
}
function pickReference(ctx:CanvasRenderingContext2D, card:Bounds, indicator:Bounds):RGB | null {
  const padX=Math.max(10,indicator.w*0.08), padY=Math.max(10,indicator.h*0.08);
  const candidates:Bounds[]=[
    {x:indicator.x, y:card.y+padY, w:indicator.w, h:Math.max(12,indicator.y-card.y-padY*1.6)},
    {x:indicator.x+indicator.w+padX, y:indicator.y, w:Math.max(12, card.x+card.w-(indicator.x+indicator.w)-padX*1.6), h:indicator.h},
    {x:indicator.x, y:indicator.y+indicator.h+padY, w:indicator.w, h:Math.max(12, card.y+card.h-(indicator.y+indicator.h)-padY*1.6)},
    {x:card.x+padX, y:indicator.y, w:Math.max(12, indicator.x-card.x-padX*1.8), h:indicator.h*0.6}
  ].map(r=>({x:clamp(r.x,0,ctx.canvas.width-1),y:clamp(r.y,0,ctx.canvas.height-1),w:Math.max(0,r.w),h:Math.max(0,r.h)})).filter(r=>r.w>=12&&r.h>=12);
  let best:RGB | null=null, bestScore=-Infinity;
  for(const c of candidates){
    const rgb=meanPatch(ctx,c);
    if(!rgb)continue;
    const score=whitenessScore(rgb);
    if(score>bestScore){bestScore=score;best=rgb;}
  }
  return best;
}
export function analyzeLiveFrame(video:HTMLVideoElement,qr:QRResult,baseline:RGB):AutoSample {
  const pts=qr.getResultPoints();
  if(!pts||pts.length<3)return {ok:false,reason:'Posisi QR tidak cukup jelas. Tahan label tegak.'};
  const xs=pts.map(p=>p.getX()),ys=pts.map(p=>p.getY());
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const fw=maxX-minX,fh=maxY-minY;
  if(fw<50||fh<50)return {ok:false,reason:'Dekatkan label sedikit ke kamera.'};
  if(Math.max(fw,fh)/Math.max(1,Math.min(fw,fh))>1.35)return {ok:false,reason:'Luruskan label, jangan terlalu miring.'};
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return {ok:false,reason:'Canvas tidak tersedia.'};
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  // Approximate overall label region from the detected QR block based on the real SENSANIN label geometry.
  const qrX=minX-fw*(7.5/14),qrY=minY-fh*(7.5/14);
  const qrW=fw*(29/14),qrH=fh*(29/14);
  const card:Bounds={x:qrX-qrW*0.12,y:qrY-qrH*0.62,w:qrW*2.45,h:qrH*1.62};
  const indicatorZone:Bounds={x:qrX+qrW*1.05,y:qrY-qrH*0.02,w:qrW*1.28,h:qrH*1.08};
  const indicator=locateIndicator(ctx,indicatorZone);
  if(!indicator)return {ok:false,reason:'Patch indikator ungu belum ditemukan. Tampilkan label utuh dan tajam.'};
  const reference=pickReference(ctx,card,indicator);
  const indicatorRgb=meanPatch(ctx,indicator);
  if(!reference||!indicatorRgb)return {ok:false,reason:'Gagal mengambil warna indikator atau latar putih label.'};
  const refBrightness=(reference[0]+reference[1]+reference[2])/3;
  const refSpread=Math.max(...reference)-Math.min(...reference);
  if(refBrightness<165||refSpread>32)return {ok:false,reason:'Latar putih label belum terbaca bersih. Perbaiki cahaya dan kurangi bayangan.'};
  const diff=Math.hypot(...indicatorRgb.map((c,i)=>c-reference[i]));
  if(diff<32)return {ok:false,reason:'Perbedaan indikator dengan latar belum cukup jelas. Dekatkan kamera ke patch ungu.'};
  const corrected=indicatorRgb.map((c,i)=>Math.round(clip(c*255/Math.max(1,reference[i])))) as RGB;
  const lab=rgbToLab(corrected);
  const colorDifference=deltaE(lab,rgbToLab(baseline));
  return {ok:true,rgb:corrected,lab,deltaE:colorDifference,reference,indicatorBounds:indicator};
}
