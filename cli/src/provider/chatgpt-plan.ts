/*
 * «Continue with ChatGPT» in the CLI (owner 13/10/2026; the desktop has it since 0.1.29). The person signs in once in the system
 * browser and the models of their ChatGPT plan are used like any other provider's; the OpenAI API key stays what it is, another way of
 * paying, and the two are never mixed.
 *
 * The sign-in is the kernel's own, used as it is: the arithmetic (`chatgpt-oauth.mjs`), the flow from the first request to the stored
 * session (`chatgpt-accesso.mjs`: loopback on 127.0.0.1 and a port the system picks, PKCE S256, state, nonce, the id token verified
 * against OpenAI's keys, renewal, revocation), the custody in pieces (`chatgpt-custodia.mjs`), the plan's model list
 * (`chatgpt-rotte.mjs`) and the usage count (`chatgpt-uso.mjs`). Sources and the live proof of 11/10/2026:
 * the desktop's ChatGPT sign-in plan of 11/10/2026 (§2 and §10).
 *
 * What the CLI adds:
 *  - ITS OWN CUSTODY. The keyring service is `talos-cli-chatgpt` (the kernel's `talos-harness-chatgpt` through the CLI's remap), so
 *    the CLI and the desktop each hold their own session. Sharing one would make two programs that do not know each other renew the
 *    same refresh token, which rotates at every use: the loser gets "already used" and deletes a session that is good.
 *  - ONE RENEWAL AT A TIME ACROSS PROCESSES. The kernel already renews once per process; two TALOS open at the same time are two
 *    processes. Before a renewal this file takes a lock in the data folder and only then asks the kernel for the token: the kernel
 *    reads the custody again, so the second TALOS finds the session the first one just renewed and sends nothing. The same three
 *    defences as the others: Hermes takes a cross-process lock and saves by compare-and-swap (hermes_cli/auth_codex.py:102-111 and
 *    :227, clone of 07/10/2026), Pi locks its auth file with proper-lockfile (packages/coding-agent/src/core/auth-storage.ts:69-102),
 *    Codex reloads what another process may have renewed before renewing (codex-rs/login/src/auth/manager.rs:1855-1997).
 *  - A lock that cannot be taken is a renewal that could not start (`CHATGPT_RINNOVO_FALLITO`, "try again"), never a lost session.
 */
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {closeSync,existsSync,mkdirSync,openSync,readFileSync,renameSync,rmSync,statSync,writeFileSync,writeSync} from 'node:fs';
import {join} from 'node:path';
import {importTalosModule} from '../runtime/repo.ts';
import type {KeyringAdapter} from './store.ts';

/** The CLI's keyring service for the plan (what the kernel's `talos-harness-chatgpt` becomes through `scopeCliKeyring`). */
export const CHATGPT_KEYRING_SERVICE='talos-cli-chatgpt';
export const CHATGPT_PROVIDER='chatgpt';
export const REFRESH_LOCK_FILE='chatgpt-renewal.lock';
export const USAGE_FILE='chatgpt-usage.json';
/** F-Y-003: the sign-in under way on this profile, across TALOS processes (pid, token, when). */
export const SIGN_IN_FILE='chatgpt-sign-in.json';
/** How often a waiting sign-in looks whether a newer one replaced it. */
export const SIGN_IN_WATCH_MS=500;
function writeFileAtomic(file:string,text:string){const temporary=`${file}.${process.pid}.tmp`;writeFileSync(temporary,text,'utf8');try{renameSync(temporary,file);}catch(error){rmSync(temporary,{force:true});throw error;}}
/** The token of the sign-in the file names; undefined when there is no readable file (then nobody replaced anyone). */
function readSignInMark(file:string):string|undefined{try{const row=JSON.parse(readFileSync(file,'utf8'));return typeof row?.token==='string'?row.token:undefined;}catch{return undefined;}}
/*
 * The renewal lock (bugfixer review of 13/10/2026, findings 2 and 3). What the first version got wrong, and what holds now:
 *  - ⛔ A lock is NEVER taken over because it is a minute old: the kernel's requests have no time limit of their own, and a
 *    renewal on a stalled network (or a laptop put to sleep in the middle) is alive and may already have used the refresh token.
 *    Taking it over sent the same token twice: the loser got "already used" and deleted a session that was good. A lock is
 *    abandoned when its writer's process is gone, or when nothing readable was written and the file is old (the writer died, or
 *    the disk was full, between creating and writing), or beyond `staleMs`, a bound far past any renewal.
 *  - The takeover is done under a SECOND exclusive file and the lock is read again there before it is removed: two TALOS that
 *    both judged the same lock abandoned no longer remove each other's fresh one (the first read-then-remove was not atomic).
 *  - A lock carries a token of its own and is released only while it still carries it.
 *  - A lock that could be created but not written is removed, not left empty for every later renewal to wait on.
 * The same shape as proper-lockfile (what Pi locks its auth file with): a stale lock is judged by time AND the takeover is
 * serialised; Hermes holds an OS lock, which the dead process gives back by itself.
 */
