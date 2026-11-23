import path from 'node:path';

export const ATTACHMENT_MAX_COUNT=10;
export const TEXT_ATTACHMENT_MAX_BYTES=256*1024;
export const TEXT_ATTACHMENTS_MAX_BYTES=1024*1024;
export const IMAGE_ATTACHMENT_MAX_BYTES=5*1024*1024;
export const IMAGE_ATTACHMENTS_MAX_BYTES=12*1024*1024;

export type CliImageMime='image/png'|'image/jpeg'|'image/webp';
export type CliTextAttachment={kind:'text';path:string;mimeType:'text/plain';bytes:number;text:string};
export type CliImageAttachment={kind:'image';path:string;mimeType:CliImageMime;bytes:number;dataBase64:string};
export type CliAttachment=CliTextAttachment|CliImageAttachment;

export class CliAttachmentError extends Error{
  code:string;
  constructor(code:string,message=code){super(message);this.name='CliAttachmentError';this.code=code;}
}

function safePath(value:unknown):string{
  if(typeof value!=='string'||value.length===0||value.length>1024||/[\0\r\n]/u.test(value)||value.includes('\\')||path.posix.isAbsolute(value)||path.win32.isAbsolute(value)||value.split('/').some(part=>part==='..'))throw new CliAttachmentError('ATTACHMENT_INVALID','Attachment path is invalid.');
  return value;
}
function exactBase64(value:unknown):Buffer{
  if(typeof value!=='string'||value.length===0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value))throw new CliAttachmentError('ATTACHMENT_INVALID','Attachment image data is invalid.');
  const bytes=Buffer.from(value,'base64');
  if(bytes.toString('base64')!==value)throw new CliAttachmentError('ATTACHMENT_INVALID','Attachment image data is not canonical base64.');
  return bytes;
}
export function imageMimeFromBytes(value:Uint8Array):CliImageMime|null{
  const bytes=Buffer.from(value);
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return'image/jpeg';
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return'image/webp';
  return null;
}

export function validateCliAttachments(input:readonly CliAttachment[]|undefined):CliAttachment[]{
  if(input===undefined)return[];
  if(!Array.isArray(input))throw new CliAttachmentError('ATTACHMENT_INVALID','Attachments must be an array.');
  if(input.length>ATTACHMENT_MAX_COUNT)throw new CliAttachmentError('ATTACHMENT_COUNT_LIMIT',`A message can attach at most ${ATTACHMENT_MAX_COUNT} files.`);
  let textBytes=0,imageBytes=0;const out:CliAttachment[]=[];
  for(const row of input){
    if(!row||typeof row!=='object')throw new CliAttachmentError('ATTACHMENT_INVALID');
    const attachmentPath=safePath((row as CliAttachment).path);
    if(row.kind==='text'){
      if(row.mimeType!=='text/plain'||typeof row.text!=='string'||!Number.isSafeInteger(row.bytes)||row.bytes<0||Buffer.byteLength(row.text,'utf8')!==row.bytes)throw new CliAttachmentError('ATTACHMENT_INVALID','Text attachment metadata does not match its content.');
      if(row.bytes>TEXT_ATTACHMENT_MAX_BYTES)throw new CliAttachmentError('ATTACHMENT_TEXT_TOO_LARGE',`Text references are limited to ${TEXT_ATTACHMENT_MAX_BYTES} bytes each.`);
      textBytes+=row.bytes;if(textBytes>TEXT_ATTACHMENTS_MAX_BYTES)throw new CliAttachmentError('ATTACHMENT_TEXT_TOTAL_LIMIT',`Text references are limited to ${TEXT_ATTACHMENTS_MAX_BYTES} bytes per message.`);
      out.push({kind:'text',path:attachmentPath,mimeType:'text/plain',bytes:row.bytes,text:row.text});continue;
    }
    if(row.kind==='image'){
      if(!['image/png','image/jpeg','image/webp'].includes(row.mimeType)||!Number.isSafeInteger(row.bytes)||row.bytes<=0)throw new CliAttachmentError('ATTACHMENT_INVALID','Image attachment metadata is invalid.');
      const bytes=exactBase64(row.dataBase64);
      if(bytes.length!==row.bytes)throw new CliAttachmentError('ATTACHMENT_INVALID','Image attachment byte count does not match its content.');
      if(row.bytes>IMAGE_ATTACHMENT_MAX_BYTES)throw new CliAttachmentError('ATTACHMENT_IMAGE_TOO_LARGE',`Images are limited to ${IMAGE_ATTACHMENT_MAX_BYTES} bytes each.`);
      if(imageMimeFromBytes(bytes)!==row.mimeType)throw new CliAttachmentError('ATTACHMENT_IMAGE_SIGNATURE','The declared image type does not match its bytes.');
      imageBytes+=row.bytes;if(imageBytes>IMAGE_ATTACHMENTS_MAX_BYTES)throw new CliAttachmentError('ATTACHMENT_IMAGE_TOTAL_LIMIT',`Images are limited to ${IMAGE_ATTACHMENTS_MAX_BYTES} bytes per message.`);
      out.push({kind:'image',path:attachmentPath,mimeType:row.mimeType,bytes:row.bytes,dataBase64:row.dataBase64});continue;
    }
    throw new CliAttachmentError('ATTACHMENT_INVALID','Attachment kind is unsupported.');
  }
  return out;
}

export function renderPromptWithAttachments(prompt:string,attachments:readonly CliAttachment[]):string{
  const textRows=attachments.filter((row):row is CliTextAttachment=>row.kind==='text');
  if(textRows.length===0)return prompt;
  const blocks=textRows.map(row=>`[TALOS project reference: ${row.path} · ${row.bytes} bytes]\n${row.text}\n[End TALOS project reference]`);
  return `${prompt}\n\n${blocks.join('\n\n')}`;
}
