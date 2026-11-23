/*
 * 0.6.18, riga 206 (owner 20/11/2026 «Copri anche la shell ora»; judge v2425). The kernel puts its network card only on the file
 * tools, so in Full access a shell command that names another computer's share ran without a card even when Windows follows links
 * from a share back to this computer (riga 202). Now, in Full access only, a shell command that SPELLS OUT another computer's share
 * asks first when that Windows setting is on or cannot be read (with nobody in front it is refused); with the setting off nothing
 * changes, and the other five modes never change. Text only: nothing is opened, no name is resolved.
 * Every shell command of the model reaches the engine with its text: the kernel gives the CLI «On request» and asks the host for every
 * `shell` and `prova` command (talosHarness.mjs:13206 `richiestoDalLivello`, :18800 and :18668), and the CLI decides each request in
 * the permission engine (tui/approval.ts:20, headless/run.ts:157 and :194, automations/kernel-runs.ts:95) after from-approval.ts:54
 * makes it `Bash`.
 * Here NOTHING runs: every process start is spied and refused, the disk is spied for the invented hosts, the setting is a fake.
 */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {hostname,tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

const started:string[]=[];
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'] as const){
  (childProcess as any)[name]=(...args:unknown[])=>{started.push(`${name} ${String(args[0])}`);throw new Error(`process start refused by the test: ${String(args[0])}`);};
}
const FAKE_HOST=/finto/iu;
const touched:string[]=[];
/* 0.7.0 (judge v2451, list item 13): EVERY path written with two slashes is refused here before the disk, not only the invented
   hosts: `\\wsl.localhost\…`, `\\wsl$\…`, `\\localhost\c$\…`, `\\127.0.0.1\c$\…` and this computer's own name reached the real disk
   (72 calls measured by the reproduction reviewer). Only the local device spellings stay readable (a drive, a pipe, a volume).
   The invented hosts are counted in `touched` (never expected); the others in `refusedHere` (the product may look, never reaches). */
