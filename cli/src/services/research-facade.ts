import {writeFile as writeFileReal} from 'node:fs/promises';
import {resolve} from 'node:path';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';

export type ResearchVerification='yes'|'partial'|'no'|'unchecked'|'contested';
export type ResearchSourceView={number:number;url:string;title:string;publishedAt:string|null;obtained:string|null};
export type ResearchClaimView={number:number;text:string;source:ResearchSourceView|null;passage:string;quotePresent:boolean|null;verification:ResearchVerification|null;reason:string|null;judge:string|null;judgedAt:string|null;opposing:unknown[]|null};
export type ResearchListRow={id:string;question:string|null;name:string|null;status:string;startedAt:string|null;finishedAt:string|null};
export type ResearchSnapshot={state:'ready'|'invalid';rows:ResearchListRow[];error:{code:'RESEARCH_STORE_INVALID';message:string}|null};
export type ResearchDetail=ResearchListRow&{phase:string|null;progress:{done:number;total:number}|null;journal:{events:number;skippedRows:number}|null;summary:string|null;verification:{total:number;supported:number;partial:number;unsupported:number;unchecked:number;contested:number}|null;sources:ResearchSourceView[]|null;claims:ResearchClaimView[]|null;plan:unknown[]|null;steps:unknown[]|null;spent:unknown|null;expectedCost:unknown|null};
export type ResearchExportFormat='md'|'json'|'bib'|'ris'|'fonti'|'html'|'pdf'|'docx';

type ResearchStore={elencaRicerche:(x:{cartella:string})=>Promise<any[]>;leggiRicerca:(x:{cartella:string;id:string})=>Promise<any|null>;leggiGiornale:(x:{cartella:string;id:string})=>Promise<{eventi:any[];righeSaltate:number;byte:number}>;leggiPiano:(x:{cartella:string;id:string})=>Promise<any|null>;leggiRapporto:(x:{cartella:string;id:string})=>Promise<string|null>};
type ResearchRun={talosResearchReplay:(events:any[])=>any;talosResearchProgressOf:(run:any)=>{done:number;total:number};talosResearchSpent:(run:any)=>unknown};
type ResearchRegistry={pausaRicerca?:(ownerSessionId:string,researchId:string)=>Promise<any>;riprendiRicerca?:(ownerSessionId:string,researchId:string)=>Promise<any>;annullaRicerca?:(ownerSessionId:string,researchId:string)=>Promise<any>};
type Deps={loadStore?:()=>Promise<ResearchStore>;loadRun?:()=>Promise<ResearchRun>;parseReport?:(document:string)=>any;exportResearch?:(input:any)=>Promise<any>;writeExportFile?:(path:string,bytes:Uint8Array)=>Promise<void>;registry?:ResearchRegistry};

const VERDICTS=new Set<ResearchVerification>(['yes','partial','no','unchecked','contested']);
function fail(code:string,message=code):never{throw Object.assign(new Error(message),{code});}
function str(value:unknown){return typeof value==='string'?value:null;}
function verification(value:unknown):ResearchVerification|null{return VERDICTS.has(value as ResearchVerification)?value as ResearchVerification:null;}
function finite(value:unknown){return typeof value==='number'&&Number.isFinite(value)?value:0;}

