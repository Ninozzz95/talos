/*
 * 14/10/2026, owner: «/context con il dettaglio dell'ultima richiesta» — what the last request to the model was made of (the
 * instructions, the project's rules and memory, the tools, MCP tools, the conversation), the way Claude Code's /context and
 * Hermes' (hermes_cli/cli_info_mixin.py `_show_context_breakdown`) show it. The kernel measures it since L3-6
 * (`richiesta-del-giro.mjs` `ripartizioneDellaRichiesta`, kept in RAM by the registry, `leggiUltimaRichiesta`); the CLI took the
 * capture away until today. The Settings sheet's Context grid already draws `parts` (stage 7.11): now it has them.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {buildContextStatus} from '../../src/runtime/context-status.ts';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {composeWithFake,runTurn,startScriptedProvider} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());

const SNAPSHOT={revision:2,measurement:{inputTokens:12_000,windowTokens:65_536,responseReserve:16_384,method:'heuristic',revision:2},settings:{auto:true,triggerRatio:0.5,targetRatio:0.49}};
const LAST={at:'2026-10-14T08:00:00.000Z',model:'deepseek-flash',ripartizione:{categorie:[{id:'system',tokens:2_000},{id:'rules',tokens:300},{id:'memory',tokens:200},{id:'tools',tokens:7_000},{id:'mcp',tokens:500},{id:'conversation',tokens:1_800}],stimata:true,messaggi:4,attrezzi:40}};

test('the last request\'s parts become the window\'s parts, marked as an estimate; the project\'s rules count as memory',()=>{
  const status=buildContextStatus({sessionId:'s',snapshot:SNAPSHOT,sessionUsage:null,lastRequest:LAST});
  assert.deepEqual(status.parts,{system:2_000,tools:7_000,mcp:500,memory:500,messages:1_800,exact:false});
  assert.equal(status.lastRequest?.at,'2026-10-14T08:00:00.000Z');
  assert.equal(status.lastRequest?.messages,4);
  assert.equal(status.lastRequest?.tools,40);
  assert.equal(buildContextStatus({sessionId:'s',snapshot:SNAPSHOT,sessionUsage:null,lastRequest:null}).parts,undefined,'nothing sent yet: no parts');
  assert.equal(buildContextStatus({sessionId:'s',snapshot:SNAPSHOT,sessionUsage:null,lastRequest:{ripartizione:{categorie:[{id:'system',tokens:-1}]}}}).parts,undefined,'a count that is not a count: no parts');
});

test('after a real turn, /context has the parts of the request that was sent',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models:{'deepseek:deepseek-flash':{contextWindow:65_536}}}));
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text' as const,text:'Done.'})});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'hello there');
    assert.ok(raw.some(e=>e?.type==='RunFinished'));
    const status=await context.runtime.contextStatus(sessionId);
    assert.ok(status.parts,'the parts are there');
    assert.equal(status.parts.exact,false);
    assert.ok(status.parts.system>0&&status.parts.tools>0&&status.parts.messages>0,JSON.stringify(status.parts));
  }finally{await context.runtime.close?.();await fake.close();}
}));
