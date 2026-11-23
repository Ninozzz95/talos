/*
 * 0.6.6 (the 0.6.6 review's F2): a run of the history in English words. The kernel's store keeps its own words (`finita`,
 * `saltata`, `precedente-in-corso`, the error classes of `classificaErroreDiCorsa`, a CLI code such as PROJECT_TRUST_REQUIRED):
 * they stay the store's — the JSON keeps them under `raw` — and the screen and the JSON's `outcome`/`reason` say them in words.
 */
import {en,t,type MessageId} from '../i18n/index.ts';
import type {AutomationMode} from './kernel-runs.ts';

const OUTCOMES:Record<string,string>={partita:'running',finita:'done',fallita:'failed',fermata:'stopped',saltata:'skipped'};
const has=(key:string):key is MessageId=>Object.prototype.hasOwnProperty.call(en,key);

/** The outcome as a stable English word (running, done, failed, stopped, skipped, unknown). */
export function runOutcome(raw:unknown):string{return OUTCOMES[String(raw)]??'unknown';}
export function runOutcomeWords(raw:unknown):string{const key=`automation.outcome.${String(raw)}`;return t(has(key)?key:'automation.outcome.unknown');}
/** Why a run was skipped or failed, in words: the store's reason, an error class, or a code the CLI has words for. */
export function runReasonWords(raw:unknown):string|null{
  if(typeof raw!=='string'||!raw)return null;
  const reason=`automation.reason.${raw}`;if(has(reason))return t(reason);
  const code=`error.code.${raw}.what`;if(has(code))return t(code).replace(/\.$/u,'');
  return t('automation.reason.ignoto');
}
/** When the run happened: started, else skipped, else ended, else when it was due. */
export function runTime(run:any):string|null{return run?.partitaAlle??run?.saltataAlle??run?.finitaAlle??run?.previstaAlle??null;}
/** A run as `history` and `run` give it in JSON: English outcome and reason, the store's own row under `raw`. */
export function describeRun(run:any){
  return{runId:run?.runId??null,at:runTime(run),outcome:runOutcome(run?.esito??run?.evento),reason:runReasonWords(run?.motivo),
    detail:typeof run?.dettaglio==='string'&&run.dettaglio?run.dettaglio:null,summary:typeof run?.riassunto==='string'?run.riassunto:null,
    sessionId:run?.sessionId??null,raw:run};
}
/** A mode as the person reads it, with the word `--mode` takes. */
export function modeWords(mode:AutomationMode|null):string{return mode?`${t(`panel.permissions.mode.${mode}` as MessageId)} (${mode})`:'';}
