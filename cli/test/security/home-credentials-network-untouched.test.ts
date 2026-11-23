/*
 * 0.6.18 (F0, judge v2365; measure of 20/11/2026 on e831cda5f, 4104 cells): since 0.6.8 the check «is this one of the computer's
 * login credentials?» (home-credentials.ts) OPENED a network path written in a command or a tool call (`realpathSync.native`,
 * `statSync`) before any card, in every mode: Windows then signs in to that computer with the person's credentials. Here a disk
 * SPY wraps every node:fs function before the engine is loaded: a network path is recorded and answered ENOENT, the real
 * function is NEVER called; a local path (`\\?\C:\…`, `\\.\C:\…` included) goes to the real disk. Host names are invented.
 * NOTHING is executed: only the text of a command reaches the permission engine.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {hostname,tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

/* ── the spy: installed before the engine's modules are imported (they import node:fs by name) ── */
const hits:{fn:string;path:string;from:string}[]=[];
/* this disk through the device namespace (`\\.\C:\…`, `\\.\GLOBALROOT\Device\HarddiskVolumeN\…`) goes to the real disk */
const isNetwork=(text:string)=>/^[\\/]{2}/u.test(text)&&!/^[\\/]{2}[?.][\\/](?:[A-Za-z]:|GLOBALROOT[\\/]Device[\\/]HarddiskVolume\d+\.*(?:[\\/]|$))/iu.test(text);
const asText=(value:unknown)=>typeof value==='string'?value:Buffer.isBuffer(value)?value.toString('utf8'):value instanceof URL&&value.host&&value.host!=='localhost'?'//'+value.host+value.pathname:null;
const TWO=new Set(['rename','renameSync','copyFile','copyFileSync','link','linkSync','symlink','symlinkSync','cp','cpSync']);
function wrap(label:string,real:(...a:any[])=>any,kind:'sync'|'exists'|'cb'|'promise'){
  const base=label.replace(/\.native$/u,'').replace(/^promises\./u,'');
  return function(this:unknown,...args:any[]){
    let hit:string|null=null;
    for(let i=0;i<(TWO.has(base)?2:1)&&i<args.length;i+=1){const t=asText(args[i]);if(t!==null&&isNetwork(t)){hit=t;break;}}
    if(hit===null)return real.apply(this,args);
    const from=String(new Error().stack).split('\n').slice(2).map(l=>l.trim()).find(l=>/cli[\\/](src|vendor)[\\/]/u.test(l))??'?';
    hits.push({fn:label,path:hit,from});
    const error=Object.assign(new Error(`ENOENT (spy): ${label} '${hit}'`),{code:'ENOENT',path:hit});
    if(kind==='exists')return false;
    if(kind==='promise')return Promise.reject(error);
    if(kind==='sync')throw error;
    const cb=[...args].reverse().find(a=>typeof a==='function');if(cb)process.nextTick(cb,base==='exists'?false:error);return undefined;
  };
}
for(const name of Object.keys(fs)){
  const real=(fs as any)[name];if(typeof real!=='function'||!/^[a-z]/u.test(name))continue;
  const spy:any=wrap(name,real,name==='existsSync'?'exists':name.endsWith('Sync')?'sync':'cb');
  if(typeof real.native==='function')spy.native=wrap(name+'.native',real.native,name.endsWith('Sync')?'sync':'cb');
  (fs as any)[name]=spy;
}
for(const name of Object.keys(fsp)){const real=(fsp as any)[name];if(typeof real==='function'&&/^[a-z]/u.test(name))(fsp as any)[name]=wrap('promises.'+name,real,'promise');}
syncBuiltinESMExports();
const touches=<T>(run:()=>T):{value:T;touched:typeof hits}=>{const start=hits.length;const value=run();return{value,touched:hits.slice(start)};};
const touchesAsync=async<T>(run:()=>Promise<T>):Promise<{value:T;touched:typeof hits}>=>{const start=hits.length;const value=await run();return{value,touched:hits.slice(start)};};

