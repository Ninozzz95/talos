import {kernelProbeDetail,PROVIDER_AUTH_TYPES,PROVIDER_EXECUTION_VALUES} from '../i18n/kernel-map.ts';
/* F-L-001: the printed profile speaks English by value; the kernel's own words stay inside (kernel-map.ts). */
function publicProviderProfile(row:any){if(!row||typeof row!=='object')return row;const execution=typeof row.execution==='string'?PROVIDER_EXECUTION_VALUES[row.execution]??row.execution:row.execution;const type=typeof row.auth?.type==='string'?PROVIDER_AUTH_TYPES[row.auth.type]??row.auth.type:row.auth?.type;/* 14/10/2026 (B2; owner: the Z.AI key only to the address you chose): plan and balance share a host, so the row names the address */const zaiAddress=row.id===ZAI_PROVIDER?(()=>{const chosen=row.endpoint?.configured===true;const address=chosen?zaiAddressOf(row.endpoint?.value):null;return{chosen,address:address?.word??null,label:address?.label??null};})():undefined;return{...row,...(execution!==undefined?{execution}:{}),...(row.auth&&typeof row.auth==='object'?{auth:{...row.auth,type}}:{}),...(zaiAddress?{zaiAddress}:{})};}
import {lstat,mkdir,readdir} from 'node:fs/promises';import {environmentKeyNotFoundText,keyVariablesOf} from '../provider/missing-key.ts';import {join} from 'node:path';
import type {CommandContext} from './context.ts';import {projectSettingsIgnoredLine} from './any-folder.ts';import {cliProviderRegistry} from '../provider/cli-providers.ts';import {assertNoUnknownOptions,takeFlag,takeOption,writeValue} from './context.ts';import {REASONING_EFFORTS,type ReasoningEffort} from '../config/types.ts';import {importTalosModule} from '../runtime/repo.ts';import {providerExclusionsHost} from '../runtime/talos-composition.ts';import {createEnvironmentKeyConsent,providerOfModel} from '../provider/environment-keys.ts';import {t} from '../i18n/index.ts';import {ZAI_ADDRESSES,ZAI_PROVIDER,parseZaiAddress,zaiAddressChosen,zaiAddressOf} from '../provider/zai-addresses.ts';
/*
 * B1 slice 18 — the command line follows the rules of `/provider`: the store sees an environment key only after it
 * was approved (`talos provider env-key <id> --use`; nothing said means No), and `set-key` tests the key against its
 * own provider and saves it only when the test passes. The key is read through the hidden prompt, never from argv.
 */
async function runtimeContext(ctx:CommandContext){return ctx.createRuntimeContext({projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model:ctx.invocation.model??'openai:gpt-5-mini',environmentKeys:'consent'});}
function environmentKeyOf(row:any){return row&&row.environmentVariable?{variable:String(row.environmentVariable),state:row.keySource==='environment'?'approved':row.keySource==='environment-declined'?'declined':'unanswered'}:null;}
/*
 * Owner 09/10/2026 («Sì, con la carta»): the person's door on OpenRouter's excluded downstream providers, on the same host as the
 * model's tools (fornitori-per-il-modello.mjs), so both doors read and write the one list. Typing the command is the person's
 * yes: the host's preview still refuses a bad name or a full list before anything is written.
 *   talos provider exclusions                 the list, and the defaults
 *   talos provider exclude <slug> [--model <openrouter id>]
 *   talos provider allow <slug> [--model <openrouter id>]
 */
