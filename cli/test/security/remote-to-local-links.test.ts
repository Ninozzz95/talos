/*
 * 0.6.18, riga 202 (owner 20/11/2026 12:19, «chiede solo dove serve»; judge v2421). In Full access a network path on ANOTHER
 * computer used to open without a card (decision 157). Windows can follow a link on that computer's share back to this
 * computer («Remote to local» symbolic links, `fsutil behavior query SymlinkEvaluation`), and then a key of this computer is
 * read through a name that is not this computer's. Now Full access opens it without a card only when Windows says those links
 * are OFF; when they are on, or TALOS cannot tell (the value missing included), it asks, and with nobody in front it refuses.
 * Sources (read 20/11/2026): Microsoft Learn «fsutil behavior» (R2L:{1|0}); «Policy CSP - ADMX_FileSys», SymlinkEvaluation:
 * «If this policy is Disabled or Not Configured, local administrators may select the types of symbolic links to be evaluated.»
 * Here NOTHING runs: the registry reader is a fake passed as a parameter, every way to start a process is spied and refused,
 * the disk is spied for the invented hosts, and only the text of a command reaches the permission engine.
 */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

/* ── spies, installed before the modules under test are imported ── */
const started:string[]=[];
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'] as const){
  (childProcess as any)[name]=(...args:unknown[])=>{started.push(`${name} ${String(args[0])}`);throw new Error(`process start refused by the test: ${String(args[0])}`);};
}
const FAKE_HOST=/-finto(?:-|\b)/iu;
const touched:string[]=[];
for(const name of Object.keys(fs)){
  const real=(fs as any)[name];if(typeof real!=='function'||!/^[a-z]/u.test(name)||!name.endsWith('Sync'))continue;
  const spy:any=function(this:unknown,...args:unknown[]){const t=typeof args[0]==='string'?args[0]:'';if(FAKE_HOST.test(t)){touched.push(`${name} ${t}`);throw Object.assign(new Error('ENOENT (spy)'),{code:'ENOENT'});}return real.apply(this,args);};
  if(typeof real.native==='function')spy.native=function(this:unknown,...args:unknown[]){const t=typeof args[0]==='string'?args[0]:'';if(FAKE_HOST.test(t)){touched.push(`${name}.native ${t}`);throw Object.assign(new Error('ENOENT (spy)'),{code:'ENOENT'});}return real.native.apply(this,args);};
  (fs as any)[name]=spy;
}
syncBuiltinESMExports();

const {createRemoteToLocalLinks,createRegistryRun,readRemoteToLocalLinks,regExePath,POLICY_KEY,POLICY_ROOT,LOCAL_KEY}=await import('../../src/security/remote-to-local-links.ts');
const {isAnotherComputer}=await import('../../src/security/home-credentials.ts');
const {createPermissionEngine}=await import('../../src/security/permission-engine.ts');
const {permissionActionFromApproval}=await import('../../src/security/from-approval.ts');

/* ── the fake reader: what `reg.exe query …` would print, never run ── */
type Out={status:number|null;stdout:string;failed?:boolean};
const ABSENT:Out={status:1,stdout:''};
const FAILED:Out={status:null,stdout:'',failed:true};
const listing=(key:string,values:Record<string,string>):Out=>({status:0,stdout:`\r\n${key}\r\n`+Object.entries(values).map(([n,v])=>`    ${n}    ${v.includes(' ')?v:'REG_DWORD    '+v}\r\n`).join('')+'\r\n'});
/* the keys above the policy key: a listing prints each subkey as a whole key path (never translated) */
const long=(key:string)=>key.replace(/^HKLM\\/u,'HKEY_LOCAL_MACHINE\\');
const sub=(key:string,children:string[]):Out=>({status:0,stdout:`\r\n${long(key)}\r\n`+children.map(c=>`${long(key)}\\${c}\r\n`).join('')+'\r\n'});
const FS=POLICY_KEY.replace(/\\NTFS$/u,''),WIN=FS.replace(/\\Filesystems$/u,''),MS=WIN.replace(/\\Windows$/u,'');
/* a typical PC: Policies\Microsoft\Windows exists, without Filesystems */
const TYPICAL:Record<string,Out>={[POLICY_ROOT]:sub(POLICY_ROOT,['Microsoft']),[MS]:sub(MS,['Windows','Cryptography']),[WIN]:sub(WIN,['DataCollection','System'])};
function fakeReg({policy=ABSENT,keys=TYPICAL,local}:{policy?:Out;keys?:Record<string,Out>;local:Out}){
  const calls:string[]=[];
  const run=(args:readonly string[])=>{
    calls.push(args.join(' '));
    if(args.length===2&&args[1]===POLICY_KEY)return policy;
    if(args.length===2&&Object.hasOwn(keys,args[1]!))return keys[args[1]!]!;
    if(args.length===2&&[FS,WIN,MS,POLICY_ROOT].includes(args[1]!))return ABSENT;
    if(args.length===4&&args[1]===LOCAL_KEY&&args[2]==='/v'&&args[3]==='SymlinkRemoteToLocalEvaluation')return local;
    throw new Error('unexpected reg query: '+args.join(' '));
  };
  return{run,calls};
}
const localValue=(v:string)=>listing(LOCAL_KEY,{SymlinkRemoteToLocalEvaluation:v});
const policyValues=(values:Record<string,string>)=>listing(POLICY_KEY,values);

