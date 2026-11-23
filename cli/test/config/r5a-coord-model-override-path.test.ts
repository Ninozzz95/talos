/* R5a (coordinator, found by the s21/s22 acceptance run): Q-R5-3's personal override `models.<provider:model>.contextWindow`
   could not be set from the command line — `talos config set models.ollama:qwen3-coder-test.contextWindow 16384` answered
   CONFIG_PATH_INVALID, because a path segment allowed only letters, digits, `_` and `-`, while a model id has `:` and often
   `.` (`openai:gpt-4.1`), the separator itself. For `models.<id>.<key>` everything between `models.` and the last key is
   the id. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {configSet,configUnset} from '../../src/config/commands.ts';

function paths(root:string){return{dataRoot:root,queueRoot:join(root,'queues'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'sessions'),logsRoot:join(root,'logs'),projectOverridesRoot:join(root,'projects'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}} as any;}

test('R5a Q-R5-3: a model window override is set and unset by path, for ids with a colon and with dots',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5a-mpath-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const p=paths(root),projectRoot=join(root,'project');
  await configSet({paths:p,projectRoot,scope:'user',path:'models.ollama:qwen3-coder-test.contextWindow',value:16384});
  await configSet({paths:p,projectRoot,scope:'user',path:'models.openai:gpt-4.1.contextWindow',value:1_000_000});
  const user=JSON.parse(await readFile(join(p.configRoot,'config.json'),'utf8'));
  assert.deepEqual(user.models,{'ollama:qwen3-coder-test':{contextWindow:16384},'openai:gpt-4.1':{contextWindow:1_000_000}});
  await configUnset({paths:p,projectRoot,scope:'user',path:'models.openai:gpt-4.1.contextWindow'});
  const after=JSON.parse(await readFile(join(p.configRoot,'config.json'),'utf8'));
  assert.equal(after.models['openai:gpt-4.1']?.contextWindow,undefined);
  await assert.rejects(configSet({paths:p,projectRoot,scope:'user',path:'models..contextWindow',value:1}),/CONFIG_PATH_INVALID/u);
  await assert.rejects(configSet({paths:p,projectRoot,scope:'user',path:'ui.bad key',value:1}),/CONFIG_PATH_INVALID/u,'other paths keep the strict rule');
});
