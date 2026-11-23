/*
 * R4 lane F — the boot (owner decision Q-R4-4, gate E5, s01/s09 D-09).
 * - The full boot plays only on the first launch and after an update (a new version or build); every other launch gets the
 *   short boot, which holds NOTHING since P-A (owner 07/10 sera, «Compositore subito»; Q-R4-4's 600 ms of 02/10 is superseded:
 *   they were 70% of a warm start). A plain start opens on the composer (`initialBootState`, r4-g-composer-first.test.ts).
 *   The launch state lives under the data root (bootPlan, launch-state.ts).
 * - Reduced motion and no colour: a static frame, at most 1 s (they waited the whole 7.2 s before R4, measured 8.4-8.6 s).
 * - The screen says "Press any key to skip"; the stage name is no longer printed twice.
 * - Space, Enter and Esc only skip; a printable key skips AND stays as type-ahead, also before the runtime is ready;
 *   Ctrl+C / Ctrl+D always reach the exit rule.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import test,{after} from 'node:test';
import {bootPlan,launchStatePath} from '../../src/tui/launch-state.ts';
import {bootPhaseAt,bootRevealMs,completeBoot,createBootSequenceComponent,createBootState,markBootReady,SHORT_BOOT_MS,STATIC_BOOT_MS} from '../../src/tui/boot/boot-sequence.ts';
import {renderCinematicBoot,TALOS_BOOT_DURATION_MS} from '../../src/tui/boot/cinematic.ts';
import {decideShellInput} from '../../src/tui/shell-input.ts';

const roots:string[]=[];
after(()=>{for(const root of roots)rmSync(root,{recursive:true,force:true});});
function tempRoot(){const root=mkdtempSync(join(tmpdir(),'r4-f-boot-'));roots.push(root);return root;}
const COUNTER=/BOOT\s+\d+%/u;

test('Q-R4-4 bootPlan: full on the first launch, short on the next one, full again after an update',()=>{
  const parent=tempRoot();const dataRoot=join(parent,'data');
  assert.deepEqual(bootPlan({dataRoot,version:'1.0.0',build:'abc',now:1}),{mode:'full',firstLaunch:true});
  assert.equal(launchStatePath(dataRoot),join(dataRoot,'launch-state.json'));
  assert.deepEqual(bootPlan({dataRoot,version:'1.0.0',build:'abc',now:2}),{mode:'short',firstLaunch:false});
  assert.deepEqual(bootPlan({dataRoot,version:'1.0.0',build:'abc',now:3}),{mode:'short',firstLaunch:false});
  assert.deepEqual(bootPlan({dataRoot,version:'1.1.0',build:'abc',now:4}),{mode:'full',firstLaunch:false},'a new version is an update');
  assert.deepEqual(bootPlan({dataRoot,version:'1.1.0',build:'abc',now:5}),{mode:'short',firstLaunch:false});
  assert.deepEqual(bootPlan({dataRoot,version:'1.1.0',build:'def',now:6}),{mode:'full',firstLaunch:false},'a new build is an update');
  assert.deepEqual(bootPlan({dataRoot,version:'1.1.0',build:null,now:7}),{mode:'short',firstLaunch:false},'a build that cannot be read is not an update');
  assert.deepEqual(readdirSync(parent),['data'],'nothing is written outside the data root');
  const record=JSON.parse(readFileSync(launchStatePath(dataRoot),'utf8'));
  assert.equal(record.schema,'talos.cli.launch-state.v1');
  assert.equal(record.version,'1.1.0');assert.equal(record.firstLaunchAt,new Date(1).toISOString());assert.equal(record.lastLaunchAt,new Date(7).toISOString());
});

test('Q-R4-4 bootPlan fails toward the full boot: an unreadable record plays it, and a record that cannot be written never throws',()=>{
  const dataRoot=join(tempRoot(),'data');mkdirSync(dataRoot,{recursive:true});
  writeFileSync(launchStatePath(dataRoot),'{not json');
  assert.deepEqual(bootPlan({dataRoot,version:'1.0.0',now:1}),{mode:'full',firstLaunch:true});
  assert.deepEqual(bootPlan({dataRoot,version:'1.0.0',now:2}),{mode:'short',firstLaunch:false},'the broken record was replaced');
  const fileAsRoot=join(tempRoot(),'a-file');writeFileSync(fileAsRoot,'x');
  assert.deepEqual(bootPlan({dataRoot:fileAsRoot,version:'1.0.0',now:1}),{mode:'full',firstLaunch:true});
  assert.deepEqual(bootPlan({dataRoot:fileAsRoot,version:'1.0.0',now:2}),{mode:'full',firstLaunch:true},'nothing could be recorded, so every launch is a first launch');
});

test('Q-R4-4 reveal lengths: full with motion the whole reveal (5.2 s since 0.6.5), a static frame at most 1 s, the short boot no hold (P-A, owner 07/10)',()=>{
  assert.equal(bootRevealMs({mode:'full',motion:true}),TALOS_BOOT_DURATION_MS);
  assert.equal(bootRevealMs({mode:'full',motion:false}),STATIC_BOOT_MS);
  assert.equal(bootRevealMs({mode:'short',motion:true}),SHORT_BOOT_MS);
  assert.equal(bootRevealMs({mode:'short',motion:false}),SHORT_BOOT_MS);
  assert.ok(STATIC_BOOT_MS<=1000);assert.equal(SHORT_BOOT_MS,0);
});

test('Q-R4-4 the boot state follows the sequence that drew it: a shorter reveal ends the boot, and a runtime ready later still opens it',()=>{
  const start=createBootState(0);
  const early=markBootReady(start,300);
  assert.equal(early.phase,'revealing','a runtime ready before the reveal ends does not cut the reveal');
  assert.equal(completeBoot(early,600).phase,'ready','the short reveal is over and the runtime is ready: the composer opens');
  const waiting=completeBoot(start,600);
  assert.equal(waiting.phase,'waiting','the short reveal is over, the runtime is not ready yet');
  assert.equal(bootPhaseAt(waiting,900),'waiting','the screen says it is waiting for the runtime');
  assert.equal(markBootReady(waiting,1500).phase,'ready','the runtime becomes ready after a short reveal: the composer opens at once');
});

test('Q-R4-4 the short boot and the final frame can be drawn without the BOOT counter',()=>{
  const withCounter=renderCinematicBoot(0,100,true,true).lines.join('\n');
  assert.match(withCounter,COUNTER,'control: the full final frame keeps its counter');
  const short=renderCinematicBoot(0,100,true,true,{counter:false}).lines.join('\n');
  assert.doesNotMatch(short,COUNTER);
  assert.match(short,/████|TALOS/u,'the logo is still there');
});

/* A fake React for one synchronous render, as test/tui/boot-sequence.test.ts does. */
const FakeReact:any={useState:(init:any)=>[typeof init==='function'?init():init,()=>{}],useEffect:()=>{},createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children})};
const FakeInk:any={Box:'Box',Text:'Text'};
function textOf(node:any):string{if(node===null||node===undefined)return'';if(typeof node==='string')return node;return (node.children??[]).map(textOf).join('');}
function lastLine(tree:any){return textOf(tree.children.at(-1));}