/* ── the eight cases of the form (policy first, then the local value) ── */
const CASES:[string,{policy?:Out;keys?:Record<string,Out>;local:Out},'off'|'on'|'unknown'][]=[
  ['1 no policy, local 0',{local:localValue('0x0')},'off'],
  ['2 no policy, local 1',{local:localValue('0x1')},'on'],
  ['3 policy on with R2L 1, local 0',{policy:policyValues({SymLinkState:'0x1',SymlinkRemoteToLocalEvaluation:'0x1'}),local:localValue('0x0')},'on'],
  ['4 policy on with R2L 0, local 1',{policy:policyValues({SymLinkState:'0x1',SymlinkRemoteToLocalEvaluation:'0x0'}),local:localValue('0x1')},'off'],
  ['4 policy on with R2L missing, local 1',{policy:policyValues({SymLinkState:'0x1'}),local:localValue('0x1')},'off'],
  ['5 policy off, local 0',{policy:policyValues({SymLinkState:'0x0',SymlinkRemoteToLocalEvaluation:'0x1'}),local:localValue('0x0')},'off'],
  ['5 policy off, local 1',{policy:policyValues({SymLinkState:'0x0'}),local:localValue('0x1')},'on'],
  ['5 policy key without SymLinkState, local 1',{policy:policyValues({Other:'0x1'}),local:localValue('0x1')},'on'],
  ['6 no policy, local value missing',{local:ABSENT},'unknown'],
  ['6 no policy, local listed without the value',{local:listing(LOCAL_KEY,{LongPathsEnabled:'0x1'})},'unknown'],
  ['7 reg.exe does not start or times out',{local:FAILED},'unknown'],
  ['7 local value 2',{local:localValue('0x2')},'unknown'],
  ['7 local value not a number',{local:{status:0,stdout:'    SymlinkRemoteToLocalEvaluation    REG_DWORD    zz\r\n'}},'unknown'],
  ['7 local value of another type',{local:localValue('REG_SZ    1')},'unknown'],
  ['7 local value of another type written like a DWORD',{local:localValue('REG_SZ    0x1')},'unknown'],
  ['7 local read printed 0 but failed (killed, timed out)',{local:{status:0,stdout:'    SymlinkRemoteToLocalEvaluation    REG_DWORD    0x0\r\n',failed:true}},'unknown'],
  ['7 output that cannot be read',{local:{status:0,stdout:'\u0000\u0001garbage'}},'unknown'],
  ['8 policy read fails to start',{policy:FAILED,local:localValue('0x0')},'unknown'],
  ['8 policy key not read and no key above it read either, up to the policy root (not «not found»)',{policy:ABSENT,keys:{},local:localValue('0x0')},'unknown'],
  /* second round, point 4: a policy key that exists but cannot be read (access denied ends like «not found») is never «absent» */
  ['8 policy key listed by its parent but not read',{policy:ABSENT,keys:{...TYPICAL,[WIN]:sub(WIN,['Filesystems']),[FS]:sub(FS,['NTFS'])},local:localValue('0x0')},'unknown'],
  ['8 policy key listed in other capitals, not read, reg.exe ends with 5',{policy:{status:5,stdout:''},keys:{...TYPICAL,[WIN]:sub(WIN,['Filesystems']),[FS]:sub(FS,['ntfs'])},local:localValue('0x0')},'unknown'],
  ['8 a key above it listed but not read',{policy:ABSENT,keys:{...TYPICAL,[WIN]:sub(WIN,['FILESYSTEMS'])},local:localValue('0x0')},'unknown'],
  ['8 a key above it that fails to start',{policy:ABSENT,keys:{...TYPICAL,[FS]:FAILED},local:localValue('0x0')},'unknown'],
  ['1 policy key not there: the nearest key read lists only similar names',{policy:ABSENT,keys:{...TYPICAL,[WIN]:sub(WIN,['FilesystemsOld']),[FS]:ABSENT},local:localValue('0x0')},'off'],
  ['1 policy key not there: its parent is read and does not list it',{policy:ABSENT,keys:{...TYPICAL,[WIN]:sub(WIN,['Filesystems']),[FS]:sub(FS,['NTFS-old'])},local:localValue('0x0')},'off'],
  /* riga 206, point (A) of the judge (reviewer of the second round, 2.184 wider answers): the policy root not read is unknown ALWAYS,
     whatever a nearer key says */
  ['8 a nearer key says «not there» but the policy root is not read',{policy:ABSENT,keys:{...TYPICAL,[POLICY_ROOT]:ABSENT},local:localValue('0x0')},'unknown'],
  ['8 a nearer key says «not there» but the policy root fails to start',{policy:ABSENT,keys:{...TYPICAL,[POLICY_ROOT]:FAILED},local:localValue('0x0')},'unknown'],
  ['8 the parent says «not there» but the policy root ends with 5',{policy:ABSENT,keys:{...TYPICAL,[WIN]:sub(WIN,['Filesystems']),[FS]:sub(FS,['Other']),[POLICY_ROOT]:{status:5,stdout:''}},local:localValue('0x1')},'unknown'],
  ['8 policy SymLinkState 2',{policy:policyValues({SymLinkState:'0x2'}),local:localValue('0x0')},'unknown'],
  ['8 policy on with R2L 5',{policy:policyValues({SymLinkState:'0x1',SymlinkRemoteToLocalEvaluation:'0x5'}),local:localValue('0x0')},'unknown'],
];
for(const [name,setup,expected] of CASES){
  test(`case ${name}: ${expected}`,()=>{
    const {run,calls}=fakeReg(setup);
    assert.equal(readRemoteToLocalLinks(run),expected);
    assert.ok(calls.length>=1&&calls.length<=6,calls.join(' | '));
    assert.equal(calls[0],`query ${POLICY_KEY}`,'the policy is read first');
  });
}

