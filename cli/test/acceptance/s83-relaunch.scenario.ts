/**
 * FE-048: another folder from New session, on the BUILT CLI through ConPTY, as the owner would: the row opens, the unsent text stops it with
 * a card, staying stays, going goes; the new TALOS answers the keyboard in that folder with no medal, Ctrl+C does not end the one that waits,
 * and leaving it ends all of it with its exit code. A folder that is gone says why and how to try again.
 */
import assert from 'node:assert/strict';
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s83',files:{'README.md':'# here\n'},extraEnv:{...sinkEnv(sink),COLORTERM:'truecolor'}});
const SIZE={cols:120,rows:36};
const otherFolder=()=>join(s.profile.project,'..','other-project');

async function conversationIn(project:string,prompt:string){
  const t=TerminalSession.launch({...s.profile,project} as any,[],SIZE);s.sessions.push(t);
  await t.waitFor('the trust question',x=>/Trust this folder\?/u.test(x.text),{timeout:20_000});
  /* the question ignores keys for its first second (judge v2242; 300 ms before) */
  await new Promise(done=>setTimeout(done,1150));await t.type('y');await new Promise(done=>setTimeout(done,200));t.press('enter'); /* y: Yes (No is the default since 02/11) */
  await toComposer(t);
  await t.submit(prompt);await t.waitFor('the answer',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
  await t.close();
}
async function onOtherRow(t:TerminalSession){
  t.send('\u001bo');await t.waitFor('the projects',x=>/── New session/u.test(x.text)&&/other-project/u.test(x.text),{timeout:15_000});
  const line=(await t.settled(),t.screen().lines.filter(row=>/^ *[›]? *(project|other-project) /u.test(row)));
  const first=line.findIndex(row=>/other-project/u.test(row));
  for(let index=0;index<first;index+=1){t.press('down');await t.settled();}
}

const closing=(fn:(ctx:{t?:TerminalSession})=>Promise<void>)=>async()=>{const box:{t?:TerminalSession}={};try{await fn(box);}finally{await box.t?.close();}};

test('s83 · a project of another folder opens there, in the same terminal, and the keyboard is the new one\'s',closing(async box=>{
  mkdirSync(otherFolder(),{recursive:true});writeFileSync(join(otherFolder(),'README.md'),'# other\n');
  await conversationIn(otherFolder(),'A conversation in the other folder');
  const t=box.t=s.launch([],SIZE);await toComposer(t);
  await onOtherRow(t);
  t.press('enter');
  const next=await t.waitFor('TALOS in the other folder',x=>/other-project/u.test(x.lines[0]??'')&&/Pick up your work/u.test(x.text),{timeout:25_000});
  assert.doesNotMatch(next.text,/TALOS \/\/ AUTONOMOUS/u,'no medal again');
  await t.settled();
  t.send('typed here');
  await t.waitFor('the keyboard belongs to the new TALOS',x=>/typed here/u.test(x.text),{timeout:8_000});
  t.send('\u0003');await t.settled();
  await t.waitFor('Ctrl+C clears the draft and leaves it alive',x=>!/typed here/u.test(x.text)&&/Ask TALOS/u.test(x.text),{timeout:8_000});
  assert.ok(!(t as any).exit,'the parent that waits did not end');
  t.send('/exit\r');
  await (t as any).waitForExit(15_000);
  assert.equal((t as any).exit?.code,0,'its exit code is the exit code');
}));

test('s83 · unsent text stops it with a card: staying stays and keeps the text, going goes',closing(async box=>{
  const t=box.t=s.launch([],SIZE);await toComposer(t);
  t.send('a draft');await t.waitFor('the draft',x=>/a draft/u.test(x.text));
  await onOtherRow(t);
  t.press('enter');
  await t.waitFor('the card says what is lost',x=>/The text you have not sent is lost\./u.test(x.text)&&/Stay here/u.test(x.text)&&/Stop and open it/u.test(x.text),{timeout:10_000});
  t.press('enter');
  await t.waitFor('staying keeps the text',x=>/a draft/u.test(x.text)&&!/Stay here/u.test(x.text));
  assert.ok(!(t as any).exit);
  await onOtherRow(t);
  t.press('enter');await t.waitFor('the card',x=>/Stop and open it/u.test(x.text));
  t.press('down');await t.settled();t.press('enter');
  await t.waitFor('going goes',x=>/other-project/u.test(x.lines[0]??'')&&/Ask TALOS/u.test(x.text),{timeout:25_000});
}));

test('s83 · a folder that is gone says why and how to try again, and the terminal is not mute',closing(async box=>{
  const t=box.t=s.launch([],SIZE);await toComposer(t);
  await onOtherRow(t);
  rmSync(otherFolder(),{recursive:true,force:true});
  t.press('enter');
  const until=Date.now()+15_000;
  while(Date.now()<until&&!(t as any).exit)await new Promise(done=>setTimeout(done,50));
  assert.ok((t as any).exit,'it ended');
  const text=t.normalLines().join('\n').replace(/\s+/gu,' ');
  assert.match(text,/Could not open/u);assert.match(text,/To try again: cd/u);
}));

test('s83 · a path never seen starts with the trust question, and refusing it leaves TALOS and says so',closing(async box=>{
  const fresh=join(s.profile.project,'..','never-seen');mkdirSync(fresh,{recursive:true});
  const t=box.t=s.launch([],SIZE);await toComposer(t);
  t.send('\u001bo');await t.waitFor('the page, past its loading line',x=>/type a path/u.test(x.text),{timeout:15_000});await t.settled();
  t.send('p');await t.waitFor('the path row',x=>/Folder:/u.test(x.text));
  t.paste(fresh);await t.settled();t.press('enter');
  await t.waitFor('its own trust question',x=>/Trust this folder\?/u.test(x.text)&&/never-seen/u.test(x.text),{timeout:25_000});
  await new Promise(done=>setTimeout(done,1150)); /* past the one-second grace (judge v2242) */
  t.press('enter');
  const until=Date.now()+15_000;
  while(Date.now()<until&&!(t as any).exit)await new Promise(done=>setTimeout(done,50));
  assert.ok((t as any).exit,'cancelling ended it: no folder was opened behind the person');
}));

test.after(async()=>{await sink.close();});