const LOCK_DEFAULTS=Object.freeze({staleMs:600_000,unreadableMs:5_000,retryMs:50,timeoutMs:30_000});
export type RenewalLockOptions={/** beyond this a lock is abandoned whoever wrote it */staleMs?:number;/** an empty or unreadable lock (or takeover) file older than this was left by a TALOS that died */unreadableMs?:number;retryMs?:number;timeoutMs?:number};
export const TAKEOVER_SUFFIX='.takeover';

export type ChatgptPlanState={connected:boolean;email:string|null;planEnabled:boolean;signingIn:boolean;usageUrl:string};
export type ChatgptSignInOutcome={ok:true;email:string|null;planEnabled:boolean}|{ok:false;code:string};
export type ChatgptPlanModel={id:string;nome:string;provider:string;contextLength:number|null;[key:string]:unknown};
export type ChatgptPlan={
  /** What a screen may know. Never a token. */
  state():ChatgptPlanState;
  /** Opens a sign-in: the address for the system browser (never with a token in it), the promise of how it ended, and its own
   *  cancel. A second start closes the first; starts are taken one at a time. */
  start(input?:{consent?:boolean}):Promise<{url:string;expiresInMs:number;outcome:Promise<ChatgptSignInOutcome>;cancel():void}>;
  /** Cancels the sign-in under way, whichever it is. */
  cancel():void;
  /** The access token for one request, renewed when due — once, whatever the number of TALOS running. */
  accessToken():Promise<string>;
  signOut():Promise<{revoked:boolean}>;
  /** The models the plan lists for this account (`chatgpt:<slug>`), read from OpenAI with the plan's token. */
  models(input?:{reload?:boolean;/** ends the list's request when it ends (the status row's check, a picker that was closed) */signal?:AbortSignal}):Promise<ChatgptPlanModel[]>;
  /** Ends the reads still on their way to OpenAI (see `boundedPlanFetch`): the screen left, or the run ended. Never a renewal. */
  stopRequests():void;
  /** Waits, at most `limitMs`, for the token work on its way (see `TOKEN_WORK_EXIT_LIMIT_MS`): what the exit awaits before it leaves. */
  settleTokenWork(input?:{limitMs?:number}):Promise<TokenWorkSettled>;
  recordUsage(entry:unknown):void;
  recordLimits(entry:unknown):void;
  /** What TALOS itself sent through the plan in the last five hours and seven days, and the limits the service last declared. */
  usage():{cinqueOre:{richieste:number;token:number;senzaMisura:number};setteGiorni:{richieste:number;token:number;senzaMisura:number};limits:unknown}|null;
  /** The kernel's own access object, for the kernel hosts that take it (`creaOspiteFornitori({accessoChatgpt})`). */
  readonly kernelAccess:unknown;
};

function failure(message:string,code:string):Error{return Object.assign(new Error(message),{code});}

/*
 * Second review of 0.6.2 (13/10/2026, B1): the kernel sends the plan's own requests with no signal and no time limit
 * (`chatgpt-rotte.mjs` `elenca`, `chatgpt-accesso.mjs` `chiedi`), so the status row's check of the plan — and the window asked at
 * the start of a turn (runtime/plan-window.ts) — left a request that nothing could stop: the screen was gone and the process
 * waited for OpenAI. Everything the plan sends passes here, and a READ that came with no signal of its own gets one:
 *   · a time limit (`PLAN_REQUEST_LIMIT_MS`): a list, the discovery document, the signing keys are small answers;
 *   · the signal of whoever asked, when they gave one (`run`: the check's own controller, a picker's);
 *   · `stop`, for whoever ends everything at once (the screen that leaves, the run that ends).
 * What is NOT touched, and why:
 *   · a model's turn never passes here: the kernel's model destination sends the Responses stream itself and takes from the plan
 *     only the token (talos-composition.ts `leggiTokenDelPiano`), so no limit of this file can cut a turn that runs for minutes
 *     (pinned in test/provider/chatgpt-plan-requests.test.ts and by the turn tests of chatgpt-cli.test.ts);
 *   · a request that WRITES (the token exchange, a renewal, a revocation: every POST). The refresh token rotates at each use: a
 *     renewal ended on its way may already have spent it, and the session would be lost for a screen that closed. At exit
 *     these are WAITED for, bounded (`TOKEN_WORK_EXIT_LIMIT_MS` below, third review of 0.6.2); only one that still has not
 *     answered by then is left to the backstop (runtime/exit-backstop.ts), which ends the process;
 *   · a request that came with its own signal.
 * ⛔ The kernel side belongs to harness-ui: `elenca` and `chiedi` should take a signal and a time limit of their own.
 */