async function runProviderExclusions(ctx:CommandContext,op:string,args:string[],store:any):Promise<number>{
  const model=op==='exclusions'?undefined:takeOption(args,'--model');assertNoUnknownOptions(args);
  const slug=op==='exclusions'?undefined:args.shift();if(op!=='exclusions'&&!slug)throw new Error('PROVIDER_EXCLUSION_REQUIRES_PROVIDER');
  if(args.length)throw new Error(t('common.args.unexpected',{arg:args[0]!}));
  const factory=await providerExclusionsHost(ctx.repoRoot,store);
  if(!factory)throw Object.assign(new Error('PROVIDER_EXCLUSIONS_UNAVAILABLE'),{code:'PROVIDER_EXCLUSIONS_UNAVAILABLE'});
  const host=factory({});const name=op==='exclusions'?'provider_exclusions_list':op==='exclude'?'provider_exclude':'provider_allow';
  const input={...(slug?{provider:slug}:{}),...(model?{model}:{})};
  if(name!=='provider_exclusions_list'){const preview=await host(name,input,{fase:'anteprima'});if(!preview?.ok)throw Object.assign(new Error(String(preview?.messaggio??'PROVIDER_EXCLUSION_REFUSED')),{code:'PROVIDER_EXCLUSION_REFUSED'});}
  const done=await host(name,input,{fase:'esegui'});
  if(!done?.ok)throw Object.assign(new Error(String(done?.messaggio??'PROVIDER_EXCLUSION_REFUSED')),{code:'PROVIDER_EXCLUSION_REFUSED'});
  writeValue(ctx,{ok:true,operation:op,text:String(done.testo??'')},`${String(done.testo??'')}\n`);return 0;
}
/*
 * Owner 13/10/2026 («Sì, da qualunque cartella»): a provider command is about the person's account, not about the folder. In a
 * folder that is not trusted it runs on an empty folder of TALOS's own data instead. ⛔ The untrusted folder is never read and
 * gets no trust: the runtime is built for the neutral folder, which has nothing of a project to load. A trusted folder is used as
 * before, and any other failure is not retried. `codex login`, OpenCode's `auth login` and `gh auth login` never look at the folder.
 */
const NEUTRAL_FOLDER='no-project';
/*
 * Review of 0.6.1 (13/10/2026): the neutral folder is vouched for (`trustVerified`), so what sits in it is loaded like a trusted
 * project's. It is used only when it is a real directory (not a link: Node reports a Windows junction as one) with nothing in it;
 * anything else is refused before a runtime is built, and the folder is named on stderr so the person can look at it.
 */
