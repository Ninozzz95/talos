/*
 * R1 lane O (Q-R1-3, gate E1/E3/E4): every overlay and the slash-command menu is capped to the `maxRows` lane L
 * computes (frame − composer − 1 status row) and scrolls inside it. Each overlay is rendered through the real Ink 7.1.1
 * `renderToString` at maxRows ∈ {4 (below 6), 6, 8, 12, 30} and two widths, and the screen is checked for: no more rows
 * than the budget, the selected row on screen, a "↑/↓ N more" marker whenever content is cut, and no row mixing a
 * border with content (the `brokenBorders` predicate of test/acceptance/checks.ts, copied, review D-02).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {displayWidth} from '../../src/tui/text-width.ts';

const React=(await import('react')).default;
const Ink:any=await import('ink');
const h=React.createElement as any;

/* Copied from cli/test/acceptance/checks.ts (brokenBorders, R0) — lane I owns that file. */
function brokenBorders(lines:readonly string[]):string[]{
  return lines.map(line=>line.trimEnd()).filter(line=>
    (/^[┌└╭╰]/u.test(line)&&!/^[┌└╭╰][─━═][^]*[┐┘╮╯]$/u.test(line))||
    (/[┐┘╮╯]$/u.test(line)&&!/^[┌└╭╰]/u.test(line)));
}

const MAX_ROWS=[4,6,8,12,30] as const;
const COLUMNS=[60,100] as const;
const MORE=/[↑↓] \d+ more/u;

async function sw(){
  const mod:any=await import('../../src/tui/overlays/scroll-window.ts').catch(()=>({}));
  assert.equal(typeof mod.fitOverlay,'function','Q-R1-3: overlays/scroll-window.ts must export fitOverlay');
  assert.equal(typeof mod.renderOverlay,'function','Q-R1-3: overlays/scroll-window.ts must export renderOverlay');
  return mod;
}
function screen(element:unknown,columns:number):string[]{
  const text=Ink.renderToString(element,{columns}) as string;
  const lines=text.split('\n');
  while(lines.length&&lines.at(-1)!.trim()==='')lines.pop();
  return lines;
}
function assertFits(name:string,lines:readonly string[],{maxRows,columns,selected,cut}:{maxRows:number;columns:number;selected:RegExp|null;cut:boolean}){
  const where=`${name} at maxRows ${maxRows}, ${columns} columns`;
  const shown=lines.join('\n');
  assert.ok(lines.length<=maxRows,`${where}: ${lines.length} rows rendered, budget ${maxRows}\n${shown}`);
  for(const line of lines)assert.ok(displayWidth(line)<=columns,`${where}: a row is wider than the screen: ${line}`);
  assert.deepEqual(brokenBorders(lines),[],`${where}: rows mix a border with content\n${shown}`);
  if(maxRows>=4){
    assert.match(lines[0]??'',/^[╭┌]/u,`${where}: the top border is the first row\n${shown}`);
    assert.match(lines.at(-1)??'',/^[╰└]/u,`${where}: the bottom border is the last row\n${shown}`);
  }
  if(selected)assert.match(shown,selected,`${where}: the selected row is not on screen\n${shown}`);
  if(cut)assert.match(shown,MORE,`${where}: content is cut but no "↑/↓ N more" marker says so\n${shown}`);
}

// ─── fixtures ────────────────────────────────────────────────────────────────────────────────────────────────────
const N=40,SEL=23;
const ids=(prefix:string)=>Array.from({length:N},(_,i)=>`${prefix}-${String(i).padStart(2,'0')}`);
const trustRow={trusted:true,state:'trusted',projectTrusted:true,changed:false,currentFingerprint:'fp-a',trustedFingerprint:'fp-a'};

