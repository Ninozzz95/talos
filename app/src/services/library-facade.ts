import {createHash} from 'node:crypto';
import {basename,extname} from 'node:path';
import {readFile as readFileReal,writeFile as writeFileReal} from 'node:fs/promises';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {TEXT_ATTACHMENT_MAX_BYTES,imageMimeFromBytes,validateCliAttachments,type CliAttachment} from '../runtime/attachments.ts';

export type LibraryCreator={type:'persona'|'modello';model:string|null;provider:string|null};
export type LibrarySession={id:string;name:string|null};
export type LibraryContextPolicy={token:string|null;mode:'explicit-visible-reference';autoAttach:false;autoSubmit:false;persistence:'composer-only-until-send'};
export type LibraryView={id:string;name:string;mediaType:string;fileType:'image'|'document';origin:'uploaded'|'generated';creator:LibraryCreator;session:LibrarySession|null;createdAt:string|null;updatedAt:string|null;context:LibraryContextPolicy};
export type LibrarySnapshot={state:'ready'|'invalid';rows:LibraryView[];error:{code:'LIBRARY_STORE_INVALID';message:string}|null;legacyRows:any[]};
export type LibraryPreview={id:string;name:string;mediaType:string;size:number;mode:'text'|'metadata';text:string|null;truncated:boolean;reason:null|'image'|'unsupported-binary'|'text-too-large'};
export type LibraryDuplicateScan={id:string;state:'complete'|'partial'|'unavailable';sha256:string|null;duplicateIds:string[];unreadableIds:string[];verifiedUnique:boolean};
export type LibraryContextReference={id:string;token:string;path:string;kind:'text'|'image';bytes:number};
export type LibraryImportResult={id:string;nome:string;mediaType:string;duplicateDecision:'existing-exact'|'created'|'scan-incomplete-created';scanState:'complete'|'partial';duplicateIds:string[];unreadableIds:string[]};

type LibraryStore={
  CARTELLA_LIBRERIA?:string;
  elencaVoci:(input:{cartella:string;conProvenienza?:boolean})=>Promise<any[]>;
  elencaVociConTesto:(input:{cartella:string})=>Promise<any[]>;
  cercaVoci:(rows:any[],input:{query:string;limit?:number;offset?:number})=>any;
  leggiVoce:(input:{cartella:string;id:string})=>Promise<any|null>;
  salvaVoce:(input:any)=>Promise<string>;
  leggiBytesVoce:(input:{cartella:string;id:string})=>Promise<{bytes:Uint8Array;dimensione?:number;nome:string;mediaType:string}|null>;
  rinominaVoce:(input:{cartella:string;id:string;nome:string})=>Promise<any>;
  eliminaVoce:(input:{cartella:string;id:string})=>Promise<any>;
  percorsoContenutoVoce:(id:string)=>string|null;
};
type Input={repoRoot?:string;projectRoot:string;paths?:{dataRoot:string}};
type Deps={loadStore?:()=>Promise<LibraryStore>;readImportFile?:(file:string)=>Promise<Uint8Array>;writeExportFile?:(file:string,bytes:Uint8Array)=>Promise<void>};

const PREVIEW_CHARS=4_000;
function fail(code:string,message=code):never{throw Object.assign(new Error(message),{code});}
function required(value:unknown,field:string){if(typeof value!=='string'||!value.length)throw new TypeError('malformed Library entry: '+field);return value;}
function optional(value:unknown){return typeof value==='string'?value:null;}
function textMedia(mediaType:string){const value=mediaType.toLowerCase();return value.startsWith('text/')||value==='application/json'||value.endsWith('+json')||value==='application/xml'||value.endsWith('+xml')||value==='application/yaml'||value==='application/x-yaml'||value==='application/javascript'||value==='application/x-javascript';}
function mediaFor(file:string){const e=extname(file).toLowerCase();return({'.md':'text/markdown','.txt':'text/plain','.json':'application/json','.xml':'application/xml','.yaml':'application/yaml','.yml':'application/yaml','.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'} as Record<string,string>)[e]??'application/octet-stream';}
function digest(bytes:Uint8Array){return createHash('sha256').update(bytes).digest('hex');}
function fatalText(bytes:Uint8Array){let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('LIBRARY_CONTEXT_UNSUPPORTED','Library content is not valid UTF-8 text.');}if(text.includes('\0'))fail('LIBRARY_CONTEXT_UNSUPPORTED','Library content is binary.');return text;}
function legacyRow(raw:any){if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;const{cartella,percorso,creatoDa,sessione,...rest}=raw;return rest;}
function exactManagedLine(text:string,token:string){return text.split('\n').some(line=>line.trim()===token);}
export function attachLibraryContextToken(text:string,token:string){if(exactManagedLine(text,token))return text;return text.length?text.replace(/\n+$/u,'')+'\n'+token:token;}
export function detachLibraryContextToken(text:string,token:string){return text.split('\n').filter(line=>line.trim()!==token).join('\n');}

