const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Expected scope is never authority: Auth and live SQL determine the current epoch. */
export function validAttachmentEpoch(value:string|null):value is string{
 return value!==null&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
}
/** Missing headers are retained for existing isolated tests only. Formal writes require one at the route. */
export function attachmentEpochMatches(expected:string|null,current:string){
 return expected===null||(validAttachmentEpoch(expected)&&expected.toLowerCase()===current.toLowerCase());
}
