import type {TuiCatalogService,TuiKeySave,TuiProvider,TuiProviderProbe} from '../catalog-service.ts';
import {benchClock} from '../catalog-service.ts';

export type ProviderPickerModel={
  open():Promise<void>;
  probeSelected():Promise<TuiProviderProbe|null>;
  cancel():void;
  rows():readonly TuiProvider[];
  selected():number;
  select(index:number):void;
  probeState(id:string):TuiProviderProbe|undefined;
  setSecret(secret:string):Promise<TuiKeySave|null>;
  clearSecret():Promise<void>;
};

/*
 * B1 slice 18 — choosing a provider is ONE step that ends in a usable key or in nothing:
 * - a usable key (saved, approved from the environment, or none needed) → straight to that provider's models;
 * - a key in the environment nobody has answered for → the consent question, "No" preselected;
 * - otherwise (no key, or the environment key was declined) → masked key entry, tested before it is saved.
 */
export type ProviderPickerStep=
 | {kind:'open-model-picker';provider:string;remediation?:TuiProviderProbe['remediation']}
 | {kind:'environment-consent';provider:string}
 | {kind:'provider-setup';provider:string;remediation?:TuiProviderProbe['remediation']}
 | {kind:'provider-remediation';provider:string;remediation:TuiProviderProbe['remediation']};

const KEY_REMEDIATION_CODES=new Set(['PROVIDER_KEY_MISSING','PROVIDER_KEY_BENCHED','PROVIDER_AUTH_FAILED']);

export function providerPickerEnter(input:{selectedProvider:string;configured:boolean;requiresKey?:boolean;keySource?:TuiProvider['keySource']|undefined;probe?:TuiProviderProbe|null}):ProviderPickerStep{
  if(input.keySource==='environment-unanswered'&&!input.probe)return{kind:'environment-consent',provider:input.selectedProvider};
  const remediation=input.probe?.remediation??null;
  const readinessCode=input.probe?.readinessCode??null;
  const requiresKey=input.requiresKey!==false;
  if(readinessCode){
    if(requiresKey&&KEY_REMEDIATION_CODES.has(readinessCode))return{kind:'provider-setup',provider:input.selectedProvider,remediation};
    return{kind:'provider-remediation',provider:input.selectedProvider,remediation};
  }
  if(input.configured)return remediation&&remediation.code!=='none'
    ?{kind:'open-model-picker',provider:input.selectedProvider,remediation}
    :{kind:'open-model-picker',provider:input.selectedProvider};
  if(input.keySource==='environment-unanswered')return{kind:'environment-consent',provider:input.selectedProvider};
  if(requiresKey)return remediation?{kind:'provider-setup',provider:input.selectedProvider,remediation}:{kind:'provider-setup',provider:input.selectedProvider};
  return{kind:'provider-remediation',provider:input.selectedProvider,remediation};
}

export type ConsentChoice='no'|'yes';
/** "No" is first and preselected; the question names the variable, never any part of its value. */
export function consentQuestion(row:Pick<TuiProvider,'label'|'environmentVariable'>):{question:string;options:ReadonlyArray<{choice:ConsentChoice;label:string}>}{
  return{
    question:`${row.environmentVariable??'A key'} was found in the environment. Use it for ${row.label}?`,
    options:[{choice:'no',label:'No (recommended)'},{choice:'yes',label:'Yes, use it'}],
  };
}

/* B1 slice 25: a provider whose stored keys are all benched is shown as benched, with the cause and until when, not as "key saved". */
export function providerKeySourceLabel(row:Pick<TuiProvider,'keySource'|'environmentVariable'>&{benched?:TuiProvider['benched']|undefined}):string{
  if(row.benched)return `key benched${row.benched.cause?` (${row.benched.cause})`:''}${row.benched.until!==null?` until ${benchClock(row.benched.until)}`:''}`;
  switch(row.keySource){
    case 'saved':return 'key saved';
    case 'environment':return `key from ${row.environmentVariable??'the environment'}`;
    case 'environment-unanswered':return 'key in environment, not used';
    case 'environment-declined':return 'environment key declined';
    case 'not-required':return 'no key needed';
    default:return 'no key';
  }
}

export function maskedSecret(secret:string):string{return '•'.repeat([...secret].length);}

export function createProviderPickerModel(catalog:TuiCatalogService):ProviderPickerModel{
  let providers:TuiProvider[]=[];let selected=0;let abort:AbortController|null=null;const probes=new Map<string,TuiProviderProbe>();
  return{
    async open(){abort?.abort();abort=null;providers=await catalog.listProviders();selected=0;},
    async probeSelected(){const row=providers[selected];if(!row)return null;abort?.abort();abort=new AbortController();const result=await catalog.probeProvider(row.id,abort.signal);probes.set(row.id,result);return result;},
    cancel(){abort?.abort();abort=null;},
    rows:()=>providers,
    selected:()=>selected,
    select(index){selected=Math.max(0,Math.min(Math.max(0,providers.length-1),index));},
    probeState:id=>probes.get(id),
    async setSecret(secret){const row=providers[selected];if(!row)return null;try{return await catalog.setProviderKey(row.id,secret);}finally{secret='';}},
    async clearSecret(){const row=providers[selected];if(!row)return;await catalog.clearProviderKey(row.id);},
  };
}
