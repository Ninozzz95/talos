import assert from 'node:assert/strict';import test from 'node:test';import {main} from '../../src/main.ts';import {CLI_VERSION} from '../../src/version.ts';
test('version exits zero without runtime or tui',async()=>{let runtime=0,tui=0;const io={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};const code=await main(['--version'],{io,createRuntime:async()=>{runtime++;throw new Error('no');},runTui:async()=>{tui++;}} as never);assert.equal(code,0);assert.equal(runtime,0);assert.equal(tui,0);assert.equal(io.stdout,`${CLI_VERSION}\n`);});
test('headless run never loads tui',async()=>{let tui=0;const events=[{type:'TextMessageContent',messageId:'m',delta:'OK'},{type:'RunFinished'}];const registry:any={ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti(_id:string,sink:(e:any)=>void){queueMicrotask(()=>events.forEach(sink));return()=>{};},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:false,readStdin:async()=>''};const code=await main(['-p','hi','--json'],{io,createRuntime:async()=>({registry}),runTui:async()=>{tui++;}} as never);assert.equal(code,0);assert.equal(tui,0);assert.equal(JSON.parse(io.stdout).result.text,'OK');});
test('project config supplies model and permission rules to headless run',async()=>{const {mkdtemp,mkdir,writeFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const root=await mkdtemp(join(tmpdir(),'talos-main-config-'));await mkdir(join(root,'.talos-cli'),{recursive:true});await writeFile(join(root,'.talos-cli','config.json'),JSON.stringify({model:'ollama:qwen',permissions:{allow:['Bash(npm test)'],ask:[],deny:[]}}));let started:any;const events=[{type:'ApprovalRequested',requestId:'r1',azione:{tipo:'comando',comando:'npm test'}},{type:'RunFinished'}];const registry:any={ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:(x:any)=>{started=x;return{sessionId:'s'};},iscriviti(_id:string,sink:(e:any)=>void){queueMicrotask(()=>events.forEach(sink));return()=>{};},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:false,readStdin:async()=>''};const code=await main(['--project',root,'-p','hi','--json','--timeout','1'],{io,createRuntime:async()=>({registry}),runTui:async()=>{}} as never);assert.equal(code,0);assert.equal(started.modello,'ollama:qwen');});
test('project trust gate runs before project configuration is loaded',async()=>{const {mkdtemp,mkdir,writeFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const root=await mkdtemp(join(tmpdir(),'talos-main-trust-order-'));await mkdir(join(root,'.talos-cli'),{recursive:true});await writeFile(join(root,'.talos-cli','config.json'),'{broken json');let runtimeCalls=0;const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''};const code=await main(['--project',root,'-p','hi','--json'],{io,assertProjectTrusted:async()=>{throw Object.assign(new Error('PROJECT_TRUST_REQUIRED'),{code:'PROJECT_TRUST_REQUIRED'});},createRuntime:async()=>{runtimeCalls++;throw new Error('must not start');}} as any);assert.equal(code,2);assert.equal(runtimeCalls,0);assert.equal(JSON.parse(io.stdout).error.code,'PROJECT_TRUST_REQUIRED');});
test('headless resume starts listening after historical events and supports last',async()=>{let from=-1,resumed:any=null;const rt:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s',avviataAlle:'2026-09-14'}],export:()=>({eventi:[{},{},{}]}),resume:async(id:string,prompt?:string)=>{resumed={id,prompt};return id;},fork:async()=>'',start:async()=>{throw new Error('must not start')},subscribe(_id:string,sink:(e:any)=>void,f=0){from=f;queueMicrotask(()=>[{type:'TextMessageContent',messageId:'m2',delta:'RESUMED'},{type:'RunFinished'}].forEach(sink));return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}};const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:false,readStdin:async()=>''};const code=await main(['--resume','last','-p','continue','--json'],{io,createRuntime:async()=>rt,runTui:async()=>{}} as never);assert.equal(code,0);assert.deepEqual(resumed,{id:'s',prompt:'continue'});assert.equal(from,3);assert.equal(JSON.parse(io.stdout).result.text,'RESUMED');});
test('headless fork passes optional branch prompt to runtime',async()=>{let forked:any=null;const rt:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[],export:()=>null,resume:async()=>'',fork:async(id:string,prompt?:string)=>{forked={id,prompt};return 'child';},start:async()=>'',subscribe(_id:string,sink:(e:any)=>void){queueMicrotask(()=>[{type:'TextMessageContent',messageId:'m2',delta:'FORK'},{type:'RunFinished'}].forEach(sink));return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}};const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:false,readStdin:async()=>''};const code=await main(['--fork','parent','-p','branch work','--json'],{io,createRuntime:async()=>rt,runTui:async()=>{}} as never);assert.equal(code,0);assert.deepEqual(forked,{id:'parent',prompt:'branch work'});assert.equal(JSON.parse(io.stdout).result.text,'FORK');});

test('agent run publishes cross-process active marker and clears it on completion',async()=>{
  const {mkdtemp}=await import('node:fs/promises');const {tmpdir,homedir}=await import('node:os');const {join}=await import('node:path');const {resolveCliPaths}=await import('../../src/paths.ts');const {hasActiveRuns}=await import('../../src/runtime/active-run.ts');
  const root=await mkdtemp(join(tmpdir(),'talos-main-active-'));const profile=await mkdtemp(join(tmpdir(),'talos-main-profile-'));const names={c:'XDG_CONFIG_HOME',s:'XDG_STATE_HOME',x:'XDG_CACHE_HOME',a:'APPDATA',l:'LOCALAPPDATA'} as const;const previous=Object.fromEntries(Object.entries(names).map(([k,name])=>[k,process.env[name]]));process.env.XDG_CONFIG_HOME=join(root,'config');process.env.XDG_STATE_HOME=join(root,'state');process.env.XDG_CACHE_HOME=join(root,'cache');/* win32 resolves APPDATA/LOCALAPPDATA, not XDG_* (C row, forensics 2026-09-23) */process.env.APPDATA=join(profile,'appdata');process.env.LOCALAPPDATA=join(profile,'localappdata');
  let sink:((e:any)=>void)|null=null;const rt:any={start:async()=> 's-active',restore:async()=>({}),listSessions:async()=>[],export:()=>null,resume:async()=>'',fork:async()=>'',subscribe(_id:string,s:(e:any)=>void){sink=s;return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}};const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''};
  try{
    const pending=main(['--project',root,'-p','work','--json'],{io,createRuntime:async()=>rt,runTui:async()=>{}} as never);
    for(let i=0;i<400&&!sink;i++)await new Promise(resolve=>setTimeout(resolve,5)); /* 0.6.15: up to 2 s — 50 × 1 ms was not enough under a 4-worker suite (red twice on 26/10, green alone) */
    assert.ok(sink);const paths=resolveCliPaths(process.env,process.platform,homedir());assert.equal(await hasActiveRuns(paths),true);
    sink!({type:'TextMessageContent',delta:'OK'});sink!({type:'RunFinished'});assert.equal(await pending,0);assert.equal(await hasActiveRuns(paths),false);
  }finally{for(const [k,v] of Object.entries(previous)){const name=names[k as keyof typeof names];if(v===undefined)delete process.env[name];else process.env[name]=v;}}
});

