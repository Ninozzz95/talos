/*
 * R3 lane SP — owner decision Q-R3-13 (R0 decision 4): the TUI shows a persistent `No sandbox` and `(unsandboxed)` on
 * command approvals when shell commands have no verified sandbox. The TUI learns it from the same probe the auto
 * classifier already uses (`cliShellIsolation`, security/execution-backends.ts), which main.ts now hands to the TUI.
 * Private profile: APPDATA/LOCALAPPDATA/XDG in a temp folder, memory credential store, no probe is run (runTui is a stub).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

test('R3-SP Q-R3-13: main hands the TUI the shell-isolation probe',async()=>{
  const {mkdtemp,mkdir}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {main}=await import('../../src/main.ts');
  const home=await mkdtemp(join(tmpdir(),'talos-r3-sp-main-tui-'));const project=join(home,'project');await mkdir(project);
  const names=['APPDATA','LOCALAPPDATA','XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','TALOS_CREDENTIAL_STORE','TALOS_TEST_PROFILE'] as const;
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{APPDATA:join(home,'appdata'),LOCALAPPDATA:join(home,'local'),XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state'),XDG_CACHE_HOME:join(home,'cache'),TALOS_CREDENTIAL_STORE:'memory',TALOS_TEST_PROFILE:'1'});
  try{
    let received:any=null;const runtime:any={close:async()=>{}};
    const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
    const code=await main(['--project',project],{io,createRuntimeContext:async()=>({runtime,tuiCatalog:{}}),runTui:async(options:any)=>{received=options;}} as any);
    assert.equal(code,0,io.stderr);
    assert.equal(typeof received?.shellIsolation,'function','the TUI receives the probe it asks once after the boot');
  }finally{for(const name of names){const value=saved[name];if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});

/*
 * Owner decision (2026-09-24, R3): quitting aborts a sandbox check still running — the TUI's startup check or the broker's
 * first probe — so TALOS exits promptly with nothing left behind (measured before: acceptance s09 died with code 1 because
 * a running check kept the process alive after the TUI closed).
 */
test('R3-SP Q-R3-13: quitting TALOS aborts a check still running, ends the process it started and exits promptly with 0',async()=>{
  const {mkdtemp,mkdir}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {spawn}=await import('node:child_process');
  const {main}=await import('../../src/main.ts');const {runIsolationCheck}=await import('../../src/security/execution-backends.ts');
  const home=await mkdtemp(join(tmpdir(),'talos-r3-sp-main-quit-'));const project=join(home,'project');await mkdir(project);
  const names=['APPDATA','LOCALAPPDATA','XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','TALOS_CREDENTIAL_STORE','TALOS_TEST_PROFILE'] as const;
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{APPDATA:join(home,'appdata'),LOCALAPPDATA:join(home,'local'),XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state'),XDG_CACHE_HOME:join(home,'cache'),TALOS_CREDENTIAL_STORE:'memory',TALOS_TEST_PROFILE:'1'});
  const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
  let childPid:number|undefined;
  try{
    const runtime:any={close:async()=>{}};
    const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
    /* The TUI started a check that never finishes by itself (a real child that waits forever), then the person quit. */
    const runTui=async()=>{
      void runIsolationCheck((signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
        const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});childPid=child.pid;
        signal.addEventListener('abort',()=>{try{child.kill('SIGKILL');}catch{}child.once('exit',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})));},{once:true});
      })).catch(()=>{});
      await new Promise(resolve=>setTimeout(resolve,100));
    };
    const at=Date.now();
    const code=await main(['--project',project],{io,createRuntimeContext:async()=>({runtime,tuiCatalog:{}}),runTui} as any);
    assert.equal(code,0,io.stderr);
    assert.ok(Date.now()-at<5_000,`quitting took ${Date.now()-at} ms`);
    assert.ok(childPid,'the check started its process');
    const until=Date.now()+1_000;while(Date.now()<until&&alive(childPid!))await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(alive(childPid!),false,'the process the running check started outlived TALOS');
  }finally{if(childPid)try{process.kill(childPid,'SIGKILL');}catch{}for(const name of names){const value=saved[name];if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});

/*
 * R3 (coordinator review; owner standing rule): a check never ends a pid it cannot prove to be its own. What it left
 * running for that reason is never silently ignored: quitting states it in the development log.
 */
test('R3-SP Q-R3-13: quitting TALOS states the pids a stopped check could not prove and left running',async()=>{
  const {mkdtemp,mkdir,readdir,readFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {main}=await import('../../src/main.ts');const {runIsolationCheck}=await import('../../src/security/execution-backends.ts');
  const home=await mkdtemp(join(tmpdir(),'talos-r3-sp-main-left-'));const project=join(home,'project');await mkdir(project);
  const names=['APPDATA','LOCALAPPDATA','XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','TALOS_CREDENTIAL_STORE','TALOS_TEST_PROFILE','TALOS_CLI_DEV_LOG_DIR'] as const;
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const logDir=join(home,'devlog');
  Object.assign(process.env,{APPDATA:join(home,'appdata'),LOCALAPPDATA:join(home,'local'),XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state'),XDG_CACHE_HOME:join(home,'cache'),TALOS_CREDENTIAL_STORE:'memory',TALOS_TEST_PROFILE:'1',TALOS_CLI_DEV_LOG_DIR:logDir});
  /* No process is involved: the stopped check reports a pid it could not prove (a number no one owns here). */
  const LEFT=4_242_424;
  try{
    const runtime:any={close:async()=>{}};
    const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
    const runTui=async()=>{
      void runIsolationCheck((signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
        signal.addEventListener('abort',()=>reject(Object.assign(new Error('PROCESS_TREE_PROBE_ABORTED'),{name:'AbortError',leftover:[LEFT]})),{once:true});
      })).catch(()=>{});
    };
    const code=await main(['--project',project],{io,createRuntimeContext:async()=>({runtime,tuiCatalog:{}}),runTui} as any);
    assert.equal(code,0,io.stderr);
    const records:any[]=[];
    for(const file of await readdir(logDir))for(const line of (await readFile(join(logDir,file),'utf8')).split('\n'))if(line.trim())records.push(JSON.parse(line));
    const stated=records.find(record=>record.event==='cli.isolation.left_running');
    assert.ok(stated,'quitting did not state what the stopped check left running');
    assert.deepEqual(stated.data.pids,[LEFT]);
    assert.equal(stated.severity,'warning');
  }finally{for(const name of names){const value=saved[name];if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
