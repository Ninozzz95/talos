import {t} from '../../i18n/index.ts';
import {ZAI_ADDRESSES} from '../../provider/zai-addresses.ts';
import type {TuiCatalogService,TuiKeySave,TuiProvider,TuiProviderProbe} from '../catalog-service.ts';
import {benchClock} from '../catalog-service.ts';
import {pickerSection,type OverlayContent} from './scroll-window.ts';
import {filterItems} from '../selection-list.ts';

export type ProviderPickerModel={
  open():Promise<void>;
  probeSelected():Promise<TuiProviderProbe|null>;
  cancel():void;
  rows():readonly TuiProvider[];
  selected():number;
  select(index:number):void;
  probeState(id:string):TuiProviderProbe|undefined;
  /** R4 Q-R4-11: a local engine checked when the list opened: true running, false not running, null not checked. */
  reachable(id:string):boolean|null;
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

/* «Continue with ChatGPT» (13/10/2026): a sign-in that is missing goes to the same step, which for that provider is the sign-in. */
const KEY_REMEDIATION_CODES=new Set(['PROVIDER_KEY_MISSING','PROVIDER_SIGN_IN_REQUIRED','PROVIDER_KEY_BENCHED','PROVIDER_AUTH_FAILED']);

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
    question:t('screen.provider.consentQuestion',{variable:row.environmentVariable??t('screen.provider.consentVariableFallback'),provider:row.label}),
    options:[{choice:'no',label:t('screen.provider.consentNo')},{choice:'yes',label:t('screen.provider.consentYes')}],
  };
}

/* B1 slice 25: a provider whose stored keys are all benched is shown as benched, with the cause and until when, not as "key saved". */
export function providerKeySourceLabel(row:Pick<TuiProvider,'keySource'|'environmentVariable'>&{benched?:TuiProvider['benched']|undefined;authType?:string|undefined;configured?:boolean|undefined}):string{
  /* a provider the person signs in to (the ChatGPT plan) has no key to speak of */
  if(row.authType==='oauth-pkce')return t(row.keySource!=='saved'?'screen.provider.notSignedIn':row.configured===false?'screen.provider.signedInNoPlan':'screen.provider.signedIn');
  if(row.benched)return t('screen.provider.keyBenched')+(row.benched.cause?t('screen.provider.keyBenchedCause',{cause:row.benched.cause}):'')+(row.benched.until!==null?t('screen.provider.keyBenchedUntil',{clock:benchClock(row.benched.until)}):'');
  switch(row.keySource){
    case 'saved':return t('screen.provider.keySavedLabel');
    case 'environment':return t('screen.provider.keyFrom',{variable:row.environmentVariable??t('screen.provider.keyFromEnvironment')});
    case 'environment-unanswered':return t('screen.provider.keyUnanswered');
    case 'environment-declined':return t('screen.provider.keyDeclined');
    case 'not-required':return t('screen.provider.keyNotRequired');
    default:return t('screen.provider.keyMissing');
  }
}

/*
 * R4 Q-R4-11 (owner, 2026-09-24): what can be used now comes first. A local engine that needs no key and answered when the
 * list opened; then a provider with a key usable now (or a configured external agent); then a local engine not checked; then
 * one that did not answer; then the rest. Alphabetical inside each group, and a typed query still ranks first (the same
 * `filterItems`), so "ollama" highlights Ollama Local. The groups are sort keys only: nothing is hidden.
 */
export function providerUsabilityRank(row:Pick<TuiProvider,'local'|'requiresKey'|'configured'>,reachable:boolean|null):number{
  if(row.local&&!row.requiresKey)return reachable===true?0:reachable===false?3:2;
  return row.configured?1:4;
}
export function providerPickerItems(rows:readonly TuiProvider[],query:string,{reachable=()=>null}:{reachable?:(id:string)=>boolean|null}={}):TuiProvider[]{
  return filterItems(rows.map(row=>({id:row.id,label:row.label,searchText:`${row.id} ${row.label} ${row.description}`,group:String(providerUsabilityRank(row,reachable(row.id))),value:row})),query).map(item=>item.value);
}
/* How long opening the list waits for local engines to answer; one that has not answered by then is "not checked". */
export const LOCAL_ENGINE_CHECK_MS=800;
function reachableFrom(probe:TuiProviderProbe|undefined):boolean|null{
  if(!probe)return null;
  return probe.state==='available'?true:probe.state==='unavailable'?false:null;
}
export function maskedSecret(secret:string):string{return '•'.repeat([...secret].length);}

