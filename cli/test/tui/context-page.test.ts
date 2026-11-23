/* C4 of the redesign: the Context Manager page. The fixed row, what each tab holds, and what a key turns into: a change the app sends with the revision it read, never a change of its own. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type {CliContextStatus} from '../../src/runtime/types.ts';
import {contextSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {contextCompactionItems,contextFactItems,contextHeadRows,contextKeptRows,contextOverviewRows,contextVersionItems,type ContextPageData,type ContextVersion} from '../../src/tui/panel/context-page.ts';
import {pageRows} from '../../src/tui/panel/page.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(text).join('\n');
const status=(over:Partial<CliContextStatus>={}):CliContextStatus=>({schema:'talos.cli.context-status.v1',sessionId:'s',available:true,reason:null,
  measurement:{inputTokens:120_000,windowTokens:200_000,percentOfWindow:60,responseReserve:39_000,method:'provider',exact:true},budget:null,
  autoCompaction:{enabled:true,triggerRatio:.75,triggerPercent:75,targetRatio:.55,provenance:'x'},
  parts:{system:4000,tools:6000,mcp:0,memory:1000,messages:109_000,exact:false},lastRequest:{at:null,messages:14,tools:30},...over} as unknown as CliContextStatus);
const NOW=Date.parse('2026-11-01T12:00:00Z');
const version=(over:Partial<ContextVersion>={}):ContextVersion=>({id:'v1',model:{provider:'openai',model:'sol-6.1'},createdAt:'2026-11-01T11:59:00Z',sourceIds:['a','b'],measurement:{inputTokens:30_000},summary:{text:'What was done.'},...over});
const data=(over:Partial<ContextPageData>={}):ContextPageData=>({status:status(),snapshot:{revision:7,settings:{retainRecentTurns:2,focus:'',model:{mode:'follow-session'}},activeVersion:{id:'v2'},facts:[{id:'f1',text:'Keep the API stable'},{id:'f2',text:'old',status:'conflict',conflict:{proposedText:'new'}},{id:'f3',text:'gone',status:'removed'}]},versions:[version({id:'v2',restoredFrom:'v1'}),version()],overTime:[10,20,30],now:NOW,...over});

test('the fixed row says how full the window is, and asks once before compacting',()=>{
  const rows=contextHeadRows(status(),false);
  assert.match(all(rows),/120k of 200k · 60% {3}model window · compacts itself at 75%/u);
  assert.match(all(rows),/Compact now…/u);assert.ok(rows.flat().some(segment=>segment.action==='pkey:c'));
  assert.match(all(contextHeadRows(status(),true)),/Compact now\? The originals stay available\. c confirm · esc cancel/u);
  assert.match(all(contextHeadRows(status({measurement:null} as Partial<CliContextStatus>),false)),/Not measured yet/u);
});

test('Overview: the parts with their shares, the ~ only on what is an estimate, and the last request as counted',()=>{
  const lines=all(contextOverviewRows(data(),100,30));
  assert.match(lines,/Messages +~109k +55%/u);assert.match(lines,/Memory +~1k +<1%|Memory +~1k +1%/u);assert.doesNotMatch(lines,/MCP tools/u,'a part at zero is not drawn');
  assert.doesNotMatch(lines,/Last request/u,'owner 01/11: the line moved to «Request sent»');assert.match(lines,/39k reserved for the answer/u);assert.match(lines,/Over time +~ 3 turns/u);
  const exact=all(contextOverviewRows(data({status:status({parts:{system:1,tools:1,mcp:1,memory:1,messages:1000,exact:true}} as Partial<CliContextStatus>)}),100,30));
  assert.doesNotMatch(exact,/~1k/u);
  for(const width of [40,60,80,120])assert.ok(contextOverviewRows(data(),width,24).every(row=>displayWidth(text(row))<=width),`too wide at ${width}`);
  assert.match(all(contextOverviewRows(data({status:status({available:false,measurement:null} as Partial<CliContextStatus>)}),100,30)),/No context engine for this conversation/u);
});

test('Compactions are numbered from the oldest, a restore is not one, and only the model of the work is named',()=>{
  const items=contextCompactionItems([version({id:'v3'}),version({id:'v2',restoredFrom:'v1'}),version()],NOW);
  assert.deepEqual(items.map(item=>item.label),['Compaction 2','Compaction 1']);
  assert.equal(items[0]!.meta,'sol-6.1');assert.match(items[0]!.desc!,/30k tokens after · .* ago/u);
  assert.doesNotMatch(JSON.stringify(items),/rules/u,'the version does not say who wrote it');
});

test('Versions mark the one in use, and what a version kept is said, or that it does not say',()=>{
  const items=contextVersionItems([version({id:'v2',restoredFrom:'v1'}),version()],'v2',NOW);
  assert.deepEqual(items.map(item=>[item.label,Boolean(item.current)]),[['Version 2, restored',true],['Version 1',false]]);
  assert.match(items[1]!.desc!,/2 sources/u);
  const kept=all(contextKeptRows(version({retained:{personRequests:{total:5,kept:[{n:3,text:'Fix the login'}]}}}),40));
  assert.match(kept,/1 of 5 of your requests kept/u);assert.match(kept,/3\. Fix the login/u);assert.match(kept,/What was done\./u);
  assert.match(all(contextKeptRows(version({summary:null}),40)),/does not say what it kept/u);
});

test('Keep in mind: a conflict shows the proposal with its badge, a removed fact is gone',()=>{
  const items=contextFactItems(data().snapshot!.facts!);
  assert.deepEqual(items.map(item=>item.label),['Keep the API stable','new']);
  assert.equal(items[0]!.badge,undefined);assert.equal(items[1]!.badge,'Proposal to check');
});

const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const action=(sheet:SheetState,key:string)=>press(sheet,key).action as Record<string,unknown>|null;

test('c asks over every tab, a second c goes to /compact, any other key takes the question back',()=>{
  for(const tab of [0,1,2,3,4]){
    const first=press(contextSheet(data(),{tab}),'c');
    assert.equal(first.action,null);assert.match(all(pageRows(first.sheet!.panel,100,20)),/c confirm · esc cancel/u,`tab ${tab}`);
    assert.deepEqual(press(first.sheet!,'c').action,{kind:'runCommand',name:'compact'});
  }
  assert.equal(press(contextSheet(data({versions:[]}),{tab:1}),'c').action,null);
  assert.match(all(pageRows(press(contextSheet(data({versions:[]}),{tab:1}),'c').sheet!.panel,100,20)),/c confirm/u,'an empty list takes the key too');
  const asked=press(contextSheet(data()),'c').sheet!;
  const back=press(asked,'Escape').sheet!;
  assert.equal(back.name,'context','Esc takes the question back and leaves the page open');
  assert.doesNotMatch(all(pageRows(back.panel,100,20)),/c confirm/u);
  assert.equal(press(back,'Escape').sheet,null,'a second Esc closes it');
  const moved=press(asked,'Tab').sheet!;assert.doesNotMatch(all(pageRows(moved.panel,100,20)),/c confirm/u);
});

test('a fact is added, accepted and removed as changes for the app to send, and an empty one is nothing',()=>{
  let sheet=press(contextSheet(data(),{tab:2}),'n').sheet!;
  assert.equal(sheet.panel.edit?.label,'Fact to keep:');
  for(const ch of 'Never')sheet=press(sheet,ch).sheet!;
  assert.deepEqual(action(sheet,'Enter'),{kind:'contextChange',method:'POST',path:'/facts',body:{fact:{text:'Never',sources:[]}},done:'panel.context.factAdded',tab:2});
  assert.equal(action(press(contextSheet(data(),{tab:2}),'n').sheet!,'Enter'),null);
  const onProposal=press(contextSheet(data(),{tab:2}),'ArrowDown').sheet!;
  assert.equal((action(onProposal,'a') as any).path,'/facts/f2/resolve');
  assert.equal(action(contextSheet(data(),{tab:2}),'a'),null,'nothing to accept on a plain fact');
  const asked=press(contextSheet(data(),{tab:2}),'d').sheet!;
  assert.deepEqual(action(asked,'d'),{kind:'contextChange',method:'DELETE',path:'/facts/f1',done:'panel.context.factRemoved',tab:2});
});

test('Enter on a version goes back to it, not on the one in use; Settings sends only what acts in the CLI',()=>{
  assert.equal(action(contextSheet(data(),{tab:3}),'Enter'),null,'the one in use');
  const other=press(contextSheet(data(),{tab:3}),'ArrowDown').sheet!;
  assert.deepEqual(action(other,'Enter'),{kind:'contextChange',method:'POST',path:'/versions/v1/restore',done:'panel.context.restored',tab:3});
  const settings=contextSheet(data(),{tab:4});
  const shown=all(pageRows(settings.panel,100,20));
  assert.match(shown,/Recent exchanges to keep +2/u);assert.match(shown,/Compaction instructions +none/u);
  assert.match(shown,/Set by the CLI: starts by itself at 75%, the compaction model is Follow the chat model\./u);
  assert.doesNotMatch(shown,/Start automatically|Manage automatically/u,'what the CLI rewrites at every turn is not offered');
  let editing=press(settings,'Enter').sheet!;
  assert.equal(editing.panel.edit?.value,'2');
  editing=press(editing,'Backspace').sheet!;editing=press(editing,'5').sheet!;
  assert.deepEqual(action(editing,'Enter'),{kind:'contextChange',method:'PATCH',path:'/settings',body:{patch:{retainRecentTurns:5}},done:'panel.context.settingsSaved',tab:4});
  let bad=press(settings,'Enter').sheet!;bad=press(bad,'9').sheet!;bad=press(bad,'9').sheet!;
  assert.equal((action(bad,'Enter') as any).kind,'notice','229 exchanges are refused here, with the reason');
  let focus=press(press(settings,'ArrowDown').sheet!,'Enter').sheet!;focus=press(focus,'x').sheet!;
  assert.deepEqual(action(focus,'Enter'),{kind:'contextChange',method:'PATCH',path:'/settings',body:{patch:{focus:'x'}},done:'panel.context.settingsSaved',tab:4});
});

test('with no engine the tabs say why, and nothing can be changed',()=>{
  const sheet=contextSheet(data({snapshot:null,versions:[]}),{tab:2});
  assert.match(all(pageRows(sheet.panel,100,20)),/Not available: this conversation has no context engine\./u);
  assert.equal(action(sheet,'n'),null);assert.equal(action(contextSheet(data({snapshot:null,versions:[]}),{tab:3}),'Enter'),null);
});
