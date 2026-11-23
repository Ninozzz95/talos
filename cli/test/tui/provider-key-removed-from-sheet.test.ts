/*
 * Found by acceptance s65 (c) on the built CLI (bugfixer, 14/10/2026): `/provider`, a key provider's row, Enter, «Remove it». The key
 * was removed and said so, the screen showed the composer — and the keys went nowhere: Ctrl+C Ctrl+C did not end TALOS, and only an
 * Esc pressed blind brought the screen back. The choice had been started from the sheet (`providerViaSheetRef`), so the provider
 * window stayed open with nothing drawn for it (app.ts: «the provider is being checked: nothing to show for that moment»). Signing
 * out of the plan from the same window already closed it and brought the sheet back with the row as it is now; removing a key
 * now does the same.
 *
 * Real TuiApp through Ink into a fake TTY, over the REAL composition; in-memory keyring, temporary profile, a dummy key, a provider
 * on 127.0.0.1.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {dummyKey,ESC,fakeKeyring,flat,hermetic,KEYS,mountTui,REPO_ROOT,startFakeProvider,writeProviderRuntime} from '../provider/first-run-fixture.ts';

const REGISTRY=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
const MODEL='kimi:kimi-k2.6';

test('/provider, «Remove it» on a key: the sheet comes back with the row as it is now, and the screen answers its keys again',async()=>hermetic(async h=>{
  const key=dummyKey('kimi');
  const provider=await startFakeProvider({goodKey:key,models:[{id:'kimi-k2.6',name:'Kimi K2.6'}]});
  try{
    const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
    const {createEnvironmentKeyConsent}=await import('../../src/provider/environment-keys.ts');
    writeProviderRuntime(h.paths,{kimi:`${provider.url}/v1`});
    createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:{}}).chooseProvider('kimi');
    const context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring()} as any) as any;
    context.providerStore.setKey('kimi',key);
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,model:MODEL,columns:100});
    try{
      await tui.typeAndEnter('/provider');
      await tui.until(f=>/── (?:Models|AI provider) /u.test(f),'the provider sheet');
      tui.write('/');tui.write('kimi');
      await tui.until(f=>f.includes('/ kimi'),'the sheet filtered to kimi');
      tui.write(KEYS.enter);await tui.until(f=>f.includes('enter use'),'the filter ended');
      tui.write(KEYS.enter);
      await tui.until(f=>f.includes('› Use it')&&f.includes('Remove it'),'the key\'s choices');
      tui.write(KEYS.down);tui.write(KEYS.down);
      await tui.until(f=>f.includes('› Remove it'),'«Remove it» chosen');
      tui.write(KEYS.enter);
      await tui.until(f=>f.includes('The key for Kimi was removed.'),'the removal said');
      assert.equal(context.providerStore.hasKey('kimi'),false,'the premise: the key is gone');
      /* the window the choice opened is closed and the sheet is back, with the row that has no key now */
      const back=await tui.until(f=>/── (?:Models|AI provider) /u.test(f)&&/Kimi[^│\n]*no key/u.test(f),'the sheet again, the row with no key');
      assert.doesNotMatch(flat(back),/› Remove it|› Use it/u,'the key\'s choices are still on the screen');
      /* Esc closes the sheet, and what is typed then reaches the composer */
      tui.write(ESC);
      await tui.until(f=>!/── (?:Models|AI provider) /u.test(f),'the sheet closed');
      tui.write('still here');
      await tui.until(f=>f.includes('still here'),'what is typed reaches the composer');
    }finally{tui.unmount();}
  }finally{await provider.close();}
}));