test('stream-json writes each event before the run completes and does not replay it',async()=>{
  let sink:((e:any)=>void)|null=null;
  const rt:any={
    start:async()=> 's-stream',restore:async()=>({}),listSessions:async()=>[],export:()=>null,resume:async()=>'',fork:async()=>'',
    subscribe(_id:string,s:(e:any)=>void){sink=s;return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}
  };
  const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''};
  // 843e2bf54 checkpoints --project (default cwd) before start; an empty project keeps the subscription prompt.
  const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const project=await mkdtemp(join(tmpdir(),'talos-main-stream-'));
  const pending=main(['--project',project,'-p','work','--output-format','stream-json'],{io,createRuntime:async()=>rt,runTui:async()=>{}} as never);
  for(let i=0;i<400&&!sink;i++)await new Promise(resolve=>setTimeout(resolve,5)); /* 0.6.15: up to 2 s — 50 × 1 ms was not enough under a 4-worker suite (red twice on 26/10, green alone) */
  assert.ok(sink);
  sink!({type:'TextMessageContent',messageId:'m',delta:'early'});
  await new Promise(resolve=>setTimeout(resolve,0));
  const early=io.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(early.length,1);
  assert.equal(early[0].type,'message.delta');
  assert.equal(early[0].data.delta,'early');
  sink!({type:'RunFinished'});
  assert.equal(await pending,0);
  const all=io.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(all.map((row:any)=>row.type),['message.delta','run.completed']);
});