export const PLAN_REQUEST_LIMIT_MS=30_000;
/*
 * Third review of 0.6.2 (13/10/2026, S1). The requests that write are not stopped (above), and nothing awaited them at exit either:
 * `main` closed the runtime, which stopped the READS, and returned; two seconds later the exit backstop ended the process. A
 * renewal whose answer was later than that had already rotated the refresh token at OpenAI, and the new one was never stored: the
 * person was signed out at the next renewal. So the plan keeps the token work on its way — a renewal, a sign-in from its exchange
 * to the stored session, a sign-out — and `settleTokenWork` waits for it; closing the runtime calls it BEFORE it returns
 * (talos-composition.ts), so `main` has awaited it before the backstop is armed, for the screen and for `-p` alike.
 * The wait is bounded: an OpenAI that never answers holds the exit this long and no longer (then the backstop's two seconds).
 * Fifteen seconds: a token answer is small and normally takes well under a second; the kernel's own request has no limit.
 * ⛔ The bound's timer is NOT unref'd: with a request that keeps nothing alive (a test's, a broken socket) the event loop would
 * empty while `main` still awaits, and the process would end as a command that never finished (runtime/unfinished-command.ts).
 */
export const TOKEN_WORK_EXIT_LIMIT_MS=15_000;
/*
 * Fourth review of 0.6.2 (13/10/2026). S-1: the wait above is silent — the screen has left and the terminal sits with nothing
 * printed, which reads as a hang: after about a second the person is told what TALOS is finishing (talos-composition.ts, on
 * stderr, so a `-p` answer on stdout is untouched). S-2: the supervisor replaces a runtime by closing the old one; there a
 * renewal on its way holds the retry two seconds, not fifteen (the new runtime reads the session the old one stores, or renews
 * again under the lock).
 */
export const TOKEN_WORK_NOTICE_MS=1_000;
export const TOKEN_WORK_REPLACE_LIMIT_MS=2_000;
/*
 * Review of 0.6.3 (13/10/2026, S4). A replaced runtime waits only two seconds: token work still on its way then belongs to no
 * runtime any more, and a quit while it is out could be cut by the exit backstop — the lost session S1 closed. It is kept here,
 * for the process, and the next close (the person's exit) waits for it with the same bound. Each kept promise is one plan's
 * `settleTokenWork()`, which ends by itself at its own bound, so nothing stays here for ever.
 */
const leftBehind=new Set<Promise<unknown>>();
export function keepLeftBehind(work:Promise<unknown>):void{
  const kept=work.then(()=>{},()=>{}).finally(()=>{leftBehind.delete(kept);});leftBehind.add(kept);
}
export async function settleLeftBehind({limitMs=TOKEN_WORK_EXIT_LIMIT_MS}:{limitMs?:number}={}):Promise<TokenWorkSettled>{
  if(leftBehind.size===0)return{waited:false,timedOut:false};
  const BOUND=Symbol('bound');let timer:ReturnType<typeof setTimeout>|undefined;
  /* not unref'd, as in `settleTokenWork`: cleared the moment the work has ended */
  const bound=new Promise<typeof BOUND>(resolve=>{timer=setTimeout(()=>resolve(BOUND),limitMs);});
  try{return await Promise.race([Promise.all([...leftBehind]),bound])===BOUND?{waited:true,timedOut:true}:{waited:true,timedOut:false};}
  finally{if(timer!==undefined)clearTimeout(timer);}
}
/*
 * After the review of 0.6.3 (14/10/2026), item 2a. The exit's notice goes to stderr while the exit waits; when what read stderr
 * is already gone (a pipe closed by the program that ran `talos -p`, a terminal that went away) the write fails with EPIPE, which
 * Node reports as an 'error' event on the stream — with nobody listening, an uncaught exception that crashed the exit in the
 * middle of the wait (measured on Windows, Node 24: exit code 1). The `try` around `say` cannot catch it: the event comes later.
 * A stream already ended is not written to; a write that fails is swallowed by a listener kept until the stream reports it.
 */
