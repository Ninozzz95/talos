/* Form B, No (a), on the real TuiApp: the fixed line is a state of the session, so it stays at 80×24 and through Esc; /trust is the only way
   out, and it starts TALOS again here, where the card is the first thing asked (relaunch.ts). In a trusted folder /trust changes nothing. */
import assert from 'node:assert/strict';
import {rmSync} from 'node:fs';
import test,{after} from 'node:test';
import {relaunchWanted,requestRelaunch} from '../../src/relaunch.ts';
import {hermeticProfile,mountApp,sleep} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
after(()=>{try{rmSync(env.root,{recursive:true,force:true});}catch{/* best effort */}});
const LINE="This folder isn't trusted: its instructions are off. /trust to change";
const plain={model:'openai:gpt-5-mini',permissionMode:'default'};
const mount=(extra:Record<string,unknown>={})=>mountApp({cols:80,rows:24,root:env.root,paths:env.paths,history:[],invocation:plain,...extra} as any);

test('the fixed line shows whole at 80×24 and stays after Esc',async()=>{
  const app=await mount({projectUntrusted:true});
  try{
    await sleep(300);
    assert.match((await app.screen()).text,/This folder isn't trusted: its instructions are off\. \/trust to change/u);
    app.press('\u001b');await sleep(150);
    assert.ok((await app.screen()).text.includes(LINE),'Esc does not clear a state');
    assert.equal((await app.screen()).wrapped,0);
  }finally{app.unmount();}
});

/* Owner's decision 173 (04/11/2026): after the No, Full access works as Normal in this folder, and the fixed line says so */
test('Full access after the No: the screen holds Ask before edits, and the fixed line says why, whole at 80×24',async()=>{
  const app=await mount({projectUntrusted:true,invocation:{...plain,permissionMode:'bypassPermissions'}});
  try{
    await sleep(300);const screen=await app.screen();
    assert.ok(screen.text.includes('Not trusted: instructions off, Full access asks before edits. /trust to change'),screen.text);
    assert.ok(!screen.text.includes(LINE));assert.equal(screen.text.split('Full access').length-1,1,'only the fixed line names Full access: the mode shown is not it');assert.equal(screen.wrapped,0);
  }finally{app.unmount();}
});

test('/trust starts TALOS again in this folder',async()=>{
  requestRelaunch(null as any);
  const app=await mount({projectUntrusted:true});
  try{
    await sleep(300);app.press('/trust');await sleep(60);app.press('\r');await sleep(200);
    assert.equal(relaunchWanted(),env.root);
  }finally{app.unmount();requestRelaunch(null as any);}
});

test('on the contrary: a trusted folder has no line, and /trust starts nothing again',async()=>{
  requestRelaunch(null as any);
  const app=await mount();
  try{
    await sleep(300);
    assert.ok(!(await app.screen()).text.includes(LINE));
    app.press('/trust');await sleep(60);app.press('\r');await sleep(200);
    assert.equal(relaunchWanted(),null);
    assert.match((await app.screen()).text,/open with its instructions/u);
  }finally{app.unmount();}
});