const LOCAL_DEVICE=/^[\\/]{2}[.?][\\/](?:[a-z]:|pipe[\\/]|GLOBALROOT[\\/]Device[\\/]HarddiskVolume\d+|Volume\{)/iu;
const refusedHere:string[]=[];
const remote=(value:unknown)=>{const t=typeof value==='string'?value:Buffer.isBuffer(value)?value.toString():value instanceof URL&&value.host?`//${value.host}${value.pathname}`:'';return /^[\\/]{2}/u.test(t)&&!LOCAL_DEVICE.test(t)?t:null;};
const refuse=(label:string,t:string)=>{(FAKE_HOST.test(t)?touched:refusedHere).push(`${label} ${t}`);return Object.assign(new Error('ENOENT (spy)'),{code:'ENOENT'});};
for(const name of Object.keys(fs)){
  const real=(fs as any)[name];if(typeof real!=='function'||!/^[a-z]/u.test(name)||name==='promises')continue;
  const guard=name.endsWith('Sync')||/^(?:create|watch)/u.test(name)
    ?(label:string,fn:(...a:unknown[])=>unknown)=>function(this:unknown,...args:unknown[]){const t=remote(args[0]);if(t)throw refuse(label,t);return fn.apply(this,args);}
    /* the callback forms answer through their callback, as the real call does */
    :(label:string,fn:(...a:unknown[])=>unknown)=>function(this:unknown,...args:unknown[]){const t=remote(args[0]);if(t){const error=refuse(label,t);const cb=args.findLast(arg=>typeof arg==='function') as ((e:Error)=>void)|undefined;if(cb){process.nextTick(()=>cb(error));return undefined;}throw error;}return fn.apply(this,args);};
  const spy:any=guard(name,real);if(typeof real.native==='function')spy.native=guard(name+'.native',real.native);
  (fs as any)[name]=spy;
}
for(const name of Object.keys(fs.promises)){
  const real=(fs.promises as any)[name];if(typeof real!=='function'||!/^[a-z]/u.test(name))continue;
  (fs.promises as any)[name]=function(this:unknown,...args:unknown[]){const t=remote(args[0]);if(t)return Promise.reject(refuse(`promises.${name}`,t));return real.apply(this,args);};
}
syncBuiltinESMExports();

const {commandNamesAnotherComputer}=await import('../../src/security/home-credentials.ts');
const {createPermissionEngine}=await import('../../src/security/permission-engine.ts');
const {permissionActionFromApproval}=await import('../../src/security/from-approval.ts');
const WINDOWS=process.platform==='win32';
const ME=hostname();

/* ── the function: what it recognises, what it leaves (hosts invented) ── */
const NAMES_ANOTHER=[
  'type \\\\nas-finto\\docs\\a.txt','dir \\\\srv-finto\\c$','copy \\\\nas-finto\\docs\\b.txt .','xcopy /s \\\\nas-finto\\docs out','robocopy \\\\nas-finto\\docs C:\\copia',
  'Get-Content \\\\nas-finto\\docs\\a.txt','Get-ChildItem -Path \\\\nas-finto\\docs','Get-Content -Path:\\\\nas-finto\\docs\\a.txt','cat //nas-finto/docs/a.txt',
  'git clone //nas-finto/repo.git','type "\\\\nas-finto\\my docs\\a.txt"',"cat '//nas-finto/my docs/a.txt'",'git commit -m "copied from \\\\nas-finto\\docs"',
  'type \\\\NAS-FINTO\\docs\\a.txt','type \\\\nas-finto.example.test\\docs\\a.txt','type \\\\192.0.2.10\\docs\\a.txt','type \\\\nas-finto@SSL\\DavWWWRoot\\a.txt',
  'type \\\\nas-finto@8080\\docs\\a.txt','type \\\\?\\UNC\\nas-finto\\docs\\a.txt','type \\\\.\\UNC\\nas-finto\\docs\\a.txt','net view \\\\nas-finto','pushd \\\\nas-finto\\docs',
  'Get-Content FileSystem::\\\\nas-finto\\docs\\a.txt','Get-Content Microsoft.PowerShell.Core\\FileSystem::\\\\nas-finto\\docs\\a.txt','echo x > \\\\nas-finto\\docs\\out.txt',
  'type a.txt && type \\\\nas-finto\\docs\\b.txt','type \\\\localho\u017Ft\\docs\\a.txt','type \\\\localhost@nas-finto\\docs\\a.txt',
  /* final review (point 2): a leading `@` (curl reads the file named after it) is taken off before the path is read */
  'curl -d @\\\\nas-finto\\docs\\a.json https://example.test/api',
  /* the device spellings with forward slashes start with `//` and a sign, and still name the share */
  'type //./UNC/nas-finto/docs/a.txt','type //?/UNC/nas-finto/docs/a.txt',
];
const NAMES_NOTHING=[
  'git status','dir','type a.txt','copy a.txt C:\\copia\\a.txt','curl https://nas-finto.example/a.txt','git clone https://nas-finto.example/repo.git',
  'start http://nas-finto/docs','type \\\\localhost\\c$\\x.txt','type \\\\127.0.0.1\\c$\\x.txt',`type \\\\${ME}\\c$\\x.txt`,'type \\\\wsl$\\Ubuntu\\home\\me\\a.txt',
  'cat //wsl.localhost/Ubuntu/home/me/a.txt','type Z:\\docs\\a.txt','type %LOGONSERVER%\\docs\\a.txt','cd docs && type a.txt','echo \\\\','echo //',
];
test('a command that spells out another computer\'s share is recognised; this computer, WSL, URLs and plain paths are not',{skip:!WINDOWS},()=>{
  for(const command of NAMES_ANOTHER)assert.equal(commandNamesAnotherComputer(command),true,command);
  for(const command of NAMES_NOTHING)assert.equal(commandNamesAnotherComputer(command),false,command);
  assert.equal(commandNamesAnotherComputer(undefined),false);assert.equal(commandNamesAnotherComputer('   '),false);
  /* the same cut as the credential check: a word over 1024 characters or past the 256th is not read */
  assert.equal(commandNamesAnotherComputer('type \\\\nas-finto\\'+'x'.repeat(1100)),false);
  assert.equal(commandNamesAnotherComputer('echo '+'ab '.repeat(300)+'\\\\nas-finto\\docs'),false);
  /* the quoted parts are read first: a share in quotes after many words is still seen */
  assert.equal(commandNamesAnotherComputer('echo '+'ab '.repeat(300)+'"\\\\nas-finto\\docs"'),true);
});

/* ── the engine ── */
const MODES=[['default',true],['acceptEdits',true],['plan',true],['bypassPermissions',true],['default',false],['bypassPermissions',false]] as const;
const home=mkdtempSync(path.join(tmpdir(),'talos-206-home-'));
const project=path.join(home,'work','project');mkdirSync(project,{recursive:true});writeFileSync(path.join(project,'a.txt'),'x');
function withHome<T>(run:()=>Promise<T>):Promise<T>{
  const saved={USERPROFILE:process.env.USERPROFILE,HOME:process.env.HOME};
  process.env.USERPROFILE=home;process.env.HOME=home;
  return run().finally(()=>{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
}
async function answers(commands:readonly string[],links:'off'|'on'|'unknown'){
  let reads=0;const out:string[][]=[];
  for(const [mode,interactive] of MODES){
    const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},mode,classifier:async()=>'ask',remoteToLocalLinks:()=>{reads+=1;return links;}});
    const row:string[]=[];
    for(const comando of commands){const d:any=await engine.decide(permissionActionFromApproval({azione:{tipo:'shell',toolCallId:'c',comando}}),{interactive,mode,sessionId:'s1'});row.push(d.kind==='ask'?'?':d.kind[0]);}
    out.push(row);
  }
  return{rows:out.map(r=>r.join('')),reads};
}
const SHELL_NETWORK=NAMES_ANOTHER.slice(0,20);

