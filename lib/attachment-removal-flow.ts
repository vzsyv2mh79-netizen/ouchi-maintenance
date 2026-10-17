import {attachmentBinding,removeAttachment,type AttachmentBinding} from './attachment-client';
import {browserPendingAttachmentRemovals,type PendingWebAttachmentRemoval} from './pending-attachment-store';
import {AttachmentScopeChanged} from './attachment-upload-flow';
type Dependencies={read:typeof browserPendingAttachmentRemovals.read;complete:typeof browserPendingAttachmentRemovals.complete;binding:typeof attachmentBinding;remove:typeof removeAttachment};
const defaults:Dependencies={read:browserPendingAttachmentRemovals.read,complete:browserPendingAttachmentRemovals.complete,binding:attachmentBinding,remove:removeAttachment};
const same=(current:AttachmentBinding,expected:AttachmentBinding)=>current.account===expected.account&&current.epoch===expected.epoch;
/** Persist the original receipt before calling. Product may no longer exist;
 * only that immutable attachment is retried after current account/epoch checks. */
export async function sendPendingAttachmentRemoval(scope:AttachmentBinding,id:string,token:string,signal:AbortSignal,deps:Dependencies=defaults):Promise<PendingWebAttachmentRemoval>{
 signal.throwIfAborted();
 const pending=await deps.read(scope.account,scope.epoch);signal.throwIfAborted();
 if(!pending||pending.id!==id||pending.account!==scope.account||pending.epoch!==scope.epoch)throw Error('この端末の確認待ちの削除情報を確認してください。');
 if(!same(await deps.binding(token,signal),scope))throw new AttachmentScopeChanged();
 signal.throwIfAborted();
 await deps.remove(pending.id,pending.epoch,true,token,signal);signal.throwIfAborted();
 if(!same(await deps.binding(token,signal),scope))throw new AttachmentScopeChanged();
 signal.throwIfAborted();
 await deps.complete(scope.account,scope.epoch,pending.id);signal.throwIfAborted();
 return pending;
}