test('stream-json startup failure stays valid JSONL instead of writing human stderr',async()=>{
 const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''};
 const code=await main(['-p','work','--output-format','stream-json'],{io,createRuntime:async()=>{throw Object.assign(new Error('provider unavailable'),{code:'PROVIDER_UNREACHABLE'});},runTui:async()=>{}} as never);
 assert.equal(code,12);assert.equal(io.stderr,'');const row=JSON.parse(io.stdout.trim());assert.equal(row.schema,'talos.cli.event.v1');assert.equal(row.type,'run.failed');assert.equal(row.data.code,'PROVIDER_UNREACHABLE');
});


test('interactive mode constructs one full context and passes shared runtime plus catalog',async()=>{
  const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'talos-main-tui-context-'));const previous={config:process.env.XDG_CONFIG_HOME,state:process.env.XDG_STATE_HOME,cache:process.env.XDG_CACHE_HOME};process.env.XDG_CONFIG_HOME=join(root,'config');process.env.XDG_STATE_HOME=join(root,'state');process.env.XDG_CACHE_HOME=join(root,'cache');
  let runtimeFactoryCalls=0,contextCalls=0,received:any;const runtime:any={close:async()=>{},listSessions:async()=>['live-session']};const catalog={listProviders:async()=>['live-provider']} as any;const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
  try{const code=await main(['--project',root],{io,createRuntime:async()=>{runtimeFactoryCalls++;return runtime;},createRuntimeContext:async()=>{contextCalls++;return{runtime,tuiCatalog:catalog};},runTui:async x=>{received=x;}} as any);assert.equal(code,0);assert.equal(contextCalls,1);assert.equal(runtimeFactoryCalls,0);
    /* Startup stage 1 (owner 02/10): the TUI gets stand-ins that wait for the kernel and then pass through to the shared
       runtime and catalog of the one context (runtime/deferred-context.ts). */
    assert.deepEqual(await received.runtime.listSessions(),['live-session']);assert.deepEqual(await received.catalog.listProviders(),['live-provider']);}finally{for(const [name,value] of Object.entries(previous)){const envName=name==='config'?'XDG_CONFIG_HOME':name==='state'?'XDG_STATE_HOME':'XDG_CACHE_HOME';if(value===undefined)delete process.env[envName];else process.env[envName]=value;}}
});


test('interactive untrusted project asks before config or runtime and cancel starts nothing',async()=>{
  const {mkdtemp,mkdir,writeFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'talos-main-trust-prompt-cancel-'));await mkdir(join(root,'project','.talos-cli'),{recursive:true});await writeFile(join(root,'project','.talos-cli','config.json'),'{broken json');
  const project=join(root,'project');const previous={config:process.env.XDG_CONFIG_HOME,state:process.env.XDG_STATE_HOME,cache:process.env.XDG_CACHE_HOME};process.env.XDG_CONFIG_HOME=join(root,'config');process.env.XDG_STATE_HOME=join(root,'state');process.env.XDG_CACHE_HOME=join(root,'cache');
  const assessment:any={trusted:false,reason:'PROJECT_UNTRUSTED',workspace:{requestedRoot:project,canonicalRoot:project,gitRoot:null,nestedRepository:false,identityHash:'prompt-cancel'},resources:[{workspaceIdentityHash:'prompt-cancel',kind:'context',id:'.talos-cli/config.json',relativePath:'.talos-cli/config.json',fingerprint:'old'}]};
  let promptCalls=0,grantCalls=0,runtimeCalls=0;const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
  try{
    const code=await main(['--project',project],{io,assessProjectTrust:async()=>assessment,promptProjectTrust:async()=>{promptCalls++;return'cancel';},trustProjectAssessment:async()=>{grantCalls++;return assessment;},createRuntimeContext:async()=>{runtimeCalls++;throw new Error('must not start');},runTui:async()=>{throw new Error('must not render main tui');}} as any);
    assert.equal(code,2);assert.equal(promptCalls,1);assert.equal(grantCalls,0);assert.equal(runtimeCalls,0);assert.match(io.stderr,/PROJECT_TRUST_REQUIRED/u);assert.match(io.stderr,/talos project status/u);
  }finally{for(const [name,value] of Object.entries(previous)){const envName=name==='config'?'XDG_CONFIG_HOME':name==='state'?'XDG_STATE_HOME':'XDG_CACHE_HOME';if(value===undefined)delete process.env[envName];else process.env[envName]=value;}}
});