test('the policy decides alone when it is on: the local value is never read',()=>{
  const {run,calls}=fakeReg({policy:policyValues({SymLinkState:'0x1',SymlinkRemoteToLocalEvaluation:'0x0'}),local:localValue('0x1')});
  assert.equal(readRemoteToLocalLinks(run),'off');
  assert.deepEqual(calls,[`query ${POLICY_KEY}`]);
});

test('value names are read whatever their capitals; a reader that throws is unknown',()=>{
  assert.equal(readRemoteToLocalLinks(fakeReg({local:{status:0,stdout:'    symlinkremotetolocalevaluation    REG_DWORD    0x1\r\n'}}).run),'on');
  assert.equal(readRemoteToLocalLinks(()=>{throw new Error('boom');}),'unknown');
});

test('read once per process, only when asked; outside Windows never read and off',()=>{
  const {run,calls}=fakeReg({local:localValue('0x0')});
  const links=createRemoteToLocalLinks({platform:'win32',run});
  assert.equal(calls.length,0,'nothing is read before the first question');
  for(let i=0;i<20;i+=1)assert.equal(links(),'off');
  /* no policy key on a typical PC: the policy key, the keys above it up to the first one read (to tell «not there» from «not read»)
     and the local value, once */
  assert.deepEqual(calls,[`query ${POLICY_KEY}`,`query ${FS}`,`query ${WIN}`,`query ${POLICY_ROOT}`,`query ${LOCAL_KEY} /v SymlinkRemoteToLocalEvaluation`]);
  const elsewhere=fakeReg({local:localValue('0x1')});
  const linux=createRemoteToLocalLinks({platform:'linux',run:elsewhere.run});
  assert.equal(linux(),'off');
  assert.equal(elsewhere.calls.length,0);
});

test('reg.exe is named by its whole path under the system folder, never looked up in PATH',()=>{
  assert.equal(regExePath('C:\\Windows'),'C:\\Windows\\System32\\reg.exe');
  assert.equal(regExePath(undefined),null);
  assert.equal(regExePath(''),null);
});

