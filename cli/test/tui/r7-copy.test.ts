/*
 * Stage 7.15 (mockup copy; Claude Code /copy picker, Codex /copy with quotes — owner 03/10): /copy alone is the mockup's
 * sheet — the whole last answer, its code blocks, its quotes, earlier answers — with a preview; Enter copies the chosen text
 * and the mockup's toast says what. /copy N still copies the Nth answer back at once. The test profile's clipboard is a file
 * (TALOS_CLIPBOARD_FILE), never the real one.
 * Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B';
let n=0;const project=()=>{const root=join(env.root,`copy-${++n}`);mkdirSync(root,{recursive:true});return root;};
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');
const ANSWER='Use the helper:\n```ts\nawait waitForSession(page)\n```\n> the cookie arrives late\nDone.';

async function answered(app:Awaited<ReturnType<typeof mountR5a>>,text:string,id:string){
  app.emit('run.started',{runId:`r-${id}`});app.emit('message.started',{messageId:id,role:'assistant'});
  app.emit('message.delta',{messageId:id,delta:text});app.emit('message.completed',{messageId:id});app.emit('run.completed',{runId:`r-${id}`});
  await sleep(80);
}

test('stage 7.15: /copy opens the sheet; a code block is copied alone and the toast says which',async()=>{
  const root=project();const clip=join(root,'clipboard.txt');const before=process.env.TALOS_CLIPBOARD_FILE;process.env.TALOS_CLIPBOARD_FILE=clip;
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await answered(app,'An earlier answer.','a0');await answered(app,ANSWER,'a1');
    await app.waitFor('the answer',x=>/Done\./u.test(x.text));
    await app.type('/copy');app.press(ENTER);
    const s=await app.waitFor('the sheet',x=>/── Copy to the clipboard · OSC 52 over SSH/u.test(x.text));
    assert.match(s.text,/› The whole last answer +6 lines/u);
    assert.match(s.text,/Code block 1 · ts +1 line\b/u);assert.match(s.text,/Quote 1 +1 line\b/u);assert.match(s.text,/Answer 2 back +1 line\b/u);
    assert.match(s.text,/│ Preview/u);
    app.press(DOWN);app.press(ENTER);
    await app.waitFor('the toast',x=>/Copied code block 1 · ts · 1 line/u.test(flat(x.lines)));
    for(let i=0;i<40;i++){try{if(readFileSync(clip,'utf8'))break;}catch{/* not yet */}await sleep(25);}
    assert.equal(readFileSync(clip,'utf8'),'await waitForSession(page)');
    /* a toast, as the mockup: it leaves by itself and never joins the conversation */
    await app.waitFor('the toast left',x=>!/Copied code block 1/u.test(flat(x.lines)),6_000);
  }finally{app.unmount();if(before===undefined)delete process.env.TALOS_CLIPBOARD_FILE;else process.env.TALOS_CLIPBOARD_FILE=before;}
});

test('stage 7.15: with no answer /copy says so; /copy 2 still copies an earlier answer at once',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    await app.type('/copy');app.press(ENTER);
    await app.waitFor('nothing yet',x=>/There is no answer to copy yet\./u.test(flat(x.lines)));
    assert.doesNotMatch((await app.screen()).text,/── Copy/u,'no empty sheet');
    await answered(app,'First.','b0');await answered(app,'Second.','b1');
    await app.type('/copy 2');app.press(ENTER);
    await app.waitFor('copied at once',x=>/Copied answer 2 from the end/u.test(flat(x.lines)));
    assert.doesNotMatch((await app.screen()).text,/── Copy/u);
  }finally{app.unmount();}
});
