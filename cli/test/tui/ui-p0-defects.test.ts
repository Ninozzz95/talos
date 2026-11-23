/*
 * UI plan, Phase 0 (27/09): the defects seen in the synthetic-terminal frames (docs/talos-cli/2026-09-27-ui-improvements-
 * research-and-plan.md §7), each pinned by the frame that showed it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {outputTail,sanitizeDisplayText} from '../../src/tui/tools/shared.ts';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import type {ToolRowModel} from '../../src/tui/tools/registry.ts';
import {createTuiTheme,themeColor} from '../../src/tui/theme.ts';
import {TALOS_THEME_ACCENTS,themePalette} from '../../src/tui/theme-catalog.ts';
import {approvalDialogModel,shownReason} from '../../src/tui/overlays/approval-dialog.ts';
import {t} from '../../src/i18n/index.ts';
import {sessionStatusText} from '../../src/tui/shell-model.ts';
import {usageLine} from '../../src/tui/status-view.ts';
import {paintedBorders} from '../../src/tui/components/terminal-shell.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import {createSessionMetadataStore} from '../../src/sessions/metadata-store.ts';
import {filterSessions,normalizeSessions} from '../../src/tui/overlays/session-picker.ts';
import {budget} from '../../src/tui/regions/budget.ts';
import {errorViewLines} from '../../src/i18n/error-view.ts';
import {markdownBlockLines,markdownListItemLines,parseMarkdownBlocks} from '../../src/tui/components/markdown.ts';

test('D12: a Windows command output (CRLF) shows no blank line between its lines', () => {
  /* What `cmd /c dir /b` really returned to the fake provider in the frame run. */
  const {lines,hidden}=outputTail('README.md\r\nsrc\r\n',8);
  assert.deepEqual(lines.map(sanitizeDisplayText),['README.md','src']);
  assert.equal(hidden,0);
});

test('D12: an old Mac line end (lone CR) is still a line end, and the count of hidden lines is by real lines', () => {
  const {lines,hidden}=outputTail('a\rb\r\nc\nd',2);
  assert.deepEqual(lines,['c','d']);
  assert.equal(hidden,2);
});

const NOW=1_000_000;
const row=(name:string,args:unknown,over:Partial<ToolRowModel&{savedOutput:{path:string;keptChars:number;totalChars:number}}>={}):ToolRowModel=>({id:'t1',name,status:'completed',argsText:JSON.stringify(args),liveOutput:'',finalOutput:'',startedAt:NOW-10_000,endedAt:NOW-9_900,outcome:null,...over});
const lines8=Array.from({length:8},(_,i)=>`line ${i+1}`).join('\n')+'\n';

test('D14: the count of hidden lines stands ABOVE the tail it precedes (Pi, Codex), and the live elapsed stays under it', () => {
  const done=toolRowView(row('shell',{comando:'npm test'},{finalOutput:lines8}),120,false,NOW);
  assert.deepEqual(done.detailLines,['… +3 earlier lines','line 4','line 5','line 6','line 7','line 8']);
  const running=toolRowView(row('shell',{comando:'npm test'},{status:'streaming',liveOutput:lines8,startedAt:NOW-3_200}),120,false,NOW);
  assert.deepEqual(running.detailLines,['… +3 earlier lines','line 4','line 5','line 6','line 7','line 8','3.2 s']);
});

test('D14: when the executor kept only part of the output, the lines above are a lower bound, said once', () => {
  const saved={path:String.raw`C:\data\TALOS-CLI\tool-output\s1\1-a.txt`,keptChars:4000,totalChars:52891};
  const view=toolRowView(row('shell',{comando:'print'},{finalOutput:lines8,savedOutput:saved} as any),120,false,NOW);
  assert.ok(view.detailLines.includes('… 3+ earlier lines'),view.detailLines.join('\n'));
});

test('D13: the path of a saved output has a line of its own, so at 100 columns it is not broken by the fact before it', () => {
  const path=String.raw`C:\Users\someone\AppData\Local\TALOS-CLI\tool-output\80c8ffcb-a5c7-402c-a3f4-1af1621220d3\1790468706212-61b3d88c-ed4.txt`;
  const saved={path,keptChars:4000,totalChars:52891};
  const view=toolRowView(row('shell',{comando:'print'},{finalOutput:'x\n',savedOutput:saved} as any),120,false,NOW);
  assert.deepEqual(view.detailLines.slice(0,2),['kept 4,000 of 52,891 characters · full output:',path]);
});