const {isHomeCredential,commandNamesHomeCredential}=await import('../../src/security/home-credentials.ts');
const {createPermissionEngine}=await import('../../src/security/permission-engine.ts');
const {permissionActionFromApproval}=await import('../../src/security/from-approval.ts');
const {backslashGlobSecretCheck,kernelSecretClassifier}=await import('../../src/security/permission-dry-run.ts');
const {findTalosRepoRoot}=await import('../../src/runtime/repo.ts');

const WINDOWS=process.platform==='win32';
const H='ospite-finto-talos';
const home=mkdtempSync(path.join(tmpdir(),'talos-net-home-'));
const project=path.join(home,'work','project');mkdirSync(project,{recursive:true});mkdirSync(path.join(home,'.ssh'));
writeFileSync(path.join(home,'.npmrc'),'x');writeFileSync(path.join(home,'.ssh','id_ed25519'),'x');writeFileSync(path.join(project,'a.txt'),'x');
/* a hand-made environment: never the whole process.env */
const environment={LOGONSERVER:'\\\\'+H,USERPROFILE:home};
const o={cwd:project,home,environment};

/* every spelling of a file on another computer that Windows would open over the network */
const NETWORK=[
  `\\\\${H}\\c\\f.txt`,`//${H}/c/f.txt`,`\\\\.\\UNC\\${H}\\c\\f.txt`,`\\\\?\\UNC\\${H}\\c\\f.txt`,`//./UNC/${H}/c/f.txt`,
  `\\\\${H}@SSL\\c\\f.txt`,`\\\\${H}@80\\c\\f.txt`,`\\\\${H}@SSL@443\\DavWWWRoot\\f.txt`,
  `\\\\${H}/c\\f.txt`,`/\\${H}\\c/f.txt`,`\\/${H}/c\\f.txt`,`\\\\.\\GLOBALROOT\\Device\\Mup\\${H}\\c\\f.txt`,
  `\\\\${H}\\c\\.ssh\\id_ed25519`,`//${H}/c/.npmrc`,`\\\\${H.toUpperCase()}\\C$\\Users\\me\\.ssh\\id_ed25519`,'%LOGONSERVER%\\c\\.ssh\\id_ed25519',
  `\\\\${H}\\c\\id_*`,`//${H}/c/*`,`\\\\${H}\\c\\.ssh\\*`,`\\\\${H}\\c\\%NOT_SET_ANYWHERE%\\x`,`\\\\${H}\\`,
  /* review of 20/11 (security, R1): the same UNC object through the device namespace's other names; the lowercase `unc` too */
  `\\\\.\\GLOBAL\\UNC\\${H}\\c\\f.txt`,`//./GLOBAL/UNC/${H}/c/f.txt`,`\\\\.\\GLOBALROOT\\DosDevices\\UNC\\${H}\\c\\f.txt`,`\\\\.\\GLOBAL\\GLOBALROOT\\Device\\Mup\\${H}\\c\\f.txt`,
  `\\\\.\\GLOBALROOT\\GLOBAL??\\UNC\\${H}\\c\\.ssh\\id_ed25519`,`\\\\.\\unc\\${H}\\c\\f.txt`,`\\\\.\\GLOBALROOT\\Device\\RdpDr\\;:1\\tsclient\\C\\f.txt`,
  /* review of 20/11, round 2 (security R3): Windows drops a trailing dot from each name of a device path; and the bare UNC root */
  `\\\\.\\GLOBAL.\\UNC\\${H}\\c\\f.txt`,`\\\\.\\UNC.\\${H}\\c\\f.txt`,`\\\\.\\GLOBALROOT\\DosDevices.\\UNC\\${H}\\c\\f.txt`,
  `\\\\.\\GLOBALROOT.\\Device\\Mup\\${H}\\c\\f.txt`,`\\\\.\\GLOBALROOT\\Device\\Mup.\\${H}\\c\\.ssh\\id_ed25519`,`\\\\.\\UNC\\`,
];
const SPELLED=NETWORK.flatMap(t=>[t,`"${t}"`,`'${t}'`]);
const show=(list:typeof hits)=>[...new Set(list.map(h=>`${h.fn} ${h.path} <- ${h.from}`))].slice(0,12).join('\n');

