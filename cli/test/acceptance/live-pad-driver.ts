/*
 * DEVELOPMENT MODE for remote control (owner 27/10/2026: «nella modalità sviluppo dobbiamo poter bypassare il QR, non posso stare qui
 * a babysittarti»): a LIVE run with the Mobile session driving the real device, without the owner. NOT a scenario of the suite.
 * - An isolated profile (profile.ts: private APPDATA/LOCALAPPDATA, TALOS_TEST_PROFILE=1, clipboard redirected to a file in the
 *   profile) with the test keyring FILE (TALOS_CREDENTIAL_STORE=file, provider/store.ts): the PC's remote identity survives between
 *   processes, so a device paired in one `talos remote` reaches the next. Never the real keyring.
 * - The pinned iroh binding copied in, remote control on with the n0 relay; `talos remote` (or, with `--window`, a TALOS window with
 *   the scenarios' fake provider) in a pseudo console. `--reuse <home>` runs again on the same profile, `--keep` keeps it at the end.
 * - No camera: `c` writes the pairing link to the profile's clipboard file (never printed); the Mobile reads it into a variable and
 *   opens it on the device with a VIEW intent (`talos-remote:1?…`). The 6-digit code is compared over SendMessage and confirmed here.
 * Controlled through files in CONTROL_DIR: the screen goes to screen.txt every 400 ms; commands are read from cmd.txt, one per line,
 * each run once: `press:<key or one letter>`, `type:<text>`, `send:<raw>`, `talos:<args as JSON array>` (a second command in the
 * same profile, output to talos-<n>.txt), `quit`.
 *   node --experimental-strip-types test/acceptance/live-pad-driver.ts <control dir> <iroh binding> [--window] [--reuse <home>] [--keep]
 */
import {spawn} from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {childEnvironment,createProfile} from './profile.ts';
import {startFakeProvider} from './fake-provider.ts';
import {TerminalSession} from './terminal.ts';

const CONTROL_DIR=process.argv[2];const BINDING=process.argv[3];
if(!CONTROL_DIR||!BINDING)throw new Error('usage: live-pad-driver.ts <control dir> <iroh binding>');
mkdirSync(CONTROL_DIR,{recursive:true});
const log=(line:string)=>{writeFileSync(join(CONTROL_DIR,'log.txt'),`${new Date().toISOString()} ${line}\n`,{flag:'a'});};

