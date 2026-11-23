/*
 * The tool groups, as the approved mockup draws them (07/10 `summary(calls)` and `toolGroup`; owner 08/10 «la parità col mockup
 * non è stata raggiunta… Tutta la conversazione»): consecutive reads, searches and lists are ONE line, «Read 2 files, searched
 * 1 pattern»; consecutive edits, writes and commands another, «edited 1 file, ran 1 command»; one call is a group too. While a
 * call works the line is that call's label («Searched "retry" in src/»). A failure, a non-zero exit, a call waiting for the
 * person or denied keeps its own row.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {groupExploration,toggleOpenItem,toolGroupLine,toolGroupOpenRows,toolGroupWorking} from '../../src/tui/components/tool-group.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import type {TranscriptItem,TranscriptToolItem} from '../../src/tui/transcript-model.ts';

let n=0;
const tool=(name:string,status:TranscriptToolItem['status']='completed',args:Record<string,unknown>={},exitCode:number|null=null):TranscriptToolItem=>({kind:'tool',id:`t${++n}`,name,status,argsText:JSON.stringify(args),liveOutput:'',finalOutput:'',startedAt:0,endedAt:1,
  outcome:exitCode===null?null:{toolCallId:'x',status:'completed',content:'',receiptStatus:null,exitCode,enforcement:null,allowed:null,permissionVia:null,permissionReason:null,risk:null}});
const say=(text:string):TranscriptItem=>({kind:'message',id:`m${++n}`,role:'assistant',text} as any);

test('mockup groups: reads, searches and lists are one line in the mockup\'s order and case; a single call is a group too', () => {
  const items=[say('a'),tool('cerca'),tool('cerca'),tool('leggi'),tool('leggi'),tool('leggi'),tool('elenca'),say('b'),tool('leggi'),say('c')];
  const out=groupExploration(items);
  assert.deepEqual(out.map(item=>item.kind),['message','toolGroup','message','toolGroup','message']);
  assert.equal(toolGroupLine(out[1] as any),'Read 3 files, searched 2 patterns, listed 1 folder');
  assert.equal(toolGroupLine(out[3] as any),'Read 1 file');
});

test('mockup groups: edits, writes and commands are the work group, apart from the exploration before them', () => {
  const out=groupExploration([tool('leggi'),tool('leggi'),tool('cerca'),tool('file_edit'),tool('shell',undefined,{},0)]);
  assert.deepEqual(out.map(item=>item.kind),['toolGroup','toolGroup']);
  assert.equal(toolGroupLine(out[0] as any),'Read 2 files, searched 1 pattern');
  assert.equal(toolGroupLine(out[1] as any),'edited 1 file, ran 1 command');
  const many=groupExploration([tool('scrivi'),tool('file_edit'),tool('shell'),tool('shell')]);
  assert.equal(toolGroupLine(many[0] as any),'edited 2 files, ran 2 commands');
});

test('mockup groups: while a call works the line is its label, past tense like the mockup\'s', () => {
  const group=groupExploration([tool('leggi'),tool('cerca','running',{testo:'retry',dentro:'src/'})])[0]! as any;
  assert.equal(toolGroupWorking(group),true);
  assert.equal(toolGroupLine(group),'Searched "retry" in src/');
  assert.equal(toolGroupLine(groupExploration([tool('leggi','running',{percorso:'src/auth/login.ts'})])[0] as any),'Read src/auth/login.ts');
  assert.equal(toolGroupLine(groupExploration([tool('shell','running',{comando:'npm test\nsecond line'})])[0] as any),'Ran npm test');
});

test('mockup groups: a failure, a non-zero exit, a question for the person or a denial breaks the group and keeps its row', () => {
  for(const breaker of [tool('leggi','failed'),tool('cerca','approval'),tool('elenca','denied'),tool('shell','completed',{},1),tool('shell','interrupted')]){
    const out=groupExploration([tool('leggi'),breaker,tool('leggi')]);
    assert.deepEqual(out.map(item=>item.kind),['toolGroup','tool','toolGroup'],`${breaker.name} ${breaker.status}`);
  }
});

test('mockup groups: the group keeps a stable id (its first row) and its rows, for measuring and for search', () => {
  const rows=[tool('leggi'),tool('leggi')];
  const once=groupExploration(rows)[0] as any,again=groupExploration([...rows,tool('cerca')])[0] as any;
  assert.equal(once.id,again.id);
  assert.deepEqual(again.tools.map((row:TranscriptToolItem)=>row.id),[...rows.map(row=>row.id),again.tools[2].id]);
});

/* Stage 6c «tutto cliccabile» (mockup open tools item: `    ├ ` … `    └ ` under the title; Claude Code fullscreen: «Click a
   collapsed tool result to expand it … Click again to collapse»). */
test('6c: an open group lists its calls under its title, each on one row that fits the width',()=>{
  const group=groupExploration([tool('leggi'),tool('cerca'),tool('elenca')])[0]! as any;
  const rows=toolGroupOpenRows(group,60);
  assert.equal(rows.length,3);
  assert.match(rows[0]!,/^ {4}├ /u);assert.match(rows[1]!,/^ {4}├ /u);assert.match(rows[2]!,/^ {4}└ /u);
  for(const row of rows)assert.ok(displayWidth(row)<=60,`fits: «${row}»`);
  const narrow=toolGroupOpenRows(group,12);
  for(const row of narrow)assert.ok(displayWidth(row)<=12,`fits a narrow screen: «${row}»`);
});

test('6c: the open set toggles one item and leaves the others',()=>{
  const once=toggleOpenItem(new Set(['a']),'b');
  assert.deepEqual([...once].sort(),['a','b']);
  assert.deepEqual([...toggleOpenItem(once,'a')],['b']);
});
