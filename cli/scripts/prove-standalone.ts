/*
 * R6 closing proof (owner requirement 2026-09-25: the CLI package works ON ITS OWN, without the desktop or mobile files,
 * not nested in their lanes). It stages the release (scripts/stage-release.mjs: prepack builds and copies the kernel into
 * vendor/; the main package gains its Windows platform packages), installs `talos-code` from a local registry GLOBALLY
 * into an empty prefix under the system temp folder (outside the monorepo), and runs the
 * installed `talos` from an empty project folder, hermetic: private APPDATA/LOCALAPPDATA/HOME, memory credential store,
 * secret-named variables stripped, a local fake provider, and the refusing sink as proxy (nothing may leave 127.0.0.1).
 * Checks:
 *   1. `talos --version`, `talos doctor --json`, `talos model use`, `talos project trust`, `talos -p "hello"` succeed;
 *      the turn reaches the fake provider and prints its answer;
 *   2. every module the installed CLI loads resolves INSIDE the install prefix (a load hook records them): nothing from
 *      the monorepo, nothing from the desktop or mobile folders;
 *   3. nothing is written inside the installed package (a hash of every file before and after);
 *   4. the sink saw no request.
 * Usage: node scripts/prove-standalone.ts   (prints a JSON report; exit 1 on any failed check)
 */
import {execFile,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startFakeProvider} from '../test/acceptance/fake-provider.ts';
import {sinkEnv,startRefusingSink} from '../test/acceptance/sink.ts';
import {childEnvironment} from '../test/acceptance/profile.ts';

const here=dirname(fileURLToPath(import.meta.url));
const CLI=resolve(here,'..');const REPO=resolve(CLI,'..');
const SECRET=/(KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE)/iu;
const npm=process.platform==='win32'?'npm.cmd':'npm';

function hashTree(root:string):Record<string,string>{
  const out:Record<string,string>={};
  const walk=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const full=join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='node_modules')walk(full);}else if(entry.isFile())out[full.slice(root.length+1).replaceAll('\\','/')]=createHash('sha256').update(readFileSync(full)).digest('hex');}};
  walk(root);return out;
}