test('interactive trust acceptance is granted and verified before runtime composition',async()=>{
  const {mkdtemp,mkdir,writeFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'talos-main-trust-prompt-accept-'));const project=join(root,'project');await mkdir(join(project,'.talos-cli'),{recursive:true});await writeFile(join(project,'.talos-cli','config.json'),'{}\n');
  const previous={config:process.env.XDG_CONFIG_HOME,state:process.env.XDG_STATE_HOME,cache:process.env.XDG_CACHE_HOME};process.env.XDG_CONFIG_HOME=join(root,'config');process.env.XDG_STATE_HOME=join(root,'state');process.env.XDG_CACHE_HOME=join(root,'cache');
  const untrusted:any={trusted:false,reason:'PROJECT_UNTRUSTED',workspace:{requestedRoot:project,canonicalRoot:project,gitRoot:null,nestedRepository:false,identityHash:'prompt-accept'},resources:[{workspaceIdentityHash:'prompt-accept',kind:'context',id:'.talos-cli/config.json',relativePath:'.talos-cli/config.json',fingerprint:'old'}]};
  const trusted:any={...untrusted,trusted:true,reason:'PROJECT_TRUSTED'};const order:string[]=[];const runtime:any={close:async()=>{order.push('close');}};const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
  try{
    const code=await main(['--project',project],{io,assessProjectTrust:async()=>{order.push('assess');return untrusted;},promptProjectTrust:async()=>{order.push('prompt');return'trust';},trustProjectAssessment:async({nestedRepositories}:any)=>{order.push('grant');assert.deepEqual(nestedRepositories,[]);return trusted;},createRuntimeContext:async()=>{order.push('context');return{runtime,tuiCatalog:{}};},runTui:async()=>{order.push('tui');}} as any);
    assert.equal(code,0);assert.deepEqual(order.slice(0,5),['assess','prompt','grant','context','tui']);
  }finally{for(const [name,value] of Object.entries(previous)){const envName=name==='config'?'XDG_CONFIG_HOME':name==='state'?'XDG_STATE_HOME':'XDG_CACHE_HOME';if(value===undefined)delete process.env[envName];else process.env[envName]=value;}}
});


test('M10-A RED — interactive TUI receives the exact live registry from the composed runtime context',async()=>{
  const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'talos-main-tui-research-registry-'));const previous={config:process.env.XDG_CONFIG_HOME,state:process.env.XDG_STATE_HOME,cache:process.env.XDG_CACHE_HOME};process.env.XDG_CONFIG_HOME=join(root,'config');process.env.XDG_STATE_HOME=join(root,'state');process.env.XDG_CACHE_HOME=join(root,'cache');
  const runtime:any={close:async()=>{}};const registry:any={marker:'same-live-registry'};const catalog:any={};let received:any=null;const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
  try{
    const code=await main(['--project',root],{io,createRuntimeContext:async()=>({runtime,registry,tuiCatalog:catalog}),runTui:async(x:any)=>{received=x;}} as any);
    assert.equal(code,0);/* Startup stage 1 (owner 02/10): stand-ins that pass through to the live objects once the kernel is ready */
    await received.startup;assert.equal(received.registry.marker,'same-live-registry','TUI controls must act on the same registry that owns live research');
  }finally{for(const [name,value] of Object.entries(previous)){const envName=name==='config'?'XDG_CONFIG_HOME':name==='state'?'XDG_STATE_HOME':'XDG_CACHE_HOME';if(value===undefined)delete process.env[envName];else process.env[envName]=value;}}
});