async function neutralFolder(ctx:CommandContext):Promise<string>{
  const neutral=join(ctx.paths.dataRoot,NEUTRAL_FOLDER);
  const refuse=()=>{ctx.io.writeErr(`${neutral}\n`);return Object.assign(new Error('PROVIDER_NEUTRAL_FOLDER_UNSAFE'),{code:'PROVIDER_NEUTRAL_FOLDER_UNSAFE',details:{path:neutral}});};
  let found:Awaited<ReturnType<typeof lstat>>|null=null;
  try{found=await lstat(neutral);}catch(error){if((error as any)?.code!=='ENOENT')throw refuse();}
  if(!found){await mkdir(neutral,{recursive:true});try{found=await lstat(neutral);}catch{throw refuse();}}
  if(found.isSymbolicLink()||!found.isDirectory())throw refuse();
  let entries:string[];try{entries=await readdir(neutral);}catch{throw refuse();}
  if(entries.length)throw refuse();
  return neutral;
}
async function providerRuntimeContext(ctx:CommandContext){
  try{return await runtimeContext(ctx);}
  catch(error){
    const code=(error as any)?.code;if(code!=='PROJECT_TRUST_REQUIRED'&&code!=='PROJECT_TRUST_INVALIDATED')throw error;
    /* judge v1534 point 2: said in one line when nobody ever decided the folder */
    if(code==='PROJECT_TRUST_REQUIRED')ctx.io.writeErr(projectSettingsIgnoredLine());
    const neutral=await neutralFolder(ctx);
    return ctx.createRuntimeContext({projectRoot:neutral,paths:ctx.paths,repoRoot:ctx.repoRoot,model:ctx.invocation.model??'openai:gpt-5-mini',environmentKeys:'consent',trustVerified:true});
  }
}
export async function runProviderCommand(ctx:CommandContext,args0:string[]){const args=[...args0];const op=args.shift()??'list';const rc=await providerRuntimeContext(ctx);const store=rc.providerStore;const catalog=rc.tuiCatalog;if(op==='exclusions'||op==='exclude'||op==='allow')return runProviderExclusions(ctx,op,args,store);if(op==='list'){assertNoUnknownOptions(args);if(typeof rc.providerControlPlane?.list==='function'){writeValue(ctx,rc.providerControlPlane.list().map(publicProviderProfile));return 0;}const rows=store.listPublic();let providers:any[]=[];try{providers=await catalog?.listProviders?.()??[];}catch{providers=[];}writeValue(ctx,rows.map((row:any)=>({...row,environmentKey:environmentKeyOf(providers.find((p:any)=>p.id===row?.id))})));return 0;}const id=args.shift();if(!id)throw new Error('PROVIDER_REQUIRED');
/* P21 (owner decisions 2026-09-26): `talos provider login openrouter` signs in in the browser (the loopback waits for it);
   `--paste`, or a remote session, uses the code OpenRouter shows. Interactive only (clig.dev: never require a prompt in a
   script). The key that comes back is tested and saved like `set-key`'s; it is never printed. */
/* «Continue with ChatGPT» (owner 13/10/2026): the plan is signed in to and out of, never given a key. */
if(id==='chatgpt'&&(op==='login'||op==='logout'||op==='status')){assertNoUnknownOptions(args);if(args.length)throw new Error(t('common.args.unexpected',{arg:args[0]!}));const {runChatgptLogin,runChatgptLogout,runChatgptStatus}=await import('./provider-chatgpt.ts');return op==='login'?runChatgptLogin(ctx,catalog,rc.credentialStore??null):op==='logout'?runChatgptLogout(ctx,catalog):runChatgptStatus(ctx,catalog);}
if(op==='logout'||op==='status')throw Object.assign(new Error('PROVIDER_LOGOUT_UNSUPPORTED'),{code:'PROVIDER_LOGOUT_UNSUPPORTED'});
if(id==='chatgpt'&&(op==='set-key'||op==='remove-key'||op==='env-key'))throw Object.assign(new Error('PROVIDER_SIGN_IN_ONLY'),{code:'PROVIDER_SIGN_IN_ONLY'});
if(op==='login'){
  const paste=takeFlag(args,'--paste');assertNoUnknownOptions(args);
  if(id!=='openrouter')throw Object.assign(new Error('PROVIDER_LOGIN_UNSUPPORTED'),{code:'PROVIDER_LOGIN_UNSUPPORTED'});
  if(typeof catalog?.startOpenRouterLogin!=='function'||typeof catalog?.setProviderKey!=='function')throw Object.assign(new Error('PROVIDER_LOGIN_UNAVAILABLE'),{code:'PROVIDER_LOGIN_UNAVAILABLE'});
  if(!ctx.io.stdinIsTTY||!ctx.io.stdoutIsTTY)throw Object.assign(new Error('LOGIN_REQUIRES_TTY'),{code:'LOGIN_REQUIRES_TTY'});
  const login=await catalog.startOpenRouterLogin(paste?{paste:true}:{});
  if(login.mode==='paste')ctx.io.writeErr(`${t('key.login.paste')}\n${login.url}\n`);
  else ctx.io.writeErr(`${t(login.opened?'key.login.opened':'key.login.open')}\n${login.url}\n${t('key.login.waiting')}\n`);
  let key='';
  try{
    if(login.mode==='paste'){if(!ctx.io.readSecret)throw Object.assign(new Error('SECRET_INPUT_REQUIRES_TTY'),{code:'SECRET_INPUT_REQUIRES_TTY'});key=await login.submit(await ctx.io.readSecret(t('key.login.codePrompt')));}
    else key=await login.key;
  }catch(error){login.cancel();const code=String((error as any)?.code??'OAUTH_FAILED');writeValue(ctx,{ok:false,provider:id,code,...((error as any)?.status?{httpStatus:(error as any).status}:{})},`${t('key.login.failed',{code})}\n`);return 11;}
  let result:any;try{result=await catalog.setProviderKey(id,key);}finally{key='';}
  const saved=result.saved===true;
  writeValue(ctx,{ok:saved,provider:id,outcome:result.outcome,httpStatus:result.httpStatus,saved},`${t('key.login.signedIn',{message:result.message,saved:t(saved?'key.login.saved':'key.login.notSaved')})}\n`);
  return saved?0:11;
}
if(op==='set-key'){if(id===ZAI_PROVIDER)await chooseZaiAddressFirst(ctx,store,args);assertNoUnknownOptions(args);if(!ctx.io.readSecret)throw new Error('SECRET_INPUT_REQUIRES_TTY');if(typeof catalog?.setProviderKey!=='function')throw Object.assign(new Error('PROVIDER_KEY_TEST_UNAVAILABLE'),{code:'PROVIDER_KEY_TEST_UNAVAILABLE'});/* a one-token key test is stated before the key is read, so before anything is sent; nothing further is asked */const notice=typeof catalog.keyTestNotice==='function'?catalog.keyTestNotice(id):null;if(notice)ctx.io.writeErr(`${notice}\n`);let secret=await ctx.io.readSecret(`Key for ${id}: `);let result;try{result=await catalog.setProviderKey(id,secret);}finally{secret='';}const saved=result.saved===true;writeValue(ctx,{ok:saved,provider:id,outcome:result.outcome,httpStatus:result.httpStatus,saved},`${result.message} ${saved?'Saved.':'The key was not saved.'}\n`);return saved?0:11;}if(op==='env-key'){const use=takeFlag(args,'--use');const decline=takeFlag(args,'--decline');assertNoUnknownOptions(args);if(use&&decline)throw new Error('Use either --use or --decline');const row=(await catalog.listProviders()).find((p:any)=>p.id===id);if(!row)throw Object.assign(new Error('PROVIDER_INVALID'),{code:'PROVIDER_INVALID'});const answering=use||decline;if(answering&&row.environmentVariable)await catalog.answerEnvironmentKey(id,use?'yes':'no');const after=answering?(await catalog.listProviders()).find((p:any)=>p.id===id):row;const state=environmentKeyOf(after);if(!state){/* 14/10/2026: the variable to set is named (every one the store reads), not only the absence */const variables=keyVariablesOf(id);writeValue(ctx,{ok:!answering,provider:id,environmentKey:null,...(variables.length?{variables}:{})},`${environmentKeyNotFoundText(id,after?.label??id)}\n`);return answering?2:0;}writeValue(ctx,{ok:true,provider:id,environmentKey:state},`${state.variable}: ${state.state==='approved'?'used for '+after.label:state.state==='declined'?'declined, not used':'not used until approved (talos provider env-key '+id+' --use)'}\n`);return 0;}if(op==='remove-key'){assertNoUnknownOptions(args);/* review of 0.6.2 (13/10/2026, B2): through the catalog's door, which also forgets what the status row's check knew of the key that is going (the snapshot kept «verified» for up to an hour at the next start); the store directly only where there is no catalog */if(typeof catalog?.clearProviderKey==='function')await catalog.clearProviderKey(id);else store.clearKey(id);/* F-S-002 (stress test of 0.5.2, S2): an approved environment key stayed in use after "Removed"; removing the provider's key takes that approval back too (the same door as env-key --decline), and says how to use it again. */const envRow=typeof catalog?.listProviders==='function'?(await catalog.listProviders()).find((p:any)=>p.id===id):null;const envState=environmentKeyOf(envRow);const takenBack=envState?.state==='approved'&&typeof catalog?.answerEnvironmentKey==='function'?(await catalog.answerEnvironmentKey(id,'no'),envState.variable):null;rc.providerControlPlane?.invalidate?.(id);writeValue(ctx,{ok:true,provider:id,...(takenBack?{environmentKey:{variable:takenBack,state:'declined'}}:{})},`Removed key for ${id}${takenBack?t('screen.provider.envKeyTakenBack',{variable:takenBack,provider:id}):''}\n`);return 0;}if(op==='configure'){const addressWord=takeOption(args,'--address');if(addressWord!==undefined){if(id!==ZAI_PROVIDER)throw Object.assign(new Error('PROVIDER_ADDRESS_INVALID'),{code:'PROVIDER_ADDRESS_INVALID'});const address=parseZaiAddress(addressWord);if(!address)throw Object.assign(new Error('PROVIDER_ADDRESS_INVALID'),{code:'PROVIDER_ADDRESS_INVALID'});if(takeOption(args,'--endpoint')!==undefined)throw Object.assign(new Error('PROVIDER_ADDRESS_INVALID'),{code:'PROVIDER_ADDRESS_INVALID'});const timeoutRaw=takeOption(args,'--timeout');assertNoUnknownOptions(args);const timeoutSeconds=timeoutRaw===undefined?undefined:Number(timeoutRaw);if(timeoutSeconds!==undefined&&(!Number.isInteger(timeoutSeconds)||timeoutSeconds<5||timeoutSeconds>1800))throw new Error('PROVIDER_TIMEOUT_INVALID');store.setRuntime(id,{endpoint:address.endpoint,...(timeoutSeconds!==undefined?{timeoutSeconds}:{})});rc.providerControlPlane?.invalidate?.(id);writeValue(ctx,{ok:true,provider:id,address:{id:address.id,label:address.label},runtime:store.getRuntime(id)},`${t('key.zai.addressSet',{address:address.label})}\n`);return 0;}const endpoint=takeOption(args,'--endpoint');const timeoutRaw=takeOption(args,'--timeout');assertNoUnknownOptions(args);const current=store.getRuntime(id)??{};/* OWN-01 (09/10/2026): without --timeout no time is sent; the store keeps the time in use and whether the person chose it. */const timeoutSeconds=timeoutRaw===undefined?undefined:Number(timeoutRaw);if(timeoutSeconds!==undefined&&(!Number.isInteger(timeoutSeconds)||timeoutSeconds<5||timeoutSeconds>1800))throw new Error('PROVIDER_TIMEOUT_INVALID');if(endpoint===undefined&&timeoutRaw===undefined)throw new Error('PROVIDER_CONFIG_REQUIRED');/* review of 0.6.4 (S1): a time alone keeps the address in use — for Z.AI with none chosen that «chose» the default (pay-as-you-go) for the person: the address first */if(id===ZAI_PROVIDER&&endpoint===undefined&&!zaiAddressChosen(current))throw Object.assign(new Error(t('key.zai.addressRequired')),{code:'PROVIDER_ADDRESS_REQUIRED'});/* F-B-001 (stress test 08/10/2026): the store takes only endpoint, timeoutSeconds and modelli (setRuntime's list); the runtime read back carries more (provider, endpointConfigured…), so it is never passed whole. A timeout alone keeps the address in use (the saved one or the default: the store needs one for a provider that takes an address). */store.setRuntime(id,{...(endpoint!==undefined?{endpoint}:typeof current.endpoint==='string'&&current.endpoint?{endpoint:current.endpoint}:{}),...(timeoutSeconds!==undefined?{timeoutSeconds}:{})});rc.providerControlPlane?.invalidate?.(id);writeValue(ctx,{ok:true,provider:id,runtime:store.getRuntime(id)},`Configured ${id}\n`);return 0;}if(op==='test'){assertNoUnknownOptions(args);/* M5-A/M5-C: ordinary health testing never opts into token generation, and remediation is the control-plane decision. */if(typeof rc.providerControlPlane?.probe==='function'){const profile=await rc.providerControlPlane.probe(id);const health=profile.lastHealth??{};const latency=Number.isFinite(health.latencyMs)?` · ${health.latencyMs} ms`:'';/* R2 (E8 / Q-R2-7): a missing key is the one sentence, as a line of its own; the probe's free-text reason (the kernel's, Italian) is mapped by the remediation code and not printed. */const missingKey=profile.remediation?.code==='add-key';const remedy=missingKey?`${profile.remediation.message}\n`:profile.remediation?.code&&profile.remediation.code!=='none'?`Remedy: ${profile.remediation.message}\n`:'';/* R4 Q-R4-16 (a): the kernel's sentence in English by a pinned template, or not printed. */const mapped=health.detail&&!missingKey?kernelProbeDetail(String(health.detail),{label:String(profile.label??id)}):null;const detail=mapped?`${mapped}\n`:'';writeValue(ctx,missingKey?{...profile,code:'PROVIDER_KEY_MISSING'}:profile,`${profile.label??id}: ${health.state??'unknown'}${latency}\n${detail}${remedy}`);return health.state==='available'?0:11;}const probe=typeof rc.providerProbe==='function'?rc.providerProbe():(await importTalosModule(ctx.repoRoot,'provider-probe.mjs') as any).createProviderProbe({leggiChiave:(p:string)=>store.getKey(p),leggiRuntime:(p:string)=>store.getRuntime(p)});const result=await probe.prova(id);writeValue(ctx,result);return result?.esito==='collegato'?0:11;}throw new Error(`Unsupported provider operation: ${op}`);}
/*
 * R2 (gate E14, E-03): `talos model list` for a person — one row per model under English columns, never the raw JSON array; the
 * MODEL column is exactly what `talos model use` takes (OpenCode `opencode models` prints one id per line and JSON only with
 * --verbose: `packages/opencode/src/cli/cmd/models.ts:36-46` at 1d6c3c0, 2026-09-24). `--json` keeps the rows unchanged.
 */
