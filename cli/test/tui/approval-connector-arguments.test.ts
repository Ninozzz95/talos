/*
 * Twin repair of desktop 0.2.2, round 3, CLI side for 0.6.15 (owner 14/11 09:56 «Nella 0.2.2», judge v1852-v1853): the kernel now puts
 * the arguments of a connector, plugin or Tool Forge call on the action of its card, MASKED and CUT (talosHarness.mjs
 * `argomentiPerLaCarta`: `argomenti`, `argomentiTagliati`). Before this repair the terminal card showed every unknown field under
 * «Other details» as raw JSON (approval-dialog.ts reviewText), and the collapsed card showed only the tool.
 * The card must show them readable — `name: value`, a nested object indented under its name —, the secret masked, the cut sign and the
 * line that says values were cut; never raw JSON under «Other details», never a kernel key name.
 * The action below is the one the kernel's gate builds after the repair (talosHarness.mjs `cancelloDelloStrumentoDiFuori`): tipo, toolCallId,
 * nome, server, attrezzo, argomenti, argomentiTagliati, the sentence and its key. As Hermes (tools/mcp_tool_handlers.py:169-170, «Arguments:»
 * at the end of the card) and Codex (codex-rs/core/src/mcp_tool_call.rs:2242-2254, name and value of every parameter).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {approvalDialogLines,approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const SECRET='sk-proj-9f3a1c7e5b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a';
const CUT=`${'Weekly report line. '.repeat(59)}Weekly report …`;
const ACTION={
  tipo:'mcp_tool',toolCallId:'call_arg_1',nome:'mcp__github__create_issue',server:'github',attrezzo:'create_issue',
  argomenti:{title:'Weekly issue',note:'DELETE EVERYTHING',issue:{owner:'acme',labels:['bug','urgent'],meta:{api_key:'[redacted]',milestone:3}},body:CUT},
  argomentiTagliati:1,
  frase:'It wants to use the tool «create_issue» of the connector «github». A connector runs its own program outside TALOS: it needs your yes.',
  fraseChiave:'server.approval.mcpTool',fraseParams:{server:'github',attrezzo:'create_issue'},
};
function pendingFrom(azione:Record<string,unknown>):PendingTuiApproval{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const event=adapter.translate({type:'ApprovalRequested',requestId:'r1',azione}) as any;
  assert.equal(event?.type,'approval.required');
  const payload=event.payload as Record<string,unknown>;
  return{requestId:'r1',sessionId:'s1',action:permissionActionFromApproval(payload),rawPayload:payload,reason:'asks'};
}
const screen=(expanded:boolean,azione:Record<string,unknown>=ACTION)=>approvalDialogLines(approvalDialogModel(pendingFrom(azione),{expanded}),{columns:100}).map(line=>line.kind==='row'?line.text:`${' '.repeat(line.indent)}${line.text}`);

test('CLI-ARG-01: the collapsed card shows every argument readable, name: value, the nested object indented under its name',()=>{
  const lines=screen(false);const text=lines.join('\n');
  assert.ok(lines.some(line=>/^\s+title: Weekly issue$/u.test(line)),text);
  assert.ok(lines.some(line=>/^\s+note: DELETE EVERYTHING$/u.test(line)),text);
  const issue=lines.findIndex(line=>/^\s+issue:$/u.test(line));
  assert.ok(issue>=0,`the nested object has its own line: ${text}`);
  const indent=(line:string)=>line.length-line.trimStart().length;
  const owner=lines.findIndex(line=>/^\s+owner: acme$/u.test(line));
  assert.ok(owner>issue&&indent(lines[owner]!)>indent(lines[issue]!),`the nested field is indented under its name: ${text}`);
  assert.ok(lines.some(line=>/urgent/u.test(line)),'a list stays readable');
});

test('CLI-ARG-02: the secret stays masked, the cut value ends with the cut sign and the card says values were cut',()=>{
  for(const expanded of [false,true]){
    const text=screen(expanded).join('\n');
    assert.ok(!text.includes(SECRET),'no secret');
    assert.match(text,/api_key: \[REDACTED(?::\d+)?\]|api_key: \[redacted\]/u,'the masked key is shown as masked');
    assert.match(text,/body: Weekly report line\./u);
    assert.match(text,/…/u,'the cut sign');
    assert.match(text,/cut on this card/iu,'the line that says values were cut');
  }
});

test('CLI-ARG-03: never raw JSON under «Other details», never a kernel key name on screen',()=>{
  for(const expanded of [false,true]){
    const text=screen(expanded).join('\n');
    assert.doesNotMatch(text,/\{"/u,'no raw JSON object');
    assert.doesNotMatch(text,/argomenti|arguments:|argomentiTagliati|argumentsCut|"title"/u,'no kernel key name');
  }
  const full=screen(true).join('\n');
  const other=full.indexOf('Other details');
  if(other>=0)assert.doesNotMatch(full.slice(other),/title|DELETE EVERYTHING|acme/u,'the arguments are not repeated under «Other details»');
});

/* After the mutants (each must die by two tests): a plugin card, a long list of rows, and the v2 bridge. */
const PLUGIN={tipo:'plugin_tool',toolCallId:'call_arg_2',nome:'plugin__lint__check',plugin:'lint',attrezzo:'check',
  argomenti:{path:'src/a.ts',rules:{semi:true,quotes:'single'}},
  frase:'It wants to use the tool «check» of the plugin «lint».',fraseChiave:'server.approval.pluginTool',fraseParams:{plugin:'lint',attrezzo:'check'}};