/* ── second round, point 5: the real launcher with a fake spawnSync (reg.exe never starts) ── */
function fakeSpawn(reply:()=>{status:number|null;stdout?:string;error?:Error}=()=>({status:0,stdout:''})){
  const seen:{file:string;args:string[];options:any}[]=[];
  return{seen,spawn:(file:string,args:string[],options:any)=>{seen.push({file,args,options});return reply();}};
}
test('the launcher runs reg.exe by its whole path, never from PATH, without a shell, hidden, with a time limit',()=>{
  const {spawn,seen}=fakeSpawn(()=>({status:0,stdout:'listed'}));
  const run=createRegistryRun({systemRoot:'D:\\Win',spawn});
  assert.deepEqual(run(['query','HKLM\\X']),{status:0,stdout:'listed',failed:false});
  assert.equal(seen.length,1);
  assert.equal(seen[0]!.file,'D:\\Win\\System32\\reg.exe');
  assert.deepEqual(seen[0]!.args,['query','HKLM\\X']);
  assert.equal(seen[0]!.options.shell,false);
  assert.equal(seen[0]!.options.windowsHide,true);
  assert.ok(Number.isFinite(seen[0]!.options.timeout)&&seen[0]!.options.timeout>0&&seen[0]!.options.timeout<=2000,String(seen[0]!.options.timeout));
});
/* point 2: the rule of remote/elevation.ts:41 and harness-ui taskkill-di-sistema.mjs:19, but nothing starts instead of a default */
test('SystemRoot: only a root with a drive letter; any other value is unknown and nothing starts; reg.exe gets only SystemRoot',()=>{
  /* riga 206, point (B) of the judge: a part that is relative inside the root (`..`, `.`, an empty name) starts nothing either */
  for(const root of [undefined,'','Windows','C:Windows','\\Windows','\\\\srv-finto\\share','/Windows','C:/Windows','.\\Windows',
    'C:\\Windows\\..\\..\\T\\finto','C:\\..\\Windows','C:\\Windows\\.','C:\\.\\Windows','C:\\Windows\\\\System','C:\\Windows/..','C:\\Windows\\...']){
    const {spawn,seen}=fakeSpawn();
    const run=createRegistryRun({systemRoot:root,spawn});
    assert.equal(run(['query','K']).failed,true,String(root));
    assert.equal(readRemoteToLocalLinks(run),'unknown',String(root));
    assert.equal(seen.length,0,'nothing starts with '+String(root));
    assert.equal(regExePath(root),null,String(root));
  }
  const {spawn,seen}=fakeSpawn();
  createRegistryRun({systemRoot:'D:\\Win',spawn})(['query','K']);
  assert.deepEqual(seen[0]!.options.env,{SystemRoot:'D:\\Win'},'only SystemRoot, never this process\'s environment');
});
test('the launcher: no status (killed, timed out) is a failure; an error is a failure even with status 0, and the reader says unknown',()=>{
  assert.equal(createRegistryRun({systemRoot:'C:\\Windows',spawn:fakeSpawn(()=>({status:null,stdout:''})).spawn})(['query','K']).failed,true);
  const lying=fakeSpawn(()=>({status:0,stdout:'    SymLinkState    REG_DWORD    0x0\r\n    SymlinkRemoteToLocalEvaluation    REG_DWORD    0x0\r\n',error:new Error('ETIMEDOUT')}));
  const run=createRegistryRun({systemRoot:'C:\\Windows',spawn:lying.spawn});
  assert.equal(run(['query','K']).failed,true);
  assert.equal(readRemoteToLocalLinks(run),'unknown');
});

/* ── this computer in other spellings (hosts invented; the machine's name is passed in) ── */
test('this computer written in another way is not another computer; a name TALOS cannot tie to this computer is',()=>{
  const machine='pc-finto-talos';
  const THIS=['pc-finto-talos','PC-FINTO-TALOS','pc-finto-talos.','pc-finto-talos@SSL','pc-finto-talos@8080','localhost','LOCALHOST','localhost.','localhost@SSL@443',
    '127.0.0.1','127.1','127.255.255.254','::1','[::1]','0--1.ipv6-literal.net','wsl$','wsl.localhost'];
  for(const host of THIS)assert.equal(isAnotherComputer(host,machine),false,host);
  /* the full name with a domain may resolve elsewhere, this machine's own address is not looked up (no network, no interfaces read),
     an empty host is a card TALOS cannot place: each counts as another computer, so it asks unless Windows says the links are off */
  const OTHER=['pc-finto-talos.dominio-finto.example','192.0.2.10','nas-finto','NAS-FINTO@SSL','','127.0.0.1.nip-finto.example','localhost-finto','pc-finto-talos2'];
  for(const host of OTHER)assert.equal(isAnotherComputer(host,machine),true,host);
  assert.equal(isAnotherComputer(undefined,machine),true);
});

