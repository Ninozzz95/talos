/*
 * Stage 7.11e (mockup Settings «Usage»: «Per turn», «Today · 214k tokens · $0.19 in this project», «By model»; owner 03/10
 * «registro d'uso locale»): one line per turn, per project, in the profile — never in the project, never a word of the
 * conversation: when, which session and model, the tokens in, out and cached, and the cost when one is known. As ccusage reads
 * Claude Code's local logs, the Settings sheet reads this one. A turn is what the session's total grew by between its start and
 * its end (the kernel's usage is cumulative, usage-snapshot.ts); its cost is the same /usage figure, its difference. The file is
 * kept small: past 1 MB only the last 60 days stay, written atomically.
 */
import {appendFile,mkdir,open,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {projectId} from '../paths.ts';
import {usageSnapshot} from '../runtime/usage-snapshot.ts';

export type UsageRecordLine={at:string;session:string;model:string;in:number;out:number;cached:number;usd:number|null};
export type UsageRecordFacts={perTurn:readonly number[];today:{tokens:number;usd:number|null}|null;byModel:readonly {model:string;share:number}[]};
export const USAGE_RECORD_MAX_BYTES=1_000_000;
/** C5: the history of the «CLI usage» page. `date` is the person's own day, `tokens` in plus out, `usd` null when no turn of the day has a price. */
export type UsageDay={date:string;tokens:number;byModel:Readonly<Record<string,number>>;/* who worked that day: a session over two days is one session */sessions:readonly string[];turns:number;usd:number|null};
export type UsageHistory={days:readonly UsageDay[];/* those that spent most first */models:readonly string[]};
const KEEP_DAYS=60;

export function usageRecordFile(dataRoot:string,projectRoot:string):string{return join(dataRoot,'usage',`${projectId(projectRoot)}.jsonl`);}

async function writeAtomic(file:string,text:string){const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;await writeFile(tmp,text,{encoding:'utf8',mode:0o600});const h=await open(tmp,'r+');try{await h.sync();}finally{await h.close();}await rename(tmp,file);}
function parse(text:string):UsageRecordLine[]{
  const out:UsageRecordLine[]=[];
  for(const line of text.split('\n')){if(!line.trim())continue;try{const row=JSON.parse(line);if(typeof row?.at==='string'&&typeof row.model==='string'&&Number.isFinite(row.in)&&Number.isFinite(row.out))out.push({at:row.at,session:String(row.session??''),model:row.model,in:row.in,out:row.out,cached:Number.isFinite(row.cached)?row.cached:0,usd:Number.isFinite(row.usd)?row.usd:null});}catch{/* a torn line is skipped */}}
  return out;
}

/** Appends one turn; past the size cap keeps only the last 60 days. Writes are chained, so two turns never interleave. */
export function createUsageRecordWriter(file:string,{now=()=>new Date()}:{now?:()=>Date}={}){
  let chain:Promise<void>=Promise.resolve();
  return{
    append(row:UsageRecordLine){
      chain=chain.then(async()=>{
        await mkdir(dirname(file),{recursive:true,mode:0o700});
        await appendFile(file,JSON.stringify(row)+'\n',{encoding:'utf8',mode:0o600});
        if((await stat(file)).size<=USAGE_RECORD_MAX_BYTES)return;
        const since=now().getTime()-KEEP_DAYS*86_400_000;
        const kept=parse(await readFile(file,'utf8')).filter(line=>Date.parse(line.at)>=since);
        await writeAtomic(file,kept.map(line=>JSON.stringify(line)).join('\n')+(kept.length?'\n':''));
      }).catch(()=>{/* the record is a convenience: a full disk never stops a turn */});
      return chain;
    },
    flush:()=>chain,
  };
}

/** Follows a session's events: the total at the start of a turn and at its end; the difference is the turn's line. */
export function createUsageRecorder({write,model,session,now=()=>new Date()}:{write:(row:UsageRecordLine)=>unknown;model:()=>string;session:()=>string|null;now?:()=>Date}){
  const latest=new Map<string,unknown>();const base=new Map<string,unknown>();
  const totals=(usage:unknown,id:string)=>usageSnapshot({state:{usage},contextStatus:null,profile:null,model:id});
  return{
    observe(event:{type?:unknown;value?:unknown}){
      const id=session();if(!id)return;
      if(event.type==='usage.updated'){latest.set(id,event.value);return;}
      if(event.type==='run.started'){base.set(id,latest.get(id)??null);return;}
      if(event.type!=='run.completed'&&event.type!=='run.failed'&&event.type!=='run.cancelled')return;
      if(!base.has(id))return;
      const name=model();const end=totals(latest.get(id),name);const start=totals(base.get(id),name);base.delete(id);
      const diff=(a:number|null,b:number|null)=>Math.max(0,(a??0)-(b??0));
      const row={at:now().toISOString(),session:id,model:name,in:diff(end.inputTokens,start.inputTokens),out:diff(end.outputTokens,start.outputTokens),cached:diff(end.cachedTokens,start.cachedTokens),
        usd:end.costUsd!==null?Math.max(0,end.costUsd-(start.costUsd??0)):null};
      if(row.in+row.out>0)write(row);
    },
  };
}

/** What the Settings sheet's Usage tab shows: this session's last turns, today in this project, and today's share by model. */
export async function readUsageRecord(file:string,{session,now=new Date(),turns=12}:{session:string|null;now?:Date;turns?:number}):Promise<UsageRecordFacts|null>{
  let text:string;try{text=await readFile(file,'utf8');}catch{return null;}
  const rows=parse(text);if(!rows.length)return null;
  const day=(at:string)=>{const d=new Date(at);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;};
  const today=rows.filter(row=>day(row.at)===day(now.toISOString()));
  const perTurn=session?rows.filter(row=>row.session===session).slice(-turns).map(row=>row.in+row.out):[];
  const tokens=today.reduce((sum,row)=>sum+row.in+row.out,0);
  const priced=today.filter(row=>row.usd!==null);
  const byModel=new Map<string,number>();for(const row of today)byModel.set(row.model,(byModel.get(row.model)??0)+row.in+row.out);
  return{perTurn,today:today.length?{tokens,usd:priced.length?priced.reduce((sum,row)=>sum+row.usd!,0):null}:null,
    byModel:tokens?[...byModel].sort((a,b)=>b[1]-a[1]).map(([model,n])=>({model:short(model),share:n/tokens})):[]};
}

const short=(model:string)=>{const at=model.indexOf(':');return at>0?model.slice(at+1):model;};
const dateOf=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

/** C5: every day of the period, the empty ones too, oldest first, today last. The turns of a day are counted once, by the record's own line. */
export function usageHistory(rows:readonly UsageRecordLine[],now:Date,days=KEEP_DAYS):UsageHistory{
  const out=Array.from({length:days},(_,i)=>({date:dateOf(new Date(now.getFullYear(),now.getMonth(),now.getDate()-(days-1-i))),tokens:0,byModel:{} as Record<string,number>,sessions:new Set<string>(),turns:0,usd:null as number|null}));
  const at=new Map(out.map(day=>[day.date,day]));const models=new Map<string,number>();
  for(const row of rows){
    const day=at.get(dateOf(new Date(row.at)));if(!day)continue;
    const tokens=row.in+row.out,model=short(row.model);
    day.tokens+=tokens;day.turns+=1;day.byModel[model]=(day.byModel[model]??0)+tokens;
    if(row.session)day.sessions.add(row.session);
    if(row.usd!==null)day.usd=(day.usd??0)+row.usd;
    models.set(model,(models.get(model)??0)+tokens);
  }
  return{days:out.map(day=>({...day,sessions:[...day.sessions]})),models:[...models].sort((a,b)=>b[1]-a[1]).map(([model])=>model)};
}

/** Read once, when the page opens; null when this project has no record, or nothing in the period. */
export async function readUsageHistory(file:string,{now=new Date()}:{now?:Date}={}):Promise<UsageHistory|null>{
  let text:string;try{text=await readFile(file,'utf8');}catch{return null;}
  const history=usageHistory(parse(text),now);
  return history.models.length?history:null;
}
