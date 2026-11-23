/*
 * R5b (owner decision Q-R5-19, answered "In R5b"): `/retry` sends the person's last message again, through the same path as
 * Enter (queue, steer and readiness rules included); `/copy [n]` copies TALOS's last answer — or the n-th from the end — to
 * the clipboard through the terminal (OSC 52, as Alt+C does), and says plainly that a terminal without OSC 52 copies nothing.
 * Before R5b neither existed (Hermes has both; Claude Code has /copy).
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {SLASH_COMMANDS,slashCommandGroup} from '../../src/tui/slash-commands.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r';
let n=0;const project=()=>{const root=join(env.root,`retry-copy-${++n}`);mkdirSync(root,{recursive:true});return root;};
const HISTORY=[
  {type:'message.started',data:{messageId:'u0',role:'user'}},{type:'message.delta',data:{messageId:'u0',delta:'first question'}},{type:'message.completed',data:{messageId:'u0'}},
  {type:'message.started',data:{messageId:'a0',role:'assistant'}},{type:'message.delta',data:{messageId:'a0',delta:'The older answer.'}},{type:'message.completed',data:{messageId:'a0'}},
  {type:'message.started',data:{messageId:'a1',role:'assistant'}},{type:'message.delta',data:{messageId:'a1',delta:'The latest answer, with ünïcode.'}},{type:'message.completed',data:{messageId:'a1'}},
];
const osc52=(text:string)=>'\u001b]52;c;'+Buffer.from(text,'utf8').toString('base64')+'\u0007';

test('R5b: /retry and /copy are commands, in their groups',()=>{
  assert.ok(SLASH_COMMANDS.some(row=>row.name==='retry'));assert.ok(SLASH_COMMANDS.some(row=>row.name==='copy'));
  assert.equal(slashCommandGroup('retry'),'turn');assert.equal(slashCommandGroup('copy'),'view');
});

test('R5b /retry sends the last message again, through the same path as Enter; nothing sent yet says so',async()=>{
  const fresh=await mountR5a({cols:100,rows:30,root:project(),paths:env.paths});
  try{await fresh.type('/retry');fresh.press(ENTER);await fresh.waitFor('nothing to retry',x=>/Nothing to retry yet/u.test(x.text));}
  finally{fresh.unmount();}
  const app=await mountR5a({cols:100,rows:30,root:project(),paths:env.paths});
  try{
    await app.type('first ask');app.press(ENTER);
    await app.waitFor('first sent',()=>app.calls.includes('resume first ask'));
    app.emit('run.started',{runId:'r0'});app.emit('run.completed',{runId:'r0'});await sleep(120);
    await app.type('explain the parser');app.press(ENTER);
    await app.waitFor('sent once',()=>app.calls.filter(call=>call==='resume explain the parser').length===1);
    app.emit('run.started',{runId:'r1'});app.emit('run.completed',{runId:'r1'});await sleep(120);
    /* stage 7.3: /retry opens its sheet (the approved mockup) with the last message; «Send it again» is the first row */
    await app.type('/retry');app.press(ENTER);
    await app.waitFor('the retry sheet',x=>/Send it again/u.test(x.text)&&/› explain the parser/u.test(x.text));await sleep(60);
    app.press(ENTER);
    await app.waitFor('sent again',()=>app.calls.filter(call=>call==='resume explain the parser').length===2);
    assert.equal(app.calls.filter(call=>call==='resume first ask').length,1,'the LAST message, not the first');
  }finally{app.unmount();}
});

test('R5b /copy copies the last answer, /copy 2 the one before, through OSC 52; the notice is honest',async()=>{
  const app=await mountR5a({cols:110,rows:34,root:project(),paths:env.paths,history:HISTORY});
  try{
    await app.waitFor('the history',x=>/The latest answer/u.test(x.text));
    /* stage 7.15: /copy alone is the mockup's sheet (r7-copy.test.ts); /copy N still copies at once, through OSC 52 */
    await app.type('/copy');app.press(ENTER);
    await app.waitFor('the sheet',x=>/── Copy to the clipboard/u.test(x.text));
    app.press('\x1b');await app.waitFor('closed',x=>!/── Copy/u.test(x.text));
    await app.type('/copy 1');app.press(ENTER);
    const s=await app.waitFor('copied',x=>/Copied answer 1 from the end/u.test(x.text));
    assert.ok(app.written().includes(osc52('The latest answer, with ünïcode.')),'the latest answer went to the clipboard, byte for byte');
    assert.match(s.text.replace(/\s+/gu,' '),/without OSC 52 copies nothing/u);
    await app.type('/copy 2');app.press(ENTER);
    await app.waitFor('copied the older',x=>/Copied answer 2 from the end/u.test(x.text));
    assert.ok(app.written().includes(osc52('The older answer.')));
    await app.type('/copy 9');app.press(ENTER);
    await app.waitFor('only two',x=>/only 2 answers/u.test(x.text));
    await app.type('/copy x');app.press(ENTER);
    await app.waitFor('usage',x=>/Usage: \/copy \[n\]/u.test(x.text));
  }finally{app.unmount();}
  const empty=await mountR5a({cols:100,rows:30,root:project(),paths:env.paths});
  try{await empty.type('/copy');empty.press(ENTER);await empty.waitFor('no answer',x=>/no answer to copy yet/u.test(x.text));}
  finally{empty.unmount();}
});