type Case={name:string;content:()=>Promise<any>;selected:RegExp|null};
const SHORT=new Set(['context inspector','provider consent','provider key','effort picker']);
const CASES:Case[]=[
  {name:'automation center',selected:/› active · nightly-23/u,content:async()=>{const m=await import('../../src/tui/overlays/automation-center.ts');return m.automationCenterOverlay(m.createAutomationCenterModel({state:'ready',error:null,rows:ids('auto').map((id,i)=>({id,name:`nightly-${String(i).padStart(2,'0')}`,active:true,taskId:'t',schedule:'0 * * * *',timezone:'UTC'})) as any},SEL));}},
  {name:'context inspector',selected:null,content:async()=>{const m=await import('../../src/tui/overlays/context-inspector.ts');return m.contextInspectorOverlay({sessionId:'s-1',available:false,measurement:null,reason:'no provider measurement '.repeat(8),autoCompaction:{enabled:true,triggerPercent:80,targetRatio:null},cache:{percent:null,cachedTokens:null,promptTokens:null,provenance:'not reported by provider'},cost:{usd:null,provenance:'not reported'},sources:{activeSourceCount:null,summaryCitationCount:null,provenance:'unavailable'},budget:null} as any);}},
  {name:'forge center',selected:/› tool-23/u,content:async()=>{const m=await import('../../src/tui/overlays/forge-center.ts');return m.forgeCenterOverlay(m.createForgeCenterModel({state:'ready',error:null,rows:ids('tool').map(id=>({id,title:id,enabled:true,ownerRevision:1,risk:'low'}))} as any,SEL));}},
  {name:'hook center',selected:/› hook-23/u,content:async()=>{const m=await import('../../src/tui/overlays/hook-center.ts');return m.hookCenterOverlay(m.createHookCenterModel(ids('hook').map(id=>({id,quarantine:{active:false,reason:null},trust:trustRow,events:['PreToolUse'],launch:{command:'node hook.js'},lastDryRun:null,lastExecutions:[]})) as any,SEL));}},
  {name:'library center',selected:/› doc-23/u,content:async()=>{const m=await import('../../src/tui/overlays/library-center.ts');return m.libraryCenterOverlay(m.createLibraryCenterModel({state:'ready',error:null,rows:ids('doc').map(id=>({id,name:id,mediaType:'text/plain',fileType:'txt',origin:'user',creator:{type:'user'},session:null,context:{persistence:'session',token:null}}))} as any,SEL));}},
  {name:'mcp center',selected:/› mcp-23/u,content:async()=>{const m=await import('../../src/tui/overlays/mcp-center.ts');return m.mcpCenterOverlay(m.createMcpCenterModel(ids('mcp').map(id=>({id,health:{state:'ok',latencyMs:null,phase:null,message:null},trust:trustRow,capabilities:null,logs:[],server:null,protocol:null,permission:{configuredAllowlist:[],effectiveTools:[],perCallApproval:'always',missingAllowlistedTools:[]}})) as any,SEL));}},
  {name:'memory center',selected:/› mem-23/u,content:async()=>{const m=await import('../../src/tui/overlays/memory-center.ts');return m.memoryCenterOverlay(m.createMemoryCenterModel({state:'ready',error:null,rows:ids('mem').map(id=>({id,title:'t',kind:'fact',provenance:{writer:'user',writerEvidence:'e',scope:'global',scopeEvidence:'e'},duplicateControl:{mode:'m',normalization:'n',onCreateDuplicate:'c',onUpdate:'u',semanticDetection:false,merge:false},usage:{status:'s',reason:'r'},cost:{status:'s',reason:'r'},createdAt:null,updatedAt:null,content:'body'}))} as any,SEL));}},
  {name:'notes center',selected:/› note-23/u,content:async()=>{const m=await import('../../src/tui/overlays/notes-center.ts');return m.notesCenterOverlay(m.createNotesCenterModel({state:'ready',error:null,rows:ids('note').map(id=>({id,title:'t',format:'md',formatEvidence:'e',writer:'user',writerEvidence:'e',createdAt:null,updatedAt:null,content:'body',relations:[]}))} as any,SEL));}},
  {name:'plugin center',selected:/› plug-23/u,content:async()=>{const m=await import('../../src/tui/overlays/plugin-center.ts');return m.pluginCenterOverlay(m.createPluginCenterModel(ids('plug').map(id=>({id,name:null,registry:{state:'loaded',code:null,message:null},quarantine:{active:false,reason:null},guard:{verdict:'safe',capabilities:[],findings:[]},guardError:null,trust:{effectiveTrusted:true,scopeTrusted:true,projectTrusted:true},provenance:{kind:'project',extension:null,packageCopyPresent:true,packageCopy:'p',recordedSourceAuthority:'x',recordedSource:null,recordedSourceAvailable:false},fingerprints:{currentSetDigest:'a',trustedSetDigest:'a',changedPaths:[],addedPaths:[],removedPaths:[]}})) as any,SEL));}},
  {name:'research center',selected:/› done · q-23/u,content:async()=>{const m=await import('../../src/tui/overlays/research-center.ts');return m.researchCenterOverlay(m.createResearchCenterModel({state:'ready',error:null,rows:ids('q').map(id=>({id,status:'done',question:id}))} as any,SEL));}},
  {name:'tasks center',selected:/› \[open\] p1 · task-23/u,content:async()=>{const m=await import('../../src/tui/overlays/tasks-center.ts');return m.tasksCenterOverlay(m.createTasksCenterModel({state:'ready',error:null,rows:ids('task').map(id=>({id,status:'open',priority:'p1',title:id,writer:'user',writerEvidence:'e',description:null,dependencies:[],evidence:[],agents:[],schedules:[]}))} as any,SEL));}},
  {name:'workflow center',selected:/› wf-23/u,content:async()=>{const m=await import('../../src/tui/overlays/workflow-center.ts');return m.workflowCenterOverlay(m.createWorkflowCenterModel(ids('wf').map(id=>({id,name:id,kind:'command',provenance:{scope:'project',path:'p'},validation:{valid:true,code:null,message:null},trust:{required:false,trusted:false,state:'n/a',currentFingerprint:'a',trustedFingerprint:'a'},executableSteps:1,references:[]})) as any,SEL));}},
  {name:'trust center',selected:null,content:async()=>{const m=await import('../../src/tui/overlays/trust-center.ts');return m.trustCenterOverlay(m.trustCenterModel({trusted:true,reason:'',workspace:{canonicalRoot:'C:/p'},storeSchema:'v2',migrationRequired:false,rollbackAvailable:false,resources:ids('res').map(id=>({kind:'hook',id,state:'trusted',relativePath:`.talos/${id}`})),nestedRepositories:[]} as any,{permissionMode:'default'}));}},
  {name:'transcript search',selected:/selected: m-07/u,content:async()=>{const m=await import('../../src/tui/overlays/transcript-search.ts');const items=Array.from({length:12},(_,i)=>({id:`m-${String(i).padStart(2,'0')}`,kind:'message',role:'assistant',text:Array.from({length:30},(_,l)=>`line ${l} of message ${i}`).join('\n')}));return m.transcriptSearchOverlay({items:items as any,state:{...m.createTranscriptSearchState('m-07'),query:'message'}});}},
  {name:'queue editor',selected:/› 24\. follow-up · queued-23/u,content:async()=>{const m=await import('../../src/tui/overlays/queue-editor.ts');return m.queueEditorOverlay({entries:ids('queued').map(id=>({id,kind:'prompt',text:id,status:'pending'})),selected:SEL,paused:false,editing:false,draft:''});}},
  {name:'agent tree',selected:/› agent a-23/u,content:async()=>{const m=await import('../../src/tui/overlays/agent-tree.ts');const rows=ids('a').map((id,i)=>({id,parentId:i?'a-00':null,level:i?1:0,nativeDepth:i?1:0,role:i?'subagent':'main',focused:false,name:id,task:null,model:null,outcome:'running',interrupted:false,startedAt:null,updatedAt:null,endedAt:null,usage:null,collisionCount:0,hasCollision:false,delegationOutcome:null,delegationEvidence:null}));return m.agentTreeOverlay(m.createAgentTreeOverlayModel(rows as any,'a-23'),{width:98,nowMs:0,currentSessionId:null,running:false});}},
  {name:'help',selected:null,content:async()=>{const m=await import('../../src/tui/overlays/help-dialog.ts');return m.helpDialogOverlay();}},
  {name:'session picker',selected:/› sess-23/u,content:async()=>{const m=await import('../../src/tui/overlays/session-picker.ts');return m.sessionPickerOverlay({action:'resume',query:'',rows:ids('sess').map(id=>({id,title:id,project:'C:/p',path:null,model:null,tags:[],pinned:false})) as any,selected:SEL});}},
  {name:'provider picker',selected:/› prov-23/u,content:async()=>{const m=await import('../../src/tui/overlays/provider-picker.ts');return m.providerPickerOverlay({query:'',rows:ids('prov').map(id=>({id,label:id,keySource:'saved',environmentVariable:null,local:false,endpointHost:null,benched:null})) as any,selected:SEL});}},
  {name:'provider consent',selected:/› No \(recommended\)/u,content:async()=>{const m=await import('../../src/tui/overlays/provider-picker.ts');return m.providerConsentOverlay({provider:{label:'OpenAI',environmentVariable:'OPENAI_API_KEY'},choice:'no'});}},
  {name:'provider key',selected:/API key for OpenAI/u,content:async()=>{const m=await import('../../src/tui/overlays/provider-picker.ts');return m.providerKeyOverlay({label:'OpenAI',remediation:'The saved key was refused by the provider. '.repeat(3),benched:null,masked:'••••••••',keyTestNotice:'Enter sends one token to test the key.',testing:false,result:null});}},
  {name:'model picker',selected:/› model-23/u,content:async()=>{const m=await import('../../src/tui/overlays/model-picker.ts');return m.modelPickerOverlay({label:'OpenAI',provider:'openai',loading:false,verified:true,notice:'',query:'',rows:ids('model').map(id=>({id:`openai:${id}`,provider:'openai',name:id,contextWindow:null,reasoning:false,reasoningEfforts:[],images:false})) as any,selected:SEL});}},
  /* R5a (owner 2026-09-24): the effort picker is a line of nodes (overlays/effort-line.ts), fitted to the narrowest width. */
  {name:'effort line',selected:/Faster/u,content:async()=>{const m=await import('../../src/tui/overlays/effort-line.ts');return m.effortLineOverlay({name:'gpt-x',choices:['default','minimal','low','medium','high','xhigh'],selected:4,width:30,unicode:true});}},
  {name:'command menu',selected:/› \/model/u,content:async()=>{const m:any=await import('../../src/tui/components/command-menu.ts');const rows=m.commandMenuItems('/');const index=rows.findIndex((row:any)=>row.command.name==='model');return m.commandMenuOverlay({text:'/',selected:index});}},
];

