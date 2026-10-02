import { NextResponse } from "next/server";
import { lookupModel, normalizeModel } from "@/lib/product-lookup";
import { parseSharpIndex, SHARP_INDEX_URL } from "@/lib/official-lookup";
export async function GET(request: Request) {
  const model = normalizeModel(new URL(request.url).searchParams.get('model') ?? '');
  if (!/^[A-Z0-9][A-Z0-9-]{1,79}$/.test(model)) return NextResponse.json({error:'品番を確認してください。'}, {status:400});
  const curated = lookupModel(model);
  if (curated.length) return NextResponse.json({candidates:curated});
  if (!/^(KI|KC|FU|FP)-/.test(model)) return NextResponse.json({candidates:[]});
  try {
    // Fixed official endpoint: user-supplied URLs cannot reach internal services.
    const result = await fetch(SHARP_INDEX_URL, {redirect:'error',signal:AbortSignal.timeout(8000),next:{revalidate:86400}});
    if (!result.ok) throw new Error('Official source unavailable');
    const reader = result.body?.getReader();
    if (!reader) throw new Error('Missing source');
    let bytes=0;const chunks:Uint8Array[]=[];
    try { while (true) { const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2_000_000)throw new Error('Source too large');chunks.push(value); } } finally { await reader.cancel(); }
    const source=new TextDecoder().decode(Buffer.concat(chunks));
    return NextResponse.json({candidates:parseSharpIndex(source,model)});
  } catch { return NextResponse.json({error:'メーカー公式の一覧を取得できませんでした。時間を置いて再度お試しください。'}, {status:502}); }
}