export function createResearchFacade(input:{projectRoot:string;repoRoot?:string},deps:Deps={}){
  const repoRoot=()=>input.repoRoot??findTalosRepoRoot(input.projectRoot);
  let storePromise:Promise<ResearchStore>|null=null,runPromise:Promise<ResearchRun>|null=null,reportPromise:Promise<any>|null=null,exportPromise:Promise<any>|null=null;
  const store=()=>storePromise??=(deps.loadStore?deps.loadStore():importTalosModule(repoRoot(),'research-store.mjs') as Promise<ResearchStore>);
  const runModule=()=>runPromise??=(deps.loadRun?deps.loadRun():importTalosModule(repoRoot(),'research/run.mjs') as Promise<ResearchRun>);
  const parseReport=async(document:string)=>{if(deps.parseReport)return deps.parseReport(document);reportPromise??=importTalosModule(repoRoot(),'research/report.mjs');return (await reportPromise).talosResearchParseReport(document);};
  const exportResearch=async(value:any)=>{if(deps.exportResearch)return deps.exportResearch(value);exportPromise??=importTalosModule(repoRoot(),'research/esportazioni.mjs');return (await exportPromise).costruisciEsportazione(value);};
  const writeExport=deps.writeExportFile??(async(path:string,bytes:Uint8Array)=>{await writeFileReal(path,bytes);});

  async function replay(id:string){
    const s=await store(),journal=await s.leggiGiornale({cartella:input.projectRoot,id}),mod=await runModule();
    const state=mod.talosResearchReplay(Array.isArray(journal.eventi)?journal.eventi:[]);
    let progress:null|{done:number;total:number}=null,spent:unknown=null;
    try{const p=mod.talosResearchProgressOf(state);if(p&&Number.isFinite(p.done)&&Number.isFinite(p.total))progress={done:Number(p.done),total:Number(p.total)};}catch{}
    try{spent=mod.talosResearchSpent(state)??null;}catch{}
    return{state,journal,progress,spent};
  }
  function row(meta:any,phase:string|null):ResearchListRow{
    if(!meta||typeof meta!=='object'||Array.isArray(meta)||typeof meta.id!=='string'||!meta.id)throw new TypeError('malformed research metadata');
    return{id:meta.id,question:str(meta.domanda),name:str(meta.nome??meta.titolo),status:str(meta.terminata)??phase??'unknown',startedAt:str(meta.avviataAlle),finishedAt:str(meta.conclusaAlle)};
  }
  async function raw(id:string){
    if(typeof id!=='string'||!id)fail('RESEARCH_ID_INVALID');
    const s=await store(),meta=await s.leggiRicerca({cartella:input.projectRoot,id});if(!meta||meta.id!==id)fail('RESEARCH_NOT_FOUND');
    const [journalPlan,report]=await Promise.all([s.leggiPiano({cartella:input.projectRoot,id}),s.leggiRapporto({cartella:input.projectRoot,id})]);
    const live=await replay(id);
    return{s,meta,plan:Array.isArray(journalPlan)?journalPlan:null,report,live};
  }
  const list=async():Promise<ResearchSnapshot>=>{
    try{
      const s=await store(),rowsRaw=await s.elencaRicerche({cartella:input.projectRoot});if(!Array.isArray(rowsRaw))throw new TypeError('malformed research list');
      const rows:ResearchListRow[]=[];for(const meta of rowsRaw){const id=typeof meta?.id==='string'?meta.id:'';const live=id?await replay(id):null;rows.push(row(meta,str(live?.state?.status)));}
      return{state:'ready',rows,error:null};
    }catch(error){return{state:'invalid',rows:[],error:{code:'RESEARCH_STORE_INVALID',message:error instanceof Error?error.message:String(error)}};}
  };
  const read=async(id:string):Promise<ResearchDetail>=>{
    const x=await raw(id),phase=str(x.live.state?.status),base=row(x.meta,phase);
    const parsed=typeof x.report==='string'?await parseReport(x.report):null;
    let sources:ResearchSourceView[]|null=null,claims:ResearchClaimView[]|null=null,summary:string|null=null,standing:ResearchDetail['verification']=null;
    if(parsed&&Array.isArray(parsed.sources)&&Array.isArray(parsed.claims)){
      sources=parsed.sources.map((source:any,index:number)=>({number:index+1,url:str(source?.url)??'',title:str(source?.title)??'',publishedAt:str(source?.publishedAt),obtained:str(source?.obtained)}));
      claims=parsed.claims.map((claim:any,index:number)=>{
        const sourceNumber=Number.isSafeInteger(claim?.sourceIndex)?Number(claim.sourceIndex):0;
        return{number:index+1,text:str(claim?.text)??'',source:sourceNumber>0?(sources?.[sourceNumber-1]??null):null,passage:str(claim?.passage)??'',quotePresent:typeof claim?.checks?.quotePresent==='boolean'?claim.checks.quotePresent:null,verification:verification(claim?.checks?.claimSupported),reason:str(claim?.checks?.supportReason),judge:str(claim?.checks?.judge),judgedAt:str(claim?.checks?.judgedAt),opposing:Array.isArray(claim?.checks?.opposing)?claim.checks.opposing:null};
      });
      summary=str(parsed.summary);
      const claimRows=claims as ResearchClaimView[];const count=(v:ResearchVerification)=>claimRows.filter(c=>c.verification===v).length;
      standing={total:claimRows.length,supported:count('yes'),partial:count('partial'),unsupported:count('no'),unchecked:count('unchecked'),contested:count('contested')};
    }
    return{...base,phase,progress:x.live.progress,journal:{events:Array.isArray(x.live.journal.eventi)?x.live.journal.eventi.length:0,skippedRows:finite(x.live.journal.righeSaltate)},summary,verification:standing,sources,claims,plan:x.plan,steps:Array.isArray(x.live.state?.steps)?x.live.state.steps:null,spent:x.live.spent,expectedCost:null};
  };
  async function ownerAction(method:'pausaRicerca'|'riprendiRicerca'|'annullaRicerca',ownerSessionId:string,researchId:string){
    if(!ownerSessionId||!researchId)fail('RESEARCH_CONTROL_ID_REQUIRED');const fn=deps.registry?.[method];if(typeof fn!=='function')fail('RESEARCH_CONTROL_UNAVAILABLE');
    const result=await fn.call(deps.registry,ownerSessionId,researchId);
    if(result?.erroreAvvio)fail(typeof result.code==='string'?result.code:'RESEARCH_CONTROL_UNAVAILABLE',String(result.erroreAvvio));
    if(result?.ricerca===null)fail('RESEARCH_NOT_FOUND');
    if(result?.ok===false)fail('RESEARCH_CONFLICT',str(result.motivo)??'Research state does not allow this action.');
    return result;
  }
  const pause=(ownerSessionId:string,researchId:string)=>ownerAction('pausaRicerca',ownerSessionId,researchId);
  const resume=(ownerSessionId:string,researchId:string)=>ownerAction('riprendiRicerca',ownerSessionId,researchId);
  const cancel=(ownerSessionId:string,researchId:string)=>ownerAction('annullaRicerca',ownerSessionId,researchId);
  const exportFile=async(id:string,format:ResearchExportFormat,out?:string,tone?:string)=>{
    const x=await raw(id),result=await exportResearch({ricerca:{...x.meta,contenutoRapporto:x.report},formato:format,...(tone?{tono:tone}:{})});
    const path=out??resolve(input.projectRoot,String(result.nomeFile));const bytes=Buffer.from(result.bytes);await writeExport(path,bytes);
    return{id,format,path,nomeFile:String(result.nomeFile),mediaType:String(result.mediaType),bytes:bytes.length};
  };
  return{list,read,pause,resume,cancel,exportFile};
}
