/*
 * «One line», step 3 (judge v1541, v1579, cured after the reviewer's short re-check, judge v1597, 12/11/2026): what the screen says
 * when the kernel compacts at its emergency, at its threshold and after the provider's refusal — live and after --resume the same.
 *
 * The rows are the kernel's own, never written here: `test/fixtures/kernel-compaction/rows-line-kernel.json` was produced by
 * `generate-rows.mjs` from the line's kernel (the head and the files' sha256 are inside), `live` from `talosLavora`'s `onGiro`,
 * `journal` from those same rows through the kernel's `avviaSessione` journal mapping. `rows-kernel-cure.json` is the same run on the
 * kernel branch `cura/fine-istantanea-soglia-2026-11-12`, whose instant end row at the emergency also carries `soglia` (v1597 c).
 *
 * What the reviewer measured (v1597): with a model summary already prepared, at its emergency the kernel writes ONE row,
 * `compattazione-fine` `istantanea:true, motivo:'emergenza'`, and no `compattazione-inizio` (agent-service.mjs:1648). The CLI read
 * the reason only from the start row, so live it said «at 75% of the window… 200,000 tokens by default» and after --resume «at its
 * emergency line»; and the earlier test fed a start+end pair the kernel never writes, so its «240k»/«900k» came out of no real path.
 * Now one reading (provider-attempts.ts compactionCauseOf) takes the row's own reason first, then its start's; the number is only one the
 * kernel wrote (the start's `soglia`, or the instant end row's optional `soglia`); no reason ⇒ no rule and no number.
 * Precedents: pi's compaction end carries its own reason (pi-mono agent-session.ts:213-219, `compaction_end` `reason`); Hermes names
 * the threshold number it acted on (agent/context_compressor.py:3385-3391).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createCliEventHub,createRunObserver} from '../../src/runtime/provider-attempts.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';

type Scene={live:any[];journal:any[]};
type Fixture={kernel:{head:string;lastKernelCommit:string;sha256:Record<string,string>};thresholds:Record<string,{soglia:number;emergenza:number}>;scenes:Record<string,Scene>};
const load=(name:string):Fixture=>JSON.parse(readFileSync(new URL(`../fixtures/kernel-compaction/${name}`,import.meta.url),'utf8'));
const LINE=load('rows-line-kernel.json');
const CURE=load('rows-kernel-cure.json');

let seq=0;const durable=(row:Record<string,unknown>)=>({...row,_sequenza:++seq});
const started=()=>durable({type:'RunStarted',runId:'r1'});
const finished=(compattazioni:number)=>durable({type:'RunFinished',runId:'r1',outcome:'concluso',result:{detto:'ok',compattazioni}});
function screen(){
  const bridge=createV2EventBridge('s-1',()=>'2026-11-12T00:00:00.000Z');
  const adapter=createTuiEventAdapter();adapter.bindSession('s-1');
  let model=createTranscriptModel();
  const feed=(raw:any)=>{const event=bridge.translate(raw);for(const tui of event?adapter.translateAll(event):[])model=reduceTranscriptEvent(model,tui);return event;};
  const lines=()=>model.items.filter((item:any)=>item.kind==='warning').map((item:any)=>item.text as string);
  return{feed,lines};
}
/** Live: the observer reads the `onGiro` rows and the kernel streams its journal rows too; resumed: the journal rows alone. */
function shown(scene:Scene){
  const compacted=scene.live.filter(row=>row.tipo==='compattazione-fine'&&row.compattato===true).length;
  const now=screen();const hub=createCliEventHub();hub.subscribe('s-1',event=>{now.feed(event);});
  const observer=createRunObserver({sessionId:'s-1',hub,readRequestedWait:null,baseFetch:async()=>new Response('{}')});
  now.feed(started());for(const row of scene.live)observer.onCompaction(row);for(const row of scene.journal)now.feed(durable(row));now.feed(finished(compacted));
  const after=screen();for(const row of [started(),...scene.journal.map(durable),finished(compacted)])after.feed(row);
  return{live:now.lines(),resumed:after.lines()};
}
const k=(n:number)=>n<1000?String(n):n<99_950?`${(n/1000).toFixed(1).replace(/\.0$/u,'')}k`:n<999_500?`${Math.round(n/1000)}k`:`${(n/1_000_000).toFixed(1).replace(/\.0$/u,'')}m`;
const endOf=(scene:Scene)=>scene.live.find(row=>row.tipo==='compattazione-fine'&&row.compattato===true);
const figures=(scene:Scene)=>{const r=endOf(scene).record;return`${k(r.tokenPrima)} → ${k(r.tokenDopo)} tokens`;};
/* the numbers the kernel never wrote for these rows: the old 1.2× of a start line, and the 75% rule's default */
const NOT_WRITTEN=/288k|1\.1m|1\.2×|75%|200,000 tokens by default|90% of the window/u;