/* second round, point 3: compared in ASCII only; after `@` only Windows' WebDAV forms, `@SSL` and `@<port>` (DavGetHTTPFromUNCPath:
   «\\server[@SSL][@port][\path]», Microsoft Learn, read 20/11/2026) */
test('a host with a character outside ASCII is never this computer; after @ only @SSL and @port',()=>{
  const machine='pc-kappa-finto';
  for(const host of ['localhoſt','LOCALHOſT','pc-Kappa-finto','PC-KAPPA-FINTO','localhost ','lıcalhost','localhost@nas-finto','localhost@SSL@nas',
    'pc-kappa-finto@','pc-kappa-finto@SSL@','localhost@443@SSL','localhost@SS','pc-kappa-finto@SSL@443@80'])
    assert.equal(isAnotherComputer(host,machine),true,JSON.stringify(host));
  for(const host of ['localhost@SSL','localhost@ssl','localhost@8080','LOCALHOST@SSL@443','pc-kappa-finto@SSL@443','pc-kappa-finto@80'])
    assert.equal(isAnotherComputer(host,machine),false,host);
  /* the machine's own name in capitals is still this computer */
  assert.equal(isAnotherComputer('pc-kappa-finto','PC-KAPPA-FINTO'),false);
  /* a machine name with a sign outside ASCII is compared as written, never folded into another name */
  assert.equal(isAnotherComputer('pc-kappa-finto','pc-Kappa-finto'),true);
});

/* ── the engine: 20 network commands × 6 modes × 3 answers, and the everyday commands ── */
const MODES=[['default',true],['acceptEdits',true],['plan',true],['bypassPermissions',true],['default',false],['bypassPermissions',false]] as const;
/* second round, point 1: the kernel puts its network card only on the file tools (read, write, edit, list, search:
   talosHarness.mjs:15255, reviewer), never on a shell command: the cards here are those it sends */
const HOSTS=['nas-finto','srv-finto.example','backup-finto@SSL','dav-finto@8080'];
const NETWORK_CARDS=HOSTS.flatMap(h=>{const share=`\\\\${h}\\docs`;return(['leggi','scrivi','file_edit','elenca','cerca'] as const).map(tipo=>
  ({tipo,percorso:tipo==='elenca'||tipo==='cerca'?share:`${share}\\${tipo}.txt`,percorsoDiRete:{ospite:h,via:'stringa'}}));});
const home=mkdtempSync(path.join(tmpdir(),'talos-r2l-home-'));
const project=path.join(home,'work','project');mkdirSync(project,{recursive:true});writeFileSync(path.join(project,'a.txt'),'x');
function withHome<T>(run:()=>Promise<T>):Promise<T>{
  const saved={USERPROFILE:process.env.USERPROFILE,HOME:process.env.HOME};
  process.env.USERPROFILE=home;process.env.HOME=home;
  return run().finally(()=>{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
}
async function answers(cards:Record<string,unknown>[],links:'off'|'on'|'unknown'){
  let reads=0;const out:string[]=[];
  for(const [mode,interactive] of MODES){
    const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},mode,remoteToLocalLinks:()=>{reads+=1;return links;}});
    for(const azione of cards){const d:any=await engine.decide(permissionActionFromApproval({azione:{toolCallId:'c',...azione}}),{interactive,mode,sessionId:'s1'});out.push(d.kind==='ask'?'?':d.kind[0]);}
  }
  return{text:out.join(''),reads};
}
const per=(text:string,mode:number)=>text.slice(mode*20,mode*20+20);