test('Q-R4-4 / s01 D-09: the boot says a key skips it, once, instead of repeating the stage name',()=>{
  const BootSequence=createBootSequenceComponent(FakeReact,FakeInk);
  const tree=BootSequence({state:createBootState(Date.now()),motion:true,unicode:true,width:100,mutedColor:'#9D7F24'});
  assert.equal(lastLine(tree),'Press any key to skip');
  assert.equal(tree.children.at(-1).props.color,'#9D7F24');
  const all=textOf(tree);
  assert.equal(all.split('SIGNAL ACQUISITION').length-1,1,'the stage name is drawn once, inside the frame');
  const hinted=BootSequence({state:createBootState(Date.now()),motion:true,unicode:true,width:100,hint:'Press any key to skip'});
  assert.equal(lastLine(hinted),'Press any key to skip','lane N may pass the dictionary text; it is the same line');
});

test('Q-R4-4 / s09 D-09: the short boot is the final frame without the BOOT counter, with the hint',()=>{
  const BootSequence=createBootSequenceComponent(FakeReact,FakeInk);
  const tree=BootSequence({state:createBootState(Date.now()),motion:true,unicode:true,width:100,mode:'short'});
  const all=textOf(tree);
  assert.doesNotMatch(all,COUNTER);
  assert.match(all,/████/u,'the final logo, not an early animation frame');
  assert.equal(lastLine(tree),'Press any key to skip');
});

test('Q-R4-4: without colour the boot is "starting" and the hint; while waiting it says so',()=>{
  const BootSequence=createBootSequenceComponent(FakeReact,FakeInk);
  const plain=BootSequence({state:createBootState(Date.now()),logo:false,motion:false,unicode:true,width:100});
  assert.match(textOf(plain),/^starting/u);
  assert.match(textOf(plain),/Press any key to skip/u);
  const waiting=BootSequence({state:{...createBootState(0),phase:'waiting'},motion:true,unicode:true,width:100,mode:'short'});
  assert.equal(lastLine(waiting),'runtime synchronization…');
});