export function writeExitNotice(text:string,stream:NodeJS.WritableStream=process.stderr):void{
  const target=stream as NodeJS.WritableStream&{destroyed?:boolean;writable?:boolean};
  if(target.destroyed===true||target.writable===false)return;
  const swallow=()=>{/* a notice is an extra: never the end of the exit */};
  try{
    target.on('error',swallow);
    target.write(text,error=>{if(!error)target.off('error',swallow);});
  }catch{/* written to a stream that ended meanwhile */}
}
/** The work's own answer; `say` is called once if the work is still on its way after `afterMs` (a `say` that throws is ignored). */
export async function sayIfSlow<T>(work:Promise<T>,afterMs:number,say:()=>void):Promise<T>{
  const timer=setTimeout(()=>{try{say();}catch{/* a notice is an extra: never the answer */}},afterMs);
  (timer as {unref?:()=>void}).unref?.();
  try{return await work;}finally{clearTimeout(timer);}
}
export type TokenWorkSettled={/** something was on its way */waited:boolean;/** and still was at the bound */timedOut:boolean};
export function boundedPlanFetch(send:typeof fetch,{limitMs=PLAN_REQUEST_LIMIT_MS,onWrite}:{limitMs?:number;/** told of every request that writes (never stopped, never bounded here), with what it was sent with */onWrite?:(request:Promise<unknown>,init:any)=>void}={}):{fetchImpl:typeof fetch;run<T>(signal:AbortSignal|undefined,work:()=>Promise<T>):Promise<T>;stop():void}{
  const asked=new AsyncLocalStorage<AbortSignal>();
  const inFlight=new Set<AbortController>();
  const fetchImpl=(async(input:any,init:any={})=>{
    const method=String(init?.method??(typeof input==='object'&&input&&'method' in input?input.method:'GET')).toUpperCase();
    if(method!=='GET'){const request=send(input,init);try{onWrite?.(request,init);}catch{/* the request goes on */}return request;}
    if(init?.signal)return send(input,init);
    const own=new AbortController();inFlight.add(own);
    const caller=asked.getStore();
    /* `AbortSignal.timeout` does not keep the process alive by itself (Node: its timer is unref'd) */
    const signal=AbortSignal.any([own.signal,AbortSignal.timeout(limitMs),...(caller?[caller]:[])]);
    try{return await send(input,{...init,signal});}
    finally{inFlight.delete(own);}
  }) as typeof fetch;
  return{
    fetchImpl,
    run:(signal,work)=>signal?asked.run(signal,work):work(),
    stop(){for(const request of [...inFlight]){inFlight.delete(request);try{request.abort();}catch{/* already ended */}}},
  };
}
function processAlive(pid:unknown):boolean{
  if(!Number.isSafeInteger(pid)||(pid as number)<=0)return false;
  try{process.kill(pid as number,0);return true;}catch(error){return (error as NodeJS.ErrnoException)?.code==='EPERM';}
}
type LockHolder={pid?:unknown;at?:unknown;token?:unknown};
function readHolder(file:string):LockHolder|null{try{const holder=JSON.parse(readFileSync(file,'utf8'));return holder&&typeof holder==='object'?holder:null;}catch{return null;}}
function fileAge(file:string):number|null{try{return Date.now()-statSync(file).mtimeMs;}catch{return null;}}
/** Creates `file` with `content` only if it is not there: true when created, false when it exists. A file created but not written is removed. */
function createExclusive(file:string,content:string):boolean{
  let fd:number;
  try{fd=openSync(file,'wx');}catch(error){if((error as NodeJS.ErrnoException)?.code==='EEXIST')return false;throw error;}
  try{writeSync(fd,content);}
  catch(error){try{closeSync(fd);}catch{/* already closed */}try{rmSync(file,{force:true});}catch{/* the next renewal takes an old empty file over */}throw error;}
  closeSync(fd);return true;
}
/** Whether the lock was left by a TALOS that is not renewing any more. A file that is gone is not: the loop simply tries again. */
function abandoned(file:string,options:Required<RenewalLockOptions>):boolean{
  const holder=readHolder(file);
  if(!holder||typeof holder.at!=='number'){const age=fileAge(file);return age!==null&&age>options.unreadableMs;}/* being written, or never written */
  return !processAlive(holder.pid)||Date.now()-holder.at>options.staleMs;
}
/** Removes an abandoned lock, one TALOS at a time: under the takeover file the lock is read AGAIN, so a fresh one is never removed. */
function takeOver(file:string,options:Required<RenewalLockOptions>):void{
  const guard=file+TAKEOVER_SUFFIX;let mine=false;
  try{mine=createExclusive(guard,JSON.stringify({pid:process.pid,at:Date.now()}));}catch{return;}
  if(!mine){
    /* a takeover lasts a few file operations: one that is old was left by a TALOS that died inside it */
    const age=fileAge(guard);if(age!==null&&age>options.unreadableMs){try{rmSync(guard,{force:true});}catch{/* another TALOS removed it first */}}
    return;
  }
  try{if(abandoned(file,options))rmSync(file,{force:true});}
  catch{/* it stays: the next look tries again */}
  finally{try{rmSync(guard,{force:true});}catch{/* an old takeover file is removed by the next one */}}
}

