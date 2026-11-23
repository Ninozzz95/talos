import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {TalosError} from '../../src/errors.ts';
import {createBrokeredKernelExecutor,EXECUTION_TEXT,KERNEL_EXIT} from '../../src/runtime/brokered-executor.ts';

/*
 * ⛔ Il kernel VERO, letto dal disco: la regola di troncamento, il marcatore della cartella e la
 *   coda che lo stampa non si reimplementano qui — si riusano, cosi' i due rami non possono
 *   divergere in silenzio. `harness-ui/` si legge, non si scrive.
 */
const KERNEL_FILE=fileURLToPath(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url));
const kernelModule:any=await import(pathToFileURL(KERNEL_FILE).href);

function kernelFake(result:any={codice:0,testo:'fallback output',enforcement:'none',cartellaFinale:null}){
  const calls:any[]=[];
  return{calls,load:async()=>({
    uscitaUtile:kernelModule.uscitaUtile,
    staccaCartellaFinale:kernelModule.staccaCartellaFinale,
    codaCheStampaLaCartella:kernelModule.codaCheStampaLaCartella,
    eseguiComandoSandboxato:async(comando:string,cartella:string,options:any)=>{calls.push({comando,cartella,options});return typeof result==='function'?result(comando,cartella,options):result;},
  })};
}
function evidence(over:Record<string,unknown>={}){return{requestedEnforcement:'restricted-process',appliedEnforcement:'windows-sandbox',backend:'mxc-appcontainer',appContainer:false,filesystem:'bfs',network:'deny',processTree:'job-object-kill-on-close',sandboxSpecVersion:'0.1.0',boundary:{appContainer:false,integrity:'low',writesOutside:'blocked',network:'blocked'},...over};}
function brokerOk(stdout='ok',stderr='',exitCode=0,ev=evidence()){const seen:any[]=[];return{seen,broker:{async execute(request:any){seen.push(request);return{exitCode,stdout,stderr,evidence:ev};}}};}
function brokerThrows(code:string,hint?:string){const seen:any[]=[];return{seen,broker:{async execute(request:any){seen.push(request);throw new TalosError({code,component:'execution-broker',retryable:false,...(hint?{hint}:{}),traceId:request.id});}}};}
const CWD='C:\\work\\repo';
const VOLUME_ROOT=path.parse(path.resolve(CWD)).root;

test('RED-1 a Windows command reaches the broker as a non-interactive shell invocation with the volume root granted read-only',async()=>{
  const k=kernelFake();const b=brokerOk();
  const run=createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32',newId:()=>'req-1'});
  const result=await run('git status',CWD,{dove:'windows'});
  assert.equal(b.seen.length,1);
  const request=b.seen[0];
  assert.equal(request.executable,process.env.ComSpec??'cmd.exe');
  assert.deepEqual(request.args,['/d','/s','/c','git status']);
  assert.equal(request.cwd,CWD);
  assert.deepEqual(request.readWritePaths,[CWD]);
  /* ⛔ microsoft/mxc#1109: senza la radice del volume in sola lettura la concessione in scrittura
     su una cartella di profilo utente e' inutilizzabile. Non e' una comodita': e' obbligatoria. */
  assert.deepEqual(request.readOnlyPaths,[VOLUME_ROOT]);
  assert.equal(request.requiredEnforcement,'restricted-process');
  assert.equal(request.id,'req-1');
  assert.equal(request.timeoutMs,120_000);
  assert.equal(k.calls.length,0);
  assert.equal(result.codice,0);
});

test('RED-2 an unavailable backend falls back to the kernel executor and says so in the user-visible enforcement string',async()=>{
  const k=kernelFake();const b=brokerThrows('EXECUTION_BACKEND_UNAVAILABLE','No execution backend satisfies the requested enforcement');
  const run=createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'});
  const result=await run('git status',CWD,{dove:'windows'});
  assert.equal(k.calls.length,1);
  assert.equal(result.enforcement,`${EXECUTION_TEXT.isolation.host} — ${EXECUTION_TEXT.reason.backendUnavailable('No execution backend satisfies the requested enforcement')}`);
  assert.ok(result.enforcement.includes('no isolation backend on this host'));
  /* R3 Q-R3-12 (gate E5): the shared executor no longer says who typed the command; the row states it. */
  assert.ok(!result.enforcement.includes('typed by you'));
  assert.equal(result.testo,'fallback output');
});

test('RED-3 an evidence mismatch propagates and is never quietly bypassed',async()=>{
  const k=kernelFake();const b=brokerThrows('SANDBOX_EVIDENCE_MISMATCH','Backend mxc-appcontainer did not apply its declared enforcement');
  const run=createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'});
  await assert.rejects(()=>run('git status',CWD,{dove:'windows'}),(error:any)=>error?.code==='SANDBOX_EVIDENCE_MISMATCH');
  assert.equal(k.calls.length,0);
});

