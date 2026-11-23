import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {resolveCliPaths} from '../../src/paths.ts';import {runSystemCommand} from '../../src/commands/system-cli.ts';
async function ctx(){const root=await mkdtemp(join(tmpdir(),'talos-sys-'));await mkdir(join(root,'harness-ui','src'),{recursive:true});const home=await mkdtemp(join(tmpdir(),'talos-home-'));const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);for(const p of [paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.logsRoot])await mkdir(p,{recursive:true});const out:string[]=[];return{root,paths,out,c:{invocation:{outputFormat:'json'} as any,io:{writeOut:(s:string)=>out.push(s),writeErr:()=>{},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:root,repoRoot:root,paths,createRuntimeContext:async()=>({})} as any};}
/*
 * B1 slice 19, round 2 — NO TEST IN THIS FILE CAN REACH THE REAL KEYRING. `diagnostic bundle` runs doctor,
 * and doctor's default loader resolves `@napi-rs/keyring` the way Node does: on this host that walk ends at
 * the real module behind the drive-root junction `C:\node_modules`, and only the approved-roots guard stood
 * between these tests and a real probe write into Windows Credential Manager. The keyring dependencies are
 * injected instead: resolution always reports the module absent, and loading always throws. A regression in
 * the guard can no longer turn a unit test into a write to the owner's keyring.
 */
function sealedKeyring(){const calls={resolve:0,load:0};const deps={keyring:{resolve:()=>{calls.resolve++;throw Object.assign(new Error("Cannot find module '@napi-rs/keyring' (sealed by the test)"),{code:'MODULE_NOT_FOUND'});},load:()=>{calls.load++;throw new Error('the sealed test keyring never loads a module');}}};return{calls,deps};}
test('init creates project configuration without touching desktop files',async()=>{const x=await ctx();assert.equal(await runSystemCommand(x.c,'init',[],sealedKeyring().deps),0);assert.equal(await readFile(join(x.root,'.talos-cli','config.json'),'utf8'),'{}\n');});
test('diagnostic bundle is a real zip and contains no prompt/file content by default',async()=>{const x=await ctx();const k=sealedKeyring();const out=join(x.root,'diag.zip');assert.equal(await runSystemCommand(x.c,'diagnostic',['bundle','--out',out],k.deps),0);assert.ok(k.calls.resolve>0,'doctor inside the bundle consulted the sealed resolver, not Node');assert.equal(k.calls.load,0);const b=await readFile(out);assert.equal(b.readUInt32LE(0),0x04034b50);assert.equal(b.includes(Buffer.from('prompt')),false);assert.equal(b.includes(Buffer.from('diff')),false);});
test('diagnostic bundle redacts known environment secret values inside log prose',async()=>{const x=await ctx();await import('node:fs/promises').then(fs=>fs.writeFile(join(x.paths.logsRoot,'talos.log'),'provider rejected supersecret payload\n'));const prev=process.env.TALOS_TEST_API_KEY;process.env.TALOS_TEST_API_KEY='supersecret';try{const k=sealedKeyring();const out=join(x.root,'diag-secret.zip');assert.equal(await runSystemCommand(x.c,'diagnostic',['bundle','--out',out],k.deps),0);assert.ok(k.calls.resolve>0,'doctor inside the bundle consulted the sealed resolver, not Node');assert.equal(k.calls.load,0);const b=await readFile(out);assert.equal(b.includes(Buffer.from('supersecret')),false);assert.equal(b.includes(Buffer.from('[REDACTED:11]')),true);}finally{if(prev===undefined)delete process.env.TALOS_TEST_API_KEY;else process.env.TALOS_TEST_API_KEY=prev;}});

test('update refuses while another TALOS CLI run is active before any network call',async()=>{
  const x=await ctx();
  const {registerActiveRun}=await import('../../src/runtime/active-run.ts');
  const release=await registerActiveRun(x.paths,{projectRoot:x.root,sessionId:'active'});
  const previous=process.env.TALOS_CLI_UPDATE_MANIFEST_URL;
  delete process.env.TALOS_CLI_UPDATE_MANIFEST_URL;
  try{
    await assert.rejects(()=>runSystemCommand(x.c,'update',['--check'],sealedKeyring().deps),(error:any)=>error?.code==='UPDATE_ACTIVE_RUN');
  }finally{
    await release();
    if(previous===undefined)delete process.env.TALOS_CLI_UPDATE_MANIFEST_URL;else process.env.TALOS_CLI_UPDATE_MANIFEST_URL=previous;
  }
});
test('diagnostic bundle refuses project or prompt content export in privacy-first v1',async()=>{
  const x=await ctx();
  const out=join(x.root,'diag-content.zip');
  await assert.rejects(()=>runSystemCommand(x.c,'diagnostic',['bundle','--out',out,'--include-content'],sealedKeyring().deps),(error:any)=>error?.message==='DIAGNOSTIC_CONTENT_EXPORT_DISABLED');
});

