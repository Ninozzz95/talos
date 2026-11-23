/*
 * «Continue with ChatGPT» from the command line (owner 13/10/2026): `talos provider login chatgpt`, `logout chatgpt` and `status chatgpt`.
 * The person signs in in the system browser; the loopback on this machine waits for it. Interactive only, like the OpenRouter
 * sign-in (clig.dev: never require a prompt in a script). ⛔ No token is ever printed: the address, who signed in, what to do next.
 *
 * What the others print, read in the clones: Codex the address with "If your browser did not open, navigate to this URL", and
 * `codex logout` revokes (codex-rs/cli/src/login.rs:117-119 and :128, clone of 24/09/2026); OpenCode "Go to:", "Waiting for
 * authorization..." and "Login successful" (packages/opencode/src/cli/cmd/providers.ts:99-131). Codex and Hermes also offer a
 * device code for a machine with no browser (`codex login --device-auth`; hermes_cli/auth_codex.py:945-975, clone of 07/10/2026):
 * the kernel's flow has none yet, so over SSH the address is printed with what it needs, and nothing is promised.
 */
import type {CommandContext} from './context.ts';import {writeValue} from './context.ts';
import {t} from '../i18n/index.ts';
import {displayCode,hasEnglishFor} from '../i18n/error-view.ts';
import type {TuiChatgpt} from '../tui/catalog-service.ts';

/* 0.6.10 (bugfixer): CHATGPT_ERROR's own words now describe a plan REQUEST that did not complete; during a sign-in there is no
   request, so a sign-in that ends with the generic code keeps the generic sign-in sentence. */
const signInReason=(shown:string)=>shown!=='CHATGPT_ERROR'&&hasEnglishFor(shown)?t(`error.code.${shown}.what` as any):'';
/** The sentence for a sign-in that did not complete: the code's own words when the CLI has them, always the code. */
export function chatgptFailureText(code:string):string{
  const shown=displayCode(code);
  const reason=signInReason(shown);
  return reason?t('key.chatgpt.login.failed',{reason,code:shown}):t('key.chatgpt.login.failedCode',{code:shown});
}
/** The same reason alone, for a window that has one short line for it. */
export function chatgptFailureReason(code:string):string{
  return signInReason(displayCode(code))||t('screen.provider.oauthError.other');
}
/** What the screen notes after a sign-in. With the memory store (finding 4, 13/10/2026) it says how long the sign-in lasts: the
 *  tokens are in this process only, as `store.saved.memory` says of a key. */
export function chatgptSignedInNote(who:string,store:string|null|undefined):string{
  const note=t('screen.provider.signedInNote',{who});
  return store==='memory'?`${note}\n${t('screen.provider.signedInMemory')}`:note;
}
function planOf(catalog:any):TuiChatgpt{
  const plan=catalog?.chatgpt as TuiChatgpt|undefined;
  if(!plan||typeof plan.startLogin!=='function')throw Object.assign(new Error('PROVIDER_LOGIN_UNAVAILABLE'),{code:'PROVIDER_LOGIN_UNAVAILABLE'});
  return plan;
}