function contextText(value:unknown):string{
  if(!Number.isFinite(value)||Number(value)<=0)return t('key.models.unknown');
  const n=Number(value);return n>=1_000_000?`${Number((n/1_000_000).toFixed(1))}M`:n>=1000?`${Math.round(n/1000)}K`:String(n);
}
function flagText(value:unknown):string{return value===true?t('key.models.yes'):value===false?t('key.models.no'):t('key.models.unknown');}
function sourceText(value:unknown):string{return t(value==='live'?'key.models.source.live':value==='configured'?'key.models.source.configured':value==='documented'?'key.models.source.documented':'key.models.source.unknown');}
/* the kinds of model list (catalog-service.ts `TuiModelListing`) whose notice asks something of the person */
const NOTICES_TO_ACT_ON:ReadonlySet<string>=new Set(['signed-out','unreachable','engine-down']);
export function modelListText(rows:readonly any[],notice?:string):string{
  const head=notice?`${notice}\n`:'';
  if(!rows.length)return `${head}${t('key.models.none')}\n`;
  const table=[[t('key.models.column.model'),t('key.models.column.context'),t('key.models.column.tools'),t('key.models.column.reasoning'),t('key.models.column.availability')],
    ...rows.map(row=>[String(row?.id??''),contextText(row?.contextWindow),flagText(row?.toolCalling),flagText(row?.reasoning),sourceText(row?.source??row?.available)])];
  const widths=table[0]!.map((_,column)=>Math.max(...table.map(line=>line[column]!.length)));
  const lines=table.map(line=>line.map((cell,column)=>column===line.length-1?cell:cell.padEnd(widths[column]!)).join('  '));
  return `${head}${lines.join('\n')}\n${t('key.models.use')}\n`;
}
export async function runModelCommand(ctx:CommandContext,args0:string[]){const args=[...args0];const op=args.shift()??'list';if(op==='effort'){const effort=args.shift();if(!effort)throw new Error('REASONING_EFFORT_REQUIRED');const scope=(takeOption(args,'--scope')??'user') as 'user'|'project-user';if(!['user','project-user'].includes(scope))throw new Error('CONFIG_SCOPE_INVALID');assertNoUnknownOptions(args);const {configSet,configUnset}=await import('../config/commands.ts');if(effort==='default'){await configUnset({paths:ctx.paths,projectRoot:ctx.projectRoot,scope,path:'reasoningEffort'});writeValue(ctx,{ok:true,reasoningEffort:null,scope},`Cleared the ${scope} reasoning-effort override; a lower-precedence setting may still apply, otherwise the model default is used.\n`);return 0;}if(!REASONING_EFFORTS.includes(effort as ReasoningEffort))throw new Error('CONFIG_INVALID_REASONING_EFFORT');await configSet({paths:ctx.paths,projectRoot:ctx.projectRoot,scope,path:'reasoningEffort',value:effort});writeValue(ctx,{ok:true,reasoningEffort:effort,scope},`Using reasoning effort ${effort} (${scope})\n`);return 0;}if(op==='use'){const id=args.shift();if(!id)throw new Error('MODEL_REQUIRED');const scope=(takeOption(args,'--scope')??'user') as 'user'|'project'|'project-user';if(!['user','project','project-user'].includes(scope))throw new Error('CONFIG_SCOPE_INVALID');assertNoUnknownOptions(args);const provider=providerOfModel(id);const registryModule:any=await importTalosModule(ctx.repoRoot,'provider-registry.mjs');if(!provider||!cliProviderRegistry(registryModule.REGISTRO_FORNITORI)[provider])throw Object.assign(new Error('MODEL_PROVIDER_INVALID'),{code:'MODEL_PROVIDER_INVALID'});const {configSet}=await import('../config/commands.ts');await configSet({paths:ctx.paths,projectRoot:ctx.projectRoot,scope,path:'model',value:id});/* choosing a model chooses its provider: the interactive screen starts from the same choice */createEnvironmentKeyConsent({dataRoot:ctx.paths.dataRoot,registry:registryModule.REGISTRO_FORNITORI,env:{}}).chooseProvider(provider);writeValue(ctx,{ok:true,model:id,scope},`Using ${id} (${scope})\n`);return 0;}if(op==='list'){const provider=takeOption(args,'--provider');assertNoUnknownOptions(args);/* 0.6.1 (review of 0.6.0, F2; owner 13/10/2026 «Funziona ovunque»): the sign-in sends the person here, so the list answers in any folder, like the provider commands; it reads and writes nothing of the project */const rc=await providerRuntimeContext(ctx);const catalog=rc.tuiCatalog;if(provider){if(typeof catalog?.providerModels!=='function')throw Object.assign(new Error('PROVIDER_CATALOG_UNAVAILABLE'),{code:'PROVIDER_CATALOG_UNAVAILABLE'});const list=await catalog.providerModels(provider);/* review of 0.6.1: in `--json` stdout is the rows and nothing else, so what the text form says above the table (how to sign in to a plan nobody is signed in to) goes to stderr, as `set-key`'s and `login`'s notices do. Review of 0.6.2 (13/10/2026): only what the person must act on — nobody signed in, a provider or a local engine that could not be reached (`listing`, catalog-service.ts). Every answer carries a notice, so a plain success wrote «Live list from X: N models.» to stderr every time, and a script that reads stderr as a failure broke. */if(ctx.invocation.outputFormat==='json'&&typeof list.notice==='string'&&list.notice&&NOTICES_TO_ACT_ON.has(String(list.listing)))ctx.io.writeErr(`${list.notice}\n`);writeValue(ctx,list.rows,modelListText(list.rows,list.notice));return 0;}if(typeof catalog?.listModels!=='function')throw Object.assign(new Error('PROVIDER_CATALOG_UNAVAILABLE'),{code:'PROVIDER_CATALOG_UNAVAILABLE'});const rows=await catalog.listModels();writeValue(ctx,rows,modelListText(rows));return 0;}throw new Error(`Unsupported model operation: ${op}`);}