test('D10: on a Unicode terminal a wide table is drawn with box lines (Pi, OpenCode, Claude Code), every row as wide', () => {
  const block=parseMarkdownBlocks('| File | Lines |\n| --- | ---: |\n| README.md | 1 |\n| src/index.js | 12 |')[0]!;
  const layout=markdownBlockLines(block,80,{unicode:true});
  assert.equal(layout.mode,'wide');
  assert.deepEqual(layout.lines,[
    '┌──────────────┬───────┐',
    '│ File         │ Lines │',
    '├──────────────┼───────┤',
    '│ README.md    │     1 │',
    '│ src/index.js │    12 │',
    '└──────────────┴───────┘',
  ]);
  assert.deepEqual(layout.roles,['border','header','border','row','row','border']);
  /* without Unicode the ASCII form stays (R3 D-13) */
  assert.deepEqual(markdownBlockLines(block,80).lines[1],'-------------+------');
});

test('D10: a box table that does not fit falls back to the narrow form, never wider than the screen', () => {
  const block=parseMarkdownBlocks('| File | Lines |\n| --- | --- |\n| README.md | 1 |')[0]!;
  const layout=markdownBlockLines(block,20,{unicode:true});
  assert.equal(layout.mode,'narrow');
});

test('D7: a list item that wraps keeps its text under the text, not under the bullet (hanging indent)', () => {
  const lines=markdownListItemLines({prefix:'• ',text:'Second step with a very long line that should wrap nicely inside the transcript',width:30});
  assert.deepEqual(lines,['• Second step with a very long','  line that should wrap nicely','  inside the transcript']);
  const numbered=markdownListItemLines({prefix:'10. ',text:'alpha beta gamma delta',width:14});
  assert.deepEqual(numbered,['10. alpha beta','    gamma','    delta']);
});

const luminance=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]!+0.7152*c[1]!+0.0722*c[2]!;};
const contrast=(a:string,b:string)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x!+0.05)/(y!+0.05);};

/* Stage 7 (the approved mockup's palette, owner 02/10): the dim text is the mockup's neutral dim, no longer the accent mixed
   into the background; D3's floor still holds for dim and for faint (raised to 4.5:1 by the owner's decision). */
test('D3: the dim and faint text of every theme read at WCAG AA (4.5:1) on its own background; dim is the mockup\'s', () => {
  for(const accent of TALOS_THEME_ACCENTS){
    const theme=createTuiTheme({interactive:true,color:true,motion:true,unicode:true},accent.id);
    const muted=themeColor(theme,'footer')!;
    assert.ok(contrast(muted,accent.background)>=4.5,`${accent.id}: ${muted} on ${accent.background} is ${contrast(muted,accent.background).toFixed(2)}`);
    assert.ok(contrast(theme.colors.faint!,accent.background)>=4.5,`${accent.id}: faint ${theme.colors.faint}`);
    assert.equal(muted,themePalette(accent).dim,`${accent.id}: the mockup's dim`);
  }
});

test('D17: the approval says in words why it asks; the engine reason reaching the model and the logs is unchanged', () => {
  assert.equal(shownReason('no rule matched'),'no rule allows or blocks this, so TALOS asks');
  assert.equal(shownReason('segment 2: no rule matched'),'segment 2: no rule allows or blocks this, so TALOS asks');
  assert.equal(shownReason('matched ask rule'),'matched ask rule');
  const model=approvalDialogModel({requestId:'r',sessionId:'s',action:{tool:'Bash',command:'cmd /c dir /b'},rawPayload:{command:'cmd /c dir /b'},reason:'no rule matched'} as any,{expanded:false,selected:0} as any);
  assert.equal(model.reason,'no rule allows or blocks this, so TALOS asks');
});

test('D26: a provider 5xx headline does not repeat the status the details line already gives', () => {
  assert.equal(t('error.provider.serverError.what'),'The model provider had an internal error.');
});

