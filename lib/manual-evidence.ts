import type { VerifiedSuggestion } from "./product-lookup";
export function officialManualUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.hostname !== 'jp.sharp' || url.port || url.username || url.password || url.search || !/^\/(?:restricted\/support\/manual\/air_purifier|support\/air_purifier\/doc)\/[a-zA-Z0-9_-]+\.pdf$/.test(url.pathname)) throw new Error('Unsupported manual URL');
  url.hash=''; return url.href;
}
export function hasExactModel(cover: string, model: string) {
  const text=cover.normalize('NFKC').toUpperCase().replace(/[‐‑‒–—−ー]/g,'-');
  const escaped=model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?:^|[^A-Z0-9-])${escaped}(?=$|[^A-Z0-9-])`).test(text);
}
const parts=['本体・後ろパネル','センサー部','加湿フィルター・トレー'];
export function extractMaintenanceLines(pages: {page:number;lines:string[]}[], manualUrl:string): VerifiedSuggestion[] {
  const found=new Map<string,VerifiedSuggestion>();
  for(const page of pages) {
    if(!page.lines.some(line=>line.includes('お手入れ')))continue;
    for(const line of page.lines) {
      const normalized=line.normalize('NFKC').replace(/\s/g,'');
      for(const part of parts) {
        const match=normalized.match(new RegExp(`^${part}約?([1-9][0-9]?)カ?月に1回$`));
        if(!match)continue;
        const months=Number(match[1]);if(months>12)continue;
        const suggestion:VerifiedSuggestion={name:`${part}のお手入れ`,kind:'掃除',intervalDays:months*30,sourceKind:'取扱説明書',sourceUrl:`${manualUrl}#page=${page.page}`,frequency:`約${months}か月に1回（予定計算は${months*30}日）`,conditions:`説明書${page.page}ページの同一行に記載された周期を自動抽出しました。対象と条件、作業手順を説明書で確認してから登録してください。`};
        // Conflicting evidence is unsafe to resolve automatically.
        const existing=found.get(part);
        if(existing && existing.intervalDays!==suggestion.intervalDays)found.set(part,{...existing,intervalDays:0});
        else if(!existing)found.set(part,suggestion);
      }
    }
  }
  return [...found.values()].filter(item=>item.intervalDays>0);
}

export function pdfTextLines(items: {str:string;transform:number[];width:number}[]) {
  const rows=new Map<number,{x:number;end:number;text:string}[]>();
  for(const item of items) {
    if(!item.str.trim())continue;
    const baseline=item.transform[5];
    const y=[...rows.keys()].find(y=>Math.abs(y-baseline)<=4)??baseline;
    rows.set(y,[...(rows.get(y)??[]),{x:item.transform[4],end:item.transform[4]+item.width,text:item.str}]);
  }
  return [...rows.entries()].sort(([a],[b])=>b-a).flatMap(([,row])=>{
    const groups:string[]=[];let text='',right=-Infinity;
    for(const item of row.sort((a,b)=>a.x-b.x)) {
      if(text&&item.x-right>32){groups.push(text);text='';}
      text+=(text?' ':'')+item.text;right=Math.max(right,item.end);
    }
    if(text)groups.push(text);return groups;
  });
}
