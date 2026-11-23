/*
 * Stage 3, the MCP elicitation card (owner 02/10: kernel patch, then the CLI; registro 12). A server asks the person
 * for details (`form`: a flat schema of text, numbers, yes/no, single and multiple choices) or to open a page (`url`: for
 * sign-ins and secrets, which never pass through TALOS). Drawn as the approved mockup draws it (`elicitCard`, golden frames
 * step-17-server-mcp-che-chiedono-*): «╭─ <server> (MCP server) <message>», one row per field (title in 18 cells, value),
 * «Review and send · Decline» and the hint; the url request with the domain in clear and «Open in browser · Decline».
 * Keys as the mockup: ↑/↓ field, typing edits, space toggles (on a multiple choice it walks the options and toggles each),
 * Enter sends, Esc cancels; on a url Enter opens it (never by itself, like Codex), d declines. Pure: state in, rows and
 * outcome out; the kernel validates the content again against the server's schema.
 */
import {t} from '../i18n/index.ts';
import type {ElicitationResponse} from '../runtime/types.ts';
import {displayWidth} from './text-width.ts';
import {fit,trunc,type CardRow,type CardSegment} from './question-card-rows.ts';

export type ElicitField={name:string;title:string;kind:'text'|'number'|'integer'|'bool'|'choice'|'multi';value:string|boolean|string[];options?:string[];required:boolean;cursor:number};
export type ElicitCardState={requestId:string;server:string;mode:'form'|'url';message:string;fields:ElicitField[];sel:number;url?:string;domain?:string;missing?:string|undefined};
export type ElicitKey={name:string;ctrl?:boolean;text?:string};
export type ElicitOutcome={kind:'none'}|{kind:'send';response:ElicitationResponse}|{kind:'open';url:string;response:ElicitationResponse};
const seg=(text:string,roles='',action?:string):CardSegment=>({text,roles:roles.split(' ').filter(Boolean),...(action?{action}:{})});

function fieldOf(name:string,schema:Record<string,any>,required:boolean):ElicitField{
  const title=typeof schema.title==='string'&&schema.title?schema.title:name;
  if(schema.type==='boolean')return{name,title,kind:'bool',value:schema.default===true,required,cursor:-1};
  if(schema.type==='array'){const options:string[]=schema.items?.enum??[];return{name,title,kind:'multi',options,value:Array.isArray(schema.default)?schema.default.filter((x:string)=>options.includes(x)):[],required,cursor:-1};}
  if(schema.type==='string'&&Array.isArray(schema.enum)){const options:string[]=schema.enum;return{name,title,kind:'choice',options,value:typeof schema.default==='string'&&options.includes(schema.default)?schema.default:options[0]??'',required,cursor:-1};}
  if(schema.type==='number'||schema.type==='integer')return{name,title,kind:schema.type,value:typeof schema.default==='number'?String(schema.default):'',required,cursor:-1};
  return{name,title,kind:'text',value:typeof schema.default==='string'?schema.default:'',required,cursor:-1};
}

export function openElicitCard(request:{requestId:string;server:string;mode:'form'|'url';message:string;requestedSchema?:Record<string,any>;url?:string;domain?:string;elicitationId?:string}):ElicitCardState{
  const properties=request.requestedSchema?.properties??{};const required:string[]=request.requestedSchema?.required??[];
  return{requestId:request.requestId,server:request.server,mode:request.mode,message:request.message,sel:0,
    fields:request.mode==='form'?Object.entries(properties).map(([name,schema])=>fieldOf(name,schema as Record<string,any>,required.includes(name))):[],
    ...(request.url?{url:request.url}:{}),...(request.domain?{domain:request.domain}:{})};
}

function withField(state:ElicitCardState,index:number,field:ElicitField):ElicitCardState{
  return{...state,fields:state.fields.map((f,i)=>i===index?field:f),missing:undefined};
}
/* The content the server asked for, in its kinds; the first field that cannot be sent is named instead. */
function contentOf(state:ElicitCardState):{content:Record<string,unknown>}|{missing:string}{
  const content:Record<string,unknown>={};
  for(const f of state.fields){
    if(f.kind==='bool'||f.kind==='multi'){content[f.name]=Array.isArray(f.value)?[...f.value]:f.value;continue;}
    const text=String(f.value).trim();
    if(!text){if(f.required)return{missing:f.name};continue;}
    if(f.kind==='number'||f.kind==='integer'){const n=Number(text);if(!Number.isFinite(n)||(f.kind==='integer'&&!Number.isInteger(n)))return{missing:f.name};content[f.name]=n;continue;}
    content[f.name]=text;
  }
  return{content};
}