test('Q-R1-3: every overlay and the command menu stays inside maxRows, keeps the selection visible and marks what it cuts',async()=>{
  const {fitOverlay,renderOverlay}=await sw();
  const failures:string[]=[];
  for(const item of CASES){
    let content:any;
    try{content=await item.content();}catch(error){failures.push(`${item.name}: no maxRows view (${(error as Error).message.split('\n')[0]})`);continue;}
    for(const columns of COLUMNS)for(const maxRows of MAX_ROWS){
      const whole=fitOverlay(content,{columns}),fit=fitOverlay(content,{maxRows,columns});
      // Whatever does not fit is either scrolled (and announced) or is optional chrome the fit says it dropped.
      if(whole.rows.length+2>maxRows&&!fit.cut&&!fit.dropped)failures.push(`${item.name} at ${maxRows}×${columns}: too tall, yet nothing was cut`);
      const cut=fit.cut&&maxRows>=6;
      if(maxRows>=6&&whole.rows.length>fit.rows.length+2&&!fit.cut&&fit.dropped===0)failures.push(`${item.name} at ${maxRows}×${columns}: rows vanished unannounced`);
      try{assertFits(item.name,screen(renderOverlay(h,Ink,content,{maxRows,columns}),columns),{maxRows,columns,selected:item.selected,cut});}
      catch(error){failures.push((error as Error).message);}
    }
  }
  assert.deepEqual(failures,[],failures.join('\n\n'));
});