test('red on 0.6.17: the credential check never opens a network path, in any spelling',{skip:!WINDOWS},()=>{
  const touched:typeof hits=[];
  for(const target of SPELLED){
    touched.push(...touches(()=>isHomeCredential(target,o)).touched);
    touched.push(...touches(()=>commandNamesHomeCredential(`type ${target}`,o)).touched);
  }
  assert.equal(touched.length,0,`${touched.length} network touches before the decision:\n${show(touched)}`);
  for(const target of NETWORK)assert.equal(isHomeCredential(target,o),false,'another computer\'s file is not this computer\'s credential: '+target);
});

const MODES=[['default',true],['acceptEdits',true],['plan',true],['bypassPermissions',true],['default',false],['bypassPermissions',false]] as const;
const ACTIONS=[(t:string)=>({tipo:'shell',comando:`cat ${t}`}),(t:string)=>({tipo:'shell',comando:`type ${t}`}),(t:string)=>({tipo:'shell',comando:`cp a.txt ${t}`}),
  (t:string)=>({tipo:'shell',comando:`mv a.txt ${t}`}),(t:string)=>({tipo:'shell',comando:`rm ${t}`}),(t:string)=>({tipo:'shell',comando:`mkdir ${t}`}),
  (t:string)=>({tipo:'leggi',percorso:t}),(t:string)=>({tipo:'scrivi',percorso:t}),(t:string)=>({tipo:'file_edit',percorso:t})];
function withHome<T>(userProfile:string,run:()=>Promise<T>):Promise<T>{
  const saved={USERPROFILE:process.env.USERPROFILE,HOME:process.env.HOME,LOGONSERVER:process.env.LOGONSERVER};
  process.env.USERPROFILE=userProfile;process.env.HOME=userProfile;process.env.LOGONSERVER='\\\\'+H;
  return run().finally(()=>{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
}

test('red on 0.6.17: the engine decides every mode without opening a network path (shell, read, write, edit; marked or not)',{skip:!WINDOWS},async()=>{
  await withHome(home,async()=>{
    const repoRoot=findTalosRepoRoot(project);
    const touched:typeof hits=[];let cells=0;
    for(const [mode,interactive] of MODES)for(const marked of [false,true]){
      /* riga 202: a fake reader of the Windows setting, so no reg.exe runs here */
      const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},mode,secretRecheck:backslashGlobSecretCheck(kernelSecretClassifier(repoRoot,project)),remoteToLocalLinks:()=>'unknown'});
      for(const target of SPELLED)for(const make of ACTIONS){
        const azione:any=make(target);if(azione.tipo!=='shell'&&/^["']/u.test(target))continue;
        if(marked)azione.percorsoDiRete={ospite:H,via:'stringa'};
        cells+=1;
        touched.push(...(await touchesAsync(()=>engine.decide(permissionActionFromApproval({azione}),{interactive,mode,sessionId:'s1'}))).touched);
      }
    }
    assert.ok(cells>2000,String(cells));
    assert.equal(touched.length,0,`${touched.length} network touches in ${cells} cells:\n${show(touched)}`);
  });
});

test('a home on a share keeps today\'s check on its own computer: its keys still ask in Full access, another computer is not opened',{skip:!WINDOWS},async()=>{
  const shareHome='\\\\casa-finta-talos\\utenti\\me';
  const s={cwd:project,home:shareHome,environment:{USERPROFILE:shareHome}};
  for(const target of ['~\\.ssh\\id_ed25519','%USERPROFILE%\\.npmrc','\\\\casa-finta-talos\\utenti\\me\\.ssh\\id_ed25519','\\\\CASA-FINTA-TALOS\\utenti\\me\\.npmrc','//casa-finta-talos/utenti/me/.aws/credentials'])
    assert.equal(isHomeCredential(target,s),true,'the home\'s credential on its share: '+target);
  const other=touches(()=>[`\\\\${H}\\c\\.ssh\\id_ed25519`,`//${H}/c/f.txt`,`\\\\.\\UNC\\${H}\\c\\f`].map(t=>isHomeCredential(t,s)));
  assert.deepEqual(other.value,[false,false,false]);
  assert.equal(other.touched.filter(h=>h.path.toLowerCase().includes(H)).length,0,show(other.touched));
  await withHome(shareHome,async()=>{
    const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]}});
    const action=permissionActionFromApproval({azione:{tipo:'shell',comando:'type ~\\.ssh\\id_ed25519'}});
    assert.equal((await engine.decide(action,{interactive:true,mode:'bypassPermissions'})).kind,'ask','Full access asks, as today');
    assert.equal((await engine.decide(action,{interactive:false,mode:'bypassPermissions'})).kind,'deny','-p Full access refuses, as today');
    const read=permissionActionFromApproval({azione:{tipo:'leggi',percorso:'%USERPROFILE%\\.npmrc'}});
    assert.equal((await engine.decide(read,{interactive:true,mode:'bypassPermissions'})).kind,'ask');
  });
});

