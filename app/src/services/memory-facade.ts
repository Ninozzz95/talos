import {join} from 'node:path';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';

export type MemoryKind='preference'|'project_fact'|'procedure'|'policy_note';
export type MemoryMetricUnavailable={
  status:'unavailable';
  reason:'store-does-not-persist-memory-usage'|'store-does-not-persist-memory-cost';
};
export type MemoryProvenance={
  writer:'persona'|'modello';
  writerEvidence:'persisted'|'derived-legacy-default';
  scope:'global';
  scopeEvidence:'derived-store-contract';
  projectId:null;
  sessionId:null;
  source:null;
};
export type MemoryDuplicatePolicy={
  mode:'create-title-normalized';
  normalization:'trim-lowercase';
  onCreateDuplicate:'return-existing-no-write';
  onUpdate:'not-checked';
  semanticDetection:false;
  merge:false;
};
export type MemoryView={
  id:string;
  title:string;
  content:string;
  kind:MemoryKind|null;
  createdAt:string|null;
  updatedAt:string|null;
  provenance:MemoryProvenance;
  duplicateControl:MemoryDuplicatePolicy;
  usage:MemoryMetricUnavailable;
  cost:MemoryMetricUnavailable;
};
export type MemoryScope={kind:'global';evidence:'derived-store-contract';projectId:null;sessionId:null};
export type MemoryStoreErrorView={code:'MEMORY_STORE_INVALID';message:string};
export type MemorySnapshot={
  state:'ready'|'invalid';
  scope:MemoryScope;
  rows:MemoryView[];
  error:MemoryStoreErrorView|null;
  legacyRows:any[];
};
export type MemorySearchResult=MemorySnapshot&{total:number;legacy:{memorie:any[];totale:number}|null};
export type MemoryAddResult={memory:MemoryView;duplicateDecision:'created'|'existing-title-no-write';legacy:any};
export type MemoryUpdateResult={memory:MemoryView;duplicateDecision:'not-checked-on-update';legacy:any};
export type MemoryDeleteResult={ok:true;id:string;legacy:{ok:true;id:string}};

type MemoryStoreModule={
  formaPubblicaMemoria?:(row:any)=>any;
  elencaMemorie:(input:{cartella:string})=>Promise<any[]>;
  cercaMemorie:(rows:any[],input:{query:string;limit?:number})=>{memorie:any[];totale:number};
  creaMemoria:(input:{cartella:string;title:string;content:string;kind:MemoryKind;origine:'persona'|'modello'})=>Promise<{voce:any;duplicato:boolean}>;
  aggiornaMemoria:(input:{cartella:string;id:string;title?:string;content?:string;kind?:MemoryKind})=>Promise<any>;
  eliminaMemoria:(input:{cartella:string;id:string})=>Promise<void>;
};
type MemoryFacadeInput={
  repoRoot?:string;
  projectRoot?:string;
  paths?:{dataRoot:string};
  memoryRoot?:string;
};
type MemoryFacadeDeps={loadStore?:()=>Promise<MemoryStoreModule>};

const KINDS=new Set<MemoryKind>(['preference','project_fact','procedure','policy_note']);
const SCOPE:MemoryScope={kind:'global',evidence:'derived-store-contract',projectId:null,sessionId:null};
const DUPLICATE_POLICY:MemoryDuplicatePolicy={
  mode:'create-title-normalized',
  normalization:'trim-lowercase',
  onCreateDuplicate:'return-existing-no-write',
  onUpdate:'not-checked',
  semanticDetection:false,
  merge:false
};
const USAGE:MemoryMetricUnavailable={status:'unavailable',reason:'store-does-not-persist-memory-usage'};
const COST:MemoryMetricUnavailable={status:'unavailable',reason:'store-does-not-persist-memory-cost'};