test('20 network commands × 6 modes: off changes nothing; on and unknown add a card in Full access, a refusal with -p',async()=>{
  await withHome(async()=>{
    assert.equal(NETWORK_CARDS.length,20);
    const off=await answers(NETWORK_CARDS,'off'),on=await answers(NETWORK_CARDS,'on'),unknown=await answers(NETWORK_CARDS,'unknown');
    /* before (measured with the gate put back as in 3ef81d758, in a copy: this line passes, the next one fails): outside Full access
       a write or an edit on another computer is refused (outside the project; in plan, read only), the rest asks; Full access opens
       every network path, on the screen and with -p */
    const OTHERS='?dd??'.repeat(12);
    const BEFORE=OTHERS+'a'.repeat(20)+'d'.repeat(20)+'a'.repeat(20);
    assert.equal(off.text,BEFORE,'with the links off every mode answers as before');
    const AFTER=OTHERS+'?'.repeat(20)+'d'.repeat(20)+'d'.repeat(20);
    assert.equal(on.text,AFTER);assert.equal(unknown.text,AFTER);
    for(const mode of [0,1,2,4])assert.equal(per(on.text,mode),per(off.text,mode),'the other modes never change');
    /* the reader is asked only by Full access, and once per decision here (the engine's own memo is the process's, tested above) */
    assert.equal(off.reads,40);
  });
});

/* the kernel sends no network card for a shell command; since riga 206 the engine reads the command's text itself
   (shell-another-computer.test.ts): with the setting on, Full access asks for it too */
test('a shell command naming another computer reaches the engine without a network card: since riga 206 Full access asks when the setting is on',{skip:process.platform!=='win32'},async()=>{
  await withHome(async()=>{
    let reads=0;const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},remoteToLocalLinks:()=>{reads+=1;return 'on';}});
    for(const comando of ['type \\\\nas-finto\\docs\\a.txt','dir \\\\srv-finto\\docs'])
      assert.equal((await engine.decide(permissionActionFromApproval({azione:{tipo:'shell',comando}}),{interactive:true,mode:'bypassPermissions'})).kind,'ask',comando);
    assert.equal(reads,2);
  });
});

test('the same share on this computer, and the project folder card: Full access as before for this computer, asks for another one when not off',async()=>{
  await withHome(async()=>{
    const local=['localhost','127.0.0.1','wsl$'].map(h=>({tipo:'leggi',percorso:`\\\\${h}\\x\\a.txt`,percorsoDiRete:{ospite:h,via:'stringa'}}));
    let reads=0;const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},remoteToLocalLinks:()=>{reads+=1;return 'on';}});
    for(const azione of local)assert.equal((await engine.decide(permissionActionFromApproval({azione}),{interactive:true,mode:'bypassPermissions'})).kind,'allow',JSON.stringify(azione));
    assert.equal(reads,0,'this computer never needs the reading');
    const folder={tipo:'leggi',percorso:'\\\\nas-finto\\lavoro\\b.ts',percorsoDiRete:{ospite:'nas-finto',via:'cartella',ambito:'sessione'}};
    assert.equal((await engine.decide(permissionActionFromApproval({azione:folder}),{interactive:true,mode:'bypassPermissions'})).kind,'ask');
    assert.equal((await engine.decide(permissionActionFromApproval({azione:folder}),{interactive:false,mode:'bypassPermissions'})).kind,'deny');
  });
});

test('noise: twenty everyday commands × 6 modes answer as in 0.6.17 whatever Windows says, and the setting is never read',async()=>{
  await withHome(async()=>{
    const COMMANDS=['git status','git diff --stat','git log --oneline -5','npm test','npm run build','npx tsc --noEmit','node script.js','dir','ls -la','type a.txt',
      'cat a.txt','findstr TODO *.ts','rg TODO src','mkdir out','echo hi > out.txt','cp a.txt b.txt','mv b.txt c.txt','rm c.txt','python -m pytest','cargo build'].map(comando=>({tipo:'shell',comando}));
    const NOISE_0617='aaa????aaaaaa?d?????aaa????aaaaaaadaaa??aaaddddaaaaaadddddddaaaaaaaaaaaaaaaaaaaaaaaddddaaaaaadddddddaaaaaaaaaaaaaaaaaaaa';
    for(const links of ['off','on','unknown'] as const){
      const {text,reads}=await answers(COMMANDS,links);
      if(process.platform==='win32')assert.equal(text,NOISE_0617,links);
      assert.equal(reads,0,'no network card: nothing is read');
    }
  });
});

test('nothing was started and no invented computer was touched',()=>{
  assert.deepEqual(started,[]);
  assert.deepEqual(touched,[]);
});