test('D22: /status says what its numbers count, and a context window it does not know in words', () => {
  const block=sessionStatusText({session:'s',running:false,model:'ollama:m',mode:'default',tools:6});
  assert.match(block,/^  tools    6 calls so far$/mu);
  const usage=usageLine({inputTokens:2400,outputTokens:680,contextTokens:null,windowTokens:null,percent:null} as any,'ollama:m');
  assert.ok(usage&&!usage.includes('ctx ?')&&usage.includes('context window unknown'),String(usage));
});

test('D2: a bordered box takes the painted background on its border too; an unpainted session and an explicit colour are left alone', async () => {
  const React=(await import('react')).default;
  const FakeBox=()=>null;
  let background:string|undefined='#080b11';
  const Painted=paintedBorders(React,{Box:FakeBox,Text:'t'},()=>background);
  /* the forwardRef render function gives the element it would draw: its props are what Ink.Box receives */
  const render=(props:any)=>(Painted.Box as any).render(props,null).props;
  assert.equal(render({borderStyle:'single'}).borderBackgroundColor,'#080b11');
  assert.equal(render({flexDirection:'column'}).borderBackgroundColor,undefined,'no border: nothing added');
  assert.equal(render({borderStyle:'round',borderBackgroundColor:'red'}).borderBackgroundColor,'red','an explicit colour wins');
  background=undefined;
  assert.equal(render({borderStyle:'single'}).borderBackgroundColor,undefined,'a session that does not paint adds nothing');
  assert.equal(Painted.Text,'t','the rest of Ink is the same');
});

test('D23: the first message titles a session in the resume list; the person\'s own name still wins; the id stays searchable', async () => {
  const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const root=mkdtempSync(join(tmpdir(),'talos-d23-'));
  try{
    const store=createSessionMetadataStore({rootDir:root});
    await store.setFirstMessage('s1','  explain\nhow this   project is built  ');
    await store.setFirstMessage('s1','a later message');
    assert.equal((await store.get('s1'))?.firstMessage,'explain how this project is built','set once, whitespace folded');
    await store.setFirstMessage('s2','x'.repeat(200));
    assert.equal((await store.get('s2'))?.firstMessage,'x'.repeat(79)+'…','80 characters at most');
    await store.setFirstMessage('s3','bad\u001b[31m text');
    assert.equal((await store.get('s3'))?.firstMessage,'bad [31m text','control characters never reach the file');
  }finally{rmSync(root,{recursive:true,force:true});}
  const row={sessionId:'80c8ffcb-a5c7',id:'80c8ffcb-a5c7',depth:0,outcome:'completed',collisions:[]};
  assert.equal(normalizeSessions([{...row,firstMessage:'explain the build'}])[0]!.title,'explain the build');
  assert.equal(normalizeSessions([{...row,firstMessage:'explain the build',metadataName:'Build notes'}])[0]!.title,'Build notes');
  assert.equal(normalizeSessions([row])[0]!.title,'80c8ffcb-a5c7');
  assert.equal(filterSessions(normalizeSessions([{...row,firstMessage:'explain the build'}]),'80c8').length,1);
});

test('D9/D18/D28: with no agent rows the queue and reasoning lines keep their room; a roster that is dropped still takes them with it', () => {
  const input={rows:30,columns:100,frameRows:29,composerLines:1,composerHints:1,header:1,shortcut:1,roster:0,extras:1,footer:1,status:1};
  assert.equal(budget(input as any).extras,1,'no agent rows: the queue line still shows');
  const tight={...input,rows:12,frameRows:11,roster:2,extras:1};
  const b=budget(tight as any);
  if(b.roster===0)assert.equal(b.extras,0,'a dropped roster drops its queue/reasoning lines (E13 order)');
});

test('D26 (owner 27/09 "yes"): a command at the end of the details line says what to do with it — "see talos …"', () => {
  const lines=errorViewLines({what:'W',todo:'T',where:'talos provider list',code:'PROVIDER_REQUEST_ERROR',detail:'HTTP 500',raw:null} as any);
  assert.equal(lines[2],'Details: HTTP 500 · (PROVIDER_REQUEST_ERROR) · see talos provider list');
  const sentence=errorViewLines({what:'W',todo:null,where:'/context shows the window TALOS measured.',code:null,detail:null,raw:null} as any);
  assert.equal(sentence[1],'Details: /context shows the window TALOS measured.','a where that is already a sentence stays as it is');
});