export function createProviderPickerModel(catalog:TuiCatalogService):ProviderPickerModel{
  let providers:TuiProvider[]=[];let selected=0;let abort:AbortController|null=null;const probes=new Map<string,TuiProviderProbe>();
  return{
    async open(){
      abort?.abort();abort=null;providers=await catalog.listProviders();selected=0;
      /* R4 Q-R4-11: only local engines that need no key are checked, all at once and briefly; nothing on the network is. */
      const locals=providers.filter(row=>row.local&&!row.requiresKey);
      if(!locals.length)return;
      const check=new AbortController();const timer=setTimeout(()=>check.abort(),LOCAL_ENGINE_CHECK_MS);
      const answered=Promise.all(locals.map(async row=>{try{probes.set(row.id,await catalog.probeProvider(row.id,check.signal));}catch{/* not checked */}}));
      try{await Promise.race([answered,new Promise<void>(resolve=>check.signal.addEventListener('abort',()=>resolve(),{once:true}))]);}
      finally{clearTimeout(timer);check.abort();}
    },
    async probeSelected(){const row=providers[selected];if(!row)return null;abort?.abort();abort=new AbortController();const result=await catalog.probeProvider(row.id,abort.signal);probes.set(row.id,result);return result;},
    cancel(){abort?.abort();abort=null;},
    rows:()=>providers,
    selected:()=>selected,
    select(index){selected=Math.max(0,Math.min(Math.max(0,providers.length-1),index));},
    probeState:id=>probes.get(id),
    reachable:id=>reachableFrom(probes.get(id)),
    async setSecret(secret){const row=providers[selected];if(!row)return null;try{return await catalog.setProviderKey(row.id,secret);}finally{secret='';}},
    async clearSecret(){const row=providers[selected];if(!row)return;await catalog.clearProviderKey(row.id);},
  };
}