test('a project on a share: its own words are not opened by the credential check; an unknown start still fails closed',{skip:!WINDOWS},()=>{
  const nas='\\\\nas-finto-talos\\lavoro';
  const n={cwd:nas,home,environment};
  const own=touches(()=>['src\\b.ts','a.txt','.ssh\\*','.ssh\\id_*','.\\x\\*','\\\\nas-finto-talos\\lavoro\\b.ts'].map(t=>isHomeCredential(t,n)));
  assert.deepEqual(own.value,[false,false,false,false,false,false]);
  assert.equal(own.touched.length,0,show(own.touched));
  /* the unknown start is judged by its last names without the disk, as today: a project on a share does not lose it */
  for(const target of ['%NOT_SET_ANYWHERE%\\.ssh\\id_rsa','$NOT_SET/.npmrc'])assert.equal(isHomeCredential(target,n),true,target);
  /* a local credential written in full is still one (the share is the project folder, opened as today) */
  assert.equal(isHomeCredential(path.join(home,'.ssh','id_ed25519'),n),true);
});

test('local spellings stay as today: \\\\?\\C: and \\\\.\\C: are this disk, the WSL home is not another computer',{skip:!WINDOWS},()=>{
  /* `\\.\C:\…` is opened on this disk and is the key (real path); `\\?\C:\…` goes through the unresolved branch (a `?`), as in 0.6.17 */
  assert.equal(isHomeCredential('\\\\.\\'+path.join(home,'.ssh','id_ed25519'),o),true);
  assert.equal(isHomeCredential('\\\\.\\'+path.join(home,'.npmrc'),o),true);
  const wsl=touches(()=>isHomeCredential('\\\\wsl.localhost\\Ubuntu\\home\\me\\.ssh\\id_ed25519',o));
  assert.ok(wsl.touched.length>0,'the WSL home is this machine: checked as before (it is opened)');
  /* a glob with a network-looking start that today is read under the project (lost leading slashes): unchanged */
  const parent=path.dirname(home);const name=path.basename(home);
  assert.equal(isHomeCredential(`\\\\${name}\\*\\.npmrc`,{cwd:parent,home,environment}),true,'as in 0.6.17');
});

test('the networks this check recognises are the kernel\'s network paths',{skip:!WINDOWS},async()=>{
  const repoRoot=findTalosRepoRoot(project);
  const {classificaPercorsoDiRete}=await import(new URL('file:///'+path.join(repoRoot,'harness-ui','src','kernel','file-namespace-contract.mjs').replace(/\\/gu,'/')).href);
  for(const target of NETWORK.filter(t=>/^[\\/]/u.test(t)&&!/[*%]/u.test(t))){
    assert.notEqual(classificaPercorsoDiRete(target,{platform:'win32'}),null,'the kernel calls it a network or NT path: '+target);
    assert.equal(touches(()=>isHomeCredential(target,o)).touched.length,0,target);
  }
  for(const local of ['\\\\?\\C:\\x','C:\\x','\\\\wsl.localhost\\Ubuntu\\x','\\\\wsl$\\Ubuntu\\x'])assert.notEqual(classificaPercorsoDiRete(local,{platform:'win32'}),'rete',local);
});

