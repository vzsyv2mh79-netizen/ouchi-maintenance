import { NextResponse } from "next/server";
import {normalizeModel} from "@/lib/product-lookup";
import {officialManualUrl} from "@/lib/manual-evidence";
import {inspectManual} from "@/lib/manual-pdf";
export const runtime='nodejs';
export const maxDuration=30;
export async function POST(request:Request) {
  let model:string,url:string;
  try {
    if(Number(request.headers.get('content-length')??0)>2000)throw new Error();
    const text=await request.text();if(text.length>2000)throw new Error();
    const body=JSON.parse(text);model=normalizeModel(body.model);url=officialManualUrl(body.url);
    if(!/^[A-Z0-9][A-Z0-9-]{1,79}$/.test(model))throw new Error();
  } catch { return NextResponse.json({error:'品番と対応するメーカー公式PDFのURLを確認してください。'},{status:400}); }
  try {
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000),cache:"no-store"});
    if(!response.ok)throw new Error();const reader=response.body?.getReader();if(!reader)throw new Error();
    const chunks:Uint8Array[]=[];let size=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10_000_000)throw new Error();chunks.push(value);}}finally{await reader.cancel();}
    const bytes=new Uint8Array(Buffer.concat(chunks));if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error();
    const result=await inspectManual(bytes,model,url);
    return NextResponse.json({...result,manualUrl:url});
  } catch (error) { console.error("Manual inspection failed", error instanceof Error ? error.message : "Unknown failure"); return NextResponse.json({error:'説明書を確認できませんでした。品番が一致する文字付きPDF（10MB・100ページ以内）か確認してください。'},{status:422}); }
}
