/*
 * C10 on the real TuiApp (the consent fixture's mount, a fake coordinator behind the window's remote bridge): /devices lists the devices the
 * coordinator keeps and their folders, d twice revokes the one the first d named with the coordinator's own revoke, and the list is read again.
 * No real remote control is started: the bridge is fake.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {fakeRemote,mountApp,sleep} from './consent-order-fixture.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
function devicesRemote(){
  const calls:Array<[string,...unknown[]]>=[];
  let telefoni:any[]=[{id:'pad1',nome:'Pad',inLinea:true,percorso:{tipo:'diretto'},collegatoAlle:'2026-10-30T09:00:00Z'},{id:'ph2',nome:'Phone',inLinea:false,ultimaVoltaAlle:'2026-10-31T18:00:00Z'}];
  const coordinator={
    stato:async()=>{calls.push(['stato']);return{nomePc:'Workstation',telefoni};},
    revoca:async(id:string)=>{calls.push(['revoca',id]);telefoni=telefoni.filter(p=>p.id!==id);return{};},
    cartelle:{consensiDi:async(id:string)=>{calls.push(['consensiDi',id]);return id==='pad1'?[{cartellaId:'c1',nome:'shop-api',percorso:'C:\\work\\shop-api'}]:[];}},
  };
  const remote:any={...fakeRemote(),toolCoordinator:()=>coordinator};
  return{remote,calls};
}
const PAGE=/── Devices Devices paired with this PC · Workstation/u;

test('/devices: the paired devices and their folders; d twice revokes the one named, and the list is read again',async()=>{
  const {remote,calls}=devicesRemote();
  const app=await mountApp({cols:120,rows:36,root:env.root,paths:env.paths,clock:()=>Date.now(),remote});
  try{
    app.press('/devices');await sleep(150);app.press('\r');
    const page=await app.waitFor('the page',s=>PAGE.test(s.text)&&/Pad .*online/u.test(s.text)&&/Phone .*offline/u.test(s.text));
    assert.match(page.text,/shop-api +C:\\work\\shop-api/u);
    console.log('FRAME devices\n'+page.text);
    app.press('\u001b[B');await app.waitFor('Phone chosen',s=>/› +Phone/u.test(s.text));
    app.press('d');await app.waitFor('the question',s=>/Revoke “Phone”\? It can no longer reach this PC\./u.test(s.text));
    app.press('d');
    await app.waitFor('revoked, read again',s=>PAGE.test(s.text)&&!/Phone .*offline/u.test(s.text)&&/Revoked: Phone/u.test(s.text));
    assert.deepEqual(calls.filter(c=>c[0]==='revoca'),[['revoca','ph2']],'the coordinator\'s own revoke, the id the first d named');
    assert.ok(calls.filter(c=>c[0]==='stato').length>=2,'the list is read again after the revoke');
  }finally{app.unmount();}
});