/* 0.6.18: this computer's administrative share is its own disk (narrower only: in 0.6.17 a key reached this way ran in Full access) */
test('\\\\localhost\\C$\\… is this computer\'s disk: a key reached that way asks, nothing is opened over the network',{skip:!WINDOWS},async()=>{
  const drive=home.slice(0,1);const rest=home.slice(3);
  const ways=[`\\\\localhost\\${drive}$\\${rest}`,`//127.0.0.1/${drive.toLowerCase()}$/${rest.replace(/\\/gu,'/')}`,`\\\\?\\UNC\\localhost\\${drive}$\\${rest}`,`\\\\.\\UNC\\127.1\\${drive}$\\${rest}`,`\\\\${hostname()}\\${drive}$\\${rest}`];
  const seen=touches(()=>ways.flatMap(way=>[isHomeCredential(way+'\\.ssh\\id_ed25519',o),isHomeCredential(way+'\\.npmrc',o),isHomeCredential(way+'\\.ssh\\*',o),isHomeCredential(way+'\\work\\project\\a.txt',o)]));
  assert.deepEqual(seen.value,ways.flatMap(()=>[true,true,true,false]),'the key asks, an ordinary project file does not');
  assert.equal(seen.touched.length,0,show(seen.touched));
  /* a home written as this computer's share is the same home */
  assert.equal(isHomeCredential('~\\.ssh\\id_ed25519',{cwd:project,home:ways[0]!,environment}),true);
  assert.equal(isHomeCredential(path.join(home,'.npmrc'),{cwd:project,home:ways[0]!,environment}),true);
  await withHome(home,async()=>{
    const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]}});
    const action=permissionActionFromApproval({azione:{tipo:'shell',comando:`type ${ways[0]}\\.ssh\\id_ed25519`}});
    assert.equal((await engine.decide(action,{interactive:true,mode:'bypassPermissions'})).kind,'ask');
    assert.equal((await engine.decide(action,{interactive:false,mode:'bypassPermissions'})).kind,'deny');
  });
});