const home=mkdtempSync(join(tmpdir(),'talos-standalone-'));
const report:Record<string,unknown>={home,checks:{}};const checks=report.checks as Record<string,unknown>;
const fail=(name:string,detail:unknown)=>{checks[name]={ok:false,detail};};
const pass=(name:string,detail:unknown=null)=>{checks[name]={ok:true,...(detail===null?{}:{detail})};};
const fake=await startFakeProvider();const sink=await startRefusingSink();
try{
  if(resolve(home).toLowerCase().startsWith(REPO.toLowerCase()))throw new Error('the temp folder is inside the monorepo');
  /* 1. Stage the release as it will be published (scripts/stage-release.mjs: prepack, then the main package with its
     platform packages as optional dependencies, and the two Windows platform packages), serve it from a local registry
     (scripts/local-registry.mjs; everything else comes from the real one) and install `talos-code@<ver>` globally into an
     empty prefix: npm itself resolves the alias and picks the platform package by os/cpu (owner 02/10, registro 12). */
  const packDir=join(home,'pack');
  const {stageRelease}=await import('./stage-release.mjs');const {startLocalRegistry}=await import('./local-registry.mjs');
  const staged=await stageRelease({cliRoot:CLI,out:packDir});
  const tarball=staged.main;
  report.tarball={file:tarball,bytes:statSync(tarball).size,platforms:Object.fromEntries(Object.entries(staged.platforms).map(([platform,file])=>[platform,statSync(file as string).size]))};
  const manifestOf=(dir:string)=>JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  const registry=await startLocalRegistry({latest:staged.version,entries:[
    {manifest:manifestOf(join(packDir,'talos-code')),tarball},
    ...Object.entries(staged.platforms).map(([platform,file])=>({manifest:manifestOf(join(packDir,'platforms',`talos-code-${platform}`)),tarball:file})),
  ]});
  const prefix=join(home,'prefix');mkdirSync(prefix);
  const installStarted=Date.now();
  const install=await new Promise<{status:number|null;stdout:string;stderr:string}>(done=>execFile(npm,['install','-g','--prefix',prefix,`talos-code@${staged.version}`,'--registry',registry.url,'--prefer-offline','--no-audit','--no-fund'],{encoding:'utf8',shell:process.platform==='win32',maxBuffer:64*1024*1024},(error:any,stdout,stderr)=>done({status:error?(typeof error.code==='number'?error.code:1):0,stdout:String(stdout),stderr:String(stderr)})));
  await registry.close();
  if(install.status!==0)throw new Error(`npm install failed: ${install.stderr||install.stdout}`);
  const name=JSON.parse(readFileSync(join(CLI,'package.json'),'utf8')).name;
  const pkg=process.platform==='win32'?join(prefix,'node_modules',name):join(prefix,'lib','node_modules',name);
  {
    const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
    const installed=walk(pkg);
    report.install={ms:Date.now()-installStarted,files:installed.length,megabytes:Math.round(installed.reduce((sum,file)=>sum+statSync(file).size,0)/1048576*10)/10};
  }
  /* Platform packages: the sandbox and node-pty only inside this machine's platform package, never at the top. */
  {
    const own=process.platform==='win32'&&['x64','arm64'].includes(process.arch)?`talos-code-win32-${process.arch}`:null;
    const present=['talos-code-win32-x64','talos-code-win32-arm64'].filter(alias=>existsSync(join(pkg,'node_modules',alias,'package.json')));
    const atTop=['@microsoft/mxc-sdk','node-pty'].filter(module=>existsSync(join(pkg,'node_modules',...module.split('/'))));
    const sdkInside=own===null||existsSync(join(pkg,'node_modules',own,'vendor','node_modules','@microsoft','mxc-sdk','dist','index.js'));
    JSON.stringify(present)===JSON.stringify(own?[own]:[])&&atTop.length===0&&sdkInside?pass('only this machine\'s platform package',{present}):fail('only this machine\'s platform package',{own,present,atTop,sdkInside});
  }
  const main=join(pkg,'dist','main.js');
  /* P-F (owner 08/10/2026): the package ships the BUNDLED kernel (kernel/, scripts/bundle-kernel.mjs), not the loose vendored files; the inlined npm packages are not installed.
     Owner 27/10/2026 («Misura vera»): the count of the bundle's files (< 150, a proxy for startup) is gone; the startup itself is
     measured against the previous release below (scripts/startup-gate.ts). The count stays in the report. */
  let vendorFiles:number|null=null;let kernelOutputs:number|null=null;
  try{const manifest=JSON.parse(readFileSync(join(pkg,'kernel','manifest.json'),'utf8'));vendorFiles=manifest.vendorFiles;kernelOutputs=Object.keys(manifest.outputs??{}).length;}catch{vendorFiles=null;}
  report.installed={pkg,vendorFiles,kernelOutputs};vendorFiles?pass('the kernel is in the package',vendorFiles):fail('the kernel is in the package','kernel/manifest.json missing');
  {
    const looseCopy=existsSync(join(pkg,'vendor'));
    const inlined=['ai','zod','@ai-sdk/openai','@ai-sdk/anthropic','@ai-sdk/google','@modelcontextprotocol/client','canonicalize','eventsource-parser','unicode-segmenter'].filter(name=>existsSync(join(pkg,'node_modules',...name.split('/'))));
    const licences=existsSync(join(pkg,'kernel','THIRD_PARTY_LICENSES.txt'))&&existsSync(join(pkg,'dist','THIRD_PARTY_LICENSES.txt'));
    !looseCopy&&inlined.length===0&&licences&&(kernelOutputs??0)>0?pass('a bundled kernel, no loose copy, no inlined package installed',{kernelOutputs}):fail('a bundled kernel, no loose copy, no inlined package installed',{looseCopy,inlined,licences,kernelOutputs});
  }
  /* Installation, documents (owner 02/10): the document libraries are built into vendor/node_modules and NOT installed; the
     installed kernel's own generator must still make and verify a PDF, a DOCX, an XLSX and a PPTX from them. */
  {
    const stray=['docx','jszip','pdf-lib','pdfmake','pptxgenjs','xlsx','pdfjs-dist','@napi-rs/canvas'].filter(name=>existsSync(join(pkg,'node_modules',...name.split('/'))));
    const generator=pathToFileURL(join(pkg,'kernel','harness-ui','src','document-generator.mjs')).href;
    /* Desktop F-001 (merged 02/10): the installed kernel's `leggi` extracts the text of the same documents back — jszip and
       xlsx by `require`, pdf.js from its files in vendor/node_modules (scripts/pack-documents.mjs). */
    const extractor=pathToFileURL(join(pkg,'kernel','harness-ui','src','kernel','estrai-documento.mjs')).href;
    const probe=join(home,'documents.mjs');
    writeFileSync(probe,`const {generateTalosDocument,verifyTalosDocument}=await import(${JSON.stringify(generator)});const {estraiTestoDocumento}=await import(${JSON.stringify(extractor)});const out={};
for(const format of ['pdf','docx','xlsx','pptx']){const document=await generateTalosDocument({format,title:'TALOS proof',body:'Caffè 中文 TALOS',rows:[['TALOS a','b'],['1','2']]});out[format]=await verifyTalosDocument(document);
const read=await estraiTestoDocumento(document.bytes,format).catch(error=>({error:String(error?.message??error)}));out[format]={...out[format],readBack:typeof read?.testo==='string'&&read.testo.includes('TALOS'),...(read?.error?{readError:read.error}:{})};}
console.log(JSON.stringify(out));\n`);
    const run=spawnSync(process.execPath,[probe],{cwd:home,encoding:'utf8',timeout:120_000});
    let made:Record<string,{ok?:boolean;readBack?:boolean}>|null=null;try{made=JSON.parse(run.stdout.trim().split('\n').at(-1)??'');}catch{made=null;}
    const allOk=made&&['pdf','docx','xlsx','pptx'].every(format=>made![format]?.ok===true&&made![format]?.readBack===true);
    stray.length===0&&allOk?pass('documents from the built libraries',made):fail('documents from the built libraries',{stray,made,stderr:run.stderr.slice(0,2000)});
  }
  /* R7: every file under the package's dist/ is the output of a source that exists today (2026-09-25: 148 stale files of
     removed code, Hermes's tui2 bundle among them, were in the first dry run). */
  const distFiles=Object.keys(hashTree(join(pkg,'dist')));
  /* Startup stage (01/10): dist/ is the esbuild bundle (scripts/bundle.mjs) — its three entries and its chunks, nothing else. */
  const stale=distFiles.filter(rel=>!/^(?:(?:main|windows-notification-worker|mxc-support-worker|chunk-[A-Z0-9]+)\.js|THIRD_PARTY_LICENSES\.txt)$/u.test(rel));
  stale.length===0&&distFiles.length>0?pass('no stale build output',distFiles.length):fail('no stale build output',{files:distFiles.length,stale:stale.slice(0,20),count:stale.length});
  const before=hashTree(pkg);
  /* 2. A hermetic environment and a load hook that records every module file the installed CLI resolves. */
  const dirs=Object.fromEntries(['appdata','localappdata','user','project'].map(d=>{const p=join(home,d);mkdirSync(p,{recursive:true});return[d,p];}));
  const traceFile=join(home,'trace.jsonl');const hook=join(home,'hook.mjs');
  writeFileSync(hook,`import {registerHooks} from 'node:module';import {appendFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
const out=${JSON.stringify(traceFile)};const seen=new Set();
registerHooks({resolve(s,c,next){const r=next(s,c);try{if(r.url.startsWith('file:'))seen.add(fileURLToPath(r.url));}catch{}return r;}});
process.on('exit',()=>{appendFileSync(out,[...seen].join('\\n')+'\\n');});\n`);
  // The parent can be a CI job or TERM=dumb shell; the child is a real synthetic terminal.
  const base:Record<string,string>={};for(const [k,v] of Object.entries(childEnvironment()))if(v!==undefined&&!SECRET.test(k)&&!/^(TALOS_|OLLAMA_|NODE_OPTIONS$)/u.test(k))base[k]=v;
  const env={...base,APPDATA:dirs.appdata,LOCALAPPDATA:dirs.localappdata,USERPROFILE:dirs.user,HOME:dirs.user,TALOS_TEST_PROFILE:'1',TALOS_CREDENTIAL_STORE:'memory',OLLAMA_BASE_URL:fake.url,NODE_OPTIONS:`--import=${pathToFileURL(hook).href}`,...sinkEnv(sink)};
  const talos=(args:string[])=>spawnSync(process.execPath,[main,...args],{cwd:dirs.project,env,encoding:'utf8',timeout:120_000});
  const version=talos(['--version']);version.status===0?pass('version',version.stdout.trim()):fail('version',version.stderr);
  const doctor=talos(['doctor','--json']);
  try{const parsed=JSON.parse(doctor.stdout);pass('doctor',{exit:doctor.status,ok:parsed.ok,catalog:parsed.sections?.catalog?.state});}catch{fail('doctor',{exit:doctor.status,stderr:doctor.stderr.slice(0,500)});}
  const use=talos(['model','use','ollama:qwen3-coder-test','--scope','user']);use.status===0?pass('model use'):fail('model use',use.stdout+use.stderr);
  const trust=talos(['project','trust','--include-nested']);trust.status===0?pass('project trust'):fail('project trust',trust.stdout+trust.stderr);
  /* The turn runs ASYNC: the fake provider lives in this process, and a synchronous child would block it (the first run
     of this proof timed out that way). */
  const turn=await new Promise<{status:number|null;stdout:string;stderr:string}>(done=>execFile(process.execPath,[main,'-p','hello standalone'],{cwd:dirs.project,env,encoding:'utf8',timeout:120_000},(error:any,stdout,stderr)=>done({status:error?(typeof error.code==='number'?error.code:null):0,stdout:String(stdout),stderr:String(stderr)})));
  const reached=fake.chatRequests().some(r=>r.lastUser?.includes('hello standalone'));
  turn.status===0&&reached&&/\bOK\b/u.test(turn.stdout)?pass('-p turn',turn.stdout.trim().slice(0,200)):fail('-p turn',{exit:turn.status,reached,stdout:turn.stdout.slice(0,500),stderr:turn.stderr.slice(0,800)});
  /* 2b. The kernel's data stores (notes, tasks, memory) and a TUI session on a synthetic terminal: the kernel's default
     data folders are relative to its src (desktop session, 2026-09-25), so they would land INSIDE the package unless the
     CLI passes its own; check 4 below sees any such write. */
  for(const [label,args] of [['notes add',['notes','add','Standalone note','written by the standalone proof']],['tasks add',['tasks','add','Standalone task','written by the standalone proof']],['memory add',['memory','add','Standalone memory','written by the standalone proof']],['notes list',['notes','list']]] as const){
    const r=talos([...args]);r.status===0?pass(label):fail(label,(r.stdout+r.stderr).slice(0,400));
  }
  {
    const {TerminalSession}=await import('../test/acceptance/terminal.ts');
    const {composerReady,idleFooter}=await import('../test/acceptance/checks.ts');
    const t=new TerminalSession(process.execPath,[main],{cols:100,rows:30,cwd:dirs.project,env});
    try{
      const first=await t.waitFor('first paint',x=>x.text.trim()!=='',{timeout:30_000});if(/BOOT\s+\d+%/u.test(first.text))t.press('space');
      await t.waitFor('the composer',x=>composerReady(x)&&idleFooter(x),{timeout:30_000});
      await t.submit('hello tui');
      /* the approved mockup draws the answer under a two-cell indent */
      await t.waitFor('the answer',x=>/^ {2}OK$/mu.test(x.text)&&idleFooter(x),{timeout:60_000});
      await t.submit('/status');
      /* stage 7.11: /status is the Settings sheet; its Work row reads the tasks and notes back */
      const status=await t.waitFor('the status sheet',x=>/── Settings/u.test(x.text)&&/Work +tasks open \d+ · notes \d+/u.test(x.text),{timeout:20_000});
      /tasks open 1/u.test(status.text)&&/notes 1/u.test(status.text)?pass('TUI turn and /status (tasks and notes read back)'):fail('TUI turn and /status (tasks and notes read back)',status.text.slice(-600));
      /* the Settings sheet takes the first Ctrl+C (it closes the sheet): Esc closes it first, so TALOS exits on its own and the
         trace hook (written at exit) records every module it loaded, the sandbox's included */
      t.press('esc');await t.waitFor('the sheet closed',x=>!/── Settings/u.test(x.text),{timeout:10_000});
      t.press('ctrl+c');if(!await t.waitForExit(400))t.press('ctrl+c');await t.waitForExit(10_000);
    }catch(error){fail('TUI turn and /status (tasks and notes read back)',error instanceof Error?error.message.slice(0,800):String(error));}
    finally{await t.close();}
  }
  /* 2b'. Owner 27/10/2026 («Misura vera»): the warm start to a ready composer against the previous release, same machine, same
     run, the two interleaved, each on its own fresh profile with the same model and trust; red over +10 % (startup-gate.ts). */
  {
    const {previousReleaseMain,startupVerdict,STARTUP_RUNS,STARTUP_WARMUP}=await import('./startup-gate.ts');
    const {TerminalSession}=await import('../test/acceptance/terminal.ts');
    const {composerReady,idleFooter}=await import('../test/acceptance/checks.ts');
    const CHECK='startup within 10 % of the previous release';
    const previous=await previousReleaseMain({name,currentVersion:staged.version,currentMain:main,home});
    if(!previous)fail(CHECK,'no previous release to compare with (set TALOS_STARTUP_BASELINE_MAIN)');
    else{
      type Side={main:string;cwd:string;env:Record<string,string>};
      const side=(label:string,entry:string):Side=>{
        const d=Object.fromEntries(['appdata','localappdata','user','project'].map(k=>{const p=join(home,`startup-${label}`,k);mkdirSync(p,{recursive:true});return[k,p];}));
        /* the trace hook stays out: it would weigh on one program's start and not on the other's */
        const {NODE_OPTIONS:_hook,...rest}=env;
        return{main:entry,cwd:d.project!,env:{...rest,APPDATA:d.appdata!,LOCALAPPDATA:d.localappdata!,USERPROFILE:d.user!,HOME:d.user!}};
      };
      const sides={now:side('now',main),before:side('before',previous.main)};
      /* review E4/E7: a profile that was not prepared measures another start, and what the older release asks of the network is
         not this package's: its requests leave the sink's list, the check «no outbound request» is about the package */
      const asReference=async<T>(run:()=>T|Promise<T>)=>{const seen=sink.hits.length;try{return await run();}finally{sink.hits.length=seen;}};
      const prepare=(s:Side)=>[['model','use','ollama:qwen3-coder-test','--scope','user'],['project','trust','--include-nested']]
        .map(args=>spawnSync(process.execPath,[s.main,...args],{cwd:s.cwd,env:s.env,encoding:'utf8',timeout:120_000})).find(run=>run.status!==0)?.stderr??null;
      const unprepared=prepare(sides.now)??await asReference(()=>prepare(sides.before));
      if(unprepared!==null){fail(CHECK,`a profile was not prepared: ${unprepared.slice(0,400)}`);}
      else{
      /* one start: from the spawn to a ready composer (the first launch of a profile plays the boot, a key skips it), then an orderly exit */
      const start=async(s:Side)=>{
        const t=new TerminalSession(process.execPath,[s.main],{cols:100,rows:30,cwd:s.cwd,env:s.env});const t0=performance.now();let ready=-1;
        try{
          while(performance.now()-t0<30_000){
            await new Promise(r=>setTimeout(r,5));const x=t.screen();
            if(/BOOT\s+\d+%|Press any key to skip/u.test(x.text))t.press('space');
            if(composerReady(x)&&idleFooter(x)){ready=performance.now()-t0;break;}
          }
          t.press('ctrl+c');if(!await t.waitForExit(400))t.press('ctrl+c');await t.waitForExit(10_000);
        }finally{await t.close();}
        return Math.round(ready);
      };
      const startBefore=()=>asReference(()=>start(sides.before));
      for(let i=0;i<STARTUP_WARMUP;i+=1){await start(sides.now);await startBefore();}
      const now:number[]=[],before:number[]=[];
      for(let i=0;i<STARTUP_RUNS;i+=1){now.push(await start(sides.now));before.push(await startBefore());}
      const verdict=startupVerdict(now,before);
      report.startup={previous:{version:previous.version,source:previous.source},...verdict};
      verdict.ok?pass(CHECK,{medianNow:verdict.medianNow,medianBefore:verdict.medianBefore,ratio:verdict.ratio}):fail(CHECK,verdict);
      }
    }
  }
  /* 2c. The semantic gate's TypeScript base types (desktop fix f8eab2d2c, brought in as ff4f5d829): npm pack never carries
     vendor/harness-ui/node_modules, so the kernel's fixed path is absent here and the fallback must find the package's own
     typescript. */
  {
    const harness=pathToFileURL(join(pkg,'kernel','harness-ui','src','kernel','talosHarness.mjs')).href;
    const probe=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(harness)});if(typeof m.leggiLibreriaStandardTs!=='function'){console.log('NOT_EXPORTED');}else{const t=await m.leggiLibreriaStandardTs('lib.es5.d.ts');console.log(t&&t.includes('interface Math')?'READ':'NULL');}`],{cwd:dirs.project,env:{...env,NODE_OPTIONS:''},encoding:'utf8',timeout:60_000});
    const verdict=probe.stdout.trim().split('\n').pop();
    const fixedAbsent=!existsSync(join(pkg,'kernel','harness-ui','node_modules','typescript','lib'));
    verdict==='READ'&&fixedAbsent?pass('TypeScript base types readable in the package'):fail('TypeScript base types readable in the package',{verdict,fixedAbsent,stderr:probe.stderr.slice(0,400)});
  }
  /* 3. Every loaded module inside the prefix (or Node's own). */
  const loaded=[...new Set(readFileSync(traceFile,'utf8').split('\n').filter(Boolean))];
  const outside=loaded.filter(file=>!resolve(file).toLowerCase().startsWith(resolve(prefix).toLowerCase())&&file!==hook);
  const fromRepo=loaded.filter(file=>resolve(file).toLowerCase().startsWith(REPO.toLowerCase()));
  report.loaded={count:loaded.length,bundledKernel:loaded.filter(f=>f.replaceAll('\\','/').includes('/kernel/harness-ui/src/')).length,looseKernel:loaded.filter(f=>f.replaceAll('\\','/').includes('/vendor/harness-ui/src/')).length};
  fromRepo.length===0&&outside.length===0?pass('modules only from the install'):fail('modules only from the install',{fromRepo:fromRepo.slice(0,10),outside:outside.slice(0,10)});
  /* The TUI asks the sandbox once after the boot (R3 Q-R3-13): on Windows its SDK and node-pty load from the platform
     package and from nowhere else. */
  {
    const slash=(file:string)=>file.replaceAll('\\','/');
    const native=loaded.filter(file=>/\/(@microsoft\/mxc-sdk|node-pty)\/(dist|lib)\//u.test(slash(file)));
    const fromPlatform=native.filter(file=>slash(file).includes('/node_modules/talos-code-win32-'));
    const expected=process.platform==='win32'&&['x64','arm64'].includes(process.arch);
    (expected?native.length>0&&fromPlatform.length===native.length:native.length===0)?pass('sandbox from the platform package',{modules:native.length}):fail('sandbox from the platform package',{expected,native:native.slice(0,10)});
  }
  /* 4. Nothing written inside the package. */
  const after=hashTree(pkg);
  const changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(f=>before[f]!==after[f]);
  changed.length===0?pass('nothing written in the package'):fail('nothing written in the package',changed.slice(0,20));
  sink.hits.length===0?pass('no outbound request'):fail('no outbound request',sink.hits);
}catch(error){fail('run',error instanceof Error?error.message:String(error));}
finally{await fake.close();await sink.close();}
const ok=Object.values(checks).every((c:any)=>c.ok);
report.ok=ok;
console.log(JSON.stringify(report,null,1));
if(ok&&!process.argv.includes('--keep'))rmSync(home,{recursive:true,force:true});else console.error(`kept for inspection: ${home}`);
process.exitCode=ok?0:1;