/** Runs `work` holding the renewal lock of this data folder. Only an abandoned lock is taken over (see above). */
async function withRenewalLock<T>(dataRoot:string,options:Required<RenewalLockOptions>,work:()=>Promise<T>):Promise<T>{
  const file=join(dataRoot,REFRESH_LOCK_FILE);
  const started=Date.now();const token=randomUUID();
  for(;;){
    let created=false;
    try{mkdirSync(dataRoot,{recursive:true});created=createExclusive(file,JSON.stringify({pid:process.pid,at:Date.now(),token}));}
    catch{throw failure('The ChatGPT session could not be renewed.','CHATGPT_RINNOVO_FALLITO');}
    if(created)break;
    if(abandoned(file,options)){takeOver(file,options);if(!existsSync(file))continue;}
    if(Date.now()-started>=options.timeoutMs)throw failure('The ChatGPT session could not be renewed.','CHATGPT_RINNOVO_FALLITO');
    await new Promise(resolve=>setTimeout(resolve,options.retryMs));
  }
  try{return await work();}
  finally{try{if(readHolder(file)?.token===token)rmSync(file,{force:true});}catch{/* an abandoned lock is taken over by the next renewal */}}
}

/**
 * The plan for this profile, or null when it cannot be connected here (no keyring: the tokens are kept nowhere else).
 * `fetchImpl` and `clock` are for tests; production uses the global fetch and the system clock.
 */