export function createLibraryFacade(input:Input,deps:Deps={}){
  const repoRoot=()=>input.repoRoot??findTalosRepoRoot(input.projectRoot);
  let storePromise:Promise<LibraryStore>|null=null;
  const store=()=>storePromise??=(deps.loadStore?deps.loadStore():importTalosModule(repoRoot(),'library-store.mjs') as Promise<LibraryStore>);
  const readImport=deps.readImportFile??(async(file:string)=>readFileReal(file));
  const writeExport=deps.writeExportFile??(async(file:string,bytes:Uint8Array)=>{await writeFileReal(file,bytes);});

  function projectRow(raw:any,mod:LibraryStore):LibraryView{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('malformed Library entry: object');
    const id=required(raw.id,'id'),name=required(raw.nome,'nome'),mediaType=required(raw.mediaType,'mediaType');
    const fileType=raw.fileType==='image'?'image':raw.fileType==='document'?'document':(()=>{throw new TypeError('malformed Library entry: fileType');})();
    const origin=raw.origine==='generated'?'generated':raw.origine==='uploaded'?'uploaded':(()=>{throw new TypeError('malformed Library entry: origine');})();
    const created=raw.creatoDa;
    if(!created||typeof created!=='object')throw new TypeError('malformed Library entry: creatoDa');
    const creator:LibraryCreator=created.tipo==='persona'
      ?{type:'persona',model:null,provider:null}
      :created.tipo==='modello'
        ?{type:'modello',model:optional(created.modello),provider:optional(created.provider)}
        :(()=>{throw new TypeError('malformed Library entry: creatoDa.tipo');})();
    const session:LibrarySession|null=raw.sessione&&typeof raw.sessione==='object'&&typeof raw.sessione.id==='string'&&raw.sessione.id
      ?{id:raw.sessione.id,name:optional(raw.sessione.nome)}:null;
    const relative=mod.percorsoContenutoVoce(id);
    const token=relative&&typeof relative==='string'&&!/[\0\r\n\s]/u.test(relative)?'@'+relative:null;
    return{id,name,mediaType,fileType,origin,creator,session,createdAt:optional(raw.creatoIl),updatedAt:optional(raw.aggiornatoIl),context:{token,mode:'explicit-visible-reference',autoAttach:false,autoSubmit:false,persistence:'composer-only-until-send'}};
  }
  async function metadata(){
    const mod=await store(),raw=await mod.elencaVoci({cartella:input.projectRoot,conProvenienza:true});
    if(!Array.isArray(raw))throw new TypeError('malformed Library list');
    return{mod,raw,rows:raw.map(row=>projectRow(row,mod))};
  }
  async function exact(id:string){
    const all=await metadata(),index=all.rows.findIndex(row=>row.id===id);
    if(index<0)fail('LIBRARY_NOT_FOUND');
    return{...all,row:all.rows[index]!,raw:all.raw[index]};
  }
  async function bytesFor(id:string){
    const mod=await store(),value=await mod.leggiBytesVoce({cartella:input.projectRoot,id});
    if(!value)fail('LIBRARY_NOT_FOUND');
    return{...value,bytes:Buffer.from(value.bytes)};
  }
  async function scanBytes(source:Uint8Array,excludeId?:string){
    const mod=await store(),rows=await mod.elencaVoci({cartella:input.projectRoot});
    if(!Array.isArray(rows))throw new TypeError('malformed Library list');
    const wanted=digest(source),duplicates:string[]=[],unreadable:string[]=[];
    for(const row of rows){
      const id=typeof row?.id==='string'?row.id:null;if(!id||id===excludeId)continue;
      try{const value=await mod.leggiBytesVoce({cartella:input.projectRoot,id});if(!value){unreadable.push(id);continue;}if(digest(value.bytes)===wanted)duplicates.push(id);}
      catch{unreadable.push(id);}
    }
    duplicates.sort();unreadable.sort();
    return{sha256:wanted,duplicateIds:duplicates,unreadableIds:unreadable,state:unreadable.length?'partial' as const:'complete' as const};
  }

  const list=async():Promise<LibrarySnapshot>=>{
    try{const x=await metadata();return{state:'ready',rows:x.rows,error:null,legacyRows:x.raw.map(legacyRow)};}
    catch(error){return{state:'invalid',rows:[],error:{code:'LIBRARY_STORE_INVALID',message:error instanceof Error?error.message:String(error)},legacyRows:[]};}
  };
  const search=async(query:string)=>{const mod=await store(),rows=await mod.elencaVociConTesto({cartella:input.projectRoot});const legacy=mod.cercaVoci(rows,{query});return{legacy};};
  const read=async(id:string)=>{const mod=await store(),legacy=await mod.leggiVoce({cartella:input.projectRoot,id});return{legacy};};
  const preview=async(id:string):Promise<LibraryPreview>=>{
    const entry=await exact(id),value=await bytesFor(id),size=Number.isFinite(value.dimensione)?Number(value.dimensione):value.bytes.length;
    if(entry.row.fileType==='image'||entry.row.mediaType.startsWith('image/'))return{id,name:entry.row.name,mediaType:entry.row.mediaType,size,mode:'metadata',text:null,truncated:false,reason:'image'};
    if(!textMedia(entry.row.mediaType))return{id,name:entry.row.name,mediaType:entry.row.mediaType,size,mode:'metadata',text:null,truncated:false,reason:'unsupported-binary'};
    if(value.bytes.length>TEXT_ATTACHMENT_MAX_BYTES)return{id,name:entry.row.name,mediaType:entry.row.mediaType,size,mode:'metadata',text:null,truncated:false,reason:'text-too-large'};
    let decoded:string;try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(value.bytes);}catch{return{id,name:entry.row.name,mediaType:entry.row.mediaType,size,mode:'metadata',text:null,truncated:false,reason:'unsupported-binary'};}
    if(decoded.includes('\0'))return{id,name:entry.row.name,mediaType:entry.row.mediaType,size,mode:'metadata',text:null,truncated:false,reason:'unsupported-binary'};
    return{id,name:entry.row.name,mediaType:entry.row.mediaType,size,mode:'text',text:decoded.slice(0,PREVIEW_CHARS),truncated:decoded.length>PREVIEW_CHARS,reason:null};
  };
  const duplicates=async(id:string):Promise<LibraryDuplicateScan>=>{
    await exact(id);
    let target;try{target=await bytesFor(id);}catch{return{id,state:'unavailable',sha256:null,duplicateIds:[],unreadableIds:[id],verifiedUnique:false};}
    const scan=await scanBytes(target.bytes,id);
    return{id,state:scan.state,sha256:scan.sha256,duplicateIds:scan.duplicateIds,unreadableIds:scan.unreadableIds,verifiedUnique:scan.state==='complete'&&scan.duplicateIds.length===0};
  };
  const importFile=async(file:string):Promise<LibraryImportResult>=>{
    const bytes=Buffer.from(await readImport(file)),name=basename(file),mediaType=mediaFor(file),scan=await scanBytes(bytes);
    if(scan.duplicateIds.length){return{id:scan.duplicateIds[0]!,nome:name,mediaType,duplicateDecision:'existing-exact',scanState:scan.state,duplicateIds:scan.duplicateIds,unreadableIds:scan.unreadableIds};}
    const mod=await store(),id=await mod.salvaVoce({cartella:input.projectRoot,nome:name,mediaType,origine:'uploaded',base64:bytes.toString('base64')});
    return{id,nome:name,mediaType,duplicateDecision:scan.state==='complete'?'created':'scan-incomplete-created',scanState:scan.state,duplicateIds:[],unreadableIds:scan.unreadableIds};
  };
  const exportFile=async(id:string,out:string)=>{const value=await bytesFor(id);await writeExport(out,value.bytes);return{legacy:{ok:true as const,id,out,nome:value.nome,mediaType:value.mediaType}};};
  const rename=async(id:string,name:string)=>{const mod=await store(),legacy=await mod.rinominaVoce({cartella:input.projectRoot,id,nome:name});return{legacy};};
  const deleteEntry=async(id:string)=>{const mod=await store(),legacy=await mod.eliminaVoce({cartella:input.projectRoot,id});return{legacy};};
  const prepareContextReference=async(id:string):Promise<LibraryContextReference>=>{
    const entry=await exact(id),relative=entry.mod.percorsoContenutoVoce(id);
    if(!relative||/[\0\r\n\s]/u.test(relative))fail('LIBRARY_CONTEXT_UNSUPPORTED','Library content path cannot be attached safely.');
    const value=await bytesFor(id);let attachment:CliAttachment;
    if(entry.row.fileType==='image'||entry.row.mediaType.startsWith('image/')){
      const mime=imageMimeFromBytes(value.bytes);if(!mime)fail('LIBRARY_CONTEXT_UNSUPPORTED','This image format is not supported by the current CLI attachment model.');
      attachment={kind:'image',path:relative,mimeType:mime,bytes:value.bytes.length,dataBase64:value.bytes.toString('base64')};
    }else{
      if(!textMedia(entry.row.mediaType))fail('LIBRARY_CONTEXT_UNSUPPORTED','This Library file type is not supported by the current CLI attachment model.');
      if(value.bytes.length>TEXT_ATTACHMENT_MAX_BYTES)fail('LIBRARY_CONTEXT_UNSUPPORTED','This Library text file exceeds the current CLI attachment limit.');
      const text=fatalText(value.bytes);
      attachment={kind:'text',path:relative,mimeType:'text/plain',bytes:value.bytes.length,text};
    }
    validateCliAttachments([attachment]);
    return{id,token:'@'+relative,path:relative,kind:attachment.kind,bytes:attachment.bytes};
  };

  return{list,search,read,preview,duplicates,importFile,exportFile,rename,delete:deleteEntry,prepareContextReference};
}
