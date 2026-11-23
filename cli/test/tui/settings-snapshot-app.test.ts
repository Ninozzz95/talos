/*
 * Owner 27/10/2026 («sul pc devono essere visibili subito come modello, ragionamento etc»): on the real TuiApp a settings snapshot
 * from a paired device changes the status row's model at once and says it once in the transcript; the same snapshot from this
 * computer changes the row without a word; an older snapshot changes nothing.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {mountApp} from './consent-order-fixture.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const OFF={state:'off',phones:[],elsewhere:null,consents:[],notified:[],error:null};
const quietRemote={subscribe:()=>()=>{},getSnapshot:()=>OFF,setAttached(){},setWaiting(){},async decideConsent(){}};
const change=(version:number,model:string,origin:any,reasoningEffort:string|null='high')=>({version,reason:'settings',model,reasoningEffort,mode:'default',name:null,origin});

test('a device\'s settings change reaches the status row at once and is said once; from this computer it is quiet; older is dropped',async()=>{
  const app=await mountApp({cols:110,rows:30,root:env.root,paths:env.paths,clock:()=>Date.now(),remote:quietRemote});
  try{
    await app.waitFor('status row',s=>/gpt-5-mini/u.test(s.text));
    app.emit('session.settings.changed',change(10,'openai:gpt-5',{kind:'device',deviceId:'p1'}));
    await app.waitFor('the device\'s model on the row',s=>/A device changed the model to openai:gpt-5/u.test(s.text)&&!/gpt-5-mini/u.test(s.text));
    assert.match((await app.screen()).text,/A device changed the reasoning to high/u);
    app.emit('session.settings.changed',change(9,'openai:stale',{kind:'device',deviceId:'p1'}));
    app.emit('session.settings.changed',change(11,'openai:gpt-5-nano',{kind:'computer'}));
    await app.waitFor('this computer\'s change',s=>/gpt-5-nano/u.test(s.text));
    const text=(await app.screen()).text;
    assert.doesNotMatch(text,/openai:stale/u,'the older snapshot changed nothing');
    assert.doesNotMatch(text,/A device changed the model to openai:gpt-5-nano/u,'a change made here is not announced as a device\'s');
  }finally{app.unmount();}
});
