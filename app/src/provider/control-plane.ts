import {
  UNKNOWN_PROVIDER_HEALTH,
  providerCooldownFromRow,
  providerHealthFromProbe,
  providerReadinessDecision,
  remediationForProvider,
  type ProviderAuthSource,
  type ProviderCooldown,
  type ProviderHealthObservation,
  type ProviderReadinessDecision,
  type ProviderRemediation,
} from './health.ts';

export type ProviderControlPlaneEndpoint={
  value:string|null;
  host:string|null;
  configured:boolean;
  supportsCustom:boolean;
  valid:boolean;
};

export type ProviderControlPlaneProfile={
  id:string;
  label:string;
  description:string;
  auth:{
    required:boolean;
    type:string;
    source:ProviderAuthSource;
    configured:boolean;
    usable:boolean;
    environmentVariable:string|null;
  };
  endpoint:ProviderControlPlaneEndpoint;
  execution:string;
  runtimeConfigured:boolean;
  local:boolean;
  cloud:boolean;
  supportsOAuth:boolean;
  cooldown:ProviderCooldown;
  lastHealth:ProviderHealthObservation;
  remediation:ProviderRemediation;
  ready:boolean;
};

export type ProviderControlPlaneDeps={
  publicProviders:()=>any[];
  registry:Record<string,any>;
  runtimeFor:(id:string)=>any;
  keyFor:(id:string)=>string|null;
  createProbe:(signal?:AbortSignal)=>{prova:(id:string)=>Promise<any>};
  environmentKey?:(id:string)=>any;
  now?:()=>number;
};

export type ProviderControlPlane={
  list():ProviderControlPlaneProfile[];
  get(id:string):ProviderControlPlaneProfile;
  probe(id:string,signal?:AbortSignal):Promise<ProviderControlPlaneProfile>;
  invalidate(id:string):void;
  readiness(id:string):ProviderReadinessDecision;
};

const SECRET_QUERY_NAME=/(?:api[-_]?key|authorization|password|secret|token)/iu;

function safeEndpoint(value:unknown):{value:string|null;host:string|null;valid:boolean}{
  if(typeof value!=='string'||value.trim()==='')return{value:null,host:null,valid:false};
  try{
    const url=new URL(value);
    if(url.username||url.password)return{value:null,host:null,valid:false};
    for(const name of url.searchParams.keys())if(SECRET_QUERY_NAME.test(name))return{value:null,host:null,valid:false};
    return{value:url.toString(),host:url.host,valid:true};
  }catch{return{value:null,host:null,valid:false};}
}

function authSource({record,row,usable,environment}:{record:any;row:any;usable:boolean;environment:any}):ProviderAuthSource{
  const required=typeof row?.requiresKey==='boolean'?row.requiresKey:record?.chiaveObbligatoria===true;
  if(!required)return'not-required';
  if(row?.origineChiave==='custodia')return'saved';
  if(row?.origineChiave==='ambiente'||usable)return'environment';
  const state=String(environment?.state??'');
  if(state==='approved'||state==='accepted')return'environment';
  if(state==='unanswered')return'environment-unanswered';
  if(state==='declined')return'environment-declined';
  return'missing';
}

export function createProviderControlPlane(deps:ProviderControlPlaneDeps):ProviderControlPlane{
  const healthByProvider=new Map<string,ProviderHealthObservation>();
  const now=deps.now??Date.now;

  function publicRows(){try{return deps.publicProviders()??[];}catch{return[];}}
  function records(){
    return Object.values(deps.registry??{}).filter((record:any)=>record?.destinazioneChat===true);
  }
  function rowFor(id:string){return publicRows().find((row:any)=>String(row?.id??'')===id)??{};}
  function recordFor(id:string){
    const record=deps.registry?.[id];
    if(!record||record.destinazioneChat!==true)throw Object.assign(new Error('PROVIDER_INVALID'),{code:'PROVIDER_INVALID',provider:id});
    return record;
  }

  function snapshot(id:string):ProviderControlPlaneProfile{
    const record=recordFor(id);
    const row=rowFor(id);
    let runtime:any={};try{runtime=deps.runtimeFor(id)??{};}catch{runtime={};}
    let usableSecret:string|null=null;try{usableSecret=deps.keyFor(id)??null;}catch{usableSecret=null;}
    const usable=Boolean(usableSecret);
    let environment:any=null;try{environment=deps.environmentKey?.(id)??null;}catch{environment=null;}
    const required=typeof row?.requiresKey==='boolean'?row.requiresKey:record.chiaveObbligatoria===true;
    const source=authSource({record,row,usable,environment});
    const configured=!required||usable||row?.keyConfigured===true||source==='environment'||source==='saved';
    const rawEndpoint=row?.endpoint??runtime?.endpoint??record?.baseUrl??null;
    const safe=safeEndpoint(rawEndpoint);
    const endpointless=record?.wire==='acp';
    const endpoint:ProviderControlPlaneEndpoint={
      value:safe.value,
      host:safe.host,
      valid:safe.valid||endpointless,
      configured:row?.endpointConfigured===true||runtime?.endpointConfigured===true,
      supportsCustom:row?.supportsEndpoint===true||record?.indirizzoModificabile===true,
    };
    const cooldown=providerCooldownFromRow(row);
    const lastHealth=healthByProvider.get(id)??UNKNOWN_PROVIDER_HEALTH;
    const execution=String(row?.execution??record?.esecuzione??'unknown');
    const runtimeConfigured=record?.wire==='acp'?execution==='configurato':true;
    const base={
      id,
      label:String(row?.label??record?.etichetta??id),
      description:String(record?.descrizione??''),
      auth:{
        required,
        type:String(record?.auth?.tipo??(required?'key':'none')),
        source,
        configured,
        usable:required?usable:true,
        environmentVariable:typeof environment?.variable==='string'?environment.variable:null,
      },
      endpoint,
      execution,
      runtimeConfigured,
      local:record?.wire==='locale'||record?.catalogo?.fonte==='runtime-locale'||/locale/u.test(String(record?.esecuzione??'')),
      cloud:Boolean(record?.cloud),
      supportsOAuth:row?.supportsOAuth===true||Boolean(record?.oauth),
      cooldown,
      lastHealth,
    };
    const remediation=remediationForProvider(base);
    const decision=providerReadinessDecision(base);
    return{...base,remediation,ready:decision.ready};
  }

  return{
    list(){return records().map((record:any)=>snapshot(String(record.id)));},
    get(id){return snapshot(id);},
    async probe(id,signal){
      recordFor(id);
      const result=await deps.createProbe(signal).prova(id);
      healthByProvider.set(id,providerHealthFromProbe(result,now()));
      return snapshot(id);
    },
    invalidate(id){recordFor(id);healthByProvider.delete(id);},
    readiness(id){return providerReadinessDecision(snapshot(id));},
  };
}