export async function runChatgptLogin(ctx:CommandContext,catalog:any,store:{kind?:string;testProfile?:boolean}|null=null):Promise<number>{
  const plan=planOf(catalog);
  if(!ctx.io.stdinIsTTY||!ctx.io.stdoutIsTTY)throw Object.assign(new Error('LOGIN_REQUIRES_TTY'),{code:'LOGIN_REQUIRES_TTY'});
  /* Finding 4 (bugfixer, 13/10/2026): with `credentials.store: memory` the tokens live in THIS process, and this command is one
     process that ends: it signed in for real at OpenAI, said "Signed in", and kept nothing — with a refresh token nobody would
     ever revoke and a new registration at every try. Refused before the local address opens and before anything is sent. A test
     profile is always in memory and its sign-ins are the fake's: it goes on. */
  if(store?.kind==='memory'&&store.testProfile!==true)throw Object.assign(new Error('CHATGPT_STORE_NOT_KEPT'),{code:'CHATGPT_STORE_NOT_KEPT'});
  const before=await plan.state();
  if(before?.connected&&!before.planEnabled)ctx.io.writeErr(`${t('key.chatgpt.login.plan')}\n`);
  const login=await plan.startLogin();
  const minutes=Math.max(1,Math.round(login.expiresInMs/60_000));
  ctx.io.writeErr(`${t(login.remote?'key.chatgpt.login.remote':login.opened?'key.chatgpt.login.opened':'key.chatgpt.login.open')}\n${login.url}\n${t('key.chatgpt.login.waiting',{minutes})}\n`);
  const outcome=await login.outcome;
  if(!outcome.ok){
    const code=displayCode(outcome.code);
    writeValue(ctx,{ok:false,provider:'chatgpt',code},`${chatgptFailureText(outcome.code)}\n`);return 11;
  }
  const who=outcome.email?t('key.chatgpt.who',{email:outcome.email}):'';
  if(!outcome.planEnabled){
    writeValue(ctx,{ok:false,provider:'chatgpt',code:'CHATGPT_PLAN_NOT_ENABLED',email:outcome.email,planEnabled:false},`${t('key.chatgpt.login.noPlan',{who})}\n`);return 11;
  }
  writeValue(ctx,{ok:true,provider:'chatgpt',email:outcome.email,planEnabled:true},`${t('key.chatgpt.login.signedIn',{who})}\n${t('key.chatgpt.login.next')}\n`);
  return 0;
}

/** Who is signed in, whether the plan can be used, and what TALOS itself sent through it (its own count: OpenAI's is at the address). */
export async function runChatgptStatus(ctx:CommandContext,catalog:any):Promise<number>{
  const plan=planOf(catalog);
  const state=await plan.state();
  if(!state){writeValue(ctx,{provider:'chatgpt',available:false,connected:false},`${t('key.chatgpt.tool.unavailable')}\n`);return 0;}
  if(!state.connected){writeValue(ctx,{provider:'chatgpt',available:true,connected:false},`${t('key.missing.signIn',{provider:t('key.chatgpt.planName'),id:'chatgpt'})}\n`);return 0;}
  const sent=plan.usage();
  const window=(entry:{richieste:number;token:number;senzaMisura:number}|undefined)=>({requests:entry?.richieste??0,tokens:entry?.token??0,unmeasured:entry?.senzaMisura??0});
  const usage={fiveHours:window(sent?.cinqueOre),sevenDays:window(sent?.setteGiorni)};
  const who=state.email?t('key.chatgpt.who',{email:state.email}):'';
  const lines=[t(state.planEnabled?'key.chatgpt.status.signedIn':'key.chatgpt.status.noPlan',{who}),
    t('key.chatgpt.status.sent',{fiveRequests:usage.fiveHours.requests,fiveTokens:usage.fiveHours.tokens,sevenRequests:usage.sevenDays.requests,sevenTokens:usage.sevenDays.tokens}),
    t('key.chatgpt.status.account',{url:state.usageUrl})];
  writeValue(ctx,{provider:'chatgpt',available:true,connected:true,email:state.email,planEnabled:state.planEnabled,usage,usageUrl:state.usageUrl},`${lines.join('\n')}\n`);
  return 0;
}

export async function runChatgptLogout(ctx:CommandContext,catalog:any):Promise<number>{
  const plan=planOf(catalog);
  const done=await plan.signOut();
  const text=!done.signedOut?t('key.chatgpt.logout.none'):done.revoked?t('key.chatgpt.logout.done'):t('key.chatgpt.logout.notConfirmed');
  writeValue(ctx,{ok:true,provider:'chatgpt',signedOut:done.signedOut,revoked:done.revoked},`${text}\n`);
  return 0;
}