/* `--devlog <dir>`: TALOS writes its development log there (the profile drops the variable by default) */
const DEVLOG=process.argv.includes('--devlog')?process.argv[process.argv.indexOf('--devlog')+1]:undefined;
/* `--reuse <home>`: the same isolated profile again (its pairing kept), for a second `talos remote` */
const reuse=process.argv.indexOf('--reuse');
function reusedProfile(home:string,providerUrl?:string){
  const dirs={appData:join(home,'appdata'),localAppData:join(home,'localappdata'),user:join(home,'user')};const project=join(home,'project');
  const env=childEnvironment({APPDATA:dirs.appData,LOCALAPPDATA:dirs.localAppData,USERPROFILE:dirs.user,HOME:dirs.user,TALOS_TEST_PROFILE:'1',TALOS_CREDENTIAL_STORE:'file',TALOS_CLIPBOARD_FILE:join(home,'clipboard.txt'),...(providerUrl?{OLLAMA_BASE_URL:providerUrl}:{}),...(DEVLOG?{TALOS_CLI_DEV_LOG_DIR:DEVLOG}:{})});
  return{home,project,env,
    talos:(args:string[],timeoutMs=60_000)=>new Promise<{status:number|null;stdout:string;stderr:string}>(done=>{
      const child=spawn(process.execPath,[MAIN,...args],{cwd:project,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let stdout='';let stderr='';child.stdout.setEncoding('utf8').on('data',d=>{stdout+=d;});child.stderr.setEncoding('utf8').on('data',d=>{stderr+=d;});
      const timer=setTimeout(()=>child.kill(),timeoutMs);child.on('close',status=>{clearTimeout(timer);done({status,stdout,stderr});});
    }),
    dispose:()=>{try{rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}}};
}
const MAIN=join(dirname(fileURLToPath(import.meta.url)),'..','..','dist','main.js');
/* `--window`: a TALOS window instead of `talos remote` (the fake provider of the scenarios, so it reaches the composer): it pairs
   with `/remote` and stays the host with the same identity, which an in-memory test keychain needs */
const WINDOW=process.argv.includes('--window');
const fake=WINDOW?await startFakeProvider():null;
const profile:any=reuse>0?reusedProfile(process.argv[reuse+1]!,fake?.url):createProfile({name:'live-pad',...(fake?{providerUrl:fake.url}:{}),extraEnv:{TALOS_CREDENTIAL_STORE:'file'}});
const dataRoot=join(profile.env.LOCALAPPDATA!,'TALOS-CLI');
const remoteDir=join(dataRoot,'remote');
if(reuse<0){
  mkdirSync(join(remoteDir,'iroh','1.1.0'),{recursive:true});
  copyFileSync(BINDING,join(remoteDir,'iroh','1.1.0','iroh.win32-x64-msvc.node'));
  writeFileSync(join(remoteDir,'settings.json'),JSON.stringify({acceso:true,relay:{modo:'n0'}}));
}
writeFileSync(join(CONTROL_DIR,'profile.json'),JSON.stringify({home:profile.home,dataRoot,clipboard:join(profile.home,'clipboard.txt'),project:profile.project}));
log(`profile ${profile.home}`);

if(WINDOW&&reuse<0){
  for(const args of [['model','use','ollama:qwen3-coder-test','--scope','user'],['project','trust','--include-nested']]){
    const r=await profile.talos(args);log(`talos ${args.join(' ')} -> ${r.status}`);
  }
}
const t=TerminalSession.launch(profile,WINDOW?[]:['remote'],{cols:120,rows:44});
let done=0;let extra=0;
const tick=setInterval(()=>{
  try{writeFileSync(join(CONTROL_DIR,'screen.txt'),t.screen().text);}catch{}
  const file=join(CONTROL_DIR,'cmd.txt');
  if(!existsSync(file))return;
  const lines=readFileSync(file,'utf8').split(/\r?\n/u).filter(Boolean);
  for(;done<lines.length;done++){
    const line=lines[done]!;const at=line.indexOf(':');const verb=at<0?line:line.slice(0,at);const arg=at<0?'':line.slice(at+1);
    log(`cmd ${verb}${verb==='type'?` (${arg.length} chars)`:arg?` ${arg}`:''}`);
    try{
    if(verb==='press'){if(arg.length===1)t.send(arg);else t.press(arg);}
    else if(verb==='type')void t.type(arg);
    else if(verb==='send')t.send(arg.replace(/\\r/gu,'\r'));
    else if(verb==='talos'){const n=++extra;void profile.talos(JSON.parse(arg),60_000).then((r:{status:number|null;stdout:string;stderr:string})=>writeFileSync(join(CONTROL_DIR,`talos-${n}.txt`),`status ${r.status}\n${r.stdout}\n${r.stderr}`));}
    else if(verb==='quit'){void finish();}
    }catch(error){log(`cmd failed: ${String((error as Error)?.message??error)}`);}
  }
},400);
async function finish(){
  clearInterval(tick);
  try{writeFileSync(join(CONTROL_DIR,'screen.txt'),t.screen().text);}catch{}
  await t.close();
  await fake?.close();
  log(`closed exit=${JSON.stringify(t.exit)}`);
  if(process.argv.includes('--keep'))log('profile kept');else{profile.dispose();log('profile removed');}
  process.exit(0);
}
process.on('SIGINT',()=>{void finish();});
