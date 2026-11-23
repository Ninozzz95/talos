/*
 * Stage 7.11c (mockup Settings; owner 03/10): the new choices are real settings — `ui.reduceMotion` reduces motion as
 * TALOS_REDUCED_MOTION does, `ui.reasoning` accepts «hidden», `ui.toolRows` and `ui.editor` are validated like every ui key —
 * and hidden reasoning is never drawn, not even the one-line «Thought for».
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {detectTerminalCapabilities} from '../../src/tui/terminal-capabilities.ts';
import {parseReasoning} from '../../src/tui/ui-preferences.ts';
import {visibleTranscriptItems} from '../../src/tui/components/thinking-row.ts';
import {loadEffectiveConfig} from '../../src/config/load.ts';

test('reduced motion comes from the setting as from the variable',()=>{
  const base={stdinIsTTY:true,stdoutIsTTY:true,color:true,env:{}};
  assert.equal(detectTerminalCapabilities(base).motion,true);
  assert.equal(detectTerminalCapabilities({...base,reduceMotion:true}).motion,false);
  assert.equal(detectTerminalCapabilities({...base,env:{TALOS_REDUCED_MOTION:'1'}}).motion,false);
  assert.equal(detectTerminalCapabilities({...base,reduceMotion:true}).color,true,'colour stays');
});

test('hidden reasoning is a choice, and it draws nothing',()=>{
  assert.equal(parseReasoning('hidden'),'hidden');assert.equal(parseReasoning('loud'),null);
  const items:any[]=[{kind:'reasoning',id:'r',text:'plan',streaming:false},{kind:'message',id:'m',role:'assistant',text:'hi'}];
  assert.deepEqual(visibleTranscriptItems(items,false).map(item=>item.id),['r','m'],'collapsed keeps its «Thought for» line');
  assert.deepEqual(visibleTranscriptItems(items,false,{hidden:true}).map(item=>item.id),['m']);
  assert.deepEqual(visibleTranscriptItems(items,true,{hidden:true}).map(item=>item.id),['m'],'hidden wins over shown');
});

test('the new ui keys are validated: tool rows, reduced motion, editor',async()=>{
  const root=mkdtempSync(join(tmpdir(),'talos-settings-config-'));
  try{
    const paths={configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'sessions'),logsRoot:join(root,'logs'),projectOverridesRoot:join(root,'overrides'),queueRoot:join(root,'queue'),trust:{hooks:join(root,'t1'),mcp:join(root,'t2'),plugins:join(root,'t3'),projects:join(root,'t4')}};
    const project=join(root,'project');mkdirSync(project,{recursive:true});mkdirSync(paths.configRoot,{recursive:true});
    const load=async(ui:Record<string,unknown>)=>{writeFileSync(join(paths.configRoot,'config.json'),JSON.stringify({version:2,ui}));return loadEffectiveConfig({paths:paths as any,projectRoot:project});};
    assert.equal((await load({toolRows:'each',reduceMotion:true,editor:'code --wait',reasoning:'hidden'})).value.ui?.toolRows,'each');
    assert.equal((await load({startView:'zen'})).value.ui?.startView,'zen');
    for(const ui of [{toolRows:'some'},{startView:'huge'},{reduceMotion:'yes'},{editor:''},{editor:'vim\nrm -rf'},{reasoning:'loud'}])
      await assert.rejects(load(ui),/CONFIG_INVALID/u,JSON.stringify(ui));
  }finally{rmSync(root,{recursive:true,force:true});}
});
