/*
 * R2 lane T (gate E3, Q-R2-3; review D-07 and D-05): the transcript's tool rows read the ONE tool table. Before R2 no
 * kernel tool name matched a renderer key (`Read`/`Write`/`Bash`…), so every row fell to the generic renderer and printed
 * `leggi · completed / args {"percorso":…}`. The kernel names and argument keys below are the ones the model really
 * sends (talosHarness.mjs:1571-2810); the table maps them for display and never renames them (gate E2).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {rendererForTool,renderTool,type ToolRowModel} from '../../src/tui/tools/registry.ts';

const row=(name:string,args:unknown,output='',status:ToolRowModel['status']='completed'):ToolRowModel=>({id:'t1',name,status,argsText:typeof args==='string'?args:JSON.stringify(args),liveOutput:'',finalOutput:output,startedAt:0,endedAt:10});
const text=(r:{title:string;detailLines:string[]})=>[r.title,...r.detailLines].join('\n');

test('R2 T: the core kernel tools get their dedicated renderer through the table',()=>{
  assert.deepEqual(['leggi','scrivi','file_edit','shell','prova','cerca'].map(name=>rendererForTool(name).kind),['read','write','edit','bash','bash','search']);
  assert.equal(rendererForTool('notes_create').kind,'generic');
  assert.equal(rendererForTool('mcp__github__create_issue').kind,'generic');
});

test('R2 T: s07\'s three kernel calls render as English label + primary argument (Q-R2-3)',()=>{
  const rows=[
    row('leggi',{percorso:'README.md'}),
    row('shell',{comando:'cmd /c dir /b'},'README.md\nsrc'),
    row('scrivi',{percorso:'notes.txt',contenuto:'one\ntwo'}),
  ];
  /* R3 Q-R3-1 (owner 2026-09-24; gate §2.3 "one space apart, today two"): label and target one space apart; the write
     and edit summaries move onto the row (`statusLabel`, Q-R3-4) and the edit count is the real line diff (E10). */
  assert.deepEqual(rows.map(r=>renderTool(r,100,false).title),['Read file README.md','Shell cmd /c dir /b','Write file notes.txt']);
  assert.deepEqual(renderTool(rows[2]!,100,false).detailLines,[]);
  assert.equal(renderTool(rows[2]!,100,false).statusLabel,'2 lines');
  const edit=renderTool(row('file_edit',{percorso:'src/a.ts',old_string:'a\nb',new_string:'a\nc\nd'}),100,false);
  assert.deepEqual([edit.title,edit.statusLabel,edit.detailLines],['Edit file src/a.ts','+2 −1',[]]);
  assert.equal(renderTool(row('cerca',{testo:'needle'},'a.ts\nb.ts'),100,false).title,'Search files needle');
  assert.equal(renderTool(row('prova',{},'ok'),100,false).title,'Run tests');
});

test('R2 T: the shell row shows the description the model gave, then the output',()=>{
  const rendered=renderTool(row('shell',{comando:'git diff main',descrizione:'List files changed since main'},'a.ts'),100,false);
  assert.deepEqual(rendered.detailLines,['List files changed since main','a.ts']);
});

/* One realistic call per shape the kernel accepts, nested objects and arrays included (document_create, research_deposit,
   tool_create, library_delete). */
const GENERIC_CALLS:[string,Record<string,unknown>][]=[
  ['elenca',{percorso:'src'}],['naviga',{url:'https://example.org/docs'}],['web_search',{query:'node 24 release',maxResults:3}],
  ['artifact_create',{titolo:'Sales chart',html:'<!doctype html><html><body>{"x":1}</body></html>'}],
  ['document_create',{format:'docx',title:'Report',report:{blocks:[{type:'p',text:'x'}],theme:'plain'},slides:[{title:'a',bullets:['b']}]}],
  ['delega_sottotask',{task:'Summarise the tests',cartella:'C:\\work'}],['carica_skill',{nome:'pdf'}],
  ['library_delete',{id:'f1',ids:['f1','f2']}],['library_context_policy_update',{action:'set_mode',expected_revision:3,mode:'smart_relevant_v1'}],
  ['research_deposit',{parte:{indice:1,ultima:true},testo:'# Title\n\nBody',affermazioni:[{testo:'a',fonte:'https://x',passaggio:'b'}],fonti:[{url:'https://x',titolo:'X'}]}],
  ['tool_create',{id:'log-water',title:'Log water',description:'Logs water',flow:{entry:'a',nodes:[{id:'a',type:'return',value:1}]}}],
  ['mcp__github__create_issue',{title:'Bug',labels:['a'],body:{text:'x'}}],
];

test('R2 T: the generic renderer labels arguments in English and never prints an object or array as JSON (D-07)',()=>{
  const failures:string[]=[];
  for(const [name,args] of GENERIC_CALLS)for(const expanded of [false,true]){
    const shown=text(renderTool(row(name,args,'done'),100,expanded));
    if(/\{"|"\w+":|\[\{|\bargs \{/u.test(shown.replaceAll('<!doctype html><html><body>{"x":1}</body></html>','')))failures.push(`${name}${expanded?' (expanded)':''}:\n${shown}`);
    for(const key of ['percorso','contenuto','comando','descrizione','testo','nome','titolo','cartella','parte','affermazioni','fonti'])
      if(new RegExp(`(^|\\s)${key}:`,'u').test(shown))failures.push(`${name}: raw key ${key}\n${shown}`);
  }
  assert.deepEqual(failures,[],failures.join('\n\n'));
  const research=text(renderTool(row('research_deposit',GENERIC_CALLS[9]![1]),100,true));
  assert.match(research,/^claims: 1 item$/mu);assert.match(research,/^sources: 1 item$/mu);assert.match(research,/^part: 2 fields$/mu);
  assert.match(research,/^text: 13 bytes · 3 lines$/mu,'a multi-line text is summarised, not dumped');
});

test('R2 T: argument VALUES are data and are shown as they are, even when they look like JSON',()=>{
  const artifact=renderTool(row('artifact_create',{titolo:'Chart',html:'{"not":"parsed"}'}),120,true);
  assert.equal(artifact.title,'Create artifact Chart'); // R3 Q-R3-1: one space between label and target
  assert.ok(artifact.detailLines.includes('HTML: {"not":"parsed"}'),artifact.detailLines.join('\n'));
});

test('R2 T: arguments still streaming in are never shown as partial JSON',()=>{
  const partial=renderTool(row('leggi','{"percorso":"READ',undefined,'queued'),100,false);
  /* twin repair of desktop 0.2.2, round 8 (reviewer 3, R1): a value still open reads «…» until it closes, never a piece of it (was «Read file READ») */
  assert.equal(partial.title,'Read file …','a truncated string value is shown as «…» (R3 Q-R3-1: one space)');
  for(const argsText of ['{"titolo":"Sa','{"report":{"blocks":[{"ty','{"a'])
    assert.doesNotMatch(text(renderTool(row('document_create',argsText,undefined,'queued'),100,true)),/\{"/u,argsText);
});

test('R2 T: the raw kernel name appears only in the expanded detail (Q-R2-3)',()=>{
  const r=row('leggi',{percorso:'README.md'});
  assert.doesNotMatch(text(renderTool(r,100,false)),/leggi/u);
  assert.ok(renderTool(r,100,true).detailLines.includes('tool id leggi'));
});