test('Q-R1-3: without maxRows an overlay renders whole, exactly as tall as its wrapped content (the default before lane L wires the budget)',async()=>{
  const {fitOverlay,renderOverlay}=await sw();
  const m=await import('../../src/tui/overlays/help-dialog.ts');
  const content=(m as any).helpDialogOverlay();
  const whole=fitOverlay(content,{columns:100});
  const lines=screen(renderOverlay(h,Ink,content,{columns:100}),100);
  assert.equal(lines.length,whole.rows.length+2,'rows = wrapped content + the two border rows');
  assert.doesNotMatch(lines.join('\n'),MORE,'nothing is cut, so nothing is announced');
  assert.deepEqual(brokenBorders(lines),[]);
});

test('D-02: the help overlay fits a 100×30 screen budget and scrolls with an offset, the last page reaching the end',async()=>{
  const {renderOverlay}=await sw();
  const m:any=await import('../../src/tui/overlays/help-dialog.ts');
  const maxRows=20;
  const first=screen(renderOverlay(h,Ink,m.helpDialogOverlay(undefined,{offset:0}),{maxRows,columns:100}),100);
  const last=screen(renderOverlay(h,Ink,m.helpDialogOverlay(undefined,{offset:Number.MAX_SAFE_INTEGER}),{maxRows,columns:100}),100);
  for(const lines of [first,last]){
    assert.ok(lines.length<=maxRows);
    assert.match(lines.join('\n'),/Help/u,'the title stays');
    assert.match(lines.join('\n'),/Esc \/ Enter \/ \? closes help/u,'the way out stays');
    assert.deepEqual(brokenBorders(lines),[]);
  }
  assert.match(first.join('\n'),/↓ \d+ more/u);
  assert.match(last.join('\n'),/↑ \d+ more/u);
  assert.doesNotMatch(last.join('\n'),/↓ \d+ more/u,'the last page shows the end of the help');
});

