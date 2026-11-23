/*
 * 0.6.6, the 0.6.6 review's F3 — the composition gives the kernel the words the model reads for the turn's permission by who is
 * in front: the screen (`askPerson`) says that being asked is not a refusal; `-p`, a command and the automations' host (nobody)
 * say that what would be asked is refused. Real composition, real kernel registry, hermetic profile (first-run-fixture.ts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fakeKeyring,hermetic,REPO_ROOT,settle,writeProviderRuntime} from '../provider/first-run-fixture.ts';
import {rememberSessionMode} from '../../src/runtime/session-modes.ts';

async function wordsFor(askPerson:boolean|undefined){
  return await hermetic(async h=>{
    writeProviderRuntime(h.paths,{});
    const {composeTalosRuntime,loadModules}=await import('../../src/runtime/talos-composition.ts');
    const real:any=await loadModules(REPO_ROOT);
    let seen:any=null;
    const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring(),
      ...(askPerson===undefined?{}:{askPerson}),modules:{...real,createSessionRegistry:(options:any)=>{seen=options;return real.createSessionRegistry(options);}}} as any);
    try{rememberSessionMode('s-composed','default');return String(seen?.permessoPerIlModello?.({sessionId:'s-composed'}));}
    finally{await context.runtime?.close?.();await settle(h.root);}
  });
}

test('the screen tells the model that being asked is not a refusal; with nobody in front, that it is refused',async()=>{
  assert.match(await wordsFor(true),/^Ask before edits: .*Being asked is not a refusal/u);
  for(const nobody of [false,undefined]){
    const words=await wordsFor(nobody);
    assert.match(words,/^Ask before edits, with nobody here to answer: .*refused/u,String(nobody));
    assert.doesNotMatch(words,/Being asked is not a refusal/u);
  }
});
