/*
 * R5a lane S — S1, the one status row (owner decisions Q-R5-2, Q-R5-5; gate E1, E2; R3 Q-R3-13) and the `/usage` view
 * (Q-R5-8). Pure: the snapshots are built here, never read from lane R's bodies (common brief: "your tests build their
 * own snapshots and events").
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {compactTokens,contextTone,costText,percentText,statusBar,type StatusBarInput} from '../../src/tui/status-bar.ts';
import {splitModelId,usageFacts,usageViewText} from '../../src/tui/usage-view.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import type {UsageSnapshot} from '../../src/runtime/usage-snapshot.ts';

/* R5a wiring (coordinator): lane R's contract — `inputTokens` is the run's total, the context in use is `contextTokens`; the
   status row's `ctx used/window` reads the latter. The fixtures carry both. */
const NONE:UsageSnapshot={contextTokens:null,inputTokens:null,outputTokens:null,cachedTokens:null,windowTokens:null,percent:null,estimated:false,costUsd:null,costSource:null,local:false,compactions:0};
const FULL:UsageSnapshot={inputTokens:3100,contextTokens:3100,outputTokens:340,cachedTokens:800,windowTokens:131072,percent:2.4,estimated:false,costUsd:0.004,costSource:'models.dev',local:false,compactions:1};
const MODEL='ollama:qwen3-coder-test';
const bar=(over:Partial<StatusBarInput>)=>statusBar({snapshot:FULL,model:MODEL,width:200,safety:{fullAccess:false,noSandbox:false},...over});

test('S1 Q-R5-2: the Hermes form, every figure present, in the fixed order',()=>{
  assert.equal(bar({}).text,'model ollama:qwen3-coder-test · ↑3.1k ↓340 · cached 800 · ctx 3.1k/131k 2% · ~$0.004 · cmp 1');
  assert.equal(bar({unseen:3,safety:{fullAccess:true,noSandbox:true}}).text,'Full access · No sandbox · model ollama:qwen3-coder-test · ↑3.1k ↓340 · cached 800 · ctx 3.1k/131k 2% · ~$0.004 · cmp 1 · 3 new');
});

test('S1 E1: nothing invented — unknown window is `ctx ?`, no price source is `cost ?`, no reported tokens leave no segment',()=>{
  assert.equal(bar({snapshot:NONE}).text,'model ollama:qwen3-coder-test · ctx ? · cost ?');
  assert.equal(bar({snapshot:null}).text,'model ollama:qwen3-coder-test · ctx ? · cost ?');
  /* a window with no percentage is not a percentage */
  assert.match(bar({snapshot:{...FULL,percent:null}}).text,/ctx \? /u);
  /* a price without its source is not a cost */
  assert.match(bar({snapshot:{...FULL,costSource:null}}).text,/ · cost \?/u);
  assert.match(bar({snapshot:{...FULL,costSource:'  '}}).text,/ · cost \?/u);
  /* one side unknown is `?`, never 0 */
  assert.match(bar({snapshot:{...FULL,outputTokens:null}}).text,/↑3\.1k ↓\? /u);
  assert.doesNotMatch(bar({snapshot:NONE}).text,/\b0\b|↑|↓|\$/u);
});

test('S1 E1/Q-R5-5: estimates carry `~`; a local engine says `local`; zero compactions say nothing',()=>{
  assert.match(bar({snapshot:{...FULL,estimated:true}}).text,/↑~3\.1k ↓~340 .* ctx ~3\.1k\/131k 2% /u);
  assert.match(bar({snapshot:{...FULL,local:true,costUsd:null,costSource:null}}).text,/ · local · cmp 1$/u);
  assert.doesNotMatch(bar({snapshot:{...FULL,compactions:0}}).text,/cmp/u);
});

test('S1 E2: one row that never exceeds the width, in the owner drop order; ctx, Full access and No sandbox never dropped',()=>{
  const safety={fullAccess:true,noSandbox:true};
  const widths=[40,41,50,60,70,80,100,120,160,240];
  for(const width of widths)for(const snapshot of [FULL,NONE,{...FULL,estimated:true,percent:97}]){
    const row=statusBar({snapshot,model:'provider:a-very-long-model-name-that-does-not-fit-anywhere-at-all',width,safety,unseen:12});
    assert.ok(displayWidth(row.text)<=width,`${width}: ${row.text}`);
    assert.ok(!row.text.includes('\n'));
    assert.match(row.text,/^Full access · No sandbox · /u,`${width}: ${row.text}`);
    assert.match(row.text,/ctx (\?|~?\d+%|~?[\d.]+k\/[\d.]+k ~?\d+%)/u,`${width}: ${row.text}`);
  }
  /* The order: cost, cached, tokens, cmp, N new, the window figure, then the model is cut and dropped. */
  const at=(width:number)=>statusBar({snapshot:FULL,model:MODEL,width,safety:{fullAccess:false,noSandbox:false},unseen:3}).text;
  assert.equal(at(120),'model ollama:qwen3-coder-test · ↑3.1k ↓340 · cached 800 · ctx 3.1k/131k 2% · ~$0.004 · cmp 1 · 3 new');
  assert.equal(at(95),'model ollama:qwen3-coder-test · ↑3.1k ↓340 · cached 800 · ctx 3.1k/131k 2% · cmp 1 · 3 new');
  assert.equal(at(80),'model ollama:qwen3-coder-test · ↑3.1k ↓340 · ctx 3.1k/131k 2% · cmp 1 · 3 new');
  assert.equal(at(70),'model ollama:qwen3-coder-test · ctx 3.1k/131k 2% · cmp 1 · 3 new');
  assert.equal(at(60),'model ollama:qwen3-coder-test · ctx 3.1k/131k 2% · 3 new');
  assert.equal(at(50),'model ollama:qwen3-coder-test · ctx 3.1k/131k 2%');
  assert.equal(at(45),'model ollama:qwen3-coder-test · ctx 2%');
  assert.equal(at(40),'model ollama:qwen3-coder-test · ctx 2%');
  const cut=statusBar({snapshot:FULL,model:'provider:an-extremely-long-model-identifier',width:40,safety:{fullAccess:true,noSandbox:true}}).text;
  assert.equal(cut,'Full access · No sandbox · ctx 2%');
  const middle=statusBar({snapshot:FULL,model:'provider:an-extremely-long-model-identifier',width:44,safety:{fullAccess:false,noSandbox:false}}).text;
  assert.match(middle,/^model provider:an…identifier · ctx 2%$|^model .*….* · ctx 2%$/u,middle);
});

