/*
 * Stage 7.12 (mockup transcript mode; Claude Code fullscreen «Ctrl+o toggles between the normal prompt and transcript mode»)
 * in the REAL app: Ctrl+O and /transcript open the whole conversation on the whole screen with the mockup's top row; / searches
 * and says where the match is; [ leaves the alternate screen and writes the conversation to the terminal's own scrollback until
 * q; q, Esc or Ctrl+O come back to the composer.
 * Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

/* the search's words are drawn in reverse: the frames carry their colours */
process.env.FORCE_COLOR='3';
const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',ESC='\x1b',CTRL_O='\x0f';
let n=0;const project=()=>{const root=join(env.root,`transcript-${++n}`);mkdirSync(root,{recursive:true});return root;};

async function conversation(app:Awaited<ReturnType<typeof mountR5a>>){
  await app.type('Why is the login test flaky?');app.press(ENTER);await sleep(80);
  app.emit('run.started',{runId:'r1'});app.emit('message.started',{messageId:'a1',role:'assistant'});
  app.emit('message.delta',{messageId:'a1',delta:'It waited 500 ms for the session cookie.'});app.emit('message.completed',{messageId:'a1'});app.emit('run.completed',{runId:'r1'});
  await app.waitFor('the answer',x=>/session cookie/u.test(x.text));
}

test('stage 7.12: Ctrl+O opens the transcript mode; / searches and says where; q comes back',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await conversation(app);
    app.press(CTRL_O);
    let s=await app.waitFor('the transcript mode',x=>/^ Transcript · 2 messages {3}\/ search · n\/N next · \{ \} prompts · \[ to terminal scrollback · v editor · q back/mu.test(x.text));
    assert.match(s.text,/ \/ to search$/mu);assert.doesNotMatch(s.text,/^╭─/mu,'no composer on the transcript page');
    await app.type('/cookie');
    s=await app.waitFor('typing the search',x=>/ \/cookie▍ {3}1 match/u.test(x.text));
    app.press(ENTER);
    await app.waitFor('the match',x=>/ match 1 of 1 for "cookie" · n next · N previous/u.test(x.text));
    await app.type('q');
    await app.waitFor('back',x=>/^╭─/mu.test(x.text)&&!/^ Transcript · /mu.test(x.text));
  }finally{app.unmount();}
});

const ok={status:'completed',receipt:{status:null,allowed:null,via:null,reason:null,risk:null},enforcement:null};
const OUTPUT=Array.from({length:14},(_,i)=>`output line ${i+1}`).join('\n');
async function workedConversation(app:Awaited<ReturnType<typeof mountR5a>>){
  await app.type('Why is the login test flaky?');app.press(ENTER);await sleep(80);
  app.emit('run.started',{runId:'r1'});
  app.emit('reasoning.started',{messageId:'m0'});app.emit('reasoning.delta',{messageId:'m0',delta:'The cookie arrives late, plan to wait for it.'});app.emit('reasoning.completed',{messageId:'m0'});
  /* two reads in a row: one group line in the main view, one row each in the full transcript */
  app.emit('tool.started',{toolCallId:'g1',toolName:'leggi'});app.emit('tool.args',{toolCallId:'g1',delta:'{"percorso":"src/session.ts"}'});app.emit('tool.completed',{toolCallId:'g1',content:'export const a=1;',...ok});
  app.emit('tool.started',{toolCallId:'g2',toolName:'leggi'});app.emit('tool.args',{toolCallId:'g2',delta:'{"percorso":"src/cookie.ts"}'});app.emit('tool.completed',{toolCallId:'g2',content:'export const b=2;',...ok});
  app.emit('tool.started',{toolCallId:'t1',toolName:'shell'});app.emit('tool.args',{toolCallId:'t1',delta:'{"command":"npm test"}'});
  app.emit('tool.output',{toolCallId:'t1',delta:OUTPUT});app.emit('tool.completed',{toolCallId:'t1',content:OUTPUT,...ok});
  app.emit('message.started',{messageId:'a1',role:'assistant'});
  app.emit('message.delta',{messageId:'a1',delta:'It waited 500 ms for the session cookie.'});app.emit('message.completed',{messageId:'a1'});app.emit('run.completed',{runId:'r1'});
  await app.waitFor('the answer',x=>/session cookie/u.test(x.text));
}

