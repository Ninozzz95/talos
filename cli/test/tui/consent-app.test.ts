/*
 * 0.6.15 remote control on the real TuiApp (fixture of r1-layout): a device's folder request takes the card the moment the
 * window's remote snapshot lists it, answers only after the cards' grace, sends the person's answer to the kernel, and leaves
 * when the request leaves the snapshot (answered here, on the device or elsewhere, or expired). Esc is «Not now».
 */
import assert from 'node:assert/strict';
import {rmSync} from 'node:fs';
import test,{after} from 'node:test';
import {APPROVAL_GRACE_MS} from '../../src/tui/overlays/approval-dialog.ts';
import {ESC,KEY,hermeticProfile,mountApp,sleep} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
after(()=>{try{rmSync(env.root,{recursive:true,force:true});}catch{/* best effort */}});

type Consent={richiestaId:string;device:string;folder:string;expiresAt:number};
function fakeRemote(){
  let snapshot={state:'host' as const,phones:[{id:'p1',name:'Pad di Nino'}],elsewhere:null,consents:[] as Consent[],error:null};
  const listeners=new Set<()=>void>();const answers:Array<[string,boolean]>=[];
  return{
    answers,
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    getSnapshot:()=>snapshot,
    set(consents:Consent[]){snapshot={...snapshot,consents};for(const listener of listeners)listener();},
    async decideConsent(id:string,allow:boolean){answers.push([id,allow]);},
  };
}
const request=(id:string):Consent=>({richiestaId:id,device:'Pad di Nino',folder:'C:\\work\\shop-api',expiresAt:Date.now()+120_000});
const CARD=/A device asks for a folder/u;

test('consent card: appears with the device and the folder, ignores keys in its grace, Allow sends yes, and leaves with the request',async()=>{
  const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],invocation:{model:'openai:gpt-5-mini',permissionMode:'default'},remote});
  try{
    await app.waitFor('footer names the device',s=>s.text.includes('⌁ Pad di Nino'));
    remote.set([request('c1')]);
    const shown=await app.waitFor('the card',s=>CARD.test(s.text));
    assert.match(shown.text,/Allow “Pad di Nino” to work in this folder\?/u);
    assert.match(shown.text,/C:\\work\\shop-api/u);
    assert.match(shown.text,/Not now/u);
    app.press(KEY.enter);await sleep(60);
    assert.deepEqual(remote.answers,[],'an Enter typed in the grace never answers it');
    await sleep(APPROVAL_GRACE_MS+50);
    app.press(`${ESC}[C`);await sleep(60);app.press(KEY.enter);
    for(let i=0;i<40&&!remote.answers.length;i++)await sleep(25);
    assert.deepEqual(remote.answers,[['c1',true]]);
    assert.ok(CARD.test((await app.screen()).text),'it stays until the request leaves the snapshot');
    remote.set([]);
    await app.waitFor('the card leaves',s=>!CARD.test(s.text));
    /* and it gives the keys back: the composer takes text again */
    app.press('hello there');
    await app.waitFor('the composer types again',s=>/│ › hello there/u.test(s.text));
  }finally{app.unmount();}
});

test('consent card: Not now is selected first, and Esc answers no',async()=>{
  const remote=fakeRemote();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],invocation:{model:'openai:gpt-5-mini',permissionMode:'default'},remote});
  try{
    await app.waitFor('footer names the device',s=>s.text.includes('⌁ Pad di Nino'));
    remote.set([request('c2')]);
    await app.waitFor('the card',s=>CARD.test(s.text));
    await sleep(APPROVAL_GRACE_MS+50);
    app.press(KEY.enter);
    for(let i=0;i<40&&!remote.answers.length;i++)await sleep(25);
    assert.deepEqual(remote.answers,[['c2',false]],'Enter on the default choice is «Not now»');
    remote.set([request('c3')]);
    await app.waitFor('the next request',s=>CARD.test(s.text));
    await sleep(APPROVAL_GRACE_MS+50);
    app.press(ESC);
    for(let i=0;i<40&&remote.answers.length<2;i++)await sleep(25);
    assert.deepEqual(remote.answers.at(-1),['c3',false]);
  }finally{app.unmount();}
});
