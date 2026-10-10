import {readProductAttachment,type ValidatedAttachment} from './product-attachment';

export type AttachmentIdentity={user:string;session:string;epoch:string;premium:boolean};
export type AttachmentReservation={identity:AttachmentIdentity;product:string;id:string;file:ValidatedAttachment;path:string};
export type AttachmentUploadServices={
 // Must verify this exact bearer with Auth and derive session/epoch from server state.
 authorize:(request:Request)=>Promise<AttachmentIdentity|null>;
 reserve:(reservation:AttachmentReservation)=>Promise<void>;
 // Create only; no overwrite. An ambiguous result is reconciled by reading the same path.
 create:(reservation:AttachmentReservation)=>Promise<void>;
 // Must bound the downloaded object, then measure/hash its actual bytes server-side.
 inspect:(reservation:AttachmentReservation)=>Promise<{size:number;sha256:string;mime:string}>;
 finalize:(reservation:AttachmentReservation)=>Promise<void>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=(value:string)=>uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
/** Reserved quota is retained on uncertain failures until object reconciliation. */
export async function uploadProductAttachment(request:Request,product:string,id:string,services:AttachmentUploadServices){
 const headers={'Cache-Control':'no-store'};
 if(!valid(product)||!valid(id))return Response.json({error:'添付先を確認してください。'},{status:400,headers});
 try{
  const identity=await services.authorize(request);
  if(!identity)return Response.json({error:'ログインを確認してください。'},{status:401,headers});
  if(!identity.premium)return Response.json({error:'有料利用権が必要です。'},{status:403,headers});
  if(!valid(identity.user)||!valid(identity.session)||!valid(identity.epoch)||identity.user.toLowerCase()===identity.epoch.toLowerCase())throw new Error('Invalid binding');
  let file:ValidatedAttachment;
  try{file=await readProductAttachment(request);}catch{return Response.json({error:'ファイル形式とサイズを確認してください。'},{status:400,headers});}
  const reservation={identity,product:product.toLowerCase(),id:id.toLowerCase(),file,path:`${identity.user.toLowerCase()}/${identity.epoch.toLowerCase()}/${id.toLowerCase()}.${file.extension}`};
  await services.reserve(reservation);
  // A timeout or duplicate create is not proof of failure or permission to overwrite.
  try{await services.create(reservation);}catch{/* reconcile the one reserved path */}
  const actual=await services.inspect(reservation);
  if(actual.size!==file.size||actual.sha256!==file.sha256||actual.mime!==file.mime)throw new Error('Stored object mismatch');
  // Database completion rechecks current session, epoch and household membership.
  await services.finalize(reservation);
  return Response.json({saved:true,attachmentId:reservation.id},{headers});
 }catch{return Response.json({error:'保存完了を確認できませんでした。同じ添付IDで再確認してください。'},{status:503,headers});}
}