test('LINEA-3 v1597: the fixtures are the kernel\'s rows, with the kernel they come from',()=>{
  for(const fixture of [LINE,CURE]){
    assert.match(fixture.kernel.head,/^[0-9a-f]{40}$/u);assert.match(fixture.kernel.lastKernelCommit,/^[0-9a-f]{40}$/u);
    assert.equal(Object.keys(fixture.kernel.sha256).length,3);
    assert.equal(JSON.stringify(fixture).includes('## Summary'),false,'no summary text in the fixture');
  }
  /* D3 (a), judge v1605: the line now carries the 200k threshold (3de0e2b59, owner 11/11 17:47 point 12: the old compactor takes the engine
     ceiling, 1M => 200,000, emergency 1.2x = 240,000), so the line's rows were generated again from that kernel. 900k is no longer the line's. */
  for(const scale of ['cap-200k','window-1m','cap-200k-window-1m'])assert.equal(LINE.thresholds[scale]!.emergenza,240_000,`${scale}: the line's emergency line`);
  /* judge v1610 point 2: the field's rows come from the field AND the threshold together (cura/fine-istantanea-soglia-2026-11-12 after it took
     the candidate edba3aee8): the instant end row at the emergency says 240,000 at every scale, never the 900k of the kernel before the threshold */
  for(const [name,scale] of [['adopted-at-emergency-cap-200k','cap-200k'],['adopted-at-emergency-window-1m','window-1m'],['adopted-at-emergency-cap-200k-window-1m','cap-200k-window-1m']] as const){
    assert.equal(CURE.thresholds[scale]!.emergenza,240_000,`${scale}: the field kernel's emergency line`);
    assert.equal(CURE.scenes[name]!.live.find((row:any)=>row.tipo==='compattazione-fine'&&row.compattato===true).soglia,240_000,`${name}: the field's line`);
  }
  assert.notEqual(LINE.kernel.sha256['harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs'],CURE.kernel.sha256['harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs'],'two different kernels');
  /* what the reviewer measured: at the emergency, with a summary ready, ONE end row and no start */
  for(const name of ['adopted-at-emergency-cap-200k','adopted-at-emergency-window-1m','adopted-at-emergency-cap-200k-window-1m']){
    const scene=LINE.scenes[name]!;
    assert.deepEqual(scene.live.map(row=>[row.tipo,row.motivo,row.istantanea]),[['compattazione-fine','emergenza',true]],name);
    assert.equal('soglia' in scene.live[0],false,'the line\'s kernel writes no line on it');
  }
});

/* proofs 1, 2 and 4 again (cap 200k / 1M window / both), on the kernel of today: no number the kernel did not write */
for(const [name,scale] of [['adopted-at-emergency-cap-200k','cap-200k'],['adopted-at-emergency-window-1m','window-1m'],['adopted-at-emergency-cap-200k-window-1m','cap-200k-window-1m']] as const){
  test(`LINEA-3 v1597: a summary adopted at the emergency (${scale}, line's kernel) is said at the emergency line with no number, live as after --resume`,()=>{
    const scene=LINE.scenes[name]!;
    const {live,resumed}=shown(scene);
    assert.deepEqual(live,[`Context compacted by the kernel at its emergency line: earlier messages summarized · ${figures(scene)} · /context`],live.join('\n'));
    assert.deepEqual(resumed,live,'after --resume the same line');
    assert.doesNotMatch(live.join('\n'),NOT_WRITTEN);
    assert.doesNotMatch(live.join('\n'),new RegExp(`\\b${k(LINE.thresholds[scale]!.emergenza)} tokens:`,'u'),'the line was not written, so it is not said');
  });
  test(`LINEA-3 v1597 (c): with the kernel's new field (${scale}), the same row says the kernel's own line, live as after --resume`,()=>{
    const scene=CURE.scenes[name]!;
    const line=endOf(scene).soglia;
    assert.equal(line,CURE.thresholds[scale]!.emergenza,'the cured kernel writes its emergency line on the instant end row');
    assert.equal(scene.journal.find((row:any)=>row.value.fase==='fine').value.soglia,line,'and its journal keeps it');
    const {live,resumed}=shown(scene);
    assert.deepEqual(live,[`Context compacted by the kernel at its emergency line, ${k(line)} tokens: earlier messages summarized · ${figures(scene)} · /context`],live.join('\n'));
    assert.deepEqual(resumed,live);
    assert.doesNotMatch(live.join('\n'),NOT_WRITTEN);
  });
}

