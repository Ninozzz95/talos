/* Startup stage 1 (owner 02/10): the TUI is on screen before the kernel is loaded, so what main used to write on stderr
   before the screen (the configured reasoning effort that cannot be used) reaches the TUI when the kernel is ready. */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {hermeticProfile,mountApp} from './r1-layout-fixture.ts';

test('a startup notice decided after the kernel loads appears in the transcript',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-startup-notice-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  let release!:(value:unknown)=>void;const startup=new Promise(resolve=>{release=resolve;});
  const app=await mountApp({cols:100,rows:30,root,paths:{dataRoot:join(root,'data'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),stateRoot:join(root,'state')},startup});
  try{
    const before=await app.screen();
    assert.doesNotMatch(before.text,/not affirmed for/u);
    release({reasoningEffort:null,notices:[{code:'REASONING_EFFORT_UNSUPPORTED',message:'Configured reasoning effort "high" is not affirmed for ollama:demo; using model default and sending no effort override.'}]});
    await app.waitFor('the notice',s=>/not affirmed for ollama:demo/u.test(s.text.replace(/\s+/gu,' ')));
  }finally{app.unmount();}
});
