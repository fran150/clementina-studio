import type {BankAsset} from './index.js';
export interface Raster {width:number;height:number;data:Uint8ClampedArray|number[]}
export interface ImageImportOptions {
 crop:{x:number;y:number;width:number;height:number};width:number;height:number;
 tileX:number;tileY:number;paletteMode:'match'|'create';alphaCutoff?:number;protectedPalettes?:number[];
}
export interface ImageImportResult {
 bank:BankAsset;tilesWide:number;tilesHigh:number;overwrittenTiles:number[];
 createdPalettes:number[];remappedPixels:number;limitedTiles:number;transparentPixels:number;
}
export function rgb565(r:number,g:number,b:number):number{return (Math.round(r*31/255)<<11)|(Math.round(g*63/255)<<5)|Math.round(b*31/255);}
export function channels(word:number):number[]{return [((word>>11)&31)*255/31,((word>>5)&63)*255/63,(word&31)*255/31];}
const distance=(a:number,b:number)=>{const x=channels(a),y=channels(b);return x.reduce((n,v,i)=>n+(v-y[i])**2,0);};
/** Weighted median-cut quantization; palette zero is reserved for transparency. */
function quantize(hist:Map<number,number>,limit:number):number[]{
 const colors=[...hist].sort((a,b)=>a[0]-b[0]);if(colors.length<=limit)return colors.map(c=>c[0]);
 const boxes=[colors];
 while(boxes.length<limit){
  let choice=-1,axis=0,best=-1;
  boxes.forEach((box,i)=>{if(box.length<2)return;for(let c=0;c<3;c++){const v=box.map(p=>channels(p[0])[c]),score=(Math.max(...v)-Math.min(...v))*Math.sqrt(box.reduce((n,p)=>n+p[1],0));if(score>best){best=score;choice=i;axis=c;}}});
  if(choice<0)break;const box=boxes.splice(choice,1)[0].sort((a,b)=>channels(a[0])[axis]-channels(b[0])[axis]||a[0]-b[0]);
  const half=box.reduce((n,c)=>n+c[1],0)/2;let count=0,split=1;for(let i=0;i<box.length-1;i++){count+=box[i][1];split=i+1;if(count>=half)break;}
  boxes.push(box.slice(0,split),box.slice(split));
 }
 return [...new Set(boxes.map(box=>{const total=box.reduce((n,c)=>n+c[1],0),rgb=[0,1,2].map(i=>box.reduce((n,c)=>n+channels(c[0])[i]*c[1],0)/total);return rgb565(rgb[0],rgb[1],rgb[2]);}))];
}
function integer(n:number,min:number,max:number){return Number.isInteger(n)&&n>=min&&n<=max;}
/** Pure preview: never mutates the input bank or image. Imports replace complete destination tiles. */
export function convertBankImage(original:BankAsset,image:Raster,o:ImageImportOptions):ImageImportResult {
 if(!integer(image.width,1,8192)||!integer(image.height,1,8192)||image.width*image.height>16777216||image.data.length!==image.width*image.height*4)throw Error('Invalid image dimensions or pixel data (maximum 16 megapixels).');
 const c=o.crop;
 if(!integer(c.x,0,image.width-1)||!integer(c.y,0,image.height-1)||!integer(c.width,1,image.width-c.x)||!integer(c.height,1,image.height-c.y))throw Error('Crop must be a nonempty rectangle inside the source image.');
 if(!integer(o.width,1,128)||!integer(o.height,1,128))throw Error('The imported region must fit in 128 × 128 pixels. Crop it or enable resizing.');
 const tw=Math.ceil(o.width/8),th=Math.ceil(o.height/8);
 if(!integer(o.tileX,0,16-tw)||!integer(o.tileY,0,16-th))throw Error('The imported tiles extend beyond this bank. Choose another position or a smaller region.');
 if(!['match','create'].includes(o.paletteMode))throw Error('Invalid palette mode.');
 const cutoff=o.alphaCutoff??128;if(!integer(cutoff,0,255))throw Error('Alpha cutoff must be 0–255.');
 const bank=structuredClone(original),limit=bank.mode===1?1:7,targets=new Set<number>();
 for(let y=0;y<th;y++)for(let x=0;x<tw;x++)targets.add((o.tileY+y)*16+o.tileX+x);
 const reserved=new Set(o.protectedPalettes??[]);original.cellPalettes.forEach((p,t)=>{if(!targets.has(t))reserved.add(p);});
 const result:ImageImportResult={bank,tilesWide:tw,tilesHigh:th,overwrittenTiles:[],createdPalettes:[],remappedPixels:0,limitedTiles:0,transparentPixels:0};
 const planes=bank.mode===1?[bank.plane]:[0,1,2];
 const nearest=(word:number,p:number)=>{let index=1,error=Infinity;for(let i=1;i<=limit;i++){const d=distance(word,bank.palettes[p*8+i]);if(d<error){error=d;index=i;}}return {index,error};};
 const score=(hist:Map<number,number>,p:number)=>[...hist].reduce((sum,[word,n])=>sum+nearest(word,p).error*n,0);
 for(let ty=0;ty<th;ty++)for(let tx=0;tx<tw;tx++){
  const t=(o.tileY+ty)*16+o.tileX+tx,words:(number|null)[]=[],hist=new Map<number,number>();
  if(planes.some(p=>bank.chr.slice(p*2048+t*8,p*2048+t*8+8).some(v=>v!==0)))result.overwrittenTiles.push(t);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const dx=tx*8+x,dy=ty*8+y;let word:number|null=null;
   if(dx<o.width&&dy<o.height){const sx=c.x+Math.floor(dx*c.width/o.width),sy=c.y+Math.floor(dy*c.height/o.height),i=(sy*image.width+sx)*4;
    if(image.data[i+3]>0&&image.data[i+3]>=cutoff)word=rgb565(image.data[i],image.data[i+1],image.data[i+2]);else result.transparentPixels++;
   }
   words.push(word);if(word!==null)hist.set(word,(hist.get(word)??0)+1);
  }
  let palette=bank.cellPalettes[t];
  if(hist.size){let best=Infinity;for(let p=0;p<16;p++){const error=score(hist,p);if(error<best){palette=p;best=error;}}
   if(o.paletteMode==='create'&&best>0){const colors=quantize(hist,limit),ideal=[...hist].reduce((sum,[word,n])=>sum+Math.min(...colors.map(c=>distance(word,c)))*n,0);const free=best>ideal+.0001? Array.from({length:16},(_,i)=>i).find(p=>!reserved.has(p)):undefined;
    if(free!==undefined){palette=free;for(let i=1;i<=limit;i++)bank.palettes[palette*8+i]=colors[(i-1)%colors.length];result.createdPalettes.push(palette);}
    else if(best>ideal+.0001)result.limitedTiles++;
   }
   reserved.add(palette);bank.cellPalettes[t]=palette;
  }
  for(let p of planes)for(let y=0;y<8;y++)bank.chr[p*2048+t*8+y]=0;
  words.forEach((word,i)=>{let value=0;if(word!==null){const found=nearest(word,palette);value=found.index;if(found.error>0)result.remappedPixels++;}
   for(const p of planes){const bit=bank.mode===1?(value?1:0):(value>>p)&1;bank.chr[p*2048+t*8+Math.floor(i/8)]|=bit<<(i%8);}
  });
 }
 return result;
}
