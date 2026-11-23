/*
 * Stage 7.10d (mockup PANELS.setup; owner 03/10 «foglio a schede + Check vero, a costo minimo», «chiave + 1 token sempre,
 * strumenti a richiesta», «stesso foglio anche al primo avvio»): the setup is one sheet with four tabs — 1 Provider, 2 Key,
 * 3 Model, 4 Check — the first launch opening it on the first tab that is missing, `/setup` on the first. Tab moves freely;
 * Enter on a tab goes on to the next. Nothing is decided by the sheet: each step is an action the app carries out (P17's
 * rules stay: an environment key is used only on a yes, a key is saved only once its provider accepted it, the provider is
 * chosen only with a model of it — s-code #80, OpenClaw's onboarding). Check proves the key (no tokens) and asks the model
 * for one token (when the kernel can, `provaModello`); the tools check runs only on r, and says its cost first.
 */
import {t} from '../../i18n/index.ts';
import {S,type FormField,type Panel,type PanelBody,type PanelStep,type ProgressStep,type SegRow} from './sheet.ts';
import {PROVIDER_FILTER_FROM,type SheetAction,type SheetState} from './commands.ts';

export type SetupProvider={id:string;label:string;/* an engine on this computer that needs no key */local:boolean};
export type SetupNote={text:string;roles?:string};
export type SetupKeyView=
  /* the key is asked (the mockup): an environment key offered first, OpenRouter's browser sign-in, notes under the field */
  /* `provider`: named in the field (owner 03/10: «OpenAI API key», the mockup's «API key» with the provider it is for) */
  |{kind:'ask';provider:string;help:string;consent?:{variable:string}|null;browser?:boolean;notes?:readonly SetupNote[];testing?:boolean;
    /* 14/10/2026 (owner: the Z.AI key only to the address you chose): the addresses to choose from, asked first */address?:{options:readonly string[]}|null}
  /* no key: a local engine, a provider that needs none */
  |{kind:'none';text:string}
  /* the browser sign-in under way: its lines, a code to paste when OpenRouter shows one, try again after a failure */
  /* `start`: nothing is under way yet and the button starts it (a provider that is only signed in to: the ChatGPT plan) */
  |{kind:'login';lines:readonly string[];foot:string;paste:boolean;retry:boolean;start?:boolean};
export type SetupModel={id:string;name:string;desc:string};
export type SetupCheck={label:string;state:ProgressStep['state'];detail?:string};
export type SetupState={
  providers:readonly SetupProvider[];
  /* the provider of this setup: the one in use until another is picked here */
  provider:string|null;
  key:SetupKeyView|null;
  models:readonly SetupModel[]|null;modelsNotice?:string|null;engineDown?:boolean;
  /* the model in use */
  current:string|null;
  checks:readonly SetupCheck[]|null;
  /* «Ready. Esc and start talking.», or what to do instead */
  result?:{ready:true}|{ready:false;text:string}|null;
  /* r runs the tools check */
  tools?:boolean;
};
export type SetupUse='typed'|'environment'|'browser'|'code'|'retry'|'next';

export const SETUP_TABS=4;
const FIELD_CONSENT=()=>t('panel.setup.found');
const FIELD_SIGN_IN=()=>t('panel.setup.signIn');
const FIELD_KEY=(provider:string)=>t('panel.setup.apiKey',{provider});
const FIELD_CODE=()=>t('panel.setup.code');
const FIELD_ADDRESS=()=>t('panel.setup.address');

const info=(lines:readonly SetupNote[]):PanelBody=>({kind:'info',lines:()=>[[S('')],...lines.map(line=>[S(`  ${line.text}`,line.roles??'dim')] as SegRow)]});
const noteRows=(notes:readonly SetupNote[])=>()=>notes.length?[[S('')] as SegRow,...notes.map(note=>[S(`    ${note.text}`,note.roles??'dim')] as SegRow)]:[];

