/* FE-048: another folder is a clean new start, in the same terminal. Six risks from Desktop, words from Frontend. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {relaunch} from '../src/relaunch.ts';

function bench(over:Record<string,unknown>={}){
  const calls:any[]=[];let text='',quieted=0;
  const deps={spawn:(command:string,args:readonly string[],options:any)=>{calls.push({command,args,options});return{status:7};},write:(chunk:string)=>{text+=chunk;},node:'node.exe',script:'C:/talos/main.js',flags:['--no-warnings'],env:{PATH:'x'},isFolder:()=>true,quiet:()=>{quieted+=1;},...over};
  return{deps,calls,text:()=>text,quieted:()=>quieted};
}

test('the child starts in the folder, on this terminal, with none of this command line',()=>{
  const b=bench();relaunch('C:/work/shop-api',b.deps as any);
  assert.equal(b.calls[0].command,'node.exe');
  assert.deepEqual(b.calls[0].args,['--no-warnings','C:/talos/main.js'],'no --resume, no -p, no prompt, no folder');
  assert.equal(b.calls[0].options.cwd,'C:/work/shop-api');
  assert.equal(b.calls[0].options.stdio,'inherit');
});

test('it carries the environment of the first start, and says it was relaunched so the medal does not play again',()=>{
  const b=bench();relaunch('C:/work/shop-api',b.deps as any);
  assert.deepEqual(b.calls[0].options.env,{PATH:'x',TALOS_RELAUNCHED:'1'});
});

test('its exit code is the exit code; the parent leaves the keyboard before it starts',()=>{
  const b=bench();
  assert.equal(relaunch('C:/work/shop-api',b.deps as any),7);
  assert.equal(b.quieted(),1);
  assert.match(b.text(),/^⠙ Opening shop-api\n$/u);
});

test('a killed child is no success',()=>{
  assert.equal(relaunch('C:/x',bench({spawn:()=>({status:null})}).deps as any),1);
});

test('a folder that is gone says why and how to try again, and starts nothing',()=>{
  const b=bench({isFolder:()=>false});
  assert.equal(relaunch('C:/gone',b.deps as any),1);
  assert.equal(b.calls.length,0);
  assert.match(b.text(),/Could not open C:\/gone: the folder is not there\./u);
  assert.match(b.text(),/To try again: cd "C:\/gone" && talos/u);
});

test('a child that cannot start says so too: never a silent terminal',()=>{
  const b=bench({spawn:()=>({status:null,error:new Error('EACCES')})});
  assert.equal(relaunch('C:/locked',b.deps as any),1);
  assert.match(b.text(),/Could not open C:\/locked: EACCES/u);
  assert.match(b.text(),/To try again/u);
});

test('whatever this process was started with stays out: --resume, a prompt, a folder',()=>{
  const before=process.argv;process.argv=['node','main.js','--resume','s1','-p','hello'];
  try{const b=bench();relaunch('C:/work',b.deps as any);assert.deepEqual(b.calls[0].args,['--no-warnings','C:/talos/main.js']);}
  finally{process.argv=before;}
});

test('what plugins added to this process stays out of the environment',()=>{
  process.env.TALOS_FROM_A_PLUGIN='secret';
  try{const b=bench();relaunch('C:/work',b.deps as any);assert.equal(b.calls[0].options.env.TALOS_FROM_A_PLUGIN,undefined);}
  finally{delete process.env.TALOS_FROM_A_PLUGIN;}
});
