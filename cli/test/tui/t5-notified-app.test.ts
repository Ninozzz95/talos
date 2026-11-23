/*
 * 0.6.15 T5 on the real TuiApp: the screen tells its remote bridge when it waits for the person (setWaiting), and the activity line
 * shows «notification sent to “<device>”» from the bridge's snapshot while an approval waits; answered, the line goes and the
 * bridge hears that the screen no longer waits.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {mountApp,sleep} from './consent-order-fixture.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const APPROVAL=/Shell · npm test/u;
const SENT=/Waiting for your answer · \d+s · notification sent to “Pad di Nino”/u;

function notifyingRemote(){
  let snapshot:any={state:'host',phones:[{id:'p1',name:'Pad di Nino'}],elsewhere:null,consents:[],notified:[],error:null};
  const listeners=new Set<()=>void>();let waiting:()=>unknown=()=>null;
  return{
    waiting:()=>waiting(),
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    getSnapshot:()=>snapshot,
    setAttached(){},setWaiting(source:()=>unknown){waiting=source;},
    notify(names:string[]){snapshot={...snapshot,notified:names};for(const listener of listeners)listener();},
    async decideConsent(){},
  };
}

test('T5 on the real screen: while the approval waits the bridge hears «waiting», and the line names the device notified',async()=>{
  let now=100_000;const remote=notifyingRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,remote});
  try{
    assert.equal(remote.waiting(),null,'nothing waits yet');
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',{requestId:'q1',action:{tool:'shell',command:'npm test',toolCallId:'t-q1'}});
    await app.waitFor('approval',s=>APPROVAL.test(s.text));
    for(let i=0;i<40&&remote.waiting()===null;i++)await sleep(25);
    const since=remote.waiting();assert.ok(typeof since==='number'&&Math.abs(since-Date.now())<10_000,'the bridge hears when this wait began, wall clock');
    /* the activity clock redraws every second: the wait's start must not move with the redraws, or a notification sent a second
       after the card appeared would stop counting */
    await app.waitFor('a redraw of the clock',s=>/Waiting for your answer · [1-9]\d*s/u.test(s.text),4_000);
    assert.equal(remote.waiting(),since,'the start of this wait stays put');
    remote.notify(['Pad di Nino']);
    await app.waitFor('notified line',s=>SENT.test(s.text));
    assert.doesNotMatch((await app.screen()).text,/received/u);
    now+=1_000;app.press('1');
    await app.waitFor('approval closed',s=>!APPROVAL.test(s.text));
    for(let i=0;i<40&&remote.waiting()!==null;i++)await sleep(25);
    assert.equal(remote.waiting(),null,'answered: the bridge hears it no longer waits');
    assert.doesNotMatch((await app.screen()).text,/notification sent to/u,'the line is gone with the wait');
  }finally{app.unmount();}
});
