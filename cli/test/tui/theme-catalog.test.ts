import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_THEME_ACCENT,TALOS_THEME_ACCENTS,themeAccent} from '../../src/tui/theme-catalog.ts';

/* P15 (owner, 2026-09-25): Forge is the default since 0.2.0; Calm stays one of the ten. */
test('M2-C-RED-4 — TALOS exposes exactly ten dark accents with Forge as the default',()=>{
  assert.equal(DEFAULT_THEME_ACCENT,'forge');
  assert.equal(TALOS_THEME_ACCENTS.length,10);
  assert.equal(new Set(TALOS_THEME_ACCENTS.map(row=>row.id)).size,10);
  const calm=themeAccent('calm');
  assert.equal(calm.id,'calm');
  /* R5b D4 (owner decision Q-R5-14): the product's ten dark themes and their own backgrounds; config v2. */
  assert.equal(calm.accent,'#c08b3c');
  assert.equal(calm.background,'#1e1f22');
  assert.ok(TALOS_THEME_ACCENTS.every(row=>/^#[0-9a-f]{6}$/u.test(row.background)),'each theme has its own dark background');
  assert.equal(TALOS_THEME_ACCENTS.some((row:any)=>/light/iu.test(row.id)||/light/iu.test(row.label)),false);
});

test('unknown accent falls back deterministically to the default, Forge',()=>{
  assert.equal(themeAccent('not-a-theme' as any).id,'forge');
});


test('M2-E every current non-mono config theme resolves to a catalog accent',async()=>{
  const {CURRENT_UI_THEMES}=await import('../../src/config/types.ts');
  const accents=CURRENT_UI_THEMES.filter((id:string)=>id!=='mono');
  assert.deepEqual(accents.map((id:string)=>themeAccent(id).id),accents);
});
