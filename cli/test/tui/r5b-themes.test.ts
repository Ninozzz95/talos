/*
 * R5b D4 (owner decision Q-R5-14, gate E10): the CLI's themes are the product's ten DARK themes — calm (default), forge,
 * terminal, aurora, ember, atlas, noir, signal, violet, telemetry — with the product's own accent and background seeds
 * (harness-ui/frontend/src/styles/temi.css, aligned to the mobile on 11/09). Before R5b the CLI had ten accents of its own
 * (coral, rose, indigo, azure, cyan, teal, jade…) that no other TALOS surface has. Old ids move to the nearest official
 * theme through the versioned config chain (v1 -> v2), with the existing backup and rollback. mono stays.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {DEFAULT_THEME_ACCENT,TALOS_THEME_ACCENTS} from '../../src/tui/theme-catalog.ts';
import {CURRENT_CONFIG_VERSION,migrateConfigValue} from '../../src/config/migrations.ts';
import {CURRENT_UI_THEMES} from '../../src/config/types.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

const CSS=readFileSync(path.join(REPO_ROOT,'harness-ui','frontend','src','styles','temi.css'),'utf8');
function seeds(id:string){
  const at=CSS.search(new RegExp(`data-talos-theme="${id}"\\]`,'u'));assert.ok(at>=0,`${id} is in temi.css`);
  const block=CSS.slice(at,CSS.indexOf('}',at));
  const seed=(name:string)=>new RegExp(`--talos-seme-${name}:\\s*(#[0-9a-fA-F]{6})`,'u').exec(block)?.[1]?.toLowerCase();
  return{accent:seed('accento'),background:seed('fondo')};
}
const TEN=['calm','forge','terminal','aurora','ember','atlas','noir','signal','violet','telemetry'];

test('R5b D4: the ten themes are the product\'s ten dark themes, with its accent and background seeds',()=>{
  assert.deepEqual(TALOS_THEME_ACCENTS.map(row=>row.id),TEN);
  assert.equal(DEFAULT_THEME_ACCENT,'forge','P15: Forge is the default since 0.2.0');
  for(const row of TALOS_THEME_ACCENTS){
    const css=seeds(row.id);
    assert.equal(row.accent.toLowerCase(),css.accent,`${row.id}: accent`);
    assert.equal(row.background.toLowerCase(),css.background,`${row.id}: background`);
  }
  assert.deepEqual([...CURRENT_UI_THEMES].sort(),[...TEN,'mono'].sort());
});

test('R5b D4: old theme ids move to the nearest official theme (config v1 -> v2); mono and the official ids stay',()=>{
  assert.equal(CURRENT_CONFIG_VERSION,2);
  const map:Record<string,string>={calm:'calm',ember:'ember',violet:'violet',coral:'signal',rose:'ember',indigo:'violet',azure:'telemetry',cyan:'telemetry',teal:'aurora',jade:'terminal',mono:'mono',forge:'forge'};
  for(const [from,to] of Object.entries(map)){
    const result=migrateConfigValue({version:1,ui:{theme:from,markdown:false}});
    assert.equal((result.value as any).ui.theme,to,`${from} -> ${to}`);
    assert.equal((result.value as any).ui.markdown,false,'the other fields stay');
    assert.equal(result.value.version,2);
  }
  const legacy=migrateConfigValue({ui:{theme:'dark'}});
  assert.equal((legacy.value as any).ui.theme,'calm');assert.deepEqual(legacy.steps,['v0-to-v1','v1-to-v2']);
  assert.equal(migrateConfigValue({version:2,ui:{theme:'noir'}}).changed,false);
});
