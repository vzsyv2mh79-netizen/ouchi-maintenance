"use client";
import {useState} from 'react';
import {normalizeModel,type ProductCandidate} from '@/lib/product-lookup';
import {panasonicSupportUrl} from '@/lib/official-lookup';
export function ManualLookupControls({model,initialUrl='',onSelect}:{model:string;initialUrl?:string;onSelect:(candidate:ProductCandidate)=>void}) {
 const [url,setUrl]=useState(initialUrl),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[consent,setConsent]=useState(false);
 const [candidate,setCandidate]=useState<ProductCandidate|null>(null);
 let termsUrl:string|undefined;try{const host=new URL(url).hostname;if(host==='panasonic.jp')termsUrl=panasonicSupportUrl(model)??'https://panasonic.jp/support/manual.html';else if(host==='jp.sharp')termsUrl=`https://cs.sharp.co.jp/select/download?productId=${encodeURIComponent(normalizeModel(model))}`;}catch{}
 const requiresConsent=Boolean(termsUrl);
 return <section className="settings-group"><h3>公式説明書から候補を読み取る</h3><p>SHARP・Panasonicの空気清浄機の公式PDFに対応しています。説明書の品番を照合し、明記されたお手入れ周期を確認します。読み取れない項目は手入力してください。</p><form className="form-grid" onSubmit={async event=>{
  event.preventDefault();if(busy||(requiresConsent&&!consent))return;setBusy(true);setMessage('');setCandidate(null);
  const selectedModel=normalizeModel(model);
  try{
   const response=await fetch('/api/manual-suggestions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:selectedModel,url,manualConsentConfirmed:consent})});
   const result=await response.json();if(!response.ok){setMessage(result.error??'説明書を確認できませんでした。');return;}
   if(!result.suggestions.length){setMessage('品番は一致しましたが、周期を確実に読み取れる項目がありませんでした。説明書を確認して手入力してください。');return;}
   setCandidate({maker:result.maker,name:result.name,modelNumber:selectedModel,categoryId:'air-purifier',productUrl:result.maker==='Panasonic'?(panasonicSupportUrl(selectedModel)??'https://panasonic.jp/support/manual.html'):'https://jp.sharp/support/air_purifier/download.html',manualUrl:result.manualUrl,verifiedAt:new Date().toISOString().slice(0,10),suggestions:result.suggestions,lookupNote:'説明書から自動抽出した候補です。根拠ページの対象・周期・条件を確認してください。'});
  }catch{setMessage('説明書を読み取れませんでした。通信状態を確認してください。');}finally{setBusy(false);}
 }}>
 <label className="wide"><span>メーカー公式PDFのURL</span><input type="url" required disabled={busy} value={url} onChange={event=>{setUrl(event.target.value);setCandidate(null);setConsent(false);}} placeholder="https://jp.sharp/…pdf または https://panasonic.jp/…pdf" /></label>
 {requiresConsent&&<div className="wide"><p><a href={termsUrl} target="_blank" rel="noreferrer">メーカー公式ページで説明書の利用条件を確認</a></p><label><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)} />メーカーの説明書利用条件を確認し、同意しました</label></div>}
 <button className="secondary-button" disabled={busy||!model.trim()||(requiresConsent&&!consent)}>{busy?'説明書を確認中…':'この品番の説明書を確認'}</button></form>
 {candidate&&<div><h4>{candidate.maker} {candidate.modelNumber}</h4><p>{candidate.lookupNote}</p>{candidate.suggestions.map(item=><p key={item.name}>{item.name} · {item.frequency}<br /><a href={item.sourceUrl} target="_blank" rel="noreferrer">根拠ページを確認</a></p>)}<button className="primary-button" onClick={()=>onSelect(candidate)}>確認して、お手入れ候補を選ぶ</button></div>}
 {message&&<p role="status">{message}</p>}</section>;
}