function keyBody(state:SetupState,prev:PanelBody|undefined):PanelBody{
  const key=state.key;
  if(!state.provider||!key)return info([{text:t('panel.setup.providerFirst')}]);
  /* what was typed stays while the notes under it change (a test result, «testing…»); a submit clears it in setupStep */
  const typed=(label:string)=>prev?.kind==='form'?prev.fields.find(field=>field.label===label)?.value:undefined;
  if(key.kind==='none')return{kind:'form',fields:[],sel:0,submit:t('panel.setup.next'),after:noteRows([{text:key.text}])};
  if(key.kind==='login'){
    const fields:FormField[]=key.paste?[{label:FIELD_CODE(),type:'text',value:String(typed(FIELD_CODE())??''),mask:true}]:[];
    return{kind:'form',fields,sel:0,...(key.paste||key.retry||key.start?{submit:t(key.start?'panel.setup.signInBrowser':key.retry?'panel.setup.tryAgain':'panel.setup.next')}:{}),
      after:noteRows([...key.lines.map(text=>({text,roles:''})),...(key.foot?[{text:key.foot}]:[])])};
  }
  const fields:FormField[]=[];
  if(key.address)fields.push({label:FIELD_ADDRESS(),type:'choice',value:String(typed(FIELD_ADDRESS())??key.address.options[0]??''),options:[...key.address.options],help:t('panel.setup.addressHelp')});
  if(key.consent)fields.push({label:FIELD_CONSENT(),type:'choice',value:String(typed(FIELD_CONSENT())??t('panel.setup.useNo')),options:[t('panel.setup.useNo'),t('panel.setup.useYes',{variable:key.consent.variable})],help:t('panel.setup.foundHelp',{variable:key.consent.variable})});
  if(key.browser)fields.push({label:FIELD_SIGN_IN(),type:'choice',value:String(typed(FIELD_SIGN_IN())??t('panel.setup.browser')),options:[t('panel.setup.browser'),t('panel.setup.pasteKey')]});
  fields.push({label:FIELD_KEY(key.provider),type:'text',value:String(typed(FIELD_KEY(key.provider))??''),mask:true,help:key.help});
  /* the first field (the question, when there is one) until the person moves */
  const sel=prev?.kind==='form'&&prev.fields.length===fields.length?prev.sel:0;
  const notes=[...(key.notes??[]),...(key.testing?[{text:t('panel.setup.testing')}]:[])];
  return{kind:'form',fields,sel,submit:t('panel.setup.next'),after:noteRows(notes)};
}

function listOf(prev:PanelBody|undefined){return prev?.kind==='list'?{sel:prev.sel,...(prev.filter!==undefined?{filter:prev.filter}:{}),...(prev.filtering!==undefined?{filtering:prev.filtering}:{})}:{sel:-1};}

/* «Ollama (local, no key)» as the mockup writes it; a name that already says local («Ollama Local», «Local engine (llama.cpp)»)
   is not told twice */
const localLabel=(label:string)=>t('panel.setup.noKeyLabel',{provider:label.replace(/\s+local$/iu,'')});

function providerBody(state:SetupState,prev:PanelBody|undefined):PanelBody{
  const kept=listOf(prev);const at=state.providers.findIndex(row=>row.id===state.provider);
  return{kind:'list',radio:true,...kept,sel:kept.sel>=0?kept.sel:Math.max(0,at),enter:t('panel.setup.nextKey'),empty:t('panel.setup.noProviders'),
    ...(state.providers.length>=PROVIDER_FILTER_FROM?{filterable:true}:{}),
    items:state.providers.map(row=>({id:row.id,label:row.local?localLabel(row.label):row.label,search:row.id,current:row.id===state.provider}))};
}

function modelBody(state:SetupState,prev:PanelBody|undefined):PanelBody{
  if(!state.provider)return info([{text:t('panel.setup.providerFirst')}]);
  if(!state.models)return info([{text:t('panel.setup.readingModels')}]);
  const kept=listOf(prev);const at=state.models.findIndex(row=>row.id===state.current);
  const notice=state.modelsNotice?[[S(`  ${state.modelsNotice}`,state.engineDown?'warn':'dim')] as SegRow,[S('')] as SegRow]:[];
  return{kind:'list',radio:true,twoLine:true,...kept,sel:kept.sel>=0?kept.sel:Math.max(0,at),enter:t('panel.setup.nextKey'),empty:t('panel.setup.noModels'),
    ...(state.models.length>=PROVIDER_FILTER_FROM?{filterable:true}:{}),...(notice.length?{top:()=>notice}:{}),
    ...(state.engineDown?{keys:[{key:'r',label:t('panel.setup.tryAgainKey'),adds:true}]}:{}),
    items:state.models.map(row=>({id:row.id,label:row.name,desc:row.desc,search:row.id,current:row.id===state.current}))};
}

