/**
 * F-023 (owner 06/10): «il composer e quello che sta sotto devono rimanere fissi quando scorro sopra».
 * The bottom chrome (composer, shortcut strip, reasoning/status, footer) must occupy the SAME screen rows
 * whether the transcript is at the tail, scrolled up (announcement on), or back at the tail — at every size.
 * The frame must also keep writing up to its last chrome row (no phantom empty row under the footer).
 */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {frameRowsFor} from '../../src/tui/components/terminal-shell.ts';
import {hermeticProfile,KEY,mountApp,sleep,type Screen} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const PROMPT='PROMPT what changed in the build';
const ANSWER=['# Changes','',...Array.from({length:40},(_,i)=>`- change ${i+1} in the build`)].join('\n');
const HISTORY=[
  {type:'run.started',data:{runId:'r0'}},
  {type:'message.started',data:{messageId:'u0',role:'user'}},{type:'message.delta',data:{messageId:'u0',delta:PROMPT}},{type:'message.completed',data:{messageId:'u0'}},
  {type:'message.started',data:{messageId:'a0',role:'assistant'}},{type:'message.delta',data:{messageId:'a0',delta:ANSWER}},{type:'message.completed',data:{messageId:'a0'}},
  {type:'run.completed',data:{runId:'r0'}},
];
const dump=(s:Screen)=>s.lines.map((line,index)=>`${String(index).padStart(2)}|${line}`).join('\n');
type Chrome={shortcut:number;composer:number;last:number};
const chrome=(s:Screen):Chrome=>{
  const shortcut=s.lines.findIndex(line=>line.includes(' · shift+tab'));
  const composer=s.lines.findIndex(line=>/^│ ›/u.test(line));
  let last=-1;for(let i=s.lines.length-1;i>=0;i-=1){if(s.lines[i]!.trim()!==''){last=i;break;}}
  return{shortcut,composer,last};
};
const same=(where:string,base:Chrome,now:Chrome,s:Screen)=>{
  assert.deepEqual(now,base,`${where}: the bottom chrome moved — composer/shortcut/footer must stay on their rows\n${dump(s)}`);
};

for(const [cols,rows] of [[100,36],[80,20]] as const){
  test(`F-023 ${cols}×${rows}: the bottom chrome stays fixed while the transcript scrolls`,async()=>{
    const app=await mountApp({cols,rows,root:env.root,paths:env.paths,history:HISTORY});
    try{
      await app.waitFor('the answer',s=>/change 40 in the build/u.test(s.text));
      const base=await app.settle();
      const before=chrome(base);
      assert.ok(before.shortcut>0&&before.composer>0,`tail: the chrome was not found\n${dump(base)}`);
      assert.equal(before.last,frameRowsFor(rows)-1,`tail: the frame ends on row ${before.last+1}, not on its last chrome row\n${dump(base)}`);
      /* one page up: the view sits mid-transcript, items hidden above, the announcement on */
      app.press(KEY.pageUp);
      const up=await app.waitFor('scrolled',s=>/earlier (item|message)s? above/u.test(s.text));
      same(`scrolled ${cols}×${rows}`,before,chrome(up),up);
      /* the chrome must ALSO stay put after the transient screen state expires (activity line, clocks) */
      await sleep(12000);
      const later=await app.settle();
      same(`after 12s scrolled ${cols}×${rows}`,before,chrome(later),later);
      /* the wheel path (the person's case): small steps, then back; the chrome must never move */
      for(let i=0;i<4;i+=1){app.wheel(-1);await sleep(60);}
      await app.settle();
      same(`wheel up ${cols}×${rows}`,before,chrome(await app.settle()),await app.settle());
      for(let i=0;i<8;i+=1){app.wheel(1);await sleep(60);}
      await app.settle();
      same(`wheel back to tail ${cols}×${rows}`,before,chrome(await app.settle()),await app.settle());
      /* back to the tail: the chrome must return exactly where it was */
      app.press(KEY.ctrlEnd);const back=await app.waitFor('back',s=>/change 40 in the build/u.test(s.text));
      same(`back to tail ${cols}×${rows}`,before,chrome(back),back);
    }finally{app.unmount();}
  });
}
