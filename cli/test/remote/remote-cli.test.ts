/*
 * 0.6.15 `talos remote list` and `revoke`: the rows of the mockup's cliList from the kernel's phone records — PAIRED always
 * «dd/MM HH:mm», LAST SEEN «now, direct|relay» / «today» / «yesterday» / a date, a phone revoked here leaves the list and one
 * revoked from the phone stays with that state (cliForgotten) — and which phone a name or id means.
 * Found live on 26/10/2026 (the first pairing with the Mobile on the Pad): PAIRED said «today 17:58», the mockup a date.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {findPhone,phoneRows,remotePcName} from '../../src/commands/remote-cli.ts';

const now=new Date(2026,9,26,18,0);
const at=(d:number,h:number,m:number)=>new Date(2026,9,d,h,m).getTime();

test('the list: PAIRED is a date, LAST SEEN is relative or «now», revoked here is gone, revoked from the phone stays',()=>{
  const rows=phoneRows([
    {id:'a',nome:'OnePlus Pad 3',collegatoAlle:at(26,17,58),ultimaVoltaAlle:null,inLinea:false},
    {id:'b',nome:'Pad di Nino',collegatoAlle:at(17,12,41),ultimaVoltaAlle:at(26,17,59),inLinea:true,percorso:{tipo:'diretto',rttMs:11}},
    {id:'c',nome:'Relayed',collegatoAlle:at(17,12,41),inLinea:true,percorso:{tipo:'relay',rttMs:58}},
    {id:'d',nome:'Pixel ufficio',collegatoAlle:at(2,9,15),ultimaVoltaAlle:at(25,18,20),inLinea:false},
    {id:'e',nome:'Gone',collegatoAlle:at(2,9,15),revocatoAlle:at(20,1,1),revocatoDa:'pc'},
    {id:'f',nome:'Forgot me',collegatoAlle:at(17,12,41),ultimaVoltaAlle:at(26,12,58),revocatoAlle:at(26,12,58),revocatoDa:'telefono'},
  ],now);
  assert.deepEqual(rows,[
    {name:'OnePlus Pad 3',paired:'26/10 17:58',lastSeen:'-',state:'offline'},
    {name:'Pad di Nino',paired:'17/10 12:41',lastSeen:'now, direct',state:'online'},
    {name:'Relayed',paired:'17/10 12:41',lastSeen:'now, relay',state:'online'},
    {name:'Pixel ufficio',paired:'02/10 09:15',lastSeen:'yesterday 18:20',state:'offline'},
    {name:'Forgot me',paired:'17/10 12:41',lastSeen:'today 12:58',state:'revoked-by-phone'},
  ]);
});

test('revoke finds the exact id, else the one name (any case); none or two are refused; a revoked phone is not found',()=>{
  const phones=[{id:'p1',nome:'Pad'},{id:'p2',nome:'Twin'},{id:'p3',nome:'twin'},{id:'p4',nome:'Old',revocatoAlle:1}];
  assert.equal(findPhone(phones,'p2').id,'p2');
  assert.equal(findPhone(phones,'pad').id,'p1');
  assert.throws(()=>findPhone(phones,'TWIN'),{code:'REMOTE_PHONE_AMBIGUOUS'});
  assert.throws(()=>findPhone(phones,'Nobody'),{code:'REMOTE_PHONE_NOT_FOUND'});
  assert.throws(()=>findPhone(phones,'Old'),{code:'REMOTE_PHONE_NOT_FOUND'});
});

test('the PC\'s name: TALOS_REMOTE_PC_NAME (printable, 64 at most), else the hostname',()=>{
  assert.equal(remotePcName({TALOS_REMOTE_PC_NAME:'Sonda CLI'},()=>'HOST'),'Sonda CLI');
  assert.equal(remotePcName({TALOS_REMOTE_PC_NAME:'  \u0007‎  '},()=>'HOST'),'HOST');
  assert.equal(remotePcName({TALOS_REMOTE_PC_NAME:'x'.repeat(80)},()=>'HOST').length,64);
  assert.equal(remotePcName({},()=>'DESKTOP-1'),'DESKTOP-1');
});
