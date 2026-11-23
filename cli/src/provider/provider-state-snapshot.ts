/*
 * C1R (RICERCA-5x5x5x5-OTTIMIZZAZIONE-CLI-2026-10-05, "Piano cure raffinato" point 1) — the provider-readiness
 * snapshot: the local disk file the resume reads so the session shows at once and the provider's readiness is
 * verified in the background (stale-while-revalidate; codex models-manager `OnlineIfUncached — Use cache if
 * available and fresh, otherwise fetch`; hermes `cache_only` callers "still get a warm catalog").
 *
 * What it is NOT: not `harness-ui/src/provider-state-anchor.mjs` (P4, the provider-state anchor inside the
 * journal's history) and not the probe (`harness-ui/src/provider-probe.mjs`). This module never touches the
 * network and never sees a credential: the probe answers are reduced to four fields before they get here.
 *
 * Fail-closed by construction (the cure's declared risk: a provider shown ready when it is not):
 *   - a file that is missing, corrupt, of another schema, or holding a malformed entry reads as `missing`
 *     with no provider state invented;
 *   - freshness is the caller's clock against the entry's `checkedAt`; a stale entry is a stale entry, not
 *     a ready one.
 */
import {readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';

export const PROVIDER_STATE_SCHEMA='talos.cli.provider-state.v1';
/** One hour, the order of hermes' `_PROVIDER_MODELS_CACHE_TTL` (models.py:1772); revalidated in the background. */
export const DEFAULT_PROVIDER_STATE_TTL_MS=60*60*1_000;

export type ProviderStateValue='available'|'unavailable'|'unverified';
export type ProviderStateEntry={state:ProviderStateValue;verified:boolean|null;checkedAt:number;latencyMs:number|null};
export type ProviderStateSnapshot={missing:boolean;savedAt:number|null;providers:Record<string,ProviderStateEntry>};

const STATES:ReadonlySet<string>=new Set(['available','unavailable','unverified']);

function entryOf(value:unknown):ProviderStateEntry|null{
  if(!value||typeof value!=='object')return null;
  const row=value as Record<string,unknown>;
  if(typeof row.state!=='string'||!STATES.has(row.state))return null;
  if(typeof row.checkedAt!=='number'||!Number.isFinite(row.checkedAt)||row.checkedAt<=0)return null;
  if(row.verified!==null&&typeof row.verified!=='boolean')return null;
  if(row.latencyMs!==null&&(typeof row.latencyMs!=='number'||!Number.isFinite(row.latencyMs)||row.latencyMs<0))return null;
  return{state:row.state as ProviderStateValue,verified:row.verified as boolean|null,checkedAt:row.checkedAt,latencyMs:row.latencyMs as number|null};
}

/** Reads `<cacheRoot>/provider-state.json` (talos-composition wires it there); every failure is a missing snapshot (never a state, never a throw). */
export function readProviderStateSnapshot({file}: {file:string}):ProviderStateSnapshot{
  let text:string;
  try{text=readFileSync(file,'utf8');}
  catch{return{missing:true,savedAt:null,providers:{}};}
  let value:unknown=null;
  try{value=JSON.parse(text);}catch{return{missing:true,savedAt:null,providers:{}};}
  if(!value||typeof value!=='object')return{missing:true,savedAt:null,providers:{}};
  const row=value as Record<string,unknown>;
  if(row.schema!==PROVIDER_STATE_SCHEMA)return{missing:true,savedAt:null,providers:{}};
  const savedAt=typeof row.savedAt==='number'&&Number.isFinite(row.savedAt)&&row.savedAt>0?row.savedAt:null;
  const providers:Record<string,ProviderStateEntry>={};
  const entries=row.providers;
  if(entries&&typeof entries==='object'){
    for(const [id,entry] of Object.entries(entries as Record<string,unknown>)){
      const parsed=entryOf(entry);
      if(parsed)providers[id]=parsed;
    }
  }
  return{missing:savedAt===null&&Object.keys(providers).length===0,savedAt,providers};
}

/** Writes the snapshot atomically (temp file + rename, mode 0600); a failure is `false`, never a throw. */
export function writeProviderStateSnapshot({file,now=Date.now(),providers}:{file:string;now?:number;providers:Record<string,ProviderStateEntry>}):boolean{
  const clean:Record<string,ProviderStateEntry>={};
  for(const [id,entry] of Object.entries(providers??{})){
    const parsed=entryOf(entry);
    if(parsed)clean[id]=parsed;
  }
  const payload=`${JSON.stringify({schema:PROVIDER_STATE_SCHEMA,savedAt:now,providers:clean},null,2)}\n`;
  const temporary=`${file}.tmp-${process.pid}-${now}`;
  try{
    /* No directory is invented here: the snapshot lives in `cacheRoot`, which `ensureCliPaths` creates before the composition builds. */
    writeFileSync(temporary,payload,{encoding:'utf8',mode:0o600});
    renameSync(temporary,file);
    return true;
  }catch{
    try{rmSync(temporary,{force:true});}catch{/* never created */}
    return false;
  }
}

/** `checkedAt` within `ttlMs` of `now`; an entry without a readable `checkedAt` is never fresh; a `checkedAt` in the future (clock skew, hand-edited file) is never fresh either — it must not pin «verified». */
export function isProviderStateFresh(entry:ProviderStateEntry|null|undefined,now:number,ttlMs:number=DEFAULT_PROVIDER_STATE_TTL_MS):boolean{
  if(!entry||typeof entry.checkedAt!=='number'||!Number.isFinite(entry.checkedAt)||entry.checkedAt<=0)return false;
  if(entry.checkedAt>now)return false;
  return now-entry.checkedAt<ttlMs;
}

/**
 * The one reading of an entry that may put «verified» on the screen (review of 0.6.2, 13/10/2026, B1): the provider answered AND
 * nobody said its key was left unjudged. `verified` is the kernel's three-state verdict (`provider-probe.mjs`, CLI-REQ-06):
 * `true` the provider accepted a request made with this key, `null` there was no key to judge (a local engine), `false` the
 * provider was reached and said nothing of the key. Freshness is the caller's clock (`isProviderStateFresh`), asked separately.
 * ⛔ A file written before this review holds `available` + `false` for a local engine too (the old reduction turned `null` into
 * `false`): it does not vouch, so it is checked again at the next start (catalog-service.ts) instead of reading «verified» unseen.
 */
export function providerStateVouches(entry:Pick<ProviderStateEntry,'state'|'verified'>|null|undefined):boolean{
  return Boolean(entry)&&entry!.state==='available'&&entry!.verified!==false;
}

/**
 * The kernel probe's answer (`provider-probe.mjs`), reduced to what the snapshot may hold — four fields, never the
 * probe's `motivo` text and never anything credential-shaped. `collegato` reached the provider; whether it judged the
 * key is `credenzialeVerificata`, by the kernel's written contract (CLI-REQ-06, provider-probe.mjs:240-250): `true` the provider
 * accepted a request made with THIS key; `false` with `collegato` a PUBLIC catalogue was reached, which says nothing of the key
 * (deepinfra, novita, ollama-cloud, huggingface; the external agent, initialized and closed); `null` there was nothing to judge
 * (no key: a local engine). `non-provabile`/`non-sondabile` are not failures: they are «not verified», declared.
 * Review of 0.6.2 (13/10/2026, B1): reached-but-not-judged is the STATE «unverified», so no reader of `state` alone can call it
 * verified; and «nothing to judge» stays `null` (it was turned into `false`, which a keyless local engine could never get out of).
 */
export function providerStateFromProbe(result:unknown,now:number=Date.now()):ProviderStateEntry|null{
  if(!result||typeof result!=='object')return null;
  const row=result as Record<string,unknown>;
  const esito=typeof row.esito==='string'?row.esito:'';
  const latency=Number.isFinite(row.millisecondi)&&Number(row.millisecondi)>=0?Number(row.millisecondi):null;
  const verified=typeof row.credenzialeVerificata==='boolean'?(row.credenzialeVerificata as boolean):null;
  const state:ProviderStateValue|null=
    esito==='collegato'?(verified===false?'unverified':'available'):
    esito==='irraggiungibile'||esito==='non-autorizzato'||esito==='errore'?'unavailable':
    esito==='non-provabile'||esito==='non-sondabile'?'unverified':
    null;
  if(state===null)return null;
  return{state,verified,checkedAt:now,latencyMs:latency};
}

/** The CLI control-plane's health observation (an already-run probe), reduced the same way: `credentialVerified` is the probe's
 *  verdict as `provider/health.ts` carries it (absent on an observation nobody probed: nothing was judged). */
export function providerStateFromHealth(health:{state?:unknown;latencyMs?:unknown;credentialVerified?:unknown}|null|undefined,now:number=Date.now()):ProviderStateEntry|null{
  if(!health)return null;
  const state=typeof health.state==='string'?health.state:'';
  const verified=typeof health.credentialVerified==='boolean'?health.credentialVerified:null;
  const mapped:ProviderStateValue|null=
    state==='available'?(verified===false?'unverified':'available'):
    state==='auth-failed'||state==='access-denied'||state==='unreachable'||state==='error'?'unavailable':
    state==='unconfigured'||state==='unprobeable'||state==='unknown'?'unverified':
    null;
  if(mapped===null)return null;
  const latency=Number.isFinite(health.latencyMs)&&Number(health.latencyMs)>=0?Number(health.latencyMs):null;
  return{state:mapped,verified,checkedAt:now,latencyMs:latency};
}

