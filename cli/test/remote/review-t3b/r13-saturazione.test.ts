/*
 * R13 — misura: 50 connessioni mute tenute aperte (un processo che apre la pipe e non scrive, rinnovandole) bloccano l'ospite?
 *       L'ospite deve comunque completare la stretta di mano entro i suoi 2 s.
 */
import assert from 'node:assert/strict';
import {createConnection} from 'node:net';
import test from 'node:test';
import {chan,setup,sleep} from './comune.ts';

test('R13 misura: 50 connessioni mute non impediscono all\'ospite di collegarsi',async()=>{
  const s=setup();
  const w=await chan.openWindowChannel({dataRoot:s.dir,label:'B',handlers:{attached:()=>[],call:async()=>({stato:200,dati:null}),subscribe:()=>()=>{}}});
  const [reg]=chan.readRegistrations(s.dir);
  const mute=[] as any[];
  for(let i=0;i<50;i++){const c=createConnection(reg.channel);c.on('error',()=>{});mute.push(c);}
  await sleep(300);
  try{
    const t0=Date.now();
    const c=await chan.connectWindow(reg);
    const ms=Date.now()-t0;
    console.log('R13 misura:',JSON.stringify({mute:mute.length,msCollegamento:ms}));
    c.close();
    assert.ok(ms<2000);
  }finally{for(const m of mute)m.destroy();await w.close();s.done();}
});