test('+1 completa: Ctrl+O is the full view — tool output whole, reasoning shown, time and model on the answer; d compacts it',async()=>{
  const app=await mountR5a({cols:120,rows:50,root:project(),paths:env.paths});
  try{
    await workedConversation(app);
    const main=await app.screen();
    assert.doesNotMatch(main.text,/^ {2}output line 2$/mu,'the main view keeps the call closed');
    assert.doesNotMatch(main.text,/plan to wait for it/u,'and the reasoning collapsed');
    app.press(CTRL_O);
    const full=await app.waitFor('the full view',x=>/^ Transcript · /mu.test(x.text)&&/^ {2}output line 2$/mu.test(x.text));
    assert.match(full.text,/plan to wait for it/u,'the reasoning is shown');
    assert.match(main.text,/^ {2}● Read 2 files · ctrl\+o$/mu,'the main view groups the reads');
    assert.match(full.text,/^ {2}Read file src\/session\.ts · 1 line$/mu,'the full view draws each call on its own row, two cells in');
    assert.match(full.text,/^ {2}Read file src\/cookie\.ts · 1 line$/mu);assert.doesNotMatch(full.text,/Read 2 files/u);
    assert.match(full.text,/^ {2}\d\d:\d\d · qwen3-coder-test$/mu,'the time and the model on the answer');
    await app.type('d');
    const compact=await app.waitFor('the compact view',x=>/^ Transcript · /mu.test(x.text)&&!/^ {2}output line 2$/mu.test(x.text));
    assert.doesNotMatch(compact.text,/plan to wait for it/u);assert.doesNotMatch(compact.text,/· \d\d:\d\d · qwen3/u);
    await app.type('?');
    await app.waitFor('the keys',x=>/Transcript keys/u.test(x.text)&&/full view: every item open/u.test(x.text));
    await app.type('?');await app.waitFor('the keys put away',x=>!/Transcript keys/u.test(x.text));
    await app.type('d');await app.waitFor('full again',x=>/^ {2}output line 2$/mu.test(x.text));
    const before=app.written().length;
    await app.type('/cookie');app.press(ENTER);
    const found=await app.waitFor('the match',x=>/ match \d of \d for "cookie"/u.test(x.text));
    assert.match(found.text,/^ › Why is the login test flaky\?$/mu,'under the title, the prompt the match answers');
    await sleep(150);
    assert.match(app.written().slice(before),/\u001b\[7m(?:\u001b\[[0-9;]*m)*cookie/u,'the word is drawn in reverse');
  }finally{app.unmount();}
});

test('+1 completa: f on your prompt forks before it; without the capability it says so and stays',async()=>{
  const cuts:string[][]=[];
  const export_=(id:string)=>({sessionId:id,eventi:[{type:'RunStarted',runId:'run-1',input:{prompt:'Why is the login test flaky?'}}]});
  const plain=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,runtimeExtra:{export:export_}});
  try{
    await conversation(plain);
    plain.press(CTRL_O);await plain.waitFor('the transcript mode',x=>/^ Transcript · /mu.test(x.text));
    await plain.type('g');await plain.type('f');
    await plain.waitFor('the refusal',x=>/cannot start a conversation before an earlier message/u.test(x.lines.map(line=>line.trim()).join(' ')));
  }finally{plain.unmount();}
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,runtimeExtra:{export:export_,capabilities:()=>({forkBeforeRun:true}),
    forkBeforeRun:async(id:string,runId:string)=>{cuts.push([id,runId]);return{sessionId:'s-cut',message:'Why is the login test flaky?'};}}});
  try{
    await conversation(app);
    app.press(CTRL_O);await app.waitFor('the transcript mode',x=>/^ Transcript · /mu.test(x.text));
    await app.type('g');await app.type('j');await app.type('f');await sleep(200);
    assert.deepEqual(cuts,[],'not on an answer');
    await app.type('g');await app.type('f');
    await app.waitFor('back in the composer',x=>/^╭─/mu.test(x.text)&&!/^ Transcript · /mu.test(x.text));
    assert.deepEqual(cuts,[['s1','run-1']]);
  }finally{app.unmount();}
});

test('stage 7.12: /transcript opens it too; Ctrl+O and Esc close it; [ writes to the terminal scrollback until q',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await conversation(app);
    await app.type('/transcript');app.press(ENTER);
    await app.waitFor('opened by the command',x=>/^ Transcript · /mu.test(x.text));
    app.press(CTRL_O);await app.waitFor('closed by Ctrl+O',x=>!/^ Transcript · /mu.test(x.text));
    app.press(CTRL_O);await app.waitFor('again',x=>/^ Transcript · /mu.test(x.text));
    const before=app.written().length;
    await app.type('[');await sleep(250);
    const out=app.written().slice(before);
    assert.ok(out.includes('\u001b[?1049l'),'left the alternate screen');
    assert.ok(out.indexOf('It waited 500 ms for the session cookie.')>out.indexOf('\u001b[?1049l'),'the conversation is written after it');
    assert.match(out,/Conversation written to the terminal scrollback \(\d+ lines\)/u);
    await app.type('q');await sleep(200);
    assert.ok(app.written().slice(before).includes('\u001b[?1049h'),'back on the alternate screen');
    await app.waitFor('the transcript page again',x=>/^ Transcript · /mu.test(x.text));
    app.press(ESC);await app.waitFor('closed by Esc',x=>/^╭─/mu.test(x.text));
  }finally{app.unmount();}
});
