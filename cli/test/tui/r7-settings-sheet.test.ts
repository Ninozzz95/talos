/*
 * Stage 7.11 (mockup PANELS.settings; owner 03/10) in the REAL app: /status, /usage, /context and /config open one Settings
 * sheet on their tab. Status names this TALOS, the mode in words and the facts /status had; c copies it for a bug report (never
 * to the real clipboard); Context without a conversation says nothing was measured; Config saves for this project only what
 * changed, and «Thinking hidden» and «Tool rows» take effect at once — Ctrl+T shows hidden reasoning again.
 * Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {readConfigScope} from '../../src/config/load.ts';
import {CLI_VERSION} from '../../src/version.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B',RIGHT='\x1b[C',ESC='\x1b',CTRL_T='\x14';
let n=0;const project=()=>{const root=join(env.root,`settings-${++n}`);mkdirSync(root,{recursive:true});return root;};
const flat=(text:string)=>text.replace(/\s+/gu,' ');

test('stage 7.11 /status: the Status tab of the Settings sheet; c copies it; Tab reaches Context, which says nothing was measured',async()=>{
  const root=project();const clip=join(root,'clipboard.txt');const before=process.env.TALOS_CLIPBOARD_FILE;process.env.TALOS_CLIPBOARD_FILE=clip;
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/status');app.press(ENTER);
    let s=await app.waitFor('the status tab',x=>/── Settings this project/u.test(x.text)&&/Work {10}/u.test(x.text));
    assert.match(s.text,new RegExp(`TALOS {9}${CLI_VERSION.replace(/\./gu,'\\.')} · Node \\d+\\.\\d+`,'u'));
    assert.match(s.text,/Mode {10}asks before edits/u);assert.match(s.text,/Agents {8}0 this session/u);
    assert.match(s.text,/ c copy for a bug report/u);
    await app.type('c');
    await app.waitFor('copied',x=>/Copied the status for a bug report/u.test(x.text));
    assert.match(readFileSync(clip,'utf8'),/^TALOS {9}/u,'the copy is the tab as written');
    app.press('\t');await sleep(40);app.press('\t');
    s=await app.waitFor('the context tab',x=>/Nothing measured yet: the context fills as you talk\./u.test(x.text));
    app.press(ESC);await app.waitFor('closed',x=>!/── Settings this project/u.test(x.text));
  }finally{app.unmount();if(before===undefined)delete process.env.TALOS_CLIPBOARD_FILE;else process.env.TALOS_CLIPBOARD_FILE=before;}
});

test('stage 7.11 /config: Thinking hidden and Tool rows one per call are saved for this project and apply at once; Ctrl+T shows hidden reasoning',async()=>{
  const root=project();
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/config');app.press(ENTER);
    await app.waitFor('the config tab',x=>/── Settings this project/u.test(x.text)&&/Thinking {15}/u.test(x.text));
    app.press(DOWN);await sleep(30);app.press(RIGHT);await sleep(30);app.press(RIGHT);await sleep(30);/* Thinking, second since View left the form (C10): collapsed → expanded → hidden */
    app.press(DOWN);await sleep(30);app.press(RIGHT);await sleep(30);/* Tool rows: grouped → one per call */
    app.press(ENTER);
    let s=await app.waitFor('saved',x=>/Saved for this project/u.test(x.text));
    assert.doesNotMatch(s.text,/at the next launch/u,'both apply at once');
    const saved=(await readConfigScope({paths:env.paths,projectRoot:root,scope:'project-user'})).ui;
    assert.equal(saved?.reasoning,'hidden');assert.equal(saved?.toolRows,'each');
    app.press(ESC);await app.waitFor('closed',x=>!/── Settings this project/u.test(x.text));
    app.emit('run.started',{runId:'r1'});app.emit('reasoning.started',{messageId:'m1'});app.emit('reasoning.delta',{messageId:'m1',delta:'private plan'});
    app.emit('reasoning.completed',{messageId:'m1'});app.emit('message.started',{messageId:'a1',role:'assistant'});app.emit('message.delta',{messageId:'a1',delta:'Answer'});app.emit('message.completed',{messageId:'a1'});app.emit('run.completed',{runId:'r1'});
    s=await app.waitFor('the answer',x=>/Answer/u.test(x.text));await sleep(150);s=await app.screen();
    assert.doesNotMatch(flat(s.text),/Thought for|private plan/u,'hidden: no reasoning line at all');
    app.press(CTRL_T);
    await app.waitFor('shown again',x=>/private plan/u.test(x.text));
  }finally{app.unmount();}
});

test('stage 7.11e: each turn goes to the project\'s usage record; /usage reads it back as Per turn, Today and By model',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    const turn=async(runId:string,prompt:number,completion:number)=>{
      app.emit('run.started',{runId});app.emit('usage.updated',{value:{promptTokens:prompt,completionTokens:completion}});app.emit('run.completed',{runId});await sleep(120);
    };
    await turn('r1',12_000,1_000);await turn('r2',30_000,3_000);
    await app.type('/usage');app.press(ENTER);
    /* FE-048 C5 (01/11): the usage page first (by day), then s for this session's tab, which reads the same record */
    await app.waitFor('the usage page',x=>/── CLI usage/u.test(x.text)&&/33k tokens/u.test(x.text));app.press('s');
    const s=await app.waitFor('the record',x=>/Today {9}/u.test(x.text));
    assert.match(s.text,/Per turn {6}\S\S {2}last 2 turns/u);
    assert.match(s.text,/Today {9}33k tokens in this project/u);
    assert.match(s.text,/By model {6}qwen3-coder-test 100%/u);
  }finally{app.unmount();}
});

test('stage 7.11: settings that cannot be read are said, never shown as the defaults; r reads them again',async()=>{
  const root=project();const dir=join(root,'.talos-cli');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'config.json'),'{"ui": BROKEN');
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/config');app.press(ENTER);
    const s=await app.waitFor('the error',x=>/Could not read settings\./u.test(x.text));
    assert.doesNotMatch(s.text,/Mouse {17}/u,'no form of defaults');assert.match(s.text,/ r read again/u);
    assert.equal(readFileSync(join(dir,'config.json'),'utf8'),'{"ui": BROKEN','the file is left as it is');
    writeFileSync(join(dir,'config.json'),'{}');await app.type('r');
    await app.waitFor('the form',x=>/Mouse {17}/u.test(x.text));
  }finally{app.unmount();}
});

test('stage 7.11: a change that waits for the next launch says so; nothing changed says so',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await app.type('/config');app.press(ENTER);
    await app.waitFor('the config tab',x=>/Mouse {17}/u.test(x.text));
    app.press(ENTER);await app.waitFor('nothing',x=>/Nothing changed/u.test(x.text));
    app.press(' ');await sleep(40);app.press(ENTER);/* Mouse off */
    await app.waitFor('next launch',x=>/Saved for this project · Mouse: at the next launch/u.test(x.text));
  }finally{app.unmount();}
});