/* The completion timer, measured through the real Ink with a fake TTY (the method of test/tui/boot-no-keypress.test.ts). */
function fakeTerminal(){
  const stdout:any=Object.assign(new EventEmitter(),{columns:100,rows:40,isTTY:true,write(){return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  return{stdout,stdin,stderr:stdout,exitOnCtrlC:false,patchConsole:false,interactive:true,isScreenReaderEnabled:false};
}
async function completionAfter(props:Record<string,unknown>,observeMs:number):Promise<number[]>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const BootSequence=createBootSequenceComponent(React,Ink);
  const started=Date.now();const calls:number[]=[];
  const app=Ink.render(React.createElement(BootSequence,{state:createBootState(started),unicode:true,width:100,onComplete:()=>calls.push(Date.now()-started),...props}),fakeTerminal());
  try{await new Promise(resolve=>setTimeout(resolve,observeMs));}finally{app.unmount();}
  return calls;
}

test('Q-R4-4 / P-A: the short boot ends at once (no hold), and a static full boot within 1 s',async()=>{
  const short=await completionAfter({mode:'short',motion:true},1200);
  assert.equal(short.length,1,`the short boot signals its end once: ${short.join(', ')}`);
  assert.ok(short[0]!<=SHORT_BOOT_MS+400,`short boot ended at ${short[0]} ms`);
  const still=await completionAfter({mode:'full',motion:false},1700);
  assert.equal(still.length,1,`the static boot signals its end once: ${still.join(', ')}`);
  assert.ok(still[0]!>=STATIC_BOOT_MS-5&&still[0]!<=STATIC_BOOT_MS+400,`static boot ended at ${still[0]} ms`);
  const noColour=await completionAfter({mode:'full',motion:false,logo:false},1700);
  assert.ok(noColour.length===1&&noColour[0]!<=STATIC_BOOT_MS+400,`no colour: ${noColour.join(', ')}`);
});

const ready={phase:'ready',runtimeReady:true,skipped:false} as const;
const booting=(runtimeReady:boolean,skipped=false)=>({phase:'revealing',runtimeReady,skipped});
const input=(ch:string,key:Record<string,boolean>,boot:{phase:string;runtimeReady:boolean;skipped:boolean})=>decideShellInput({ch,key,focus:'composer',composerText:'',commandMenuOpen:false,trustCenterOpen:false,approvalExpanded:false,boot});

test('Q-R4-4: Space, Enter and Esc only skip the boot; nothing reaches the composer',()=>{
  for(const [ch,key] of [[' ',{}],['\r',{return:true}],['',{escape:true}]] as const){
    for(const runtimeReady of [true,false]){
      const decision=input(ch,key,booting(runtimeReady));
      assert.equal(decision.skipBoot,true,`${JSON.stringify(ch)} skips`);
      assert.equal(decision.routed,null,`${JSON.stringify(ch)} (runtime ready: ${runtimeReady}) is not typed or run`);
    }
  }
});

test('Q-R4-4: a printable key skips the boot and stays as type-ahead, also before the runtime is ready',()=>{
  for(const runtimeReady of [true,false]){
    const decision=input('x',{},booting(runtimeReady));
    assert.equal(decision.skipBoot,true);
    assert.deepEqual(decision.routed,{kind:'text',text:'x'},`runtime ready: ${runtimeReady}`);
  }
  const after=input(' ',{},booting(false,true));
  assert.equal(after.skipBoot,false,'the boot is already skipped');
  assert.deepEqual(after.routed,{kind:'text',text:' '},'after the skip a space is part of what the person types');
  assert.equal(input('\r',{return:true},booting(false,true)).routed,null,'Enter before the runtime is ready sends nothing');
});

test('Q-R4-4: Ctrl+C reaches the exit rule during the boot; other chords wait for the runtime as before',()=>{
  assert.deepEqual(input('c',{ctrl:true},booting(false)).routed,{kind:'action',action:'interrupt'});
  assert.equal(input('c',{ctrl:true},booting(false)).skipBoot,true);
  assert.equal(input('t',{ctrl:true},booting(false)).routed,null,'a chord before the runtime is ready only skips');
  assert.notEqual(input('t',{ctrl:true},booting(true)).routed,null,'once the runtime is ready a chord is routed, as before R4');
  assert.deepEqual(input('x',{},ready),{skipBoot:false,closeTrustCenter:false,approvalScrollDelta:null,routed:{kind:'text',text:'x'}},'after the boot nothing changes');
});
