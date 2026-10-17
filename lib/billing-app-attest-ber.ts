export type ReceiptASN={tag:number;raw:Buffer;value:Buffer;children?:ReceiptASN[];indefinite:boolean};
/** Bounded BER for Apple's PKCS7 container. Primitive indefinite encodings,
 * high-tag forms, malformed lengths/EOC and trailing bytes fail closed.
 * Parsing itself does not authenticate any field.
 */
export function decodeReceiptBER(input:Buffer):ReceiptASN{
 if(!Buffer.isBuffer(input)||!input.length||input.length>65536)throw Error('Invalid receipt BER size');
 let offset=0,items=0;
 function read(end:number,depth:number):ReceiptASN{
  const start=offset;if(depth>20||++items>2048||offset+2>end)throw Error('Receipt BER limit');
  const tag=input[offset++];if(tag===0||(tag&31)===31)throw Error('Invalid receipt BER tag');
  let length=input[offset++];const indefinite=length===128,constructed=!!(tag&32);
  if(indefinite&&!constructed)throw Error('Primitive indefinite receipt BER');
  if(!indefinite&&(length&128)){const count=length&127;if(count<1||count>3||offset+count>end||input[offset]===0)throw Error('Invalid receipt BER length');length=0;for(let i=0;i<count;i++)length=length*256+input[offset++];if(length<128)throw Error('Noncanonical receipt BER length');}
  const bodyStart=offset,bodyEnd=indefinite?end:offset+length;if(bodyEnd>end)throw Error('Truncated receipt BER');
  let children:ReceiptASN[]|undefined,valueEnd:number;
  if(constructed){children=[];while(offset<bodyEnd){if(indefinite&&offset+2<=end&&input[offset]===0&&input[offset+1]===0)break;children.push(read(bodyEnd,depth+1));}valueEnd=offset;if(indefinite){if(offset+2>end||input[offset]!==0||input[offset+1]!==0)throw Error('Missing receipt BER EOC');offset+=2;}else if(offset!==bodyEnd)throw Error('Invalid receipt BER boundary');}
  else{offset=bodyEnd;valueEnd=bodyEnd;}
  return {tag,raw:input.subarray(start,offset),value:input.subarray(bodyStart,valueEnd),children,indefinite};
 }
 const value=read(input.length,0);if(offset!==input.length)throw Error('Trailing receipt BER');return value;
}
