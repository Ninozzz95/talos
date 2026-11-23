/* R5a (coordinator; owner decision 2026-09-24 after lane S): the busy-input tip is shown ONCE PER INSTALL, like Hermes's
   (`onboarding.seen.busy_input_prompt`, website user-guide/messaging/index.md:288), not once per launch: after it is shown,
   `ui.busyTipSeen` is written to the user configuration and the tip never comes back. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {writeConfigScope} from '../../src/config/load.ts';
import * as prefs from '../../src/tui/ui-preferences.ts';

function paths(root:string){return{dataRoot:root,queueRoot:join(root,'queues'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'sessions'),logsRoot:join(root,'logs'),projectOverridesRoot:join(root,'projects'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}} as any;}

test('R5a: the busy tip is remembered as seen in the user configuration, and a wrong value is refused',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5a-tip-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const p=paths(root),projectRoot=join(root,'project');
  const load=(prefs as any).loadBusyTipSeen as undefined|((x:any)=>Promise<boolean>);
  assert.equal(typeof load,'function','ui-preferences exposes loadBusyTipSeen');
  assert.equal(await load!({paths:p,projectRoot}),false,'a new install has not seen it');
  await prefs.saveUiPreference({paths:p,projectRoot,patch:{busyTipSeen:true} as any});
  assert.equal(await load!({paths:p,projectRoot}),true,'seen once, seen for good');
  const user=JSON.parse(await readFile(join(p.configRoot,'config.json'),'utf8'));
  assert.equal(user.ui.busyTipSeen,true,'written in the user scope');
  await assert.rejects(writeConfigScope({paths:p,projectRoot,scope:'user',patch:{ui:{busyTipSeen:'yes'}} as any}),/CONFIG_INVALID_UI/u);
});
