import {createHash} from 'node:crypto';
import type {BillingEnvironment} from './billing';
export type NotificationRecord={environment:BillingEnvironment;notificationId:string;notificationType:string;subtype?:string;signedAt:number;disposition:'test'|'transaction_applied'|'needs_reconciliation'};
/** Only call with output of Apple's SignedDataVerifier for this configured environment. */
export function normalizedVerifiedNotification(value:Record<string,unknown>,environment:BillingEnvironment,transactionApplied:boolean):NotificationRecord{
 const id=value.notificationUUID,type=value.notificationType,subtype=value.subtype,signedAt=value.signedDate;
 if(!['Sandbox','Production'].includes(environment)||typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||id==='00000000-0000-0000-0000-000000000000'||typeof type!=='string'||!/^[A-Z_]{1,80}$/.test(type)||(subtype!==undefined&&(typeof subtype!=='string'||!/^[A-Z_]{1,80}$/.test(subtype)))||typeof signedAt!=='number'||!Number.isSafeInteger(signedAt)||signedAt<=0)throw new Error('Invalid verified notification');
 const data=value.data as Record<string,unknown>|undefined;
 if(data?.environment!==undefined&&data.environment!==environment)throw new Error('Notification environment mismatch');
 // Renewal-only/non-transaction events need a subsequent verified reconciliation.
 // A persisted transaction must not be mistaken for handling renewal metadata.
 const disposition=type==='TEST'?'test':transactionApplied&&!data?.signedRenewalInfo?'transaction_applied':'needs_reconciliation';
 return {environment,notificationId:id.toLowerCase(),notificationType:type,...(subtype===undefined?{}:{subtype}),signedAt,disposition};
}
export async function persistVerifiedNotification(signedPayload:string,record:NotificationRecord,persist:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>){
 if(!signedPayload||Buffer.byteLength(signedPayload)>250_000)throw new Error('Invalid notification proof');
 const result=await persist('record_maintenance_verified_notification',{payload:record,proof_sha256:createHash('sha256').update(signedPayload).digest('hex')});
 if(result.error||typeof result.data!=='string'||!['inserted','duplicate'].includes(result.data))throw new Error('Notification persistence unavailable');
}