test('CLI-ARG-04: a plugin card shows its arguments as rows, the plugin and its tool in words; no raw JSON, no sentence key',()=>{
  for(const expanded of [false,true]){
    const lines=screen(expanded,PLUGIN);const text=lines.join('\n');
    assert.ok(lines.some(line=>/^\s+path: src\/a\.ts$/u.test(line)),text);
    assert.ok(lines.some(line=>/^\s+quotes: single$/u.test(line)),text);
    assert.match(text,/What it sends:/u);
    assert.doesNotMatch(text,/\{"|fraseParams|sentenceParams|sentenceKey|server\.approval\./u,'no raw JSON, no key of the sentence');
    assert.doesNotMatch(text,/cut on this card/iu,'nothing was cut: no line about cuts');
  }
  const full=screen(true,PLUGIN).join('\n');
  assert.match(full,/Plugin\s*:?\s*lint/u,'the plugin in words');
  assert.match(full,/Its tool\s*:?\s*check/u,'its tool in words');
});

test('CLI-ARG-05: many arguments: collapsed, the first rows and how many more «v» shows; expanded, every row',()=>{
  const molti={...ACTION,argomenti:Object.fromEntries(Array.from({length:20},(_,i)=>[`field${i}`,`value ${i}`])),argomentiTagliati:undefined};
  const collapsed=screen(false,molti).join('\n');
  assert.match(collapsed,/field0: value 0/u);
  assert.doesNotMatch(collapsed,/field19: value 19/u,'collapsed, the last row waits for v');
  assert.match(collapsed,/8 more lines/u,'it says how many more');
  const expanded=screen(true,molti).join('\n');
  assert.match(expanded,/field19: value 19/u,'expanded, every row');
  assert.doesNotMatch(expanded,/\{"/u,'never raw JSON');
});

const FORGE={tipo:'forge_tool',toolCallId:'call_arg_3',nome:'forge_daily_note',attrezzo:'daily_note',
  argomenti:{steps:[{name:'collect'},{name:'write'}],...Object.fromEntries(Array.from({length:12},(_,i)=>[`line${i}`,`text ${i}`]))},argomentiTagliati:3,
  frase:'It wants to use the Tool Forge tool «daily_note».',fraseChiave:'server.approval.forgeTool',fraseParams:{attrezzo:'daily_note'}};

test('CLI-ARG-07: a Tool Forge card: its tool in words, a list of objects indented under its name, how many were cut, the rest after v',()=>{
  const lines=screen(false,FORGE);const text=lines.join('\n');
  const indent=(line:string)=>line.length-line.trimStart().length;
  const steps=lines.findIndex(line=>/^\s+steps:$/u.test(line));
  const item=lines.findIndex(line=>/^\s+-$/u.test(line));
  const name=lines.findIndex(line=>/^\s+name: collect$/u.test(line));
  assert.ok(steps>=0&&item>steps&&name>item,text);
  assert.ok(indent(lines[item]!)>indent(lines[steps]!)&&indent(lines[name]!)>indent(lines[item]!),`each level is indented: ${text}`);
  assert.match(text,/Values cut on this card \(…\): 3\./u,'how many were cut');
  assert.doesNotMatch(text,/line11: text 11/u,'collapsed, the last rows wait for v');
  assert.match(text,/more lines/u);
  const full=screen(true,FORGE).join('\n');
  assert.match(full,/line11: text 11/u);
  assert.match(full,/Its tool\s*:?\s*daily_note/u,'its tool in words');
  assert.match(full,/Values cut on this card \(…\): 3\./u);
});

test('CLI-ARG-08: a plugin call through the v2 bridge: English keys only for the arguments and the cut count, the names inside unchanged',()=>{
  const action=(createV2EventBridge('s-1',()=>'2026-11-14T10:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:1,requestId:'q2',azione:{...structuredClone(PLUGIN),argomentiTagliati:2}})?.data as any).action;
  assert.deepEqual(Object.keys(action).filter(key=>/^argoment/u.test(key)),[],'no kernel key left');
  assert.equal(action.argumentsCut,2);
  assert.equal(action.arguments?.path,'src/a.ts','the tool\'s own names are kept');
  assert.equal(action.arguments?.rules?.quotes,'single');
});

/* As the PC card after the checker of round 1 (judge v1856): a field name of 289 characters must never hide its value. Collapsed, a row is
   folded at two lines, so a long name gets its own row and its value goes on the row under it. */
const NOME_LUNGO=`note_${'x'.repeat(280)}_END`;
test('CLI-ARG-09: collapsed, the value of a very long field name is on its own row, whole and visible',()=>{
  const lines=screen(false,{...ACTION,argomenti:{[NOME_LUNGO]:'DELETE EVERYTHING',title:'Weekly issue'},argomentiTagliati:undefined});
  const text=lines.join('\n');
  assert.ok(lines.some(line=>/^\s+DELETE EVERYTHING$/u.test(line)),`the value has its own visible row: ${text}`);
  assert.ok(lines.some(line=>/^\s+title: Weekly issue$/u.test(line)),'a short name stays beside its value');
});

test('CLI-ARG-10: a long field name in a plugin card, in the full review too: the value under it, indented one more step',()=>{
  for(const expanded of [false,true]){
    const lines=screen(expanded,{...PLUGIN,argomenti:{[NOME_LUNGO]:'rm -rf build',path:'src/a.ts'}});
    const value=lines.findIndex(line=>/^\s+rm -rf build$/u.test(line));
    const indent=(line:string)=>line.length-line.trimStart().length;
    const name=lines.findIndex(line=>line.includes('note_xxxx'));
    assert.ok(value>name&&name>=0,`${expanded}: the value comes after its name: ${lines.join('\n')}`);
    assert.ok(indent(lines[value]!)>indent(lines[name]!),`${expanded}: the value is indented under its name`);
    assert.ok(lines.some(line=>/^\s+path: src\/a\.ts$/u.test(line)));
  }
});

test('CLI-ARG-06: the v2 bridge carries the arguments in English keys, the masked key stays masked, the cut count is there',()=>{
  const action=(createV2EventBridge('s-1',()=>'2026-11-14T10:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:1,requestId:'q1',azione:structuredClone(ACTION)})?.data as any).action;
  assert.equal(action.arguments?.title,'Weekly issue','the arguments under «arguments»');
  assert.equal(action.argumentsCut,1,'the cut count under «argumentsCut»');
  assert.equal(action.argomenti,undefined,'never the kernel key');
  assert.ok(!JSON.stringify(action).includes(SECRET),'no secret');
  assert.match(JSON.stringify(action.arguments.issue.meta.api_key),/REDACTED|redacted/u,'the key stays masked');
});

/* Twin repair of desktop 0.2.2, round 4 (owner 14/11 12:59, judge v1865-v1868): the kernel cuts a NAME at 1,200 characters too, and two
   names equal in their first 1,199 became one: the second value overwrote the first. Now the kernel numbers a name that would repeat one
   already on the card, right after it: «pppp…», «pppp…(2)», «pppp…(3)» (talosHarness.mjs `argomentiPerLaCarta`). The action below is the
   one the kernel builds after that repair. On the terminal a long name is folded at three lines when the card is collapsed, so a number at
   the END of 1,203 characters was folded away and the two rows looked the same: the number must be seen on the collapsed card. */
const TAGLIATO=`${'p'.repeat(1199)}…`;
const NOME_SCRITTO=`report_${'w'.repeat(50)}`; // a long name the model wrote, ending in «(2)» without the cut sign
const firstLine=(lines:string[],value:RegExp)=>{const at=lines.findIndex(line=>value.test(line));return at;};
test('CLI-ARG-11: collapsed, two long names that start the same stay two rows, each with its value, and the number «(2)» is seen',()=>{
  const lines=screen(false,{...ACTION,argomenti:{[TAGLIATO]:'DELETE EVERYTHING',[`${TAGLIATO}(2)`]:'rm -rf build',title:'Weekly issue','pp…(2)':'two',[`${NOME_SCRITTO}(2)`]:'as written'},argomentiTagliati:2});
  const text=lines.join('\n');
  const second=firstLine(lines,/^\s+\(2\) p{20}/u);
  assert.ok(second>=0,`the number of the second name is on the collapsed card: ${text}`);
  assert.ok(lines.some(line=>/^\s+DELETE EVERYTHING$/u.test(line)),'the first value has its own row');
  assert.ok(lines.findIndex(line=>/^\s+rm -rf build$/u.test(line))>second,'the second value comes under the numbered name');
  assert.equal(lines.filter(line=>/^\s+\(\d+\) p/u.test(line)).length,1,'only the repeated name carries a number');
  assert.ok(lines.some(line=>/^\s+title: Weekly issue$/u.test(line)));
  assert.ok(lines.some(line=>/^\s+pp…\(2\): two$/u.test(line)),'a short numbered name is shown as the kernel wrote it');
  assert.ok(lines.some(line=>line.trimStart().startsWith(`${NOME_SCRITTO}(2):`)),'a long name the model wrote with «(2)» and no cut sign stays as written');
});

test('CLI-ARG-12: a plugin card with three numbered long names, collapsed and expanded: «(2)» and «(3)» seen, every value under its name',()=>{
  for(const expanded of [false,true]){
    const lines=screen(expanded,{...PLUGIN,argomenti:{[TAGLIATO]:'one',[`${TAGLIATO}(2)`]:'two',[`${TAGLIATO}(3)`]:{path:'src/three.ts'}},argomentiTagliati:3});
    const text=lines.join('\n');
    const two=firstLine(lines,/^\s+\(2\) p/u);const three=firstLine(lines,/^\s+\(3\) p/u);
    assert.ok(two>=0&&three>two,`${expanded}: both numbers are seen, in order: ${text}`);
    assert.ok(firstLine(lines,/^\s+two$/u)>two&&firstLine(lines,/^\s+two$/u)<three,`${expanded}: «two» under «(2)»`);
    assert.ok(firstLine(lines,/^\s+path: src\/three\.ts$/u)>three,`${expanded}: the object under «(3)» opens under it`);
    if(expanded)assert.ok(lines.map(line=>line.trimStart()).join('').includes(`${'p'.repeat(40)}…:`),'expanded, the whole name ends with the cut sign');
  }
});

test('CLI-ARG-13: a Tool Forge card, collapsed: «(2)» and «(10)» seen before their objects, the bare cut sign and its number as written',()=>{
  const lines=screen(false,{...FORGE,argomenti:{[TAGLIATO]:{a:1},[`${TAGLIATO}(2)`]:{b:2},[`${TAGLIATO}(10)`]:'ten','…':'z','…(2)':'…',[`${NOME_SCRITTO}(3)`]:'kept'},argomentiTagliati:4});
  const text=lines.join('\n');
  const two=firstLine(lines,/^\s+\(2\) p/u);const ten=firstLine(lines,/^\s+\(10\) p/u);
  assert.ok(two>=0&&ten>two,`«(2)» and «(10)» are seen: ${text}`);
  assert.ok(firstLine(lines,/^\s+b: 2$/u)>two&&firstLine(lines,/^\s+b: 2$/u)<ten,'the object of «(2)» opens under it');
  assert.ok(firstLine(lines,/^\s+ten$/u)>ten,'the value of «(10)» under it');
  assert.ok(lines.some(line=>/^\s+…: z$/u.test(line)),'the name cut to the bare cut sign keeps its value');
  assert.ok(lines.some(line=>/^\s+…\(2\): …$/u.test(line)),'the sign of the names left out, numbered, as written');
  assert.ok(lines.some(line=>line.trimStart().startsWith(`${NOME_SCRITTO}(3):`)),'a long name the model wrote with «(3)» and no cut sign stays as written');
});
