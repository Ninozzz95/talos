import type {PermissionMode} from '../args.ts';
import type {ReasoningEffort} from '../config/types.ts';
import {renderPromptWithAttachments,validateCliAttachments,type CliAttachment,type CliImageAttachment} from './attachments.ts';
import type {CliRuntime,StartInput} from './types.ts';import {CliRuntimeError} from './types.ts';import {normalizeSessionSummaries,type SessionSummaryEvidence} from './session-summary.ts';import {buildContextStatus,unavailableContextStatus} from './context-status.ts';
type Registry={ripristina?():Promise<any>|any;avviaLibero(input:any,origin?:any):any;aggiornaImpostazioni?(id:string,patch:any):any;resume?(id:string,prompt?:string|null,images?:unknown[]):any;forka?(id:string):any;accodaMessaggio?(id:string,prompt:string,images?:unknown[]):any;reindirizza?(id:string,prompt:string,options?:{immagini?:unknown[]}):any;compatta?(id:string):any;statoContesto?(id:string):any;chiudiContesto?():Promise<void>|void;elenca?():any[];elencaFigli?(id:string):any;elencaProcessi?(id:string,options?:any):any;iscriviti(id:string,sink:(e:unknown)=>void,from?:number):()=>void;rispondiApprovazione(id:string,requestId:string,approved:boolean):any;ferma(id:string,options?:any):any;shell?(id:string,comando:string):any;esporta?(id:string):unknown;};
type SessionFacadeOptions={model:string;origin?:string;modelImageCapability?:(model:string)=>boolean|null|Promise<boolean|null>;materializeImage?:(attachment:CliImageAttachment)=>Promise<unknown>};
function registryPermission(mode:PermissionMode):string{if(mode==='plan')return'Read only';if(mode==='acceptEdits'||mode==='bypassPermissions')return'Workspace write';return'On request';}
export function createSessionFacade(registry:Registry,{model,origin='talos-cli',modelImageCapability,materializeImage}:SessionFacadeOptions):CliRuntime{
 const cancelled=new Set<string>();let restored=false;let defaultReasoningEffort:ReasoningEffort|null=null;
 async function restore(){const x=typeof registry.ripristina==='function'?await registry.ripristina():{};restored=true;return{restored:Number(x?.ripristinate??x?.restored??0),total:Number(x?.totali??x?.total??0)};}
 async function ensure(){if(!restored)await restore();}
 function sessionModel(sessionId:string):string|null{let rows:any[]=[];try{rows=typeof registry.elenca==='function'?registry.elenca():[];}catch{rows=[];}const row=rows.find(candidate=>candidate?.sessionId===sessionId);return typeof row?.modello==='string'&&row.modello.trim()?row.modello.trim():null;}
 async function prepare(prompt:string|undefined,runModel:string|null,attachments:readonly CliAttachment[]|undefined){
  const rows=validateCliAttachments(attachments);if(rows.length&&!String(prompt??'').trim())throw new CliRuntimeError('ATTACHMENT_PROMPT_REQUIRED','Attachments require a prompt.');
  const images=rows.filter((row):row is CliImageAttachment=>row.kind==='image');const stored:unknown[]=[];
  if(images.length){
   let capability:boolean|null=null;try{capability=runModel&&modelImageCapability?await modelImageCapability(runModel):null;}catch{capability=null;}
   if(capability!==true)throw new CliRuntimeError('MODEL_IMAGE_UNSUPPORTED','The selected model does not affirm image input support.',{model:runModel});
   if(!materializeImage)throw new CliRuntimeError('IMAGE_ATTACHMENT_UNAVAILABLE','Image attachment storage is unavailable.');
   for(const image of images){try{stored.push(await materializeImage(image));}catch(error){if(typeof (error as any)?.code==='string')throw error;throw new CliRuntimeError('IMAGE_ATTACHMENT_MATERIALIZE_FAILED','The image could not be stored safely.');}}
  }
  return{prompt:renderPromptWithAttachments(String(prompt??''),rows),images:stored};
 }
 async function contextStatus(sessionId:string){
  await ensure();
  if(typeof registry.statoContesto!=='function')return unavailableContextStatus(sessionId,'runtime-unavailable');
  const raw=await registry.statoContesto(sessionId);
  if(raw?.unavailableReason)return unavailableContextStatus(sessionId,String(raw.unavailableReason));
  const rows=typeof registry.elenca==='function'?[...registry.elenca()]:[];
  const usage=normalizeSessionSummaries(rows).find(row=>row.id===sessionId||row.sessionId===sessionId)?.usage??null;
  return buildContextStatus({sessionId,snapshot:raw,sessionUsage:usage});
 }
 async function start(input:StartInput){await ensure();const prepared=await prepare(input.prompt,input.model||model,input.attachments);const reasoningEffort=input.reasoningEffort??defaultReasoningEffort;const x=registry.avviaLibero({cartellaLibera:input.projectRoot,consegna:prepared.prompt,modello:input.model||model,permessi:registryPermission(input.permissionMode),...(reasoningEffort?{reasoning:{effort:reasoningEffort}}:{}),...(prepared.images.length?{immagini:prepared.images}:{}),...(input.operationId?{operationId:input.operationId}:{})}, {kind:origin});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'RUNTIME_START_FAILED',x.erroreAvvio);if(typeof x?.sessionId!=='string')throw new CliRuntimeError('RUNTIME_START_FAILED');cancelled.delete(x.sessionId);return x.sessionId;}
 return{restore,start,setDefaultReasoningEffort(effort){defaultReasoningEffort=effort;},async setReasoningEffort(sessionId,effort){await ensure();if(typeof registry.aggiornaImpostazioni!=='function')throw new CliRuntimeError('SESSION_SETTINGS_UNAVAILABLE');const x=await registry.aggiornaImpostazioni(sessionId,{reasoning:{effort}});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_SETTINGS_FAILED',x.erroreAvvio);if(x?.ok!==true)throw new CliRuntimeError('SESSION_SETTINGS_FAILED');},async resume(sessionId,prompt,attachments){await ensure();if(typeof registry.resume!=='function')throw new CliRuntimeError('SESSION_RESUME_UNAVAILABLE');const prepared=await prepare(prompt,sessionModel(sessionId),attachments);const x=registry.resume(sessionId,prepared.prompt.trim()||null,prepared.images);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_RESUME_FAILED',x.erroreAvvio);if(typeof x?.sessionId!=='string')throw new CliRuntimeError('SESSION_RESUME_FAILED');cancelled.delete(x.sessionId);return x.sessionId;},async fork(sessionId,prompt,attachments){await ensure();if(typeof registry.forka!=='function')throw new CliRuntimeError('SESSION_FORK_UNAVAILABLE');const prepared=await prepare(prompt,sessionModel(sessionId),attachments);const x=registry.forka(sessionId);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_FORK_FAILED',x.erroreAvvio);if(typeof x?.sessionId!=='string')throw new CliRuntimeError('SESSION_FORK_FAILED');if(prepared.prompt.trim()){if(typeof registry.accodaMessaggio!=='function')throw new CliRuntimeError('SESSION_QUEUE_UNAVAILABLE');const q=registry.accodaMessaggio(x.sessionId,prepared.prompt.trim(),prepared.images);if(q?.erroreAvvio)throw new CliRuntimeError(q.code??'SESSION_QUEUE_FAILED',q.erroreAvvio);}return x.sessionId;},async steer(sessionId,prompt,attachments){await ensure();if(typeof registry.reindirizza!=='function')throw new CliRuntimeError('SESSION_STEER_UNAVAILABLE','Steering is unavailable for this runtime.');const text=String(prompt??'').trim();if(!text)throw new CliRuntimeError('STEER_TEXT_REQUIRED','Steering text is required.');const prepared=await prepare(text,sessionModel(sessionId),attachments);const x=registry.reindirizza(sessionId,prepared.prompt.trim(),prepared.images.length?{immagini:prepared.images}:{});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_STEER_REJECTED',x.erroreAvvio);if(x?.ok!==true||typeof x?.redirectId!=='string'||!x.redirectId)throw new CliRuntimeError('SESSION_STEER_REJECTED','The runtime did not accept the steering request.');return{redirectId:x.redirectId};},async compact(sessionId){await ensure();if(typeof registry.compatta!=='function')throw new CliRuntimeError('SESSION_COMPACT_UNAVAILABLE');const x=await registry.compatta(sessionId);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_COMPACT_FAILED',x.erroreAvvio);return x;},contextStatus,async listSessions(){
  await ensure();const rows=typeof registry.elenca==='function'?[...registry.elenca()]:[];
  const evidence=new Map<string,SessionSummaryEvidence>();
  if(typeof registry.elencaFigli==='function'){
    const parentIds=[...new Set(rows.map((row:any)=>typeof row?.padreId==='string'&&row.padreId.trim()?row.padreId:null).filter((value):value is string=>value!==null))];
    for(const parentId of parentIds){
      let result:any=null;try{result=registry.elencaFigli(parentId);}catch{result=null;}
      for(const child of Array.isArray(result?.figli)?result.figli:[]){
        const childId=typeof child?.sessionId==='string'?child.sessionId:null;if(!childId)continue;
        evidence.set(childId,{...(evidence.get(childId)??{}),child});
      }
    }
  }
  if(typeof registry.elencaProcessi==='function'){
    for(const row of rows){
      if(row?.inAttesaApprovazione!==true||typeof row?.sessionId!=='string')continue;
      let result:any=null;try{result=registry.elencaProcessi(row.sessionId);}catch{result=null;}
      const signal=Array.isArray(result?.guardia?.segnalazioni)?result.guardia.segnalazioni.find((entry:any)=>entry?.soggetto==='approvazione'):null;
      const approval=signal?{requestId:signal.requestId,waitingMs:signal.fermoDaMs}:null;
      if(approval)evidence.set(row.sessionId,{...(evidence.get(row.sessionId)??{}),approval});
    }
  }
  return normalizeSessionSummaries(rows,evidence);
 },subscribe:(id,sink,from=0)=>registry.iscriviti(id,sink,from),async answerApproval(id,rid,approved){const x=await registry.rispondiApprovazione(id,rid,approved);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'APPROVAL_FAILED',x.erroreAvvio);},async cancel(id){if(cancelled.has(id))return;cancelled.add(id);const ok=await registry.ferma(id);if(ok===false)throw new CliRuntimeError('SESSION_NOT_FOUND');},async shell(sessionId,command){await ensure();const text=String(command??'').trim();if(!text)throw new CliRuntimeError('SHELL_COMMAND_REQUIRED','A command is required');if(typeof registry.shell!=='function')throw new CliRuntimeError('SESSION_SHELL_UNAVAILABLE');const x=await registry.shell(sessionId,text);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_SHELL_FAILED',x.erroreAvvio);if(x?.ok!==true)throw new CliRuntimeError('SESSION_SHELL_FAILED');},export:(id)=>registry.esporta?.(id)??null,async close(){await registry.chiudiContesto?.();}};
}