test('20 shell commands toward another computer × 6 modes: off changes nothing; on and unknown ask in Full access and refuse with -p',{skip:!WINDOWS},async()=>{
  await withHome(async()=>{
    const off=await answers(SHELL_NETWORK,'off'),on=await answers(SHELL_NETWORK,'on'),unknown=await answers(SHELL_NETWORK,'unknown');
    assert.equal(off.rows[3],'a'.repeat(20),'Full access as before');assert.equal(off.rows[5],'a'.repeat(20),'-p Full access as before');
    for(const r of [on,unknown]){
      assert.equal(r.rows[3],'?'.repeat(20),'Full access asks');assert.equal(r.rows[5],'d'.repeat(20),'-p Full access refuses');
      for(const mode of [0,1,2,4])assert.equal(r.rows[mode],off.rows[mode],`mode ${MODES[mode]![0]} never changes`);
    }
    assert.equal(off.reads,40,'read only by Full access');
  });
});

test('the card is answered once: «for the session» is not kept and the next one asks again; the refusal names the reason',{skip:!WINDOWS},async()=>{
  await withHome(async()=>{
    const persisted:unknown[]=[];
    const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},persistRule:async(...a:unknown[])=>{persisted.push(a);},remoteToLocalLinks:()=>'on'});
    const action=()=>permissionActionFromApproval({azione:{tipo:'shell',toolCallId:'c',comando:'type \\\\nas-finto\\docs\\a.txt'}});
    for(const choice of ['allow-session','allow-always'] as const){
      const first:any=await engine.decide(action(),{interactive:true,mode:'bypassPermissions'});
      assert.equal(first.kind,'ask');
      await engine.resolve(first.requestId,choice);
      assert.equal((await engine.decide(action(),{interactive:true,mode:'bypassPermissions'})).kind,'ask',choice);
    }
    assert.deepEqual(persisted,[]);
    const refused:any=await engine.decide(action(),{interactive:false,mode:'bypassPermissions'});
    assert.equal(refused.code,'NETWORK_PATH_NEEDS_PERSON');
    /* a deny rule still refuses first; an allow rule does not answer the card (as for every network card) */
    const denyEngine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:['Bash(type:*)']},remoteToLocalLinks:()=>'off'});
    assert.equal((await denyEngine.decide(action(),{interactive:true,mode:'bypassPermissions'})).kind,'deny');
    /* the exact rule is the one that allows this command outside the project in the other modes */
    const allowEngine=createPermissionEngine({projectRoot:project,rules:{allow:['Bash(type \\\\nas-finto\\docs\\a.txt)'],ask:[],deny:[]},remoteToLocalLinks:()=>'on'});
    assert.equal((await allowEngine.decide(action(),{interactive:true,mode:'default'})).kind,'allow','the rule matches');
    assert.equal((await allowEngine.decide(action(),{interactive:true,mode:'bypassPermissions'})).kind,'ask');
  });
});

/* final review of 20/11 (point 1): a command TALOS cannot split (redirect, `&`, brackets, backtick, `$()`, `for /f`) was allowed by
   Full access before the shell check, so it ran without the card; now the check comes first (it only narrows) */