test('E4: wrapping is exact — each wrapped row fits the width, the rows join back to the text, a wide grapheme is never split',async()=>{
  const {wrapDisplay}=await sw();
  assert.equal(typeof wrapDisplay,'function');
  const text='alpha beta 漢字漢字漢字 gamma '+'x'.repeat(30)+' 👩‍💻 end';
  for(const width of [1,2,5,9,17,40]){
    const rows:string[]=wrapDisplay(text,width);
    for(const row of rows)assert.ok(displayWidth(row)<=Math.max(width,2),`width ${width}: ${row}`);
    assert.equal(rows.join(''),text,`width ${width}: wrapping loses nothing`);
  }
  assert.deepEqual(wrapDisplay('',10),['']);
});

test('the scroll slice keeps the selected item inside the window, centred when it can be, clipped only when it alone is taller',async()=>{
  const {sliceByHeights}=await sw();
  assert.equal(typeof sliceByHeights,'function');
  const ones=Array.from({length:20},()=>1);
  for(let selected=0;selected<20;selected++)for(const budget of [1,2,3,5,8]){
    const view=sliceByHeights(ones,{budget,selected});
    assert.ok(view.start<=selected&&selected<view.end,`selected ${selected} budget ${budget}`);
    const rows=view.end-view.start+((view.above||view.below)&&budget>=2?1:0);
    assert.ok(rows<=Math.max(budget,1),`budget ${budget}: ${rows} rows`);
    assert.equal(view.above,view.start);assert.equal(view.below,20-view.end);
  }
  const mid=sliceByHeights(ones,{budget:6,selected:10});
  assert.deepEqual([mid.start,mid.end],[8,13],'5 rows + 1 marker, selection in the middle');
  const tall=sliceByHeights([1,9,1],{budget:4,selected:1});
  assert.deepEqual([tall.start,tall.end,tall.clip],[1,2,3],'a selected item taller than the window is clipped to it');
});
