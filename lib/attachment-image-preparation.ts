const maximumBytes = 5 * 1024 * 1024;
const maximumPixels = 24_000_000;
const invalid = () => Error('写真を変換できません。5MB・24メガピクセル以下のJPEGまたはPNGを選択してください。');

/** Bounded format/dimension preflight, not a replacement for browser decoding. */
export function attachmentImageDimensions(bytes: Uint8Array, mime: string) {
 let width=0,height=0;
 if(bytes.length<1||bytes.length>maximumBytes)throw invalid();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(mime==='image/png'){
  const signature=[137,80,78,71,13,10,26,10];
  if(bytes.length<33||!signature.every((v,i)=>bytes[i]===v)||view.getUint32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw invalid();
  width=view.getUint32(16);height=view.getUint32(20);
  let offset=33,ended=false;
  while(offset+12<=bytes.length){
   const length=view.getUint32(offset),kind=String.fromCharCode(...bytes.slice(offset+4,offset+8));
   if(length>bytes.length-offset-12||kind==='acTL')throw invalid(); // Do not silently flatten animated PNG.
   offset+=length+12;
   if(kind==='IEND'){if(length!==0||offset!==bytes.length)throw invalid();ended=true;break;}
  }
  if(!ended)throw invalid();
 }else if(mime==='image/jpeg'){
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw invalid();
  let offset=2;
  while(offset<bytes.length){
   if(bytes[offset++]!==255)throw invalid();
   while(bytes[offset]===255)offset++;
   if(offset>=bytes.length)throw invalid();
   const marker=bytes[offset++];
   if(marker===0||marker===216||marker===217||marker===218||offset+2>bytes.length)throw invalid();
   const length=view.getUint16(offset);
   if(length<2||offset+length>bytes.length)throw invalid();
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
    if(length<8)throw invalid();
    height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;
   }
   offset+=length;
  }
 }else throw invalid();
 if(width<1||height<1||width>Math.floor(maximumPixels/height))throw invalid();
 return {width,height};
}

/** New selections only: retries must keep their original immutable bytes/ID. */
export async function prepareAttachmentImage(file: File, signal: AbortSignal): Promise<File> {
 signal.throwIfAborted();
 if(file.size<1||file.size>maximumBytes)throw invalid();
 if(file.type==='application/pdf')return file; // Never rewrite document content.
 const bytes=new Uint8Array(await file.arrayBuffer());signal.throwIfAborted();
 const original=attachmentImageDimensions(bytes,file.type);
 if(typeof createImageBitmap!=='function')throw invalid(); // No raw-file fallback.
 const image=await createImageBitmap(file,{imageOrientation:'from-image'});
 let canvas:HTMLCanvasElement|undefined;
 try{
  signal.throwIfAborted();
  if(!((image.width===original.width&&image.height===original.height)||(image.width===original.height&&image.height===original.width)))throw invalid();
  canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');if(!context)throw invalid();
  context.drawImage(image,0,0);
  const blob=await new Promise<Blob|null>(resolve=>canvas!.toBlob(resolve,file.type,file.type==='image/jpeg'?0.95:undefined));
  signal.throwIfAborted();
  if(!blob||blob.type!==file.type||blob.size<1||blob.size>maximumBytes)throw invalid();
  return new File([blob],file.name,{type:file.type,lastModified:file.lastModified});
 }finally{image.close();if(canvas){canvas.width=0;canvas.height=0;}}
}
