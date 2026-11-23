/*
 * 0.6.13, «a request too large for the model» on the screen (owner 22/10/2026: a small choice dialog, as the Full access
 * confirmation). When the kernel stops a turn with REQUEST_TOO_LARGE (nothing summarised, nothing paid) the text sent goes back to
 * an EMPTY composer — with its collapsed pastes — and the dialog says the numbers and offers «Send as attachment» (selected) and
 * «Edit the message». Enter on the first sends the same text with the kernel's `allegaSeTroppoGrande` (runtime option
 * `attachIfTooLarge`); Esc closes and keeps the text; a composer already holding new text is not overwritten. A replayed
 * conversation draws the request as not sent and opens no dialog. Mount: the REAL TuiApp into a synthetic terminal
 * (r5a-s-fixture.ts); the kernel's events are the contract's, faked; no window, no keystrokes to the desktop, no network.
 */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {composerRow,hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',ESC='\x1b',DOWN='\x1b[B';
const TOO_LARGE={type:'RunError',runId:'r1',code:'REQUEST_TOO_LARGE',message:'The request is too large for this model.',tokensRichiesta:15600,tokensCornice:9000,finestra:16000,fonte:'stima'};
/* the dialog's own rows: its title alone on a line (the conversation's failure line goes on with «: about…») and its keys */
const TITLE=/The message is too large for this model *│? *$/mu;
const KEYS=/↑\/↓ choose · Enter confirms · Esc closes/u;
const DETAIL=/About 15,600 tokens; with the system and tools \(about 9,000\) it is over this model’s 16,000\. Nothing was summarized or sent\./u;
/* the rows inside the boxes, borders off, joined: the dialog's wrapped detail reads as one line */
const boxed=(s:{lines:string[]})=>s.lines.map(line=>line.trim()).filter(line=>line.startsWith('│')&&line.endsWith('│')).map(line=>line.slice(1,-1).trim()).join(' ');
const composerLine=(s:{lines:string[]})=>{const row=composerRow(s as any);return row>=0?s.lines[row]!:'';};
async function mount(){
  const resumes:any[]=[];
  const app=await mountR5a({cols:120,rows:40,root:env.root,paths:env.paths,runtimeExtra:{resume:async(id:string,prompt?:string,attachments?:unknown,options?:unknown)=>{resumes.push({id,prompt,attachments,options});return id;}}});
  return{app,resumes};
}
/* the kernel's turn for what was just sent, ended by the contract's RunError (through the real v2 bridge of the adapter) */
async function tooLarge(app:Awaited<ReturnType<typeof mountR5a>>,prompt:string){
  app.raw({type:'RunStarted',runId:'r1',input:{consegna:prompt}});
  await sleep(40);
  app.raw({type:'CUSTOM',name:'talos.richiesta-non-inviata',value:{at:'2026-10-22T10:00:00.000Z',indice:1}});
  app.raw(TOO_LARGE);
}

test('the sent text is back in the composer, the dialog says the numbers, Enter sends it as an attachment',async()=>{
  const {app,resumes}=await mount();
  try{
    await app.type('please read this huge log');app.press(ENTER);
    await app.waitFor('sent',()=>resumes.length===1);
    assert.equal(resumes[0].options,undefined,'a normal send carries no option');
    await app.waitFor('the composer emptied',s=>!/please read this huge log/u.test(composerLine(s)));
    await tooLarge(app,'please read this huge log');
    const s=await app.waitFor('the dialog',x=>TITLE.test(x.text)&&KEYS.test(x.text)&&DETAIL.test(boxed(x)));
    assert.match(s.text,/▸ Send as attachment/u,'the first choice is selected');
    assert.match(s.text,/Edit the message/u);
        assert.match(s.text,/Not sent: too large for this model/u,'the request is marked in the conversation');
    app.press(ENTER);
    await app.waitFor('sent again',()=>resumes.length===2);
    assert.deepEqual(resumes[1],{id:'s1',prompt:'please read this huge log',attachments:[],options:{attachIfTooLarge:true}});
    const after=await app.waitFor('closed',x=>!KEYS.test(x.text));
    assert.doesNotMatch(composerLine(after),/please read this huge log/u,'the text left the composer with the send');
  }finally{app.unmount();}
});

test('Esc closes the dialog and the text stays in the composer, with its collapsed paste; nothing is sent',async()=>{
  const {app,resumes}=await mount();
  try{
    const PASTE=Array.from({length:60},(_,i)=>`line ${i+1} of a pasted log`).join('\n');
    await app.type('look: ');app.press(`\x1b[200~${PASTE}\x1b[201~`);
    await app.waitFor('the collapsed paste',s=>/\[Pasted text #\d+ \+59 lines\]/u.test(composerLine(s)));
    app.press(ENTER);
    await app.waitFor('sent',()=>resumes.length===1);
    await app.waitFor('the composer emptied',s=>!/Pasted text/u.test(composerLine(s)));
    await tooLarge(app,`look: ${PASTE}`);
    await app.waitFor('the dialog',x=>TITLE.test(x.text)&&KEYS.test(x.text));
    app.press(ESC);
    const s=await app.waitFor('closed',x=>!KEYS.test(x.text));
    assert.match(composerLine(s),/look: \[Pasted text #\d+ \+59 lines\]/u,'the draft is back as it was typed, its paste collapsed');
    await sleep(100);
    assert.equal(resumes.length,1,'Esc sends nothing');
  }finally{app.unmount();}
});

test('«Edit the message» closes the dialog, keeps the text and sends nothing',async()=>{
  const {app,resumes}=await mount();
  try{
    await app.type('another long one');app.press(ENTER);
    await app.waitFor('sent',()=>resumes.length===1);
    await tooLarge(app,'another long one');
    await app.waitFor('the dialog',x=>TITLE.test(x.text)&&KEYS.test(x.text));
    app.press(DOWN);
    await app.waitFor('Edit selected',x=>/▸ Edit the message/u.test(x.text));
    app.press(ENTER);
    const s=await app.waitFor('closed',x=>!KEYS.test(x.text));
    assert.match(composerLine(s),/another long one/u);
    await sleep(100);
    assert.equal(resumes.length,1);
  }finally{app.unmount();}
});

test('a composer already holding new text is not overwritten; the dialog still sends the request that failed',async()=>{
  const {app,resumes}=await mount();
  try{
    await app.type('the big request');app.press(ENTER);
    await app.waitFor('sent',()=>resumes.length===1);
    await app.waitFor('the composer emptied',s=>!/the big request/u.test(composerLine(s)));
    await app.type('typed meanwhile');
    await app.waitFor('typed',s=>/typed meanwhile/u.test(composerLine(s)));
    await tooLarge(app,'the big request');
    let s=await app.waitFor('the dialog',x=>TITLE.test(x.text)&&KEYS.test(x.text));
    assert.match(composerLine(s),/typed meanwhile/u);
    assert.doesNotMatch(composerLine(s),/the big request/u);
    app.press(ENTER);
    await app.waitFor('sent as attachment',()=>resumes.length===2);
    assert.equal(resumes[1].prompt,'the big request');
    assert.deepEqual(resumes[1].options,{attachIfTooLarge:true});
    s=await app.waitFor('closed',x=>!KEYS.test(x.text));
    assert.match(composerLine(s),/typed meanwhile/u,'what the person typed stays');
  }finally{app.unmount();}
});

test('a replayed conversation draws the request as not sent and opens no dialog',async()=>{
  const error=(createV2EventBridge('s1').translate({...TOO_LARGE,runId:'r0'}) as any).data;
  const history=[
    {type:'run.started',data:{runId:'r0',input:{prompt:'the old huge paste'}}},
    {type:'request.not_sent',data:{index:1}},
    {type:'run.failed',data:error},
  ];
  const app=await mountR5a({cols:120,rows:40,root:env.root,paths:env.paths,history});
  try{
    const s=await app.waitFor('the replay',x=>/the old huge paste/u.test(x.text)&&/Not sent: too large for this model/u.test(x.text));
    const lines=s.lines.map(line=>line.trim());
    const prompt=lines.findIndex(line=>/the old huge paste/u.test(line));
    assert.match(lines[prompt+1]!,/^Not sent: too large for this model$/u,'the mark is right under the request');
    await sleep(200);
    const now=await app.screen();
    assert.doesNotMatch(now.text,KEYS,'a replay never opens the dialog');
    assert.doesNotMatch(now.text,TITLE);
    assert.doesNotMatch(composerLine(now),/the old huge paste/u,'nor fills the composer');
  }finally{app.unmount();}
});

/* review 9 F3 of 0.6.13: the kernel's `allegabile:false` (not even start, end and a note fit; images) leaves one choice, «Edit the
   message», with a line that says why; Enter or the arrows never send it again as an attachment, so the dialog cannot loop */
test('not attachable: only «Edit the message», a line that says why, and Enter sends nothing',async()=>{
  const {app,resumes}=await mount();
  try{
    await app.type('please read this huge log');app.press(ENTER);
    await app.waitFor('sent',()=>resumes.length===1);
    app.raw({type:'RunStarted',runId:'r1',input:{consegna:'please read this huge log'}});
    await sleep(40);
    app.raw({...TOO_LARGE,dati:{tokensRichiesta:15600,tokensCornice:9000,finestra:16000,fonte:'stima',allegabile:false}});
    const s=await app.waitFor('the dialog',x=>TITLE.test(x.text)&&/Not even as an attachment does it fit/u.test(boxed(x)));
    assert.doesNotMatch(s.text,/Send as attachment/u,'the action that cannot work is not offered');
    assert.match(s.text,/▸ Edit the message/u);
    assert.match(s.text,/Enter or Esc closes; the text stays in the composer/u);
    app.press(DOWN);await sleep(60);app.press(ENTER);
    const after=await app.waitFor('closed',x=>!/Enter or Esc closes/u.test(x.text));
    await sleep(100);
    assert.equal(resumes.length,1,'nothing is sent again');
    assert.match(composerLine(after),/please read this huge log/u,'the text stays to be shortened');
  }finally{app.unmount();}
});