// R1 Q-R1-3: the three provider steps as app.ts draws them, capped and scrolled by overlays/scroll-window.ts.
/* R4 Q-R4-11: `chosen` marks the provider in use; `reachable` says whether a local engine is running (nothing when not checked). */
export function providerPickerOverlay({query,rows,selected,chosen=null,reachable=()=>null}:{query:string;rows:readonly TuiProvider[];selected:number;chosen?:string|null;reachable?:(id:string)=>boolean|null}):OverlayContent{
  const running=(row:TuiProvider)=>{if(!row.local)return'';const state=reachable(row.id);return state===null?'':` · ${t(state?'firstrun.providers.running':'firstrun.providers.notRunning')}`;};
  return{
    head:[{text:t('screen.provider.title'),tone:'title'},{text:t('screen.picker.searchChoose',{query:query||t('screen.none')}),tone:'dim'}],
    sections:[pickerSection(rows,selected,row=>`${row.label}${row.id===chosen?` · ${t('firstrun.providers.chosen')}`:''} · ${providerKeySourceLabel(row)} · ${t(row.local?'screen.word.local':'screen.word.cloud')}${running(row)}${row.endpointHost?` · ${row.endpointHost}`:''}`)],
  };
}
// The question scrolls with its options, so a short budget keeps the chosen answer on screen before the question.
export function providerConsentOverlay({provider,choice}:{provider:Pick<TuiProvider,'label'|'environmentVariable'>;choice:ConsentChoice}):OverlayContent{
  const asked=consentQuestion(provider),index=asked.options.findIndex(option=>option.choice===choice);
  return{
    head:[{text:t('screen.provider.titleNamed',{provider:provider.label}),tone:'title'}],
    sections:[{lines:[{text:asked.question,tone:'plain'},...asked.options.map(option=>({text:`${option.choice===choice?'›':' '} ${option.label}`,tone:option.choice===choice?'selected' as const:'accent' as const}))],selected:1+Math.max(0,index)}],
    foot:[{text:t('screen.provider.consentFoot'),tone:'dim'}],
  };
}
/* P21 (owner decisions 2026-09-26): OpenRouter's key step offers the browser sign-in or a pasted key. */
export type LoginChoice='browser'|'paste-key';
export function providerLoginChoiceOverlay({label,choice,notice=null}:{label:string;choice:LoginChoice;notice?:string|null}):OverlayContent{
  const options:Array<{choice:LoginChoice;text:string}>=[{choice:'browser',text:t('screen.provider.loginBrowser',{provider:label})},{choice:'paste-key',text:t('screen.provider.loginPasteKey')}];
  return{
    head:[{text:t('screen.provider.titleNamed',{provider:label}),tone:'title'}],
    /* A saved key that does not work now (benched) is said here too, before the person picks a way. */
    sections:[{lines:[...(notice?[{text:notice,tone:'plain' as const}]:[]),...options.map(option=>({text:`${option.choice===choice?'›':' '} ${option.text}`,tone:option.choice===choice?'selected' as const:'accent' as const}))],selected:(notice?1:0)+Math.max(0,options.findIndex(option=>option.choice===choice))}],
    foot:[{text:t('screen.provider.loginChoiceKeys'),tone:'dim'}],
  };
}
/* 14/10/2026 (owner: «the Z.AI key only to the address you chose», «Te lo chiede quando metti la chiave»): the four Z.AI addresses
   before anything sends the key, the plan first (owner 09/10) and marked as the recommended one. */
export function providerAddressOverlay({label,choice}:{label:string;choice:number}):OverlayContent{
  return{
    head:[{text:t('screen.provider.titleNamed',{provider:label}),tone:'title'}],
    sections:[{lines:[{text:t('screen.provider.addressQuestion'),tone:'plain' as const},...ZAI_ADDRESSES.map((address,index)=>({text:`${index===choice?'›':' '} ${address.label}${index===0?` (${t('screen.word.recommended')})`:''}`,tone:index===choice?'selected' as const:'accent' as const}))],selected:1+Math.max(0,Math.min(ZAI_ADDRESSES.length-1,choice))}],
    foot:[{text:t('screen.provider.addressKeys'),tone:'dim'}],
  };
}
/* Owner 11/10/2026 («dalla cli non si può rifare login se c'è una chiave e non si può cancellare»): a provider whose key is already
   there went straight to its models, so from the screen the person could neither sign in again nor remove the key (the commands
   `talos provider login` / `remove-key` could). With a key in use, Enter first offers: use it (preselected, so the usual path is
   Enter, Enter), sign in again / replace it, remove it — the way Claude Code keeps /login and /logout reachable while signed in. */
export type KeyAction='use'|'sign-in'|'remove';
export const KEY_ACTIONS:readonly KeyAction[]=['use','sign-in','remove'];
/* Finding 5 (bugfixer, 13/10/2026): signed in WITHOUT the plan there is nothing to use yet, and there was no way to sign out on
   the screen (Enter went straight to the browser; the tokens stayed in the keyring). The same window, with the two things that
   can be done: allow the plan, or sign out. */