function checkBody(state:SetupState):PanelBody{
  const keys=state.tools?[{key:'r',label:t('panel.setup.toolsKey')}]:[];
  if(!state.checks)return{...info([{text:t('panel.setup.modelFirst')}]),keys} as PanelBody;
  const result=state.result;
  return{kind:'progress',steps:state.checks.map(check=>({label:check.label,state:check.state,...(check.detail?{detail:check.detail}:{})})),
    ...(result?{result:()=>[result.ready?[S(`  ${t('panel.setup.ready')} `,'ok b'),S(t('panel.setup.readyHint'),'dim')]:[S(`  ${result.text}`,'warn')]]}:{}),keys};
}

/** The setup sheet for `state`, on `tab`; `prev` keeps what the person had moved or typed in each tab. */
export function setupSheet(state:SetupState,{tab=0,prev}:{tab?:number;prev?:Panel}={}):SheetState{
  const body=(i:number)=>prev?.tabs[i]?.body;
  const tabs=[
    {name:t('panel.setup.tab.provider'),body:providerBody(state,body(0))},
    {name:t('panel.setup.tab.key'),body:keyBody(state,body(1))},
    {name:t('panel.setup.tab.model'),body:modelBody(state,body(2))},
    {name:t('panel.setup.tab.check'),body:checkBody(state)},
  ];
  return{name:'setup',context:{setup:state},panel:{title:t('panel.setup.title'),sub:t('panel.setup.sub'),tab:Math.max(0,Math.min(SETUP_TABS-1,tab)),tabs}};
}

/** A sheet step on the setup: the tab it moved to, or what Enter, a submit or r asks the app to do. */
export function setupStep(sheet:SheetState,step:PanelStep):{sheet:SheetState|null;action:SheetAction|null}{
  const next={...sheet,panel:step.panel};const effect=step.effect;const state=sheet.context?.setup;
  if(!state)return{sheet:null,action:null};
  if(effect.kind==='tab')return{sheet:next,action:{kind:'setupTab',tab:effect.tab}};
  const tab=step.panel.tab;
  if(tab===0&&effect.kind==='enter'&&effect.item.id)return{sheet:next,action:{kind:'setupProvider',id:effect.item.id}};
  if(tab===2&&effect.kind==='enter'&&effect.item.id)return{sheet:next,action:{kind:'setupModel',id:effect.item.id}};
  if(tab===2&&effect.kind==='key'&&effect.key==='r')return{sheet:next,action:{kind:'setupModels'}};
  /* r is a key of the Check tab only when the tools check is offered (checkBody's keys) */
  if(tab===3&&effect.kind==='key'&&effect.key==='r')return{sheet:next,action:{kind:'setupTools'}};
  if(tab===1&&effect.kind==='submit'){
    const body=step.panel.tabs[1]!.body;if(body.kind!=='form')return{sheet:next,action:null};
    const value=(label:string)=>body.fields.find(field=>field.label===label)?.value;
    /* the secret leaves the sheet with the action: the field is emptied at once */
    const cleared:Panel={...step.panel,tabs:step.panel.tabs.map((entry,i)=>i===1&&entry.body.kind==='form'?{...entry,body:{...entry.body,fields:entry.body.fields.map(field=>field.mask?{...field,value:''}:field)}}:entry)};
    const after={...sheet,panel:cleared};const key=state.key;
    if(!key||key.kind==='none')return{sheet:after,action:{kind:'setupKey',use:'next'}};
    if(key.kind==='login'){
      if(key.retry||key.start)return{sheet:after,action:{kind:'setupKey',use:'retry'}};
      return{sheet:after,action:{kind:'setupKey',use:'code',key:String(value(FIELD_CODE())??'').trim()}};
    }
    const index=key.address?key.address.options.indexOf(String(value(FIELD_ADDRESS())??'')):-1;
    const address=index>=0?{address:index}:{};
    if(key.consent&&value(FIELD_CONSENT())!==t('panel.setup.useNo'))return{sheet:after,action:{kind:'setupKey',use:'environment',...address}};
    const typed=String(value(FIELD_KEY(key.provider))??'').trim();
    if(typed)return{sheet:after,action:{kind:'setupKey',use:'typed',key:typed,...(key.consent?{declined:true}:{}),...address}};
    if(key.browser&&value(FIELD_SIGN_IN())===t('panel.setup.browser'))return{sheet:after,action:{kind:'setupKey',use:'browser',...address}};
    return{sheet:after,action:{kind:'setupKey',use:'next',...(key.consent?{declined:true}:{}),...address}};
  }
  return{sheet:next,action:null};
}
