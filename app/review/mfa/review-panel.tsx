"use client";
import {useMemo} from 'react';
import {createWebTOTPConfirmation,type TOTPLoginBinding} from '@/lib/web-totp-confirmation';
import {TOTPConfirmationControls} from '@/components/totp-confirmation-controls';
export function MFAReviewPanel(){
 const flow=useMemo(()=>{
  let current:TOTPLoginBinding={account:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',token:'synthetic-original',revision:'sample1'};
  const factor='33333333-3333-4333-8333-333333333333';
  return createWebTOTPConfirmation({read:async()=>current,factors:async()=>[factor],challenge:async(_,factorID)=>({id:'44444444-4444-4444-8444-444444444444',factorID,expiresAt:Date.now()+120000}),verify:async(binding,_,code)=>{if(code!=='123456')throw Error('Synthetic wrong code');return{account:binding.account,sessionID:binding.sessionID,accessToken:'synthetic-promoted',refreshToken:'synthetic-refresh'};},commit:async(expected,promoted,signal)=>{signal.throwIfAborted();if(current!==expected&&JSON.stringify(current)!==JSON.stringify(expected))return false;current={account:promoted.account,sessionID:promoted.sessionID,token:promoted.accessToken,revision:'sample2'};return true;}});
 },[]);
 return <main className="mfa-review"><h1>本人確認の画面サンプル</h1><p>サンプル専用です。実際のアカウント・認証サーバーへ接続しません。確認用コードは123456です。</p><TOTPConfirmationControls flow={flow} bindingRevision="synthetic-review"/></main>;
}
