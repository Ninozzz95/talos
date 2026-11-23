/*
 * R1 lane R (2026-09-24) — the real TuiApp (Ink into a fake TTY, real composition, fake provider on 127.0.0.1): a prompt sent
 * from the composer is shown ONCE — the app's local echo and the RunStarted that now rebuilds the person's message are one
 * item (review D-04; gate E9) — and it is drawn above the Run row it belongs to (review D-08, last bullet).
 * R3 Q-R3-9 (owner 2026-09-24): the Run rows are removed; the same order is checked against the turn's answer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,mountTui,REPO_ROOT,startFakeProvider,writeProviderRuntime} from '../provider/first-run-fixture.ts';

/* A DeepSeek model the registry does not list: since 0.6.13 DeepSeek Flash has a 1M window and starts the Context Engine, which
   this test is not about (as kernel-readiness.test.ts). */
const MODEL='deepseek:deepseek-unlisted-test';
const plain=(frame:string)=>frame.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/gu,'').split('\n').map(line=>line.replace(/[│╭╮╰╯─]/gu,' ').trim());

test('R1-R — two prompts sent from the composer each show once, above their answer (no Run row, R3 Q-R3-9)',{timeout:90_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const fake=await startFakeProvider({goodKey:key,models:[{id:'deepseek-unlisted-test',name:'DeepSeek (test, not listed)'}]});
  let tui:Awaited<ReturnType<typeof mountTui>>|null=null;let context:any=null;
  try{
    const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
    writeProviderRuntime(h.paths,{deepseek:fake.url});
    context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring()} as any);
    context.providerStore.setKey('deepseek',key);await context.tuiCatalog.chooseProvider('deepseek');
    tui=await mountTui({context,projectRoot:h.project,paths:h.paths,model:MODEL,columns:100,rows:60});
    /* R3 Q-R3-9 (owner 2026-09-24): the Run rows are gone, so a finished turn is recognised by its answer (the fake
       provider answers `OK`, one line per turn) and the order checked is prompt above its answer. */
    const answers=(frame:string)=>plain(frame).filter(line=>line==='OK').length;
    await tui.typeAndEnter('alpha prompt one');
    await tui.until(()=>answers(tui!.last())>=1,'the first run answered',30_000);
    await tui.typeAndEnter('beta prompt two');
    await tui.until(()=>answers(tui!.last())>=2,'the second run answered',30_000);
    const lines=plain(tui.last());
    for(const prompt of ['alpha prompt one','beta prompt two'])
      assert.equal(lines.filter(line=>line===`› ${prompt}`)/* the mockup's prompt row */.length,1,`"${prompt}" is shown once:\n${lines.join('\n')}`);
    assert.equal(lines.some(line=>/^Run · /u.test(line)),false,`Q-R3-9: no Run row:\n${lines.join('\n')}`);
    const beta=lines.indexOf('› beta prompt two');const lastAnswer=lines.lastIndexOf('OK');
    assert.ok(beta>=0&&beta<lastAnswer,`the second prompt (row ${beta+1}) is above its answer (row ${lastAnswer+1}):\n${lines.join('\n')}`);
  }finally{tui?.unmount();await context?.runtime?.close?.().catch(()=>{});await fake.close();}
}));
