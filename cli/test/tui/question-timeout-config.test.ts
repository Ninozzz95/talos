/*
 * Stage 3 (owner 02/10: «5 min + riga in /config», after the competitor research; WCAG 2.2 SC 2.2.1): how long a question
 * of the model waits before it closes as expired. Never, 1, 5 or 10 minutes; 5 by default; a row in /config that applies
 * from the next card without a restart (Claude Code `askUserQuestionTimeout`, the desktop's askTimeout).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {loadEffectiveConfig,readConfigScope,writeConfigScope} from '../../src/config/load.ts';
import {DEFAULT_CONFIG,questionTimeoutMs} from '../../src/config/types.ts';
import {createConfigPanelStore,loadConfigPanelValues,CONFIG_PANEL_KEYS} from '../../src/tui/config-panel.ts';
import {configPanelOverlay} from '../../src/tui/overlays/config-panel.ts';

test('the four values and their length; 5 minutes when nothing is set',()=>{
  assert.equal(DEFAULT_CONFIG.ui?.questionTimeout,'5m');
  assert.equal(questionTimeoutMs(undefined),300_000);
  assert.equal(questionTimeoutMs('never'),null);
  assert.equal(questionTimeoutMs('1m'),60_000);
  assert.equal(questionTimeoutMs('5m'),300_000);
  assert.equal(questionTimeoutMs('10m'),600_000);
});

test('the configuration accepts the four values and refuses any other by its own code',async()=>{
  const env=hermeticProfile(),options={paths:env.paths,projectRoot:env.root};
  try{
    for(const value of ['never','1m','5m','10m'] as const){
      await writeConfigScope({...options,scope:'user',patch:{ui:{questionTimeout:value}}});
      assert.equal((await loadEffectiveConfig(options)).value.ui?.questionTimeout,value);
    }
    const {writeFileSync}=await import('node:fs');const {join}=await import('node:path');
    writeFileSync(join(env.paths.configRoot,'config.json'),JSON.stringify({version:2,ui:{questionTimeout:'forever'}}));
    await assert.rejects(loadEffectiveConfig(options),/^Error: CONFIG_INVALID_QUESTION_TIMEOUT$/u);
  }finally{env.restore();}
});

test('/config: the row shows 5 min by default, cycles the four values, saves privately and applies live',async()=>{
  const env=hermeticProfile(),options={paths:env.paths,projectRoot:env.root};
  try{
    assert.equal((await loadConfigPanelValues(options)).questionTimeout,'5m');
    const live:string[]=[];
    const store=createConfigPanelStore({...options,onQuestionTimeout:value=>live.push(value)});
    await store.open();
    const row=CONFIG_PANEL_KEYS.indexOf('questionTimeout');assert.ok(row>=0);
    store.move(row);
    const seen:string[]=[];
    for(let i=0;i<4;i++){await store.change(1);seen.push(store.getSnapshot()!.values!.questionTimeout);}
    assert.deepEqual(seen,['10m','never','1m','5m']);
    assert.deepEqual(live,['10m','never','1m','5m'],'every change reaches the screen without a restart');
    assert.equal(store.getSnapshot()!.notice,'Saved and applied to this conversation.');
    await store.change(-1);
    assert.equal((await readConfigScope({...options,scope:'project-user'})).ui?.questionTimeout,'1m');
  }finally{env.restore();}
});

test('/config overlay: «Questions close after» in words, without «next launch»',()=>{
  const values={maxProseWidth:null,mouse:false,notifications:'auto' as const,exitOutput:'transcript' as const,questionTimeout:'5m' as const};
  const line=(questionTimeout:'never'|'1m'|'5m'|'10m')=>configPanelOverlay({selected:0,values:{...values,questionTimeout},busy:false,notice:null}).sections[0]!.lines[CONFIG_PANEL_KEYS.indexOf('questionTimeout')]!.text;
  assert.equal(line('5m'),'Questions close after: 5 min');
  assert.equal(line('1m'),'Questions close after: 1 min');
  assert.equal(line('10m'),'Questions close after: 10 min');
  assert.equal(line('never'),'Questions close after: Never');
});
