/*
 * R5a lane S — the real app at 60 and 120 columns (common brief: "frames … or pure view tests at 60 and 120 columns").
 *   S1/S9  the status row is the last row (`model … · ctx ? · cost ?` while lane R's stubs answer null, E1); the header names
 *          the folder once, no `interactive`, no `session <uuid>` row, no idle row above the composer (review D-14);
 *   S5     while a turn runs the strip says what Enter does; Enter queues (default), steers or interrupts by `/busy`; the
 *          first time a one-time tip; a session command typed during a turn is queued with a line saying so (Q-R5-7/8);
 *   S8     a hidden reasoning block leaves "Thought for N s · Ctrl+T shows"; Ctrl+T shows all and is remembered (Q-R5-9);
 *   S1     `/usage` runs and says what nobody knows (Q-R5-8, E1).
 * Hermetic: APPDATA/LOCALAPPDATA point at a temp folder for the whole file (r1-layout-fixture.ts hermeticProfile).
 */
import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {frameRowsFor} from '../../src/tui/components/terminal-shell.ts';
import {brokenBorders,hermeticProfile,sleep,type Screen} from './r1-layout-fixture.ts';
import {mountR5a,type R5aApp} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const SIZES=[{cols:60,rows:30},{cols:120,rows:40}] as const;
const HISTORY=[
  {type:'run.started',data:{runId:'r0'}},
  {type:'message.started',data:{messageId:'u0',role:'user'}},{type:'message.delta',data:{messageId:'u0',delta:'first question'}},{type:'message.completed',data:{messageId:'u0'}},
  {type:'message.started',data:{messageId:'a0',role:'assistant'}},{type:'message.delta',data:{messageId:'a0',delta:'OK'}},{type:'message.completed',data:{messageId:'a0'}},
  {type:'run.completed',data:{runId:'r0'}},
];
const lastFrameRow=(s:Screen)=>s.lines[frameRowsFor(s.rows)-1]??'';
const userConfig=async()=>{try{return JSON.parse(await readFile(join(env.paths.configRoot,'config.json'),'utf8'));}catch{return{};}};
const dump=(s:Screen)=>s.lines.map((line,index)=>`${String(index).padStart(2)}|${line}`).join('\n');
async function withApp(size:{cols:number;rows:number},options:Parameters<typeof mountR5a>[0] extends infer O?Partial<O>:never,body:(app:R5aApp)=>Promise<void>){
  /* each app starts clean: no queue restored from the previous test, no remembered choice (both live in the temp profile) */
  await rm(join(env.paths.configRoot,'config.json'),{force:true});await rm(env.paths.queueRoot,{recursive:true,force:true});
  const app=await mountR5a({...size,root:env.root,paths:env.paths,...options} as any);
  try{await body(app);}finally{app.unmount();await sleep(50);}
}