export async function openChatgptPlan({repoRoot,keyring,dataRoot,fetchImpl,clock,lock,signInTimeoutMs}:{repoRoot:string;keyring:KeyringAdapter|null|undefined;dataRoot:string;fetchImpl?:typeof fetch;clock?:()=>number;lock?:RenewalLockOptions;/** tests: how long a sign-in waits for the browser (the kernel's ten minutes otherwise) */signInTimeoutMs?:number}):Promise<ChatgptPlan|null>{
  if(!keyring)return null;
  const [access,custody,oauth,routes,usageModule]:any[]=await Promise.all([
    importTalosModule(repoRoot,'chatgpt-accesso.mjs'),importTalosModule(repoRoot,'chatgpt-custodia.mjs'),importTalosModule(repoRoot,'chatgpt-oauth.mjs'),
    importTalosModule(repoRoot,'chatgpt-rotte.mjs'),importTalosModule(repoRoot,'chatgpt-uso.mjs')]);
  const now=clock??(()=>Date.now());
  /* B1 (second review of 0.6.2): the fetch is looked up at each request, as the kernel's default was meant to be */
  /* S1 (third review of 0.6.2): the token work on its way — see `TOKEN_WORK_EXIT_LIMIT_MS`. Each entry settles when its work has
     ended either way, and takes itself out. */
  const tokenWork=new Set<Promise<void>>();
  const holds=<T>(work:Promise<T>):Promise<T>=>{const done:Promise<void>=work.then(()=>{},()=>{}).then(()=>{tokenWork.delete(done);});tokenWork.add(done);return work;};
  /* the sign-in under way as the kernel settles it: the exchange, the identity checked, the session stored. It is held only from
     the moment its exchange is sent — before that it waits for the browser, for up to ten minutes, and stores nothing */
  let signInEnd:Promise<unknown>|null=null;
  const isExchange=(init:any)=>typeof init?.body==='string'&&new URLSearchParams(init.body).get('grant_type')==='authorization_code';
  const requests=boundedPlanFetch(fetchImpl??((input:any,init?:any)=>globalThis.fetch(input,init)) as typeof fetch,
    {onWrite:(request,init)=>{holds(request);if(signInEnd&&isExchange(init))holds(signInEnd);}});
  const vault=custody.creaCustodiaChatgpt({keyring});
  const usageLog=usageModule.creaRegistroUsoChatgpt({file:join(dataRoot,USAGE_FILE)});
  const kernel=usageModule.accessoConUso(access.creaAccessoChatgpt({custodia:vault,fetchDiRete:requests.fetchImpl,clock:now,...(signInTimeoutMs?{tettoMs:signInTimeoutMs}:{})}),usageLog);
  /* The sign-in under way. ⛔ The kernel's own promise never settles when the attempt is cancelled or runs out of time (its
     listener is closed and nobody answers): a command waiting on it would wait for ever. Here every sign-in ENDS: with the
     kernel's outcome, with "cancelled", or with "took too long" a moment after the kernel closed its listener. */
  let attempt:{end:(outcome:ChatgptSignInOutcome)=>void}|null=null;
  /* F-Y-003 (stress test of 0.6.4, S3): a second `provider login chatgpt` in ANOTHER TALOS left the first one waiting on its own
     listener — two sign-ins on one profile. The kernel closes the earlier attempt only inside one process. Across processes the
     sign-in under way is named in one small file of the data folder (pid, a random token, when; nothing secret), and the attempt
     it no longer names closes itself: a newer sign-in replaces it, as Codex's login server does with its `/cancel` request to the
     one already listening (codex-rs/login/src/server.rs). A file left by a TALOS that died is simply overwritten. */
  const signInFile=join(dataRoot,SIGN_IN_FILE);
  const lockOptions={...LOCK_DEFAULTS,...(lock??{})};
  let starting:Promise<unknown>=Promise.resolve();
  const begin=async(consent:boolean)=>{
    /* a second start closes the first (the kernel closes its listener): the first one is told */
    attempt?.end({ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'});
    const started=await kernel.inizia({consenso:consent});
    signInEnd=Promise.resolve(started.esito);
    const mark=randomUUID();let watch:ReturnType<typeof setInterval>|undefined;
    /* the second review of 0.6.6 (N8): a mark that could not be written (the other TALOS reading the file: EPERM on Windows) must not
       start the watch, or the watch reads the OLD mark and closes this, the newer sign-in; three tries, then no watch */
    let marked=false;
    for(let tries=0;tries<3&&!marked;tries++){try{mkdirSync(dataRoot,{recursive:true});writeFileAtomic(signInFile,JSON.stringify({pid:process.pid,token:mark,at:now()}));marked=true;}catch{/* without the file the sign-in still works; it is only not replaced from another TALOS */}}
    const expiresInMs=Number(started.scadeTraMs);
    let ended=false;let timer:ReturnType<typeof setTimeout>|undefined;let end!:(outcome:ChatgptSignInOutcome)=>void;
    const outcome=new Promise<ChatgptSignInOutcome>(resolve=>{end=result=>{
      if(ended)return;ended=true;if(timer!==undefined)clearTimeout(timer);if(watch!==undefined)clearInterval(watch);if(attempt?.end===end)attempt=null;
      try{if(readSignInMark(signInFile)===mark)rmSync(signInFile,{force:true});}catch{/* the next sign-in overwrites it */}
      catalog.dimentica();resolve(result);
    };});
    attempt={end};
    /* not unref'd: `talos provider login chatgpt` must still be there to say it took too long; cleared the moment it ends */
    /* since r4 dbae665ea the kernel ends the attempt itself with this code; the timer stays as the net under it */
    timer=setTimeout(()=>end({ok:false,code:'CHATGPT_TENTATIVO_SCADUTO'}),expiresInMs+250);
    /* F-Y-003: replaced by a sign-in in another TALOS ⇒ this one's listener closes and the person is told where the new one is */
    if(marked){
      watch=setInterval(()=>{const named=readSignInMark(signInFile);if(named!==undefined&&named!==mark){if(attempt?.end===end)kernel.annulla();end({ok:false,code:'CHATGPT_SIGN_IN_REPLACED'});}},SIGN_IN_WATCH_MS);
      watch.unref?.();
    }
    void Promise.resolve(started.esito).then((result:any)=>end(result?.ok===true
      ?{ok:true,email:result.email??null,planEnabled:result.pianoAbilitato===true}
      :{ok:false,code:String(result?.codice??result?.code??'CHATGPT_ERRORE')}),()=>end({ok:false,code:'CHATGPT_ERRORE'}));
    /* ⛔ Finding 1 (13/10/2026): signed in already, the kernel adds `id_token_hint` — the previous identity token, a signed JWT with
       the person's email — to the address, and the address is printed, shown and noted in the conversation. It is optional
       (developers.openai.com/siwc/token-sharing-open-source/sign-in, as the kernel's header quotes it), so it is taken out before
       the address leaves this file; `login_hint` (the email the person already sees) stays. */
    const address=new URL(String(started.indirizzo));address.searchParams.delete('id_token_hint');
    /* its own cancel (finding 9): the kernel's listener only while this is still the attempt under way, never a newer one's */
    const cancel=()=>{if(attempt?.end===end)kernel.annulla();end({ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'});};
    return{url:address.toString(),expiresInMs,outcome,cancel};
  };
  /** Whether the stored session must be renewed before its next use: the kernel's own rule, read without touching the network. */
  const renewalDue=():boolean=>{
    const session=vault.leggi('sessione');
    if(!session?.refreshToken||!session.accessToken)return false;/* not connected: the kernel says so */
    return now()>=oauth.quandoRinnovare({scadeAlle:session.scadeAlle,rinnovaNonPrimaDi:session.rinnovaNonPrimaDi});
  };
  const readToken=async():Promise<string>=>{
    if(!renewalDue())return kernel.tokenDiAccesso();
    /* under the lock the kernel reads the custody again: a session another TALOS renewed meanwhile is simply used */
    return withRenewalLock(dataRoot,lockOptions,()=>kernel.tokenDiAccesso());
  };
  /* S1: held until the token is read — with a renewal, until the new session is stored and the lock released */
  const accessToken=():Promise<string>=>holds(readToken());
  const lockedAccess={...kernel,tokenDiAccesso:()=>accessToken()};
  const catalog=routes.creaCatalogoChatgpt({accesso:lockedAccess,fetchDiRete:requests.fetchImpl,clock:now});
  return{
    state(){const s=kernel.stato();return{connected:s.collegato===true,email:s.email??null,planEnabled:s.pianoAbilitato===true,signingIn:s.accessoInCorso===true,usageUrl:String(s.consumi)};},
    /* one start at a time (finding 7, 13/10/2026): the kernel's `inizia` closes the attempt before, waits for its listener and only
       then records the new one, so two starts in flight did not see each other and the first listener stayed open for good */
    start({consent=false}:{consent?:boolean}={}){const run=starting.then(()=>begin(consent));starting=run.catch(()=>{});return run;},
    cancel(){kernel.annulla();attempt?.end({ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'});},
    accessToken,
    /* the kernel's exit closes a sign-in under way without settling it: it is told here (finding 8), not ten minutes later */
    /* S1: held too — cut between the revocation and the removal, the session would stay stored for someone who signed out */
    signOut(){return holds((async()=>{const done=await kernel.esci();attempt?.end({ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'});catalog.dimentica();return{revoked:done?.revocaConfermata===true};})());},
    async models({reload=false,signal}:{reload?:boolean;signal?:AbortSignal}={}){return await requests.run(signal,()=>catalog.elenca({rileggi:reload}));},
    stopRequests(){requests.stop();},
    async settleTokenWork({limitMs=TOKEN_WORK_EXIT_LIMIT_MS}:{limitMs?:number}={}):Promise<TokenWorkSettled>{
      if(tokenWork.size===0)return{waited:false,timedOut:false};
      const BOUND=Symbol('bound');let timer:ReturnType<typeof setTimeout>|undefined;
      /* not unref'd, on purpose (see `TOKEN_WORK_EXIT_LIMIT_MS`); cleared the moment the work has ended */
      const bound=new Promise<typeof BOUND>(resolve=>{timer=setTimeout(()=>resolve(BOUND),limitMs);});
      try{
        /* looked at again after each wait: a renewal's answer is followed by nothing, a sign-in's exchange by the rest of the sign-in */
        while(tokenWork.size>0){if(await Promise.race([Promise.all([...tokenWork]),bound])===BOUND)return{waited:true,timedOut:true};}
        return{waited:true,timedOut:false};
      }finally{if(timer!==undefined)clearTimeout(timer);}
    },
    /* the count is an extra: it never fails a request */
    recordUsage(entry){void Promise.resolve().then(()=>usageLog.registra(entry)).catch(()=>{});},
    recordLimits(entry){try{usageLog.registraLimiti(entry);}catch{/* the same */}},
    usage(){try{return{...usageLog.riepilogo(),limits:usageLog.limiti()};}catch{return null;}},
    kernelAccess:lockedAccess,
  };
}

/** The kernel's keyring service and the entry its custody writes last (`chatgpt-custodia.mjs`): there is a session when it is there. */
const KERNEL_SERVICE='talos-harness-chatgpt';
const SESSION_INDEX='sessione:indice';
const NOT_CONNECTED=Object.freeze({collegato:false,email:null,pianoAbilitato:false,accessoInCorso:false,consumi:'https://chatgpt.com/settings/usage'});
export type ChatgptPlanHandle={
  /** False without a keyring: the plan cannot be connected on this computer. */
  readonly available:boolean;
  /** Whether a session is stored: one keyring read, no kernel module loaded. */
  stored():boolean;
  /** What is known of the sign-in without waiting: null when it cannot be known (no keyring, or a session not read yet). */
  signedIn():{connected:boolean;planEnabled:boolean}|null;
  load():Promise<ChatgptPlan|null>;
  loaded():ChatgptPlan|null;
  /** Told after every sign-out, whichever door it came through (the screen, the command, the model's `chatgpt_account` tool). */
  onSignedOut(listener:()=>void):void;
  /** Signs out through the plan and tells the listeners; null when there is no plan to sign out of. */
  signOut():Promise<{revoked:boolean}|null>;
  /** Ends the plan's reads still on their way (B1, second review of 0.6.2); nothing to end when the plan was never opened. */
  stopRequests():void;
  /** Waits, bounded, for the plan's token work on its way (S1, third review of 0.6.2); nothing to wait for when the plan was never opened. Never rejects. */
  settleTokenWork(input?:{limitMs?:number}):Promise<TokenWorkSettled>;
  /** The shape the kernel's provider-tools host takes (`creaOspiteFornitori({accessoChatgpt})`), or null without a keyring. */
  readonly kernelFacade:{stato():any;esci():Promise<{revocaConfermata:boolean}>}|null;
};
/**
 * The plan, opened when it is first needed. A TALOS where nobody signed in loads none of the five kernel modules and reads one
 * keyring entry (the start-up budget of 0.5.0); the composition opens it at start only when a session is stored.
 */
export function chatgptPlanHandle({repoRoot,keyring,dataRoot,fetchImpl,clock}:{repoRoot:string;keyring:KeyringAdapter|null|undefined;dataRoot:string;fetchImpl?:typeof fetch;clock?:()=>number}):ChatgptPlanHandle{
  let plan:ChatgptPlan|null=null;let loading:Promise<ChatgptPlan|null>|null=null;
  /* Finding 12 (13/10/2026): the model's own disconnect went straight to the plan, so the provider-state snapshot kept saying
     "available" and what a test had learnt outlived the session. Every sign-out now passes here, and whoever keeps a state
     derived from the session (the catalog) is told. A listener that fails never fails the sign-out. */
  const listeners:Array<()=>void>=[];
  const signOut=async()=>{const opened=await load();if(!opened)return null;const done=await opened.signOut();for(const listener of listeners){try{listener();}catch{/* its own business */}}return done;};
  const stored=()=>{if(!keyring)return false;try{const entry=keyring.get(KERNEL_SERVICE,SESSION_INDEX);return typeof entry==='string'&&entry.length>0;}catch{return false;}};
  const load=()=>{
    if(plan||!keyring)return Promise.resolve(plan);
    loading??=openChatgptPlan({repoRoot,keyring,dataRoot,...(fetchImpl?{fetchImpl}:{}),...(clock?{clock}:{})}).then(opened=>{plan=opened;return opened;}).finally(()=>{loading=null;});
    return loading;
  };
  return{
    available:Boolean(keyring),stored,load,loaded:()=>plan,onSignedOut:listener=>{listeners.push(listener);},signOut,
    stopRequests(){try{plan?.stopRequests();}catch{/* nothing on its way */}},
    async settleTokenWork(input){try{return plan?await plan.settleTokenWork(input):{waited:false,timedOut:false};}catch{return{waited:false,timedOut:false};}},
    signedIn(){
      if(!keyring)return null;
      if(plan){try{const s=plan.state();return{connected:s.connected,planEnabled:s.planEnabled};}catch{return null;}}
      return stored()?null:{connected:false,planEnabled:false};
    },
    kernelFacade:keyring?{
      stato:()=>plan?(plan.kernelAccess as any).stato():NOT_CONNECTED,
      async esci(){const done=await signOut();return{revocaConfermata:done?.revoked===true};},
    }:null,
  };
}