/*
 * 14/10/2026 (owner: «the Z.AI key only to the address you chose»; «Te lo chiede quando metti la chiave»). Before the key is read,
 * so before its test sends anything: `--address` answers in advance; an address already chosen is kept; otherwise the person is
 * asked on the terminal (a wrong answer asks again, an empty one ends with nothing sent). Without a terminal it refuses and says how.
 */
async function chooseZaiAddressFirst(ctx:CommandContext,store:any,args:string[]):Promise<void>{
  const given=takeOption(args,'--address');
  const required=()=>Object.assign(new Error(t('key.zai.addressRequired')),{code:'PROVIDER_ADDRESS_REQUIRED'});
  if(given!==undefined){
    const address=parseZaiAddress(given);
    if(!address)throw Object.assign(new Error('PROVIDER_ADDRESS_INVALID'),{code:'PROVIDER_ADDRESS_INVALID'});
    store.setRuntime(ZAI_PROVIDER,{endpoint:address.endpoint});return;
  }
  let runtime:unknown=null;try{runtime=store.getRuntime(ZAI_PROVIDER);}catch{runtime=null;}
  if(zaiAddressChosen(runtime))return;
  if(typeof ctx.io.readLine!=='function'||!ctx.io.stdinIsTTY)throw required();
  const choices=ZAI_ADDRESSES.map((address,index)=>`  ${index+1}. ${address.label}${index===0?` ${t('key.zai.addressRecommended')}`:''}`);
  ctx.io.writeErr(`${t('key.zai.addressQuestion')}\n${choices.join('\n')}\n`);
  for(;;){
    const answer=(await ctx.io.readLine(t('key.zai.addressPrompt'))).trim();
    if(!answer)throw required();
    const address=/^[1-4]$/u.test(answer)?ZAI_ADDRESSES[Number(answer)-1]!:parseZaiAddress(answer);
    if(address){store.setRuntime(ZAI_PROVIDER,{endpoint:address.endpoint});return;}
    ctx.io.writeErr(`${t('key.zai.addressAgain')}\n`);
  }
}