test('LINEA-3 v1597: a summary adopted at the threshold is said by the threshold rule, live as after --resume (both kernels)',()=>{
  for(const fixture of [LINE,CURE]){
    const scene=fixture.scenes['adopted-at-threshold-cap-200k']!;
    assert.equal('soglia' in endOf(scene),false,'the field is only at the emergency');
    const {live,resumed}=shown(scene);
    assert.equal(live.length,1);
    assert.match(live[0]!,/^Context compacted by the kernel \(at 75% of the window/u);
    assert.deepEqual(resumed,live);
  }
});

test('LINEA-3 v1597: a summary adopted after the provider\'s refusal is said as that, live as after --resume (it was the «75%» rule live)',()=>{
  for(const fixture of [LINE,CURE]){
    const scene=fixture.scenes['adopted-after-refusal-cap-8k']!;
    assert.deepEqual(scene.live.map(row=>[row.tipo,row.motivo]),[['compattazione-fine','overflow']],'no start row: the reason is on the end row');
    const {live,resumed}=shown(scene);
    assert.deepEqual(live,[`Context compacted after the provider said the conversation did not fit: earlier messages summarized · ${figures(scene)} · /context`]);
    assert.deepEqual(resumed,live);
  }
});

test('LINEA-3 v1579 (a)2: the quick summary the kernel applies at its emergency says no line, live as after --resume',()=>{
  const scene=LINE.scenes['quick-at-emergency-cap-200k']!;
  assert.equal(scene.live[0].soglia,240_000,'the start row does carry the line here');
  const {live,resumed}=shown(scene);
  assert.equal(live.length,1);
  assert.match(live[0]!,/^Shortened older messages without a model summary/u);
  assert.deepEqual(resumed,live);
  assert.doesNotMatch(live.join('\n'),NOT_WRITTEN);
});

/* A kernel from before 15/10/2026 wrote the instant row with no reason at all (agent-service.mjs: «il motivo lo porta lui» came then):
   the same real rows with that one field gone. No rule, no number, no reason guessed. */
test('LINEA-3 v1597: a row that does not say why is said with no rule and no number, live as after --resume',()=>{
  const scene=LINE.scenes['adopted-at-emergency-cap-200k']!;
  const strip=({motivo:_m,...row}:any)=>row;
  const older={live:scene.live.map(strip),journal:scene.journal.map((row:any)=>({...row,value:strip(row.value)}))};
  const {live,resumed}=shown(older);
  assert.deepEqual(live,[`Context compacted by the kernel: earlier messages summarized · ${figures(scene)} · /context`],live.join('\n'));
  assert.deepEqual(resumed,live);
});

test('LINEA-3 v1597: compactionCauseOf, the one reading — the row\'s own reason first, then its start\'s; a number only from the kernel',async()=>{
  const {compactionCauseOf}=await import('../../src/runtime/provider-attempts.ts') as any;
  assert.equal(typeof compactionCauseOf,'function','one reading, exported');
  assert.deepEqual(compactionCauseOf({motivo:'emergenza'},null),{cause:'emergency',line:null});
  assert.deepEqual(compactionCauseOf({motivo:'emergenza',soglia:240_000},null),{cause:'emergency',line:240_000});
  assert.deepEqual(compactionCauseOf({},{motivo:'emergenza',soglia:900_000}),{cause:'emergency',line:900_000});
  assert.deepEqual(compactionCauseOf({motivo:'emergenza',soglia:240_000},{motivo:'emergenza',soglia:900_000}),{cause:'emergency',line:240_000},'the end row\'s own line first');
  assert.deepEqual(compactionCauseOf({motivo:'overflow'},{motivo:'emergenza',soglia:900_000}),{cause:'refusal',line:null},'the row\'s own reason first');
  assert.deepEqual(compactionCauseOf({},{motivo:'overflow'}),{cause:'refusal',line:null});
  assert.deepEqual(compactionCauseOf({motivo:'soglia',soglia:200_000},null),{cause:'threshold',line:null},'a line is said only for the emergency');
  for(const soglia of [0,-5,'240000',Number.NaN,null])assert.deepEqual(compactionCauseOf({motivo:'emergenza',soglia},null),{cause:'emergency',line:null},String(soglia));
  for(const motivo of ['motore','precalcolo','',42,undefined])assert.deepEqual(compactionCauseOf({motivo},null),{cause:null,line:null},`never a near reason: ${String(motivo)}`);
  assert.deepEqual(compactionCauseOf({},null),{cause:null,line:null});
});