test('S1: the percentage takes Hermes tones at 50 / 80 / 95; figures are compact and never read as zero',()=>{
  assert.deepEqual([null,0,49.9,50,79,80,94.9,95,100].map(contextTone),['normal','normal','normal','warn','warn','high','high','critical','critical']);
  const toned=bar({snapshot:{...FULL,percent:83}}).segments.find(segment=>segment.id==='context');
  assert.equal(toned?.tone,'high');
  assert.deepEqual([0,340,999,1000,1200,12_400,99_949,131_072,999_499,1_500_000].map(compactTokens),['0','340','999','1k','1.2k','12.4k','99.9k','131k','999k','1.5m']);
  assert.equal(percentText(0.3),'<1');assert.equal(percentText(0),'0');assert.equal(percentText(2.4),'2');
  assert.equal(costText(0.0004),'<0.001');assert.equal(costText(0.004),'0.004');assert.equal(costText(1.254),'1.25');
});

test('S1: the model id is split the way the profile lookup matches it; the stubs make every figure unknown, never 0',()=>{
  assert.deepEqual(splitModelId('ollama:qwen3:8b'),{provider:'ollama',model:'qwen3:8b'});
  assert.equal(splitModelId('none · /provider'),null);
  assert.equal(splitModelId('nocolon'),null);
  /* Whatever lane R's bodies say later, today's stubs give nulls, and the row then says `ctx ?` / `cost ?`. */
  const facts=usageFacts({model:MODEL,usage:{prompt_tokens:1200,completion_tokens:340},contextStatus:null});
  const row=statusBar({snapshot:facts.snapshot,model:MODEL,width:120,safety:{fullAccess:false,noSandbox:false}});
  assert.match(row.text,/ctx \?/u);assert.doesNotMatch(row.text,/\b0%|\$0/u);
});

test('S1 /usage: tokens, the window with its source and date, the cost with its source, and the compaction rule',()=>{
  const known=usageViewText({model:MODEL,facts:{snapshot:FULL,profile:{windowTokens:131072,responseReserve:8192,source:'ollama-show',date:'2026-09-24'}}});
  assert.equal(known,[
    'Usage',
    '  model        ollama:qwen3-coder-test',
    '  tokens       3,100 in · 340 out · 800 cached',
    '  context      3,100 of 131,072 tokens · 2% · window from Ollama (/api/show), 2026-09-24',
    '  cost         ~$0.004 at list price · source models.dev',
    '  compactions  1 · at 50% of the window',
  ].join('\n'));
  const unknown=usageViewText({model:MODEL,facts:{snapshot:NONE,profile:null}});
  assert.match(unknown,/tokens {7}not reported yet/u);
  assert.match(unknown,/context {6}window unknown, so no percentage is shown/u);
  assert.match(unknown,/cost {9}unknown: no price source for this model/u);
  /* 0.6.13 (22/10/2026): the desktop adapter's simple compaction, no longer every 8 model calls */
  assert.match(unknown,/compactions {2}0 · at context\.compactAtTokens, 200,000 tokens by default \(window unknown\)/u);
  assert.match(usageViewText({model:MODEL,facts:{snapshot:{...NONE,local:true},profile:null}}),/cost {9}local engine, no cost/u);
  assert.match(usageViewText({model:MODEL,facts:{snapshot:{...FULL,estimated:true},profile:null}}),/tokens {7}3,100 in · 340 out · 800 cached \(estimated\)/u);
});

/* Owner decision 02/10 («Nel registro + avviso discreto», registro 12): console output during the TUI goes to the log, and
   real warnings and errors are counted here, in the warning tone, pointing at `talos logs` (there is no /logs command). */
test('console: real warnings and errors counted in a warning-toned segment that points at talos logs',()=>{
  assert.equal(bar({consoleWarnings:0}).segments.some(s=>s.id==='console'),false,'nothing to say, no segment');
  const one=bar({consoleWarnings:1}).segments.find(s=>s.id==='console');
  assert.deepEqual(one,{id:'console',text:'1 warning · talos logs',tone:'warn'});
  assert.equal(bar({consoleWarnings:3}).segments.find(s=>s.id==='console')?.text,'3 warnings · talos logs');
  assert.match(bar({consoleWarnings:2}).text,/2 warnings · talos logs$/u,'last on the row');
});

test('console: dropped before the model and the context when the row is short, never before cost and cache',()=>{
  const full=bar({consoleWarnings:2,width:200}).text;
  const narrow=bar({consoleWarnings:2,width:displayWidth(full)-1});
  assert.ok(narrow.segments.some(s=>s.id==='console'),'cost goes first');
  const tight=bar({snapshot:NONE,consoleWarnings:2,width:30});
  assert.ok(displayWidth(tight.text)<=30);
  assert.ok(tight.segments.some(s=>s.id==='context'),'ctx is never dropped');
});
