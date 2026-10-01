import {ProcessOutputStoreError,OUTPUT_CHUNK_BYTES,normalizzaMetadatiCattura} from './process-output-contract.mjs';
import {PROCESS_OUTPUT_ENCODINGS,decodeSingleByteProcessOutput} from './process-output-encoding.mjs';

const invalid=()=>{throw new ProcessOutputStoreError('Invalid process output page request','OUTPUT_INVALID_INPUT');};
const stopped=signal=>signal?.throwIfAborted();
const number=(v,min,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(v)||v<min||v>max)invalid();return v;};

// Find the exact recorded wrapper nonce, preserving all original bytes in SQLite.
// Memory is bounded to one page and the marker overlap, including a very long cwd.
async function visibleEnd(store,id,manifest,stream,signal){
  const total=manifest[stream].storedBytes;
  if(stream!=='stdout')return{end:total,footerStatus:'not-applicable'};
  if(manifest.outputMetadataVersion!==undefined){
    const bad=()=>{throw new ProcessOutputStoreError('Invalid persisted output boundary','OUTPUT_INTEGRITY_FAILED');};
    if(manifest.outputMetadataVersion!==1)bad();
    const f=manifest.controlFooter;
    if(!f)return{end:total,footerStatus:'absent'};
    try{normalizzaMetadatiCattura({schema:'talos.process-output-metadata.v1',controlFooter:{type:f.type,stream:f.stream,marker:f.marker,prefixBytes:f.prefixBytes}});}catch{bad();}
    if(!Number.isSafeInteger(f.observedThrough)||f.observedThrough!==manifest.stdout.observedBytes
      ||!Number.isSafeInteger(f.pendingPrefixBytes)||f.pendingPrefixBytes<0||f.pendingPrefixBytes>=f.marker.length||f.pendingPrefixBytes>f.observedThrough
      ||(f.byteOffset!==null&&(!Number.isSafeInteger(f.byteOffset)||f.byteOffset<0||f.byteOffset+f.marker.length>f.observedThrough)))bad();
    if(f.byteOffset!==null)return{end:Math.min(total,f.byteOffset),footerStatus:'excluded'};
    if(f.pendingPrefixBytes>0)return{end:total,footerStatus:'pending-marker-prefix'};
    return{end:total,footerStatus:manifest.stdout.observedBytes>total?'retention-truncated':'not-found'};
  }
  if(!manifest.controlFooter)return{end:total,footerStatus:['recording','failed'].includes(manifest.state)?'unknown-unsettled':'absent'};
  const marker=Buffer.from(manifest.controlFooter.marker);
  let end=total,overlap=Buffer.alloc(0);
  while(end>0){
    stopped(signal);const offset=Math.max(0,end-OUTPUT_CHUNK_BYTES);
    const page=await store.readPage({...id,stream,offset,limit:end-offset});
    const bytes=Buffer.concat([page.bytes,overlap]),at=bytes.lastIndexOf(marker);
    if(at>=0)return{end:offset+at,footerStatus:'excluded'};
    overlap=bytes.subarray(0,Math.min(marker.length-1,bytes.length));end=offset;
  }
  return{end:total,footerStatus:manifest.stdout.observedBytes>total?'retention-truncated':'not-found'};
}

export async function readProcessOutputPage(store,args, {signal}={}){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['sessionId','outputId','stream','offset','limit','format','encoding'].includes(k)))invalid();
  const {sessionId,outputId,stream='stdout',format='text'}=args;
  if(!['stdout','stderr'].includes(stream)||!['text','raw'].includes(format))invalid();
  // OEM36: a caller-selected encoding from a closed list, validated before any I/O; raw bytes are never reinterpreted
  const esplicita='encoding' in args;
  if(esplicita&&(!PROCESS_OUTPUT_ENCODINGS.includes(args.encoding)||format==='raw'))invalid();
  const codifica=esplicita?args.encoding:'utf-8';
  const offset=number(args.offset??0,0),limit=number(args.limit??4096,format==='raw'?1:4,OUTPUT_CHUNK_BYTES);
  stopped(signal);const id={sessionId,outputId},manifest=await store.inspect(id);
  const view=await visibleEnd(store,id,manifest,stream,signal);
  stopped(signal);
  const size=Math.max(0,Math.min(limit,view.end-offset));
  const data=size?Buffer.from((await store.readPage({...id,stream,offset,limit:size})).bytes):Buffer.alloc(0);
  stopped(signal);
  let bytes=data.length,text=null,encoding='binary-or-invalid-utf8';
  if(format==='text'&&codifica!=='utf-8'){
    // single-byte code page: every byte offset is a boundary, the page consumes all its raw bytes
    text=await decodeSingleByteProcessOutput(data,codifica);
    stopped(signal);
    encoding=text===null?'binary-or-invalid-encoding':codifica;
  }else if(format==='text'){
    if(offset>0&&data.length&&(data[0]&0xc0)===0x80)throw new ProcessOutputStoreError('The byte offset is inside a UTF-8 character; use the returned nextOffset or read raw bytes.','OUTPUT_OFFSET_NOT_TEXT_BOUNDARY');
    if(!data.includes(0)){
      const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
      try{
        text=decoder.decode(data,{stream:true});
        if(offset+bytes<view.end){bytes=Buffer.byteLength(text,'utf8');}
        else text+=decoder.decode();
        encoding='utf-8';
      }catch{text=null;bytes=data.length;}
    }
  }
  const next=offset+bytes;
  return{schema:'talos.process-output-page.v1',outputId,runId:manifest.runId,toolCallId:manifest.toolCallId,
    stream,offset,bytes,nextOffset:next<view.end?next:null,availableBytes:view.end,
    storedBytes:manifest[stream].storedBytes,observedBytes:manifest[stream].observedBytes,
    state:manifest.state,exitCode:manifest.exitCode,termination:manifest.termination,errorCode:manifest.errorCode,
    footerStatus:view.footerStatus,encoding:format==='raw'?'raw':encoding,
    ...(esplicita?{requestedEncoding:codifica,encodingSource:'caller-selected'}:{}),
    ...(format==='raw'?{data}:{text})};
}

export function formatProcessOutputPage(page){
  const {text,data,...metadata}=page;
  const note=text===null?(metadata.encoding==='binary-or-invalid-utf8'
    ? 'This page contains binary or invalid UTF-8 bytes. Read the raw HTTP page to preserve the bytes. If the program is known to write a Windows code page (for example cp850 for Italian cmd.exe), read these same retained bytes again with process_output encoding:"cp850" (or cp437, cp852, cp866, windows-1251, windows-1252); the command does not need to run again.'
    : 'These bytes are not valid in the requested encoding (or contain NUL). Read the raw HTTP page to preserve the bytes.'):text;
  return `[TALOS retained process output; offsets and sizes are bytes. ${JSON.stringify(metadata)}]\n${note??''}`;
}