function stringOrNull(value:unknown){return typeof value==='string'?value:null;}
function requiredString(value:unknown,field:string){
  if(typeof value!=='string'||value.length===0)throw new TypeError('malformed persisted memory row: '+field);
  return value;
}
function invalid(error:unknown):MemorySnapshot{
  return{state:'invalid',scope:{...SCOPE},rows:[],error:{code:'MEMORY_STORE_INVALID',message:error instanceof Error?error.message:String(error)},legacyRows:[]};
}
function projectRow(raw:any,store:MemoryStoreModule):MemoryView{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('malformed persisted memory row: object required');
  const shaped=typeof store.formaPubblicaMemoria==='function'?store.formaPubblicaMemoria(raw):raw;
  if(!shaped||typeof shaped!=='object'||Array.isArray(shaped))throw new TypeError('malformed persisted memory row: public shape');
  const id=requiredString(shaped.id,'id');
  const title=requiredString(shaped.titolo,'titolo');
  const content=requiredString(shaped.contenuto,'contenuto');
  const kind=KINDS.has(shaped.genere as MemoryKind)?shaped.genere as MemoryKind:null;
  const writerPersisted=raw.origine==='persona'||raw.origine==='modello';
  const writer=shaped.origine==='persona'||shaped.origine==='modello'?shaped.origine:'modello';
  return{
    id,title,content,kind,
    createdAt:stringOrNull(shaped.creataAlle),
    updatedAt:stringOrNull(shaped.aggiornataAlle),
    provenance:{
      writer,
      writerEvidence:writerPersisted?'persisted':'derived-legacy-default',
      scope:'global',
      scopeEvidence:'derived-store-contract',
      projectId:null,
      sessionId:null,
      source:null
    },
    duplicateControl:{...DUPLICATE_POLICY},
    usage:{...USAGE},
    cost:{...COST}
  };
}

export function createMemoryFacade(input:MemoryFacadeInput,deps:MemoryFacadeDeps={}){
  const memoryRoot=()=>{
    if(input.memoryRoot)return input.memoryRoot;
    const dataRoot=input.paths?.dataRoot;
    if(!dataRoot)throw new Error('MEMORY_DATA_ROOT_REQUIRED');
    return join(dataRoot,'memory');
  };
  const repoRoot=()=>{
    if(input.repoRoot)return input.repoRoot;
    if(input.projectRoot)return findTalosRepoRoot(input.projectRoot);
    throw new Error('MEMORY_REPO_ROOT_REQUIRED');
  };
  let loaded:Promise<MemoryStoreModule>|null=null;
  const load=()=>loaded??=(deps.loadStore?deps.loadStore():importTalosModule(repoRoot(),'memory-store.mjs') as Promise<MemoryStoreModule>);

  const list=async():Promise<MemorySnapshot>=>{
    try{
      const store=await load();
      const raw=await store.elencaMemorie({cartella:memoryRoot()});
      if(!Array.isArray(raw))throw new TypeError('malformed persisted memory list');
      const rows=raw.map(row=>projectRow(row,store));
      return{state:'ready',scope:{...SCOPE},rows,error:null,legacyRows:raw};
    }catch(error){return invalid(error);}
  };

  const search=async(query:string,limit=5):Promise<MemorySearchResult>=>{
    try{
      const store=await load();
      const raw=await store.elencaMemorie({cartella:memoryRoot()});
      if(!Array.isArray(raw))throw new TypeError('malformed persisted memory list');
      const found=store.cercaMemorie(raw,{query,limit});
      if(!found||!Array.isArray(found.memorie)||!Number.isFinite(found.totale))throw new TypeError('malformed memory search result');
      const rows=found.memorie.map(row=>projectRow(row,store));
      return{
        state:'ready',scope:{...SCOPE},rows,error:null,legacyRows:raw,
        total:found.totale,
        legacy:{memorie:found.memorie,totale:found.totale}
      };
    }catch(error){return{...invalid(error),total:0,legacy:null};}
  };

  const add=async(value:{title:string;content:string;kind?:MemoryKind}):Promise<MemoryAddResult>=>{
    const store=await load();
    const result=await store.creaMemoria({cartella:memoryRoot(),title:value.title,content:value.content,kind:value.kind??'preference',origine:'persona'});
    return{
      memory:projectRow(result.voce,store),
      duplicateDecision:result.duplicato?'existing-title-no-write':'created',
      legacy:result
    };
  };

  const update=async(id:string,value:{title?:string;content?:string;kind?:MemoryKind}):Promise<MemoryUpdateResult>=>{
    const store=await load();
    const row=await store.aggiornaMemoria({cartella:memoryRoot(),id,...(value.title!==undefined?{title:value.title}:{}),...(value.content!==undefined?{content:value.content}:{}),...(value.kind!==undefined?{kind:value.kind}:{})});
    return{memory:projectRow(row,store),duplicateDecision:'not-checked-on-update',legacy:row};
  };

  const deleteMemory=async(id:string):Promise<MemoryDeleteResult>=>{
    const store=await load();
    await store.eliminaMemoria({cartella:memoryRoot(),id});
    const legacy={ok:true as const,id};
    return{ok:true,id,legacy};
  };

  return{list,search,add,update,delete:deleteMemory};
}
