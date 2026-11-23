import assert from 'node:assert/strict';
import test from 'node:test';

import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';
import {dummyKey,fakeKeyring,flat,hermetic,mountTui,REPO_ROOT,startFakeProvider,writeProviderRuntime} from '../provider/first-run-fixture.ts';

const MODEL='openrouter:vendor/live-model-a';

test('owner inspection — provider + model + first TUI turn reaches the real runtime and renders the streamed reply',async()=>hermetic(async h=>{
  const key=dummyKey('owner-basic-turn');
  const provider=await startFakeProvider({goodKey:key,models:[{id:'vendor/live-model-a',name:'Live Model A',context_length:128000}]});
  try{
    writeProviderRuntime(h.paths,{openrouter:`${provider.url}/api/v1`});
    const context=await composeTalosRuntime({
      repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env},
      environmentKeys:'consent',keyring:fakeKeyring(),
    } as any);
    context.providerStore.setKey('openrouter',key);
    await context.tuiCatalog.chooseProvider('openrouter');

    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,model:MODEL});
    try{
      await tui.typeAndEnter('hello from owner inspection');
      const answer=await tui.until(frame=>frame.includes('OK'),'the first streamed assistant reply',30000);
      assert.match(answer,/OK/u);
      assert.equal(tui.starts.length,1,'the prompt must start exactly one model run');
      /* R3 owner decision Q-R3-7 (gate E7): `starting` is now the status word between send and RunStarted (measured gate §0.3:
         the screen said `idle` while the provider already had the request). The property of 2026-09-22 stays: the submit never
         waits in a synthetic preparation state — `starting` only ever precedes the real RunStarted's `thinking`, and never
         follows it. */
      const lastStarting=tui.frames.findLastIndex(frame=>flat(frame).includes('Starting')),firstThinking=tui.frames.findIndex(frame=>flat(frame).includes('Thinking'));
      assert.ok(lastStarting<firstThinking,'model submit must never sit in a synthetic starting/checkpoint state after its run started');
      assert.ok(tui.frames.some(frame=>flat(frame).includes('Thinking')),'a real RunStarted must transition the status to thinking');

      const chats=provider.requests.filter(request=>request.method==='POST'&&request.path.endsWith('/chat/completions'));
      assert.equal(chats.length,1,'the first turn must reach the selected provider exactly once');
      assert.equal(chats[0]?.authorizedAs,'good','the request must use the selected provider credential');
    }finally{
      tui.unmount();
      await context.runtime.close();
    }
  }finally{await provider.close();}
}));
