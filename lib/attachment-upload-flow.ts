import {attachmentBinding,uploadAttachment,type AttachmentBinding} from './attachment-client';
import {browserPendingAttachments,type PendingWebAttachment} from './pending-attachment-store';
type Scope=AttachmentBinding&{product:string};
type Dependencies={read:typeof browserPendingAttachments.read;complete:typeof browserPendingAttachments.complete;binding:typeof attachmentBinding;upload:typeof uploadAttachment};
const defaults:Dependencies={read:browserPendingAttachments.read,complete:browserPendingAttachments.complete,binding:attachmentBinding,upload:uploadAttachment};
export class AttachmentScopeChanged extends Error {constructor(){super('登録状態が変わったため処理を止めました。');}}
function sameScope(current:AttachmentBinding,expected:Scope){return current.account===expected.account&&current.epoch===expected.epoch;}
/** Re-read committed bytes; uncertain acknowledgements never clear or mint another receipt. */
export async function sendPendingAttachment(scope:Scope,id:string,token:string,signal:AbortSignal,deps:Dependencies=defaults):Promise<PendingWebAttachment>{
 signal.throwIfAborted();
 const pending=await deps.read(scope.account,scope.epoch);signal.throwIfAborted();
 if(!pending||pending.id!==id||pending.account!==scope.account||pending.epoch!==scope.epoch||pending.product!==scope.product)throw Error('確認待ちのファイルと保存先を確認してください。');
 const before=await deps.binding(token,signal);signal.throwIfAborted();
 if(!sameScope(before,scope))throw new AttachmentScopeChanged();
 await deps.upload({product:pending.product,id:pending.id,epoch:pending.epoch,blob:pending.blob,mime:pending.mime,confirmed:true},token,signal);
 signal.throwIfAborted();
 const after=await deps.binding(token,signal);signal.throwIfAborted();
 if(!sameScope(after,scope))throw new AttachmentScopeChanged();
 await deps.complete(scope.account,scope.epoch,pending.id);signal.throwIfAborted();
 return pending;
}