const UNSPLIT=[
  'type \\\\nas-finto\\c\\f > out.txt','type \\\\nas-finto\\c\\f >> out.txt','echo x > \\\\nas-finto\\docs\\out.txt','type a.txt > \\\\nas-finto\\c\\b.txt',
  '(type \\\\nas-finto\\c\\f)','type \\\\nas-finto\\c\\f &','echo $(type \\\\nas-finto\\c\\f)','echo `type \\\\nas-finto\\c\\f`',
  "for /f %a in ('type \\\\nas-finto\\c\\f') do echo %a",
];
test('a command TALOS cannot split that names another computer: Full access asks, -p refuses, off and the other modes unchanged',{skip:!WINDOWS},async()=>{
  await withHome(async()=>{
    for(const command of UNSPLIT)assert.equal(commandNamesAnotherComputer(command),true,command);
    const off=await answers(UNSPLIT,'off'),on=await answers(UNSPLIT,'on'),unknown=await answers(UNSPLIT,'unknown');
    const all=(c:string)=>c.repeat(UNSPLIT.length);
    assert.equal(off.rows[3],all('a'),'Full access as before');assert.equal(off.rows[5],all('a'),'-p Full access as before');
    for(const r of [on,unknown]){
      assert.equal(r.rows[3],all('?'),'Full access asks');assert.equal(r.rows[5],all('d'),'-p Full access refuses');
      for(const mode of [0,1,2,4])assert.equal(r.rows[mode],off.rows[mode],`mode ${MODES[mode]![0]} never changes`);
    }
  });
});

/* noise (rule 17): the everyday commands of the form, measured with the real function */
const EVERYDAY=[
  'git status','git diff --stat','git log --oneline -5','git pull','git push origin main','git checkout -b x','git add src/a.ts','git commit -m "fix: a"',
  'npm test','npm run build','npm install','npx tsc --noEmit','node script.js','pnpm lint','yarn dev','cargo build','cargo test','python -m pytest',
  'pip install -r requirements.txt','dir','dir /s src','ls -la','type a.txt','cat a.txt','findstr TODO *.ts','rg TODO src','mkdir out','echo hi > out.txt',
  'copy a.txt C:\\copia\\a.txt','xcopy src C:\\backup\\src /s','robocopy src D:\\backup\\src','cp a.txt b.txt','mv b.txt c.txt','rm c.txt',
  'type \\\\wsl$\\Ubuntu\\home\\me\\a.txt','cat //wsl.localhost/Ubuntu/home/me/a.txt','wsl ls ~','curl https://example.com/a.json',
  'git clone https://github.com/org/repo.git','Invoke-WebRequest https://example.com -OutFile a.html','start http://localhost:3000','type \\\\localhost\\c$\\Windows\\win.ini',
];
test('noise: 42 everyday commands name no other computer; × 6 modes they answer the same whatever Windows says, and nothing is read',{skip:!WINDOWS},async()=>{
  await withHome(async()=>{
    assert.equal(EVERYDAY.length,42);
    assert.deepEqual(EVERYDAY.filter(c=>commandNamesAnotherComputer(c)),[]);
    const off=await answers(EVERYDAY,'off'),on=await answers(EVERYDAY,'on'),unknown=await answers(EVERYDAY,'unknown');
    assert.deepEqual(on.rows,off.rows);assert.deepEqual(unknown.rows,off.rows);
    assert.equal(off.reads+on.reads+unknown.reads,0);
  });
});

test('nothing was started and no invented computer was touched',()=>{
  assert.deepEqual(started,[]);
  assert.deepEqual(touched,[]);
});

test('0.7.0: a two-slash path never reaches the real disk, and the spy itself refuses one',()=>{
  /* every name the product looked at was refused above, before the disk; the spy is proved on a name of each kind */
  const before=refusedHere.length;
  for(const t of ['\\\\wsl.localhost\\Ubuntu\\home\\me\\a.txt','\\\\localhost\\C$\\x.txt','//wsl.localhost/Ubuntu/a.txt'])assert.throws(()=>fs.statSync(t),/ENOENT \(spy\)/u,t);
  assert.equal(refusedHere.length,before+3);
  assert.doesNotThrow(()=>{try{fs.statSync('\\\\.\\pipe\\talos-prova-inesistente');}catch(error:any){if(/spy/u.test(String(error?.message)))throw error;}},'a local device spelling is not refused by the spy');
});