for(const size of SIZES){
  test(`S1/S9 at ${size.cols}: the status row is the last row; the path once; no interactive, no session id, no idle row`,async()=>{
    await withApp(size,{},async app=>{
      const s=await app.settle();
      /* the approved mockup (07/10 footerRows): from 100 columns the model row is last, under 100 the mode row, with `ctx` (FE-048) */
      assert.match(lastFrameRow(s),size.cols>=100?/^ ollama:qwen3-coder-test · ctx \?(?: · \S.*)?$/u:/^ ask before edits · ctx \? · shift\+tab · \? keys\s*$/u,dump(s));
      assert.match(s.lines[0]!,/^ TALOS {2}\S/u,dump(s));
      assert.doesNotMatch(s.text,/\binteractive\b/u,dump(s));
      assert.doesNotMatch(s.text,/session [0-9a-z-]{2,}/u,dump(s));
      assert.equal(s.lines.filter(line=>line.startsWith(' TALOS  ')).length,1);
      /* D-14: nothing happening, so no activity row above the composer */
      const composerTop=s.lines.findIndex(line=>/^╭─/u.test(line));
      assert.doesNotMatch(s.lines[composerTop-1]??'',/^\s*idle\s*$/u,dump(s));
      assert.doesNotMatch(s.text,/^\s{0,2}idle\s*$/mu,dump(s));
      assert.deepEqual(brokenBorders(s.lines),[]);assert.equal(s.wrapped??0,0);
      /* UI Phase 0 (owner 27/09, "like Claude Code"): no working subagent, so no agent row in the footer */
      assert.doesNotMatch(s.text,/[•›●] main · /u,dump(s));
    });
    /* R3 Q-R3-13: `full access` and `no sandbox` lead the mode row (the mockup's footer), at every width */
    await withApp(size,{props:{shellIsolation:async()=>({verified:false}),invocation:{model:'ollama:qwen3-coder-test',permissionMode:'bypassPermissions',resume:'s1'}}},async app=>{
      const s=await app.waitFor('the safety labels',x=>x.lines.some(line=>(size.cols>=100?/^ full access · no sandbox · shift\+tab · \? keys\s*$/u:/^ full access · no sandbox · ctx \? · shift\+tab · \? keys\s*$/u).test(line)));
      assert.equal(s.wrapped??0,0);
    });
  });

  test(`S5 at ${size.cols}: while a turn runs Enter queues and says so once; a session command waits with a line`,async()=>{
    await withApp(size,{history:HISTORY},async app=>{
      app.emit('run.started',{runId:'r1'});
      /* the approved mockup (07/10 composerRows): while a turn runs, the empty composer says what typing does */
      let s=await app.waitFor('the busy line',x=>x.text.includes('Type to queue a message · esc to stop'));
      assert.doesNotMatch(s.text,/Esc\/Ctrl\+C interrupt/u);
      await app.type('follow up');app.press('\r');
      /* FE-048 (owner 01/11, «Fascia sopra il prompt»): the queued message waits in the band above the composer */
      s=await app.waitFor('the queued prompt',x=>/1 queued · goes in when the turn ends/u.test(x.text)&&/› follow up/u.test(x.text));
      assert.doesNotMatch(s.text,/queue · 1 pending/u,'no queue line under the composer');
      assert.match(s.text.replace(/\s+/gu,' '),/Tip: while TALOS works, Enter queues your message until the turn ends; Alt\+S steers, Esc interrupts, \/busy changes it\./u,dump(s));
      assert.deepEqual(app.calls,[],'nothing was sent while the turn runs');
      /* F-Q2 (owner 03/10): /model acts at once; a session command such as /compact still waits for the turn end */
      await app.type('/compact');app.press('\r');
      s=await app.waitFor('the queued command line',x=>x.text.includes('/compact runs when this turn ends (queued).'));
      await app.type('again');app.press('\r');
      s=await app.waitFor('the second queued prompt',x=>/3 queued · goes in when the turn ends/u.test(x.text));
      assert.equal(s.text.split('Tip: while TALOS works').length-1,1,'the tip is shown once');
      /* views run at once */
      await app.type('/status');app.press('\r');
      /* stage 7.11: the Settings sheet opens at once, while the turn runs */
      await app.waitFor('the status tab',x=>/── Settings this project/u.test(x.text)&&/Mode {10}asks before edits/u.test(x.text));
    });
  });

  test(`S5 at ${size.cols}: /busy steer is remembered; Enter then steers; interrupt mode stops the turn and sends`,async()=>{
    await withApp(size,{history:HISTORY},async app=>{
      await app.type('/busy steer');app.press('\r');
      await app.waitFor('the busy choice',x=>x.text.includes('Busy input set to steer'));
      /* the line is shown before the asynchronous save ends (ui-preferences.ts): wait for the file, up to 3 s — read at once
         it failed 2 runs in ~6 (27/09) */
      let saved:unknown;for(const until=Date.now()+3_000;Date.now()<until;await new Promise(resolve=>setTimeout(resolve,50))){saved=(await userConfig()).ui?.busyInput;if(saved==='steer')break;}
      assert.equal(saved,'steer');
      app.emit('run.started',{runId:'r1'});
      await app.waitFor('the steer line',x=>x.text.includes('Type to steer the turn · esc to stop'));
      await app.type('go left');app.press('\r');
      await app.waitFor('the steer call',()=>app.calls.includes('steer go left'));
    });
    await withApp(size,{history:HISTORY,props:{busyInput:'interrupt'}},async app=>{
      app.emit('run.started',{runId:'r1'});
      await app.waitFor('the interrupt line',x=>x.text.includes('Type to stop the turn and send'));
      await app.type('do this instead');app.press('\r');
      await app.waitFor('the cancel',()=>app.calls.some(call=>call.startsWith('cancel')));
      app.emit('run.cancelled',{runId:'r1'});
      await app.waitFor('the new prompt sent',()=>app.calls.includes('resume do this instead'));
    });
  });

  test(`S8 at ${size.cols}: a hidden reasoning block leaves one dim line; Ctrl+T shows all and the choice is remembered`,async()=>{
    await withApp(size,{history:HISTORY,props:{reasoning:'collapsed'}},async app=>{
      app.emit('run.started',{runId:'r1'});app.emit('reasoning.started',{messageId:'m1'});app.emit('reasoning.delta',{messageId:'m1',delta:'private plan'});
      /* the approved mockup (07/10, kind 'thought'): `▸ Thinking…` while it streams, then `▸ Thought for 2s  click to read` */
      let s=await app.waitFor('thinking',x=>/^ {2}▸ Thinking…/mu.test(x.text));
      assert.doesNotMatch(s.text,/private plan|Thought/u,'while it streams its words stay closed');
      app.emit('reasoning.completed',{messageId:'m1'});app.emit('message.started',{messageId:'a1',role:'assistant'});app.emit('message.delta',{messageId:'a1',delta:'Answer'});app.emit('message.completed',{messageId:'a1'});app.emit('run.completed',{runId:'r1'});
      s=await app.waitFor('the thought line',x=>/^ {2}▸ Thought for \d+s {2}click to read/mu.test(x.text));
      assert.doesNotMatch(s.text,/private plan/u);
      app.press('\x14');
      s=await app.waitFor('the reasoning shown',x=>x.text.includes('private plan')&&/▾ Thought for/u.test(x.text));
      assert.doesNotMatch(s.text,/click to read/u);
      await sleep(100);assert.equal((await userConfig()).ui?.reasoning,'visible');
      app.press('\x14');
      await app.waitFor('collapsed again',x=>/▸ Thought for/u.test(x.text)&&!x.text.includes('private plan'));
      await sleep(100);assert.equal((await userConfig()).ui?.reasoning,'collapsed');
    });
  });

  test(`S1 at ${size.cols}: /usage runs and names what nobody reported`,async()=>{
    await withApp(size,{history:HISTORY},async app=>{
      await app.type('/usage');app.press('\r');
      /* FE-048 C5 (01/11): /usage is the CLI usage page; s opens this session's figures, the Settings sheet's Usage tab (stage 7.11),
         where every figure nobody reported is said so */
      await app.waitFor('the usage page',x=>/── CLI usage/u.test(x.text));app.press('s');
      const s=await app.waitFor('the usage tab',x=>/── Settings this project/u.test(x.text)&&/Compactions {3}/u.test(x.text));
      assert.match(s.text,/Context {7}window unknown/u,dump(s));
      assert.match(s.text,/Cost {10}unknown: no price source for this model/u,dump(s));
    });
  });
}
