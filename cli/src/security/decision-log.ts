/*
 * Stage 7.21 (mockup permissions «Recent»; owner 03/10: the last 50 decisions of this project, kept after the session closes,
 * as Claude Code's «Recently denied»): what was asked and what came of it — a request the person answered on the approval
 * card, or one the rules, the mode or the project boundary blocked. Newest first, at most 50, one file per project in the
 * person's data (never the project's folder); a write is whole or not at all, and writes wait for each other.
 */
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {projectId,type CliPaths} from '../paths.ts';
import type {PermissionAction} from './types.ts';

export type DecisionOutcome='allowed-once'|'allowed-session'|'allowed-always'|'denied'|'denied-always'|'blocked';
export type DecisionRecord={at:string;action:PermissionAction;outcome:DecisionOutcome;code?:string};
export const DECISIONS_KEPT=50;
const OUTCOMES=new Set<DecisionOutcome>(['allowed-once','allowed-session','allowed-always','denied','denied-always','blocked']);

export function decisionLogFile(paths:Pick<CliPaths,'projectOverridesRoot'>,projectRoot:string){return join(paths.projectOverridesRoot,projectId(projectRoot),'decisions.json');}
function valid(row:any):row is DecisionRecord{return Boolean(row&&typeof row==='object'&&typeof row.at==='string'&&OUTCOMES.has(row.outcome)&&row.action&&typeof row.action.tool==='string');}
export function createDecisionLog(file:string){
  let chain:Promise<unknown>=Promise.resolve();
  const list=async():Promise<DecisionRecord[]>=>{
    let raw:unknown;try{raw=JSON.parse(await readFile(file,'utf8'));}catch(error:any){if(error?.code==='ENOENT')return[];throw Object.assign(new Error('DECISION_LOG_INVALID'),{code:'DECISION_LOG_INVALID'});}
    return Array.isArray(raw)?raw.filter(valid).slice(0,DECISIONS_KEPT):[];
  };
  const append=(record:DecisionRecord)=>{
    const run=chain.then(async()=>{
      let rows:DecisionRecord[]=[];try{rows=await list();}catch{/* an unreadable log starts again rather than stopping a decision */}
      const next=[record,...rows].slice(0,DECISIONS_KEPT);
      await mkdir(dirname(file),{recursive:true,mode:0o700});
      const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(next),{encoding:'utf8',mode:0o600});await rename(temp,file);
    });
    chain=run.catch(()=>{});return run;
  };
  return{list,append};
}
