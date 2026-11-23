/*
 * R5b D2 (owner decision Q-R5-12: "fork clears the old view"; R5 gate §5.1: after /fork the old conversation stayed on screen
 * and the fork's replay was drawn below it). After a fork the transcript is the fork's own — each earlier message once — and a
 * line says which conversation it came from.
 */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const HISTORY=[
  {type:'run.started',data:{runId:'r0',input:{prompt:'first question'}}},
  {type:'message.started',data:{messageId:'a0',role:'assistant'}},{type:'message.delta',data:{messageId:'a0',delta:'first answer'}},{type:'message.completed',data:{messageId:'a0'}},
  {type:'run.completed',data:{runId:'r0'}},
];
const count=(text:string,needle:string)=>text.split(needle).length-1;

test('R5b /fork: the view is the fork\'s own conversation, each earlier message once, and it says where it came from',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:env.root,paths:env.paths,history:HISTORY});
  try{
    await app.waitFor('the history',s=>s.text.includes('first answer'));
    await app.type('/fork s1');app.press('\r');
    const s=await app.waitFor('the fork attached',x=>/fork|Forked/iu.test(x.text)&&x.text.includes('first answer'),10_000);
    await new Promise(r=>setTimeout(r,400));
    const text=(await app.screen()).text;
    assert.equal(count(text,'first answer'),1,`the earlier answer is drawn ${count(text,'first answer')} times after the fork:\n${text}`);
    assert.match(text,/Forked from/u,`no line says where the fork came from:\n${text}`);
  }finally{app.unmount();}
});
