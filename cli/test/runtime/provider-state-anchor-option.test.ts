/*
 * 08/10/2026 (owner, after RICERCA-STATO-PROVIDER-E-FIRME-2026-10-08): the journal anchor of the provider state (P4, one `provider-state`
 * row written when a turn closes clean) is an OPTION of the kernel registry, off by default so the desktop's journal format does not
 * change; the CLI turns it on, in the interactive screen and in `talos -p` alike. Real composition, real kernel registry, hermetic profile;
 * the registry options are observed through the injected `createSessionRegistry`, as in question-tool-needs-a-person.test.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fakeKeyring,hermetic,REPO_ROOT,settle,writeProviderRuntime} from '../provider/first-run-fixture.ts';

async function registryOptions(askPerson:boolean|undefined){
  return await hermetic(async h=>{
    writeProviderRuntime(h.paths,{});
    const {composeTalosRuntime,loadModules}=await import('../../src/runtime/talos-composition.ts');
    const real:any=await loadModules(REPO_ROOT);
    let seen:any=null;
    const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring(),
      ...(askPerson===undefined?{}:{askPerson}),modules:{...real,createSessionRegistry:(options:any)=>{seen=options;return real.createSessionRegistry(options);}}} as any);
    try{return seen;}
    finally{await context.runtime?.close?.();await settle(h.root);}
  });
}

test('the CLI turns the provider-state anchor on, with a person on the screen and without one (talos -p)',async()=>{
  assert.equal((await registryOptions(true)).ancoraStatoProvider,true,'interactive');
  assert.equal((await registryOptions(false)).ancoraStatoProvider,true,'headless');
  assert.equal((await registryOptions(undefined)).ancoraStatoProvider,true,'a caller that forgets to say still gets the CLI behaviour');
});
