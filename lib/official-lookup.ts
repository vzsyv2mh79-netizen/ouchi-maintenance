import { normalizeModel, type ProductCandidate } from "./product-lookup";
export const SHARP_INDEX_URL = "https://jp.sharp/support/air_purifier/js/dl_katalist.js";
export function panasonicSupportUrl(input: string) {
  const model=normalizeModel(input);
  return /^F-[PV][A-Z0-9]{2,7}$/.test(model)?`https://panasonic.jp/airrich/products/${model}/support.html`:null;
}
function htmlText(source:string) {
  const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return source.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,(_,code:string)=>{
    if(code[0]!=='#')return entities[code.toLowerCase()]??'';
    const n=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):parseInt(code.slice(1),10);
    return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  });
}
export function parsePanasonicSupport(source:string,input:string):ProductCandidate[] {
  const model=normalizeModel(input),supportUrl=panasonicSupportUrl(model);if(!supportUrl)return [];
  // Read markup only; ignore scripts and comments, including embedded example links.
  const markup=source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const title=htmlText(markup.match(/<title\b[^>]*>([^<]{1,1000})<\/title\s*>/i)?.[1]??'').normalize('NFKC').replace(/\s+/g,' ').trim();
  if(!title.startsWith(model+' ')||!title.includes('空気清浄機')||!title.endsWith('| Panasonic'))return [];
  let discoveredManualUrl:string|undefined;
  for(const anchor of markup.matchAll(/<a\b([^>]{0,5000})>([\s\S]{0,6000}?)<\/a\s*>/gi)) {
    const label=htmlText(anchor[2].replace(/<[^>]*>/g,'')).normalize('NFKC').replace(/\s/g,'');
    if(!label.startsWith(`取扱説明書[${model}]`))continue;
    const href=anchor[1].match(/(?:^|\s)href\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    if(!href)continue;
    try {
      const url=new URL(htmlText(href[1]??href[2]),supportUrl),path=decodeURIComponent(url.pathname);
      if(url.protocol==='https:'&&url.hostname==='panasonic.jp'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/content\/dam\/panasonic\/jp\/ja\/pim-assets\/support\/manual\/(?:[0-9]+\/)+[^/\\?#]{1,180}\.pdf$/.test(path)) {discoveredManualUrl=url.href;break;}
    }catch{continue;}
  }
  return [{maker:'Panasonic',name:title.includes('加湿空気清浄機')?'加湿空気清浄機':'空気清浄機',modelNumber:model,categoryId:'air-purifier',productUrl:supportUrl,manualUrl:supportUrl,discoveredManualUrl,productLinkLabel:'公式サポートページ',manualLinkLabel:'説明書と利用条件を確認',verifiedAt:new Date().toISOString().slice(0,10),suggestions:[],lookupNote:discoveredManualUrl?'公式サポートページで品番と説明書リンクを確認しました。メーカーの利用条件を確認した後、説明書からお手入れ候補を読み取れます。周期は本文を読み取るまで未確認です。':'公式サポートページで品番を確認しました。説明書本文と周期は未確認のため、自動提案はありません。'}];
}
export function parseSharpIndex(source: string, input: string): ProductCandidate[] {
  const model = normalizeModel(input);
  if (!/^[A-Z0-9][A-Z0-9-]{1,79}$/.test(model)) return [];
  // Parse JSON records, never execute manufacturer JavaScript.
  const records = source.match(/\{[^{}]{1,1000}\}/g) ?? [];
  for (const raw of records) {
    let record: { kisyu?: unknown; cat?: unknown };
    try { record = JSON.parse(raw); } catch { continue; }
    if (typeof record.kisyu !== "string" || normalizeModel(record.kisyu) !== model) continue;
    if (!['kashitsu', 'kuki'].includes(String(record.cat))) continue;
    const url = `https://jp.sharp/support/download/members/?productId=${encodeURIComponent(model)}`;
    return [{ maker: 'SHARP', name: record.cat === 'kashitsu' ? '加湿空気清浄機' : '空気清浄機', modelNumber: model, categoryId: 'air-purifier', productUrl: 'https://jp.sharp/support/air_purifier/download.html', manualUrl: url, verifiedAt: new Date().toISOString().slice(0,10), suggestions: [], lookupNote: '公式の説明書一覧に品番が掲載されています。説明書の内容とお手入れ周期は未確認のため、自動提案はありません。' }];
  }
  return [];
}

export function daikinSupportUrl(input:string) {
  const model=normalizeModel(input);
  if(!/^AN[0-9]{2,3}[A-Z]{2,5}-[A-Z]$/.test(model))return null;
  const query=new URLSearchParams({conditions:model,searchAgeFrom:'ALL',searchAgeTo:'ALL',suesetuFlg:'0',tAuth:'free',torisetuFlg:'1',type:'0'});
  return `https://www.free.dtnet.daikin.co.jp/DT-NET/torisetu/result?${query}`;
}
export function parseDaikinSupport(source:string,input:string):ProductCandidate[] {
  const model=normalizeModel(input),url=daikinSupportUrl(model);if(!url)return [];
  const markup=source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const title=htmlText(markup.match(/<title\b[^>]*>([^<]{1,1000})<\/title\s*>/i)?.[1]??'').normalize('NFKC').replace(/\s+/g,' ').trim();
  const header=markup.match(/<h1\b[^>]*>([^<]{1,100})<\/h1\s*>\s*<p\b[^>]*>([^<]{1,500})<\/p\s*>/i);
  if(!header||normalizeModel(htmlText(header[1]))!==model||!htmlText(header[2]).includes('ルームエアコン'))return [];
  if(!title.startsWith(model+' | 取扱説明書 |')||!title.endsWith('ダイキン工業株式会社 | DT-NET'))return [];
  // The PDF download requires manufacturer consent. Link to the result page without inventing a PDF URL or maintenance intervals.
  return [{maker:'ダイキン',name:'ルームエアコン',modelNumber:model,categoryId:'aircon',productUrl:url,manualUrl:url,productLinkLabel:'公式説明書検索結果',manualLinkLabel:'説明書と利用条件を確認',verifiedAt:new Date().toISOString().slice(0,10),suggestions:[],lookupNote:'メーカー公式の検索結果で品番を確認しました。説明書のダウンロードにはメーカーの利用条件の確認が必要です。本文とお手入れ周期は未確認のため、自動提案はありません。'}];
}
