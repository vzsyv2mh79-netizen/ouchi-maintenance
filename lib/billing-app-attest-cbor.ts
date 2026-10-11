/** Bounded subset of CBOR used by App Attest. No tags, floating point,
 * indefinite lengths, duplicate map keys or trailing bytes are accepted.
 * Decoding is structural validation, not Apple attestation verification.
 */
export type AttestCBOR=number|string|Buffer|AttestCBOR[]|Map<string,AttestCBOR>;
export function decodeAttestCBOR(input:Buffer):AttestCBOR{
 if(!Buffer.isBuffer(input)||input.length===0||input.length>131072)throw Error('Invalid App Attest CBOR');
 let offset=0,items=0;
 const take=(size:number)=>{if(offset+size>input.length)throw Error('Truncated App Attest CBOR');const value=input.subarray(offset,offset+size);offset+=size;return value;};
 function read(depth:number):AttestCBOR{
  if(depth>8||++items>256)throw Error('App Attest CBOR limit');
  const head=take(1)[0],major=head>>5,additional=head&31;
  let length:number;
  if(additional<24)length=additional;
  else if(additional===24){length=take(1)[0];if(length<24)throw Error('Noncanonical App Attest CBOR');}
  else if(additional===25){length=take(2).readUInt16BE();if(length<=255)throw Error('Noncanonical App Attest CBOR');}
  else if(additional===26){length=take(4).readUInt32BE();if(length<=65535)throw Error('Noncanonical App Attest CBOR');}
  else throw Error('Unsupported App Attest CBOR');
  if(major===0)return length;
  if(major===2)return Buffer.from(take(length));
  if(major===3){return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(take(length));}
  if(major===4){if(length>128)throw Error('App Attest CBOR limit');return Array.from({length},()=>read(depth+1));}
  if(major===5){
   if(length>64)throw Error('App Attest CBOR limit');
   const value=new Map<string,AttestCBOR>();
   for(let i=0;i<length;i++){const key=read(depth+1);if(typeof key!=='string'||value.has(key))throw Error('Invalid App Attest CBOR map');value.set(key,read(depth+1));}
   return value;
  }
  throw Error('Unsupported App Attest CBOR');
 }
 const value=read(0);if(offset!==input.length)throw Error('Trailing App Attest CBOR');return value;
}