/* review of 20/11 (correctness R1-R2, reproduction 1-2, security R1): no answer wider than 0.6.17, and the spellings the review found */
test('this computer\'s share never answers more widely than 0.6.17: home and project opened through it, a project in a credential folder',{skip:!WINDOWS},async()=>{
  const drive=home.slice(0,1);const rest=home.slice(3);const adminHome=`\\\\localhost\\${drive}$\\${rest}`;const adminProject=adminHome+'\\work\\project';
  /* R1: home written as the share and the project opened through it: a relative path to a real key is still a key */
  const a={cwd:adminProject,home:adminHome,environment:{USERPROFILE:adminHome}};
  const r1=touches(()=>['..\\..\\.npmrc','../../.ssh/id_ed25519','..\\..\\.ssh\\*'].map(target=>isHomeCredential(target,a)));
  assert.deepEqual(r1.value,[true,true,true]);
  assert.equal(r1.touched.length,0,'read as this disk, home and project together: nothing opened through the share\n'+show(r1.touched));
  await withHome(adminHome,async()=>{
    const engine=createPermissionEngine({projectRoot:adminProject,rules:{allow:[],ask:[],deny:[]}});
    for(const azione of [{tipo:'shell',comando:'type ..\\..\\.npmrc'},{tipo:'shell',comando:'cat ../../.ssh/id_ed25519'},{tipo:'leggi',percorso:'..\\..\\.ssh\\id_ed25519'}]){
      assert.equal((await engine.decide(permissionActionFromApproval({azione}),{interactive:true,mode:'bypassPermissions'})).kind,'ask',JSON.stringify(azione));
      assert.equal((await engine.decide(permissionActionFromApproval({azione}),{interactive:false,mode:'bypassPermissions'})).kind,'deny',JSON.stringify(azione));
    }
  });
  /* R2: a project inside a credential folder (~/.docker/proj): 0.6.17 asked for every `\\localhost\C$\…` (`C$` read as a wildcard); it still does */
  const docker=path.join(home,'.docker','proj');mkdirSync(docker,{recursive:true});
  const d={cwd:docker,home,environment};
  for(const target of [`\\\\localhost\\${drive}$\\Windows\\win.ini`,`\\\\127.0.0.1\\${drive}$\\Windows\\win.ini`,`${adminHome}\\.docker\\proj\\a.txt`])assert.equal(isHomeCredential(target,d),true,target);
  await withHome(home,async()=>{
    const engine=createPermissionEngine({projectRoot:docker,rules:{allow:[],ask:[],deny:[]}});
    const azione={tipo:'shell',comando:`type \\\\localhost\\${drive}$\\Windows\\win.ini`};
    assert.equal((await engine.decide(permissionActionFromApproval({azione}),{interactive:true,mode:'bypassPermissions'})).kind,'ask');
  });
  /* reproduction 1-2: capitals are the same computer; another computer's C$ and this computer's name under another domain are not this disk */
  assert.equal(isHomeCredential(`\\\\LOCALHOST\\${drive.toLowerCase()}$\\${rest}\\.npmrc`,o),true);
  for(const other of [`\\\\${H}\\${drive}$\\${rest}\\.npmrc`,`\\\\${hostname()}.esterno-finto.example\\${drive}$\\${rest}\\.npmrc`])
    assert.equal(isHomeCredential(other,o),false,other);
  /* security R1: this disk through GLOBALROOT is not a network: the key is still recognised, as in 0.6.17 */
  const volume=[...Array(40).keys()].map(n=>`\\\\.\\GLOBALROOT\\Device\\HarddiskVolume${n}\\${rest}`).find(p=>fs.existsSync(p+'\\.npmrc'));
  assert.ok(volume,'this disk\'s volume name');
  assert.equal(isHomeCredential(volume+'\\.ssh\\id_ed25519',o),true,volume);
  /* round 2: the trailing dot dropped from the names does not turn this disk into another computer */
  const dotted=volume!.replace(/(HarddiskVolume\d+)/u,(name:string)=>name+'.');
  assert.equal(isHomeCredential(dotted+'\\.ssh\\id_ed25519',o),true,dotted);
});

/* noise: the commands of every day ask exactly as before (no card more, none less) */
test('noise: twenty everyday commands decide as in 0.6.17',{skip:!WINDOWS},async()=>{
  await withHome(home,async()=>{
    const COMMANDS=['git status','git diff --stat','git log --oneline -5','npm test','npm run build','npx tsc --noEmit','node script.js','dir','ls -la','type a.txt',
      'cat a.txt','findstr TODO *.ts','rg TODO src','mkdir out','echo hi > out.txt','cp a.txt b.txt','mv b.txt c.txt','rm c.txt','python -m pytest','cargo build'];
    const answers:string[]=[];
    for(const [mode,interactive] of MODES){
      const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},mode});
      for(const comando of COMMANDS){const d:any=await engine.decide(permissionActionFromApproval({azione:{tipo:'shell',comando}}),{interactive,mode,sessionId:'s1'});answers.push(d.kind);}
    }
    /* a = allow, d = deny, ask = asked; 20 commands per mode, in the order of MODES (measured on e831cda5f) */
    assert.equal(answers.map(k=>k==='ask'?'?':k[0]).join(''),NOISE_0617,'the same answers as 0.6.17, command by command');
  });
});
/* the same string with the cure: no card more, none less */
const NOISE_0617='aaa????aaaaaa?d?????aaa????aaaaaaadaaa??aaaddddaaaaaadddddddaaaaaaaaaaaaaaaaaaaaaaaddddaaaaaadddddddaaaaaaaaaaaaaaaaaaaa';