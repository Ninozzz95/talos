/*
 * R5a (coordinator; owner 2026-09-24): /effort in the REAL app at 60 and 120 columns — the line of nodes opens on the current
 * level, ← → move it, Enter applies it through the same path as /model's effort step (the config's project-user
 * `reasoningEffort`, the live session's effort), Esc closes it; `/effort <level>` sets a declared level at once and refuses
 * one the model does not declare, naming its levels. Hermetic (r1-layout-fixture.ts hermeticProfile).
 */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {hermeticProfile,sleep,type Screen} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const RIGHT='\x1b[C',LEFT='\x1b[D',ENTER='\r',ESC='\x1b';
/* Declared out of order on purpose: the owner's frame drew `default — max — high — low`. */
const DECLARED={reasoning:true,reasoningEfforts:['max','high','medium','low']};

/* Stage 7.3 (the approved mockup's /effort, owner 01/10 «alla lettera»): the R5a line of nodes is now the mockup's sheet — a
   slider over the levels the model offers, opening on the level in use («default», the model decides, is TALOS's first stop);
   ←/→ move it, Enter applies it through the same path as before, Esc closes it. */
for(const size of [{cols:60,rows:30},{cols:120,rows:40}] as const){
  test(`R5a /effort at ${size.cols}×${size.rows}: the sheet opens on the level in use, ←/→ move, Enter applies, Esc closes`,async()=>{
    const app=await mountR5a({...size,root:env.root,paths:env.paths,modelRow:DECLARED});
    try{
      await app.type('/effort');app.press(ENTER);
      let s=await app.waitFor('the effort sheet',x=>/── Reasoning effort/u.test(x.text)&&/◆ default/u.test(x.text));
      /* the sub is cut to the width below the mockup's 80 columns */
      assert.match(s.text.replace(/\s+/gu,' '),size.cols>=80?/offers low, medium, high, max/u:/offers low, medium/u,"the levels the model declares, in TALOS's order");
      assert.doesNotMatch(s.text,/xhigh/u,'only the levels the model declares');
      app.press(RIGHT);await sleep(60);app.press(RIGHT);await sleep(60);
      app.press(LEFT);await sleep(60);app.press(RIGHT);await sleep(60);
      app.press(ENTER);
      await app.waitFor('the sheet closed and the effort applied',x=>!/── Reasoning effort/u.test(x.text));
      await app.waitFor('the effort reached the runtime',()=>app.calls.includes('default-effort medium'));
      await app.type('/effort');app.press(ENTER);
      s=await app.waitFor('the sheet again',x=>/── Reasoning effort/u.test(x.text));
      if(size.cols>=80)assert.match(s.text,/◆ medium/u,`it opens on the level now in use:\n${s.text}`);
      app.press(ESC);await app.waitFor('Esc closed it',x=>!/── Reasoning effort/u.test(x.text));
    }finally{app.unmount();}
  });
}

test('R5a /effort <level>: a declared level is set at once, another one is refused with the model\'s levels',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:env.root,paths:env.paths,modelRow:DECLARED});
  try{
    await app.type('/effort max');app.press(ENTER);
    await app.waitFor('max applied',()=>app.calls.includes('default-effort max'));
    await app.type('/effort ultra');app.press(ENTER);
    const s=await app.waitFor('the refusal',x=>/"ultra" is not a level/u.test(x.text));
    assert.match(s.text.replace(/\s+/gu,' '),/default, low, medium, high, max/u);
  }finally{app.unmount();}
});

test('R5a /effort: a model that declares no levels says so, and nothing opens',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:env.root,paths:env.paths});
  try{
    await app.type('/effort');app.press(ENTER);
    const s=await app.waitFor('the notice',x=>/declares no reasoning effort levels/u.test(x.text));
    assert.doesNotMatch(s.text,/▲/u);
  }finally{app.unmount();}
});

/* Owner 2026-09-25: "quando riapro e premo /effort mi dice che il modello non dichiara reasoning, anche se prima con lo stesso
   modello l'ho impostato". At startup TALOS reads the rows it already knows (catalog.listModels), where an OpenRouter model's
   levels are missing; /model reads the provider's live list (catalog.providerModels), where they are. /effort now asks the
   live list before saying a model has no levels. */
test('R5a /effort after a restart: levels missing from the startup rows are read from the live list, as /model does',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:env.root,paths:env.paths,modelRow:{reasoning:false},liveModelRow:DECLARED});
  try{
    await app.type('/effort');app.press(ENTER);
    const s=await app.waitFor('the effort sheet from the live list',x=>/── Reasoning effort/u.test(x.text)||/declares no reasoning effort levels/u.test(x.text));
    assert.doesNotMatch(s.text,/declares no reasoning effort levels/u,'the live list was not asked');
    assert.ok(app.calls.includes('live-list'));
    assert.match(s.text.replace(/\s+/gu,' '),/offers low, medium, high, max/u);
  }finally{app.unmount();}
});