test('doctor path access distinguishes read-only runtime markers from writable state paths',async()=>{
  const {pathAccessible}=await import('../../src/commands/system-cli.ts');
  const calls:Array<{path:string;mode:number}>=[];
  const fake=async(path:string,mode:number)=>{calls.push({path,mode});};
  assert.equal(await pathAccessible('runtime.mjs',{writable:false,accessImpl:fake as any}),true);
  assert.equal(await pathAccessible('state',{writable:true,accessImpl:fake as any}),true);
  const {constants}=await import('node:fs');
  assert.deepEqual(calls,[
    {path:'runtime.mjs',mode:constants.R_OK},
    {path:'state',mode:constants.R_OK|constants.W_OK},
  ]);
});


test('M11-A RED — doctor --profile is the only branch that performs active provider probes and surfaces measured latency without key bytes',async()=>{
  const x=await ctx();const k=sealedKeyring();let probes=0;
  x.c.createRuntimeContext=async()=>({
    providerControlPlane:{
      list:()=>[{id:'openrouter',label:'OpenRouter',auth:{required:true,source:'saved',configured:true,usable:true},endpoint:{host:'openrouter.ai',configured:false,valid:true},lastHealth:{state:'unknown',detail:'',latencyMs:null,observedAt:null,httpStatus:null},ready:true,cooldown:{active:false,cause:null,until:null,keys:0}}],
      probe:async()=>{probes++;return{id:'openrouter',label:'OpenRouter',auth:{required:true,source:'saved',configured:true,usable:true},endpoint:{host:'openrouter.ai',configured:false,valid:true},lastHealth:{state:'available',detail:'ok',latencyMs:41,observedAt:1,httpStatus:200},ready:true,cooldown:{active:false,cause:null,until:null,keys:0}};},
    },
    runtime:{close:async()=>{}},registry:{},
  });
  assert.equal(await runSystemCommand(x.c,'doctor',['--json'],k.deps as any),70);
  const offline=JSON.parse(x.out.at(-1)!);assert.equal(probes,0);assert.equal(offline.sections.providers.profiles[0].lastHealth.latencyMs,null);
  assert.equal(await runSystemCommand(x.c,'doctor',['--json','--profile'],k.deps as any),70);
  const profiled=JSON.parse(x.out.at(-1)!);assert.equal(probes,1);assert.equal(profiled.sections.providers.profiles[0].lastHealth.latencyMs,41);
  const serialized=JSON.stringify(profiled);assert.doesNotMatch(serialized,/api.?key|authorization|secret-value/iu);
  assert.ok(typeof profiled.performance?.rssBytes==='number'&&profiled.performance.rssBytes>0);
});

test('M11-A RED — system doctor wires canonical terminal trust process-tree session and update authorities instead of duplicating their policy',async()=>{
  const source=await readFile(new URL('../../src/commands/system-cli.ts',import.meta.url),'utf8');
  for(const token of ['detectTerminalCapabilities','createTerminalSessionPlan','shellDimensions','createTrustAuthority','createProcessTreeEvidenceStore','elencaSessioniPersistite','leggiRegistro'])assert.match(source,new RegExp(token,'u'));
  assert.match(source,/verifyReleaseManifestSignature|signature.*unavailable/isu);
});

test('M11-A RED — diagnostic bundle pseudonymizes local paths and remains bounded with a hostile single-line log',async()=>{
  const x=await ctx();const k=sealedKeyring();const rawPath=join(x.root,'private-user-project');
  await import('node:fs/promises').then(fs=>fs.writeFile(join(x.paths.logsRoot,'huge.log'),rawPath+' '+('X'.repeat(1024*1024))+'\n'));
  const out=join(x.root,'diag-bounded.zip');assert.equal(await runSystemCommand(x.c,'diagnostic',['bundle','--out',out],k.deps),0);
  const b=await readFile(out);assert.equal(b.includes(Buffer.from(rawPath)),false,'support artifact must pseudonymize machine/project paths');
  assert.ok(b.includes(Buffer.from('[PATH:')),'pseudonymization marker should make removal visible');
  assert.ok(b.byteLength<512*1024,'one hostile log line must not make the support bundle unbounded');
});


test('M11-A hardening RED — logs --tail is not silently capped by support-bundle byte limits',async()=>{
  const x=await ctx();const lines=Array.from({length:700},(_,i)=>'LINE-'+String(i).padStart(4,'0')+' '+('x'.repeat(80)));
  await import('node:fs/promises').then(fs=>fs.writeFile(join(x.paths.logsRoot,'tail.log'),lines.join('\n')+'\n'));
  assert.equal(await runSystemCommand(x.c,'logs',['--tail','700'],sealedKeyring().deps),0);
  const rows=JSON.parse(x.out.at(-1)!);assert.equal(rows[0].lines.length,700);assert.match(rows[0].lines[0],/^LINE-0000 /u);
});


test('M11-A hardening RED — system doctor probes canonical context.sqlite read-only instead of opening the mutating context engine store',async()=>{
  const source=await readFile(new URL('../../src/commands/system-cli.ts',import.meta.url),'utf8');
  assert.match(source,/context[^\n]*context\.sqlite/u);
  assert.match(source,/SQLite format 3/u);
  assert.doesNotMatch(source,/createSqliteContextStore/u,'doctor must not create/migrate the context database while inspecting it');
});