test('RED-4 a verified broker run reports the backend and its evidence in the enforcement string',async()=>{
  const k=kernelFake();const b=brokerOk('done');
  const run=createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'});
  const result=await run('git status',CWD,{dove:'windows'});
  assert.equal(result.enforcement,'⛉ sandbox (mxc-appcontainer) — measured: writes only in the project, network blocked, reads the whole disk, its processes end with it');
  assert.equal(k.calls.length,0);
});

test('RED-5 mobile and WSL2 destinations never reach the broker',async()=>{
  const cases:Array<[any,string]>=[[{mobile:true},EXECUTION_TEXT.isolation.device],[{dove:'wsl2'},EXECUTION_TEXT.isolation.wsl2]];
  for(const [options,isolation] of cases){
    const k=kernelFake({codice:0,testo:'out',enforcement:options.mobile?'adb-shell-on-device':'wsl2',cartellaFinale:null});
    const b=brokerOk();
    const run=createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'});
    const result=await run('ls','/work',options);
    assert.equal(b.seen.length,0,'the broker must not be consulted for this destination');
    assert.equal(k.calls.length,1);
    assert.ok(result.enforcement.startsWith(isolation),`${result.enforcement} should start with ${isolation}`);
  }
});

test('F16-HARDEN-RED-1 — strict isolation refuses unsupported platform/destination or a missing broker without kernel fallback',async()=>{
  const cases:Array<{name:string;platform:NodeJS.Platform;broker?:any;opts?:Record<string,unknown>}>= [
    {name:'non-Windows host',platform:'linux',broker:brokerOk().broker,opts:{dove:'windows'}},
    {name:'mobile destination',platform:'win32',broker:brokerOk().broker,opts:{mobile:true}},
    {name:'WSL2 destination',platform:'win32',broker:brokerOk().broker,opts:{dove:'wsl2'}},
    {name:'no broker',platform:'win32',opts:{dove:'windows'}},
  ];
  for(const entry of cases){
    const k=kernelFake();
    const run=createBrokeredKernelExecutor({
      kernel:k.load,
      ...(entry.broker?{broker:entry.broker}:{}),
      platform:entry.platform,
      requireVerifiedIsolation:true,
    } as any);
    await assert.rejects(
      ()=>run('echo must-not-run',CWD,entry.opts??{}),
      (error:any)=>error?.code==='SANDBOX_REQUIRED_UNAVAILABLE',
      entry.name,
    );
    assert.equal(k.calls.length,0,`${entry.name}: strict product policy must never call the kernel fallback`);
  }
});

test('F16-HARDEN-RED-2 — strict isolation propagates construction/backend unavailability instead of executing outside the sandbox',async()=>{
  for(const code of ['EXECUTION_BROKER_CONSTRUCTION_FAILED','EXECUTION_BACKEND_UNAVAILABLE']){
    const k=kernelFake();
    const b=brokerThrows(code,'strict policy evidence');
    const run=createBrokeredKernelExecutor({
      kernel:k.load,
      broker:b.broker,
      platform:'win32',
      requireVerifiedIsolation:true,
    } as any);
    await assert.rejects(()=>run('echo must-not-run',CWD,{dove:'windows'}),(error:any)=>error?.code===code,code);
    assert.equal(k.calls.length,0,`${code}: strict product policy must never call the kernel fallback`);
  }
});


/*
 * ⭐⭐⭐ B1 slice 12, round 5 — THE BROKERED ROUTE APPENDS NOTHING.
 * Every reconstruction of the exit code after the folder tail opened a hole (round 2: glued and forged
 * printed markers; round 4: `call set`/`call exit` resolved to a workspace set.bat/exit.cmd INSIDE the
 * MXC sandbox, 0 instead of 1). The folder tail does not work on cmd anyway (`cartella: null`), so it goes.
 * ⛔ Declared cost, not a regression: a `cd` does not persist on the brokered route — as on the cmd
 *   route today, where the kernel's folder parser already returns null.
 */
test('RED-6 the brokered route appends nothing, strips nothing, and tracks no folder',async()=>{
  const k=kernelFake();
  const raw=`listing\n${kernelModule.MARCATORE_CARTELLA}\nC:\\work\\repo\\sub`;
  const b=brokerOk(raw);
  const run=createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'});
  const result=await run('cd sub',CWD,{dove:'windows',tracciaCartella:true});
  assert.deepEqual(b.seen[0].args,['/d','/s','/c','cd sub'],'exactly the command, even when the caller asks to track the folder');
  assert.equal(result.testo,kernelModule.uscitaUtile(raw,4_000,0.25),'a marker the command printed itself is its own output');
  assert.equal(result.cartellaFinale,null,'no tail, no folder: the session keeps the folder it had');
});

