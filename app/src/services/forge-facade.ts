import {createHash} from 'node:crypto';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {scanForgeManifest,validateForgeOwnerPackage,type ForgeOwnerPackage} from '../security/forge-scan.ts';

type Registry={
  installaVersioneToolForgiato?:(sessionId:string,spec:any)=>Promise<any>;
  versioniToolForgiato?:(sessionId:string,id:string)=>Promise<any>;
  ripristinaVersioneToolForgiato?:(sessionId:string,id:string,revision:number)=>Promise<any>;
  abilitaToolForgiato?:(sessionId:string,id:string,enabled:boolean)=>Promise<any>;
};
type Store={elencaToolForgiati:(x:{cartella:string})=>Promise<any[]>;leggiToolForgiato?:(x:{cartella:string;id:string})=>Promise<any|null>;elencaVersioniToolForgiatoOwner?:(x:{cartella:string;id:string})=>Promise<any[]>};
type Contract={validaManifestForgeLocale:(manifest:any)=>any;eseguiFlowForgeLocale:(manifest:any,input:any,deps:{capacitaFn:(capability:string,input:any)=>Promise<any>})=>Promise<any>};
type Deps={registry?:Registry;loadStore?:()=>Promise<Store>;loadContract?:()=>Promise<Contract>;now?:()=>Date};
function err(code:string,message=code):never{throw Object.assign(new Error(code+': '+message),{code});}
function stable(value:any):string{if(Array.isArray(value))return'['+value.map(stable).join(',')+']';if(value&&typeof value==='object'){return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';}const encoded=JSON.stringify(value);return encoded===undefined?'null':encoded;}
function digest(pkg:ForgeOwnerPackage){return createHash('sha256').update(stable(pkg)).digest('hex');}
function handle(result:any){if(result?.erroreAvvio)err(typeof result.code==='string'?result.code:'FORGE_OWNER_ACTION_FAILED',String(result.erroreAvvio));return result;}
export type ForgeRow={id:string;title:string;enabled:boolean;ownerRevision:number|null;risk:string;ownerManaged:boolean};
export type ForgeSnapshot={state:'ready'|'invalid';rows:ForgeRow[];error:{code:string;message:string}|null};

export function createForgeFacade(input:{forgeRoot:string;repoRoot?:string},deps:Deps={}){
  const repoRoot=()=>input.repoRoot??findTalosRepoRoot(input.forgeRoot);
  let storeP:Promise<Store>|null=null,contractP:Promise<Contract>|null=null;
  const store=()=>storeP??=(deps.loadStore?deps.loadStore():importTalosModule(repoRoot(),'tool-forge-store.mjs') as Promise<Store>);
  const contract=()=>contractP??=(deps.loadContract?deps.loadContract():importTalosModule(repoRoot(),'forge-contract.mjs') as Promise<Contract>);
  const now=deps.now??(()=>new Date());

  async function analyzePackage(value:unknown){
    const pkg=validateForgeOwnerPackage(value),c=await contract(),validation=c.validaManifestForgeLocale(pkg.manifest),scan=scanForgeManifest(pkg.manifest,validation);
    const capabilityRequests:any[]=[];
    let simulation:any={ok:false,status:'blocked',trace:[],capabilityRequests,error:null};
    if(validation?.ok&&scan.ok){
      try{
        const result=await c.eseguiFlowForgeLocale(pkg.manifest,pkg.simulation.input,{capacitaFn:async(capability:string,request:any)=>{
          const simulated=Object.prototype.hasOwnProperty.call(pkg.simulation.capabilityResults,capability)?pkg.simulation.capabilityResults[capability]:null;
          capabilityRequests.push({capability,input:request,result:simulated});return simulated;
        }});
        const ok=result?.ok===true||result?.status==='succeeded';
        simulation={ok,status:String(result?.status??(ok?'succeeded':'failed')),trace:Array.isArray(result?.trace)?result.trace:[],capabilityRequests,...(result?.error?{error:result.error}:{}),...(result?.output!==undefined?{output:result.output}:{}),...(result?.value!==undefined?{value:result.value}:{})};
      }catch(error){simulation={ok:false,status:'failed',trace:[],capabilityRequests,error:{message:error instanceof Error?error.message:String(error)}};}
    }
    const evidence={packageDigest:digest(pkg),ownerRevision:pkg.revision,analyzedAt:now().toISOString(),sideEffects:false,sandbox:{kind:'declarative-fake-capability-boundary',osProcessSandbox:false},validation:{ok:Boolean(validation?.ok),diagnostics:Array.isArray(validation?.diagnostica)?validation.diagnostica:[]},scan,simulation:{ok:simulation.ok,status:simulation.status,trace:simulation.trace,capabilityRequests}};
    return{package:pkg,validation,scan,simulation,evidence};
  }
  const validatePackage=(value:unknown)=>validateForgeOwnerPackage(value);
  const scanPackage=async(value:unknown)=>{const pkg=validateForgeOwnerPackage(value),validation=(await contract()).validaManifestForgeLocale(pkg.manifest);return{package:pkg,validation,scan:scanForgeManifest(pkg.manifest,validation)};};
  async function installPackage(sessionId:string,value:unknown){
    const analysis=await analyzePackage(value);if(!analysis.validation?.ok||!analysis.scan.ok||!analysis.simulation.ok)err('FORGE_ANALYSIS_BLOCKED','package must pass canonical validation, static scan and side-effect-free simulation');
    const fn=deps.registry?.installaVersioneToolForgiato;if(typeof fn!=='function')err('FORGE_OWNER_API_UNAVAILABLE');
    const result=handle(await fn.call(deps.registry,sessionId,{revision:analysis.package.revision,manifest:analysis.package.manifest,capacita:analysis.validation.capacita??[],azioni:analysis.validation.azioni??[],rischio:analysis.validation.rischio??'R1',evidence:analysis.evidence}));
    return{instrument:result.strumento,analysis};
  }
  async function list():Promise<ForgeSnapshot>{try{const rows=await (await store()).elencaToolForgiati({cartella:input.forgeRoot});return{state:'ready',rows:rows.map((x:any)=>({id:String(x.id),title:String(x.manifest?.title??x.id),enabled:x.abilitato===true,ownerRevision:Number.isSafeInteger(x.ownerRevision)?Number(x.ownerRevision):null,risk:String(x.rischio??'R1'),ownerManaged:x.ownerManaged===true})),error:null};}catch(error){return{state:'invalid',rows:[],error:{code:'FORGE_STORE_INVALID',message:error instanceof Error?error.message:String(error)}};}}
  async function read(id:string){
    const s=await store();let row=typeof s.leggiToolForgiato==='function'?await s.leggiToolForgiato({cartella:input.forgeRoot,id}):null;
    if(!row){const all=await s.elencaToolForgiati({cartella:input.forgeRoot});row=all.find((x:any)=>x?.id===id)??null;}if(!row)err('FORGE_NOT_FOUND');
    const versions=row.ownerManaged===true&&typeof s.elencaVersioniToolForgiatoOwner==='function'?await s.elencaVersioniToolForgiatoOwner({cartella:input.forgeRoot,id}):[];
    return{id:String(row.id),title:String(row.manifest?.title??row.id),description:String(row.manifest?.description??''),enabled:row.abilitato===true,ownerManaged:row.ownerManaged===true,ownerRevision:Number.isSafeInteger(row.ownerRevision)?Number(row.ownerRevision):null,risk:String(row.rischio??'R1'),capabilities:Array.isArray(row.capacita)?row.capacita:[],actions:Array.isArray(row.azioni)?row.azioni:[],evidence:row.evidence??null,scan:row.evidence?.scan??null,versions};
  }
  async function versions(sessionId:string,id:string){const fn=deps.registry?.versioniToolForgiato;if(typeof fn!=='function')err('FORGE_OWNER_API_UNAVAILABLE');return handle(await fn.call(deps.registry,sessionId,id)).versioni??[];}
  async function rollback(sessionId:string,id:string,revision:number){const fn=deps.registry?.ripristinaVersioneToolForgiato;if(typeof fn!=='function')err('FORGE_OWNER_API_UNAVAILABLE');return handle(await fn.call(deps.registry,sessionId,id,revision));}
  async function setEnabled(sessionId:string,id:string,enabled:boolean){const fn=deps.registry?.abilitaToolForgiato;if(typeof fn!=='function')err('FORGE_OWNER_API_UNAVAILABLE');return handle(await fn.call(deps.registry,sessionId,id,enabled));}
  return{validatePackage,scanPackage,analyzePackage,installPackage,list,read,versions,rollback,setEnabled};
}