export function elicitCardKey(state:ElicitCardState,key:ElicitKey):{state:ElicitCardState;outcome:ElicitOutcome}{
  const none=(next:ElicitCardState)=>({state:next,outcome:{kind:'none'} as ElicitOutcome});
  if(key.name==='escape')return{state,outcome:{kind:'send',response:{action:'cancel'}}};
  if(state.mode==='url'){
    if(key.name==='return'&&state.url)return{state,outcome:{kind:'open',url:state.url,response:{action:'accept'}}};
    if(key.text==='d'&&!key.ctrl)return{state,outcome:{kind:'send',response:{action:'decline'}}};
    return none(state);
  }
  const count=state.fields.length;const field=state.fields[state.sel];
  if(key.name==='return'){
    const result=contentOf(state);
    if('missing' in result){const index=state.fields.findIndex(f=>f.name===result.missing);return none({...state,missing:result.missing,sel:index>=0?index:state.sel});}
    return{state,outcome:{kind:'send',response:{action:'accept',content:result.content}}};
  }
  if(key.name==='down'&&count)return none({...state,sel:(state.sel+1)%count,missing:undefined});
  if(key.name==='up'&&count)return none({...state,sel:(state.sel-1+count)%count,missing:undefined});
  if(!field)return none(state);
  if(key.name==='space'){
    if(field.kind==='bool')return none(withField(state,state.sel,{...field,value:!field.value}));
    if(field.kind==='multi'){const options=field.options??[];if(!options.length)return none(state);const cursor=(field.cursor+1)%options.length;const option=options[cursor]!;const value=field.value as string[];
      return none(withField(state,state.sel,{...field,cursor,value:value.includes(option)?value.filter(x=>x!==option):[...value,option]}));}
    if(field.kind==='choice'){const options=field.options??[];if(!options.length)return none(state);const at=options.indexOf(String(field.value));return none(withField(state,state.sel,{...field,value:options[(at+1)%options.length]!}));}
  }
  if(field.kind==='text'||field.kind==='number'||field.kind==='integer'){
    if(key.name==='backspace')return none(withField(state,state.sel,{...field,value:[...String(field.value)].slice(0,-1).join('')}));
    if(key.text&&!key.ctrl)return none(withField(state,state.sel,{...field,value:String(field.value)+key.text}));
  }
  return none(state);
}

/** Stage 6c «tutto cliccabile» (mockup `click`: efield, eaccept, edecline): a field's name selects it; «Review and send» and
 *  «Open in browser» are Enter; «Decline» is the MCP spec's explicit decline (2025-11-25: decline = the person said no,
 *  cancel = dismissed), so Esc stays the dismissal. Null for an action that is not the card's. */
export function elicitCardClick(state:ElicitCardState,action:string):{state:ElicitCardState;outcome:ElicitOutcome}|null{
  const field=/^field:(\d+)$/u.exec(action);
  if(field&&state.mode==='form'){const sel=Number(field[1]);return sel<state.fields.length?{state:{...state,sel,missing:undefined},outcome:{kind:'none'}}:null;}
  if(action==='open'&&state.mode==='url')return elicitCardKey(state,{name:'return'});
  if(action==='send'&&state.mode==='form')return elicitCardKey(state,{name:'return'});
  if(action==='decline')return{state,outcome:{kind:'send',response:{action:'decline'}}};
  return null;
}

const pad=(text:string,width:number)=>{const w=displayWidth(text);return w>=width?text:text+' '.repeat(width-w);};
function valueText(field:ElicitField,selected:boolean):string{
  if(field.kind==='bool')return t(field.value?'screen.elicit.yes':'screen.elicit.no');
  if(field.kind==='multi')return (field.options??[]).map(o=>((field.value as string[]).includes(o)?'[x] ':'[ ] ')+o).join('  ');
  return String(field.value)+(selected&&field.kind!=='choice'?'▍':'');
}

export function elicitCardRows(state:ElicitCardState,width:number):CardRow[]{
  const inner=width-4;const rows:CardRow[]=[];
  if(state.mode==='url'){
    const url=state.url??'';const domain=state.domain??'';const at=domain?url.indexOf(domain):-1;
    rows.push([seg('╭─ ','acc'),seg(state.server,'acc b'),seg(t('screen.elicit.urlTitle'),'dim')],[seg('')],[seg(`  ${state.message}`)],[seg('')]);
    rows.push(at>0?[seg('  '+url.slice(0,at),'dim'),seg(domain,'acc b u'),seg(url.slice(at+domain.length),'dim')]:[seg('  '+url,'dim')]);
    rows.push([seg(t('screen.elicit.domain'),'faint'),seg(domain,'b'),seg(t('screen.elicit.domainNote'),'faint')],[seg('')]);
    rows.push([seg('  '),seg(` ${t('screen.elicit.open')} `,'pill','open'),seg('   '),seg(` ${t('screen.elicit.decline')} `,'dim','decline'),seg(`   ${t('screen.elicit.urlHint')}`,'faint')]);
  }else{
    rows.push([seg('╭─ ','acc'),seg(state.server,'acc b'),seg(t('screen.elicit.formTitle',{message:state.message}),'dim')],[seg('')]);
    state.fields.forEach((field,index)=>{const selected=index===state.sel;
      rows.push([seg(selected?' › ':'   ',selected?'acc':''),seg(pad(field.title,18),selected?'acc b':'dim',`field:${index}`),
        seg(trunc(valueText(field,selected),Math.max(1,inner-24)),field.kind==='text'||field.kind==='number'||field.kind==='integer'?'code':'')]);});
    if(state.missing){const field=state.fields.find(f=>f.name===state.missing);rows.push([seg(`  ${t('screen.elicit.missing',{field:field?.title??state.missing})}`,'warn')]);}
    rows.push([seg('')]);
    rows.push([seg('  '),seg(` ${t('screen.elicit.send')} `,'pill','send'),seg('   '),seg(` ${t('screen.elicit.decline')} `,'dim','decline'),seg(`   ${t('screen.elicit.formHint')}`,'faint')]);
  }
  return[...rows.map(row=>[seg('│ ','acc'),...fit(row,inner+1)]),[seg(`╰${'─'.repeat(width-2)}╯`,'acc')]];
}