export const keyActionsFor=(planNeeded:boolean):readonly KeyAction[]=>planNeeded?['sign-in','remove']:KEY_ACTIONS;
export function providerKeyActionsOverlay({label,source,choice,browserSignIn,signInOnly=false,planNeeded=false}:{label:string;source:string;choice:KeyAction;browserSignIn:boolean;/** the ChatGPT plan: signed in to and out of, no key */signInOnly?:boolean;/** signed in, the plan not allowed yet: allow it or sign out */planNeeded?:boolean}):OverlayContent{
  const actions=keyActionsFor(planNeeded);
  const text:Record<KeyAction,string>={
    use:t('screen.provider.keyActionUse'),
    'sign-in':planNeeded?t('screen.provider.keyActionAllowPlan'):signInOnly?t('screen.provider.keyActionSignInAgain'):t(browserSignIn?'screen.provider.keyActionSignIn':'screen.provider.keyActionReplace',{provider:label}),
    remove:t(signInOnly?'screen.provider.keyActionSignOut':'screen.provider.keyActionRemove'),
  };
  return{
    head:[{text:t('screen.provider.titleNamed',{provider:label}),tone:'title'}],
    sections:[{lines:[{text:source,tone:'plain' as const},...actions.map(action=>({text:`${action===choice?'›':' '} ${text[action]}`,tone:action===choice?'selected' as const:'accent' as const}))],selected:1+Math.max(0,actions.indexOf(choice))}],
    foot:[{text:t('screen.provider.keyActionsKeys'),tone:'dim'}],
  };
}
/* The sign-in under way: the address (always shown, the browser may not open), then the code the person may paste. Only the
   MASK of a pasted code reaches this view. */
export function providerOAuthOverlay({label,url,mode,opened,phase,masked,message,intro,pasteable=true}:{label:string;url:string;mode:'browser'|'paste';opened:boolean;phase:'waiting'|'paste'|'exchanging'|'failed';masked:string;message:string|null;/** the first line, when the sign-in has its own words (the ChatGPT plan) */intro?:string|undefined;/** false: the browser comes back by itself and there is no code to paste */pasteable?:boolean|undefined}):OverlayContent{
  const lines:string[]=[];
  if(intro)lines.push(intro);
  /* finding 10 (13/10/2026): a sign-in that could not START has no address, so the line that says to open it is not said */
  else if(!url&&phase==='failed'){/* only why it failed, below */}
  else if(mode==='paste')lines.push(t('screen.provider.oauthRemote',{provider:label}));
  else lines.push(t(opened?'screen.provider.oauthOpened':'screen.provider.oauthNotOpened',{provider:label}));
  if(url)lines.push(url);
  const typing=pasteable&&(phase==='paste'||(mode==='paste'&&phase!=='failed'));
  if(typing)lines.push(t('screen.provider.oauthPaste',{masked:masked||' '}));
  if(message)lines.push(message);
  const foot=phase==='exchanging'?t('screen.provider.oauthExchanging'):phase==='failed'?t('screen.provider.oauthFailedKeys'):typing?t('screen.provider.oauthPasteKeys'):t(pasteable?'screen.provider.oauthWaiting':'screen.provider.oauthWaitingOnly');
  return{head:[{text:t('screen.provider.titleNamed',{provider:label}),tone:'title'}],sections:[{lines:lines.map(text=>({text,tone:'plain' as const})),selected:typing?lines.findIndex(line=>line.startsWith(t('screen.provider.oauthPaste',{masked:''}).trim())):0}],foot:[{text:foot,tone:'dim'}]};
}
// Only the MASK reaches this view, never the typed key. The key line is the "selected" row: it is where the person types.
export function providerKeyOverlay({label,remediation,benched,masked,keyTestNotice,testing,result}:{label:string;remediation:string|null;benched:string|null;masked:string;keyTestNotice:string|null;testing:boolean;result:string|null}):OverlayContent{
  const lines=[...(remediation?[remediation]:[]),...(benched?[benched]:[])];
  const keyLine=lines.length;
  lines.push(t('screen.provider.keyPrompt',{provider:label,masked:masked||' '}),...(keyTestNotice?[keyTestNotice]:[]));
  const status=testing?{text:t('screen.provider.keyTesting',{provider:label}),tone:'dim' as const}
    :result?{text:t('screen.provider.keyResult',{result}),tone:'plain' as const}
    :{text:t('screen.provider.keyFoot'),tone:'dim' as const};
  return{head:[{text:t('screen.provider.titleNamed',{provider:label}),tone:'title'}],sections:[{lines:lines.map(text=>({text,tone:'plain' as const})),selected:keyLine}],foot:[status]};
}