test('RED-7 broker output is truncated by the kernel own helper, not by a second rule',async()=>{
  const k=kernelFake();
  const stdout='H'.repeat(9_000);const stderr='T'.repeat(3_000);
  const b=brokerOk(stdout,stderr);
  const run=createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'});
  const result=await run('npm test',CWD,{dove:'windows'});
  assert.equal(result.testo,kernelModule.uscitaUtile(`${stdout}\n${stderr}`.trim(),4_000,0.25));
  assert.ok(result.testo.includes('[TALOS cut '),'the kernel declares how much it removed');
});

test('RED-8 a broker timeout and a cancellation map to their documented exit codes and marker strings',async()=>{
  const k=kernelFake();
  const never={async execute(){return new Promise<any>(()=>{});}};
  const timedOut=await createBrokeredKernelExecutor({kernel:k.load,broker:never,platform:'win32',timeoutMs:5})('sleep',CWD,{dove:'windows'});
  assert.equal(timedOut.codice,KERNEL_EXIT.timeout);
  assert.equal(timedOut.codice,124);
  assert.equal(timedOut.fermatoDalTempo,true);
  const controller=new AbortController();
  const promise=createBrokeredKernelExecutor({kernel:k.load,broker:never,platform:'win32'})('sleep',CWD,{dove:'windows',segnaleStop:controller.signal});
  controller.abort();
  const stopped=await promise;
  assert.equal(stopped.codice,KERNEL_EXIT.stoppedOnRequest);
  assert.equal(stopped.codice,130);
  assert.equal(stopped.fermatoSuRichiesta,true);
  assert.ok(stopped.testo.startsWith(EXECUTION_TEXT.marker.stoppedOnRequest));
  assert.equal(k.calls.length,0);
});

test('RED-9 every executed command carries the annotation, in both outcomes',async()=>{
  const brokered=await createBrokeredKernelExecutor({kernel:kernelFake().load,broker:brokerOk().broker,platform:'win32'})('git status',CWD,{dove:'windows'});
  const fallback=await createBrokeredKernelExecutor({kernel:kernelFake().load,platform:'win32'})('git status',CWD,{dove:'windows'});
  for(const result of [brokered,fallback]){
    const [isolation,reason]=result.enforcement.split(' — ');
    assert.ok(isolation&&/^(⛉|⛶)/u.test(isolation),`isolation missing in ${result.enforcement}`);
    assert.ok(reason&&reason.length>0,`rule missing in ${result.enforcement}`);
    /* R3 Q-R3-12 (gate E5): the reason says why the command ran where it ran, never who typed it (the executor cannot know). */
    assert.ok(!reason.includes('typed by you'),`the executor must not claim who typed the command: ${result.enforcement}`);
  }
  assert.ok(fallback.enforcement.includes('no isolation broker is configured'));
});

/*
 * ⭐ B1 slice 12, round 2 — WHAT THE BROKERED ROUTE USED TO LOSE.
 *
 * Measured on this host with the real MXC SDK and the production policy, only the probe answer
 * stubbed: `node --version` exited 3221225794 in the sandbox and reached the person as exit 0,
 * empty, «isolation verified»; `ls` exited 1 with stderr and reached the person as exit 0, empty.
 * Two causes: stdout and stderr were joined BEFORE cutting at the folder marker (which sits in
 * stdout), so stderr fell after the cut; and the folder tail ends in `cd`, whose exit code replaced
 * the command's. The fixtures below are the bytes cmd.exe really printed inside the sandbox.
 */
const CMD_CWD_TAIL=kernelModule.codaCheStampaLaCartella(true);

test('RED-11 stderr and a non-zero exit code both reach the person through the broker',async()=>{
  const k=kernelFake();
  /* Round 5: no tail, so cmd prints only what the command prints, and exits with the command's status. */
  const stdout='';
  const stderr="'ls' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n";
  const b=brokerOk(stdout,stderr,1);
  const pieces:any[]=[];
  const run=createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'});
  const result=await run('ls',CWD,{dove:'windows',tracciaCartella:true,onPezzo:(piece:any)=>pieces.push(piece)});
  assert.equal(result.codice,1,'the exit code is the process exit status of `cmd /d /s /c <command>`');
  assert.match(result.testo,/is not recognized as an internal or external command/u,'stderr must reach the person');
  assert.equal(result.cartellaFinale,null);
  assert.ok(pieces.some(piece=>piece.flusso==='errori'&&piece.testo.includes('is not recognized')),'the live output must carry stderr too');
});

