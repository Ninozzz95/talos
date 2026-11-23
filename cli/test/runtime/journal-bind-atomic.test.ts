/*
 * Review of 0.6.4 (found by acceptance s49, reproduced 14/10/2026): `bind` rewrote the start's record with `writeFile`, which empties
 * the file before writing it. A TALOS killed in that moment (a closed window, a crash) left an EMPTY record: the next TALOS could not
 * read it, and never said which turn was cut. Measured in the acceptance run: the record was empty after the kill. The rewrite is
 * now a temporary file renamed over the record, so a kill leaves the old record or the new one, never nothing.
 * ⛔ Honest about this test: on the old code it did not catch the race in 30 kills (the window is short); the RED proof is the
 *   acceptance run s46 + s47 + s49-restart, which failed 3 times out of 3 before the cure. This test guards the property. Here a busy child
 * process binds again and again and is killed at random moments; after every kill the record is whole.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';

const MODULE=pathToFileURL(join(import.meta.dirname,'../../src/runtime/replay-buffer.ts')).href;

test('a process killed while it binds its start leaves a readable record, never an empty one',{timeout:240_000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-journal-atomic-'));
  try{
    let empty=0;let checked=0;
    for(let round=0;round<30;round++){
      const script=`const {createStartOperationJournal}=await import(${JSON.stringify(MODULE)});
const j=createStartOperationJournal({rootDir:${JSON.stringify(join(root,String(round)))}});
const {operationId}=await j.claim('f'.repeat(64));
/* a busy process, as a TALOS drawing its screen: the event loop turns slowly between the file's opening and its writing */
setInterval(()=>{const t=Date.now();while(Date.now()-t<4);},1);
process.stdout.write('ready');
for(let i=0;;i++)await j.bind(operationId,'session-'+String(i).padStart(6,'0')+'-'+'x'.repeat(2000));`;
      const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','inherit']});
      await new Promise<void>((resolve,reject)=>{child.stdout!.on('data',(d:Buffer)=>{if(String(d).includes('ready'))resolve();});child.on('exit',()=>reject(new Error('the child ended before binding')));});
      await new Promise(resolve=>setTimeout(resolve,20+Math.floor(Math.random()*80)));
      /* the exit is awaited from before the kill: a child that already ended does not hang the test (fourth review, NIT) */
      const ended=child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve));
      child.kill('SIGKILL');
      await ended;
      const dir=join(root,String(round));
      for(const name of (await readdir(dir)).filter(name=>name.endsWith('.json'))){
        checked+=1;const text=(await readFile(join(dir,name),'utf8')).trim();
        /* whole: the start's own record (killed before its first bind) or a bound one */
        if(text==='')empty+=1;else{const record=JSON.parse(text);assert.equal(record.schema,'talos.cli.runtime-start-operation.v1',name);if(record.sessionId!==undefined)assert.match(record.sessionId,/^session-\d{6}-x+$/u,name);}
      }
    }
    assert.ok(checked>=30,`records checked: ${checked}`);
    assert.equal(empty,0,`${empty} of ${checked} records were left empty by a kill`);
  }finally{await rm(root,{recursive:true,force:true,maxRetries:5});}
});