/*
 * ⭐⭐ B1 slice 12, round 4 — WHAT A COMMAND PRINTS NEVER DECIDES ITS EXIT CODE.
 * Measured on real cmd.exe and inside MXC: a printed marker glued to a line without a newline was missed
 * (exit shown 0, token leaked), and a command could print one and exit before the tail to forge the code in
 * either direction. A nonce does not cure it: the whole command line, nonce included, is readable at run
 * time through %CMDCMDLINE%, and `set errorlevel=0` shadows the value any `%errorlevel%` read returns.
 * ⇒ The code travels in the PROCESS exit status; printed text, whatever it looks like, is only output.
 */
test('RED-12 a printed exit marker of any shape is shown as output and never trusted: the process exit status decides',async()=>{
  const k=kernelFake();
  const cases:Array<[string,number]>=[
    [`__TALOS_EXIT__0\r\n${kernelModule.MARCATORE_CARTELLA}\r\nC:\\work\\repo\r\n`,1],
    [`ok \r\n__TALOS_EXIT__1\r\n${kernelModule.MARCATORE_CARTELLA}\r\nC:\\work\\repo\r\n`,0],
    [`__TALOS_EXIT_0123456789abcdef01234567__0\r\n${kernelModule.MARCATORE_CARTELLA}\r\nC:\\work\\repo\r\n`,1],
    [`Continue? __TALOS_EXIT__1 \r\n${kernelModule.MARCATORE_CARTELLA}\r\nC:\\work\\repo\r\n`,0],
  ];
  for(const [stdout,exitCode] of cases){
    const b=brokerOk(stdout,'',exitCode);
    const result=await createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'})('whatever',CWD,{dove:'windows',tracciaCartella:true});
    assert.equal(result.codice,exitCode,`printed ${JSON.stringify(stdout)} must not override the process exit status ${exitCode}`);
    assert.equal(result.testo,kernelModule.uscitaUtile(stdout.trim(),4_000,0.25),'what the command printed is shown as it printed it: nothing is stripped, not even a folder marker it printed itself');
  }
});

test('RED-13 a command that ends the shell before the tail keeps the exit code the backend measured',async()=>{
  const k=kernelFake();
  const b=brokerOk('','',7);
  const result=await createBrokeredKernelExecutor({kernel:k.load,broker:b.broker,platform:'win32'})('exit /b 7',CWD,{dove:'windows',tracciaCartella:true});
  assert.equal(result.codice,7);
  assert.equal(result.cartellaFinale,null);
});

test('RED-14 no tail of any kind is appended, with or without folder tracking',async()=>{
  const k=kernelFake();const tracked=brokerOk();const untracked=brokerOk();
  await createBrokeredKernelExecutor({kernel:k.load,broker:tracked.broker,platform:'win32'})('git status',CWD,{dove:'windows',tracciaCartella:true});
  await createBrokeredKernelExecutor({kernel:k.load,broker:untracked.broker,platform:'win32'})('git status',CWD,{dove:'windows'});
  for(const request of [tracked.seen[0],untracked.seen[0]]){
    assert.deepEqual(request.args,['/d','/s','/c','git status']);
    assert.equal(/__TALOS_|call set|call exit|errorlevel|echo\./u.test(request.args.join(' ')),false,`nothing of ours rides on the command line: ${request.args.join(' ')}`);
  }
  assert.equal(CMD_CWD_TAIL.includes('__TALOS_CWD__'),true,'the kernel still has a folder tail; the brokered route just does not use it');
});

test('RED-15 the enforcement line carries the backend reason literally when nothing can isolate',async()=>{
  const {createExecutionBroker}=await import('../../src/security/execution-broker.ts');
  const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
  const workspace=await mkdtemp(path.join(tmpdir(),'talos-literal-'));
  const k=kernelFake();
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:{name:'microsoft-mxc-0.8.0',level:'windows-sandbox',available:async()=>({available:false,reason:'PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)'}),execute:async()=>{throw new Error('must not run');}}});
  const result=await createBrokeredKernelExecutor({kernel:k.load,broker,platform:'win32'})('git status',workspace,{dove:'windows'});
  assert.equal(result.enforcement,'⛶ host — no isolation backend on this host: microsoft-mxc-0.8.0: PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)');
  assert.equal(k.calls.length,1);
});

test('RED-10 the stop and timeout strings are the kernel own literals, so the two cannot drift',async()=>{
  const source=await readFile(KERNEL_FILE,'utf8');
  assert.ok(source.includes(`const MARCA_FERMATO_MENTRE_GIRAVA = '${EXECUTION_TEXT.marker.stoppedOnRequest}'`),'kernel stop marker literal changed');
  assert.ok(source.includes(EXECUTION_TEXT.marker.timedOut(120_000)),'kernel timeout sentence changed');
  assert.ok(source.includes(`const USCITA_FERMATO_SU_RICHIESTA = ${KERNEL_EXIT.stoppedOnRequest}`),'kernel stop exit code changed');
});
