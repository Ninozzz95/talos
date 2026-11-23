/*
 * A5j, road B (owner 13/11/2026 04:35, row 126 of the register; judge's plan on paper 19/11/2026): «No to this tool until your next
 * message» on the terminal's card of an outside tool (a connector, a plugin, Tool Forge), with the PC's words (desktop 0.2.3:
 * `frontend/src/i18n/testi/chat.js:1498-1499`, `app.js:18917-18919`). The kernel keeps the no in the run and empties it at the person's
 * next message (talosHarness.mjs `noAlloStrumentoDelGiro`); the registry takes it only as a plain `false` with `{ambito:'strumento'}`
 * from the person, on a card that names an outside tool (session-registry.mjs:17115), and the same `ambito` with a YES is «yes for
 * this tool» for the whole session (:17107, :17129). The judge's posts:
 *   1. the no never widens anything: `ambito:'strumento'` leaves only with a no, only when the person chose that row;
 *   2. the row is offered only on an outside tool's card, and the four choices and «[5] deny always» stay;
 *   5. a child's no goes to the child's session, never to the root;
 *   6. -p, dontAsk and automations never send it;
 *   7. if the registry refuses it, a plain no leaves at once: the no is never lost;
 *   9. the key is in the generated command reference.
 * Posts 3, 4 and 8 (no card for the same tool after the no, the card back at the next message, the frames) are the pty scenario
 * test/acceptance/s94-no-to-tool.scenario.ts, on the real kernel.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {approvalChoicesFor,approvalClickChoice,approvalDefaultSelected,approvalDialogFit,approvalDialogLines,approvalDialogModel,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';
import {KEYBINDINGS} from '../../src/tui/keybindings.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const MCP={azione:{tipo:'mcp_tool',server:'gh',attrezzo:'create_pr'}};
const PLUGIN={azione:{tipo:'plugin_tool',plugin:'jira',attrezzo:'open_issue'}};
const FORGE={azione:{tipo:'forge_tool',attrezzo:'csv_to_json'}};
const scoped=(args:unknown[])=>{const extra=args[3];return Boolean(extra&&typeof extra==='object'&&(extra as Record<string,unknown>).ambito==='strumento');};

function fakeEngine(){
  const resolved:string[]=[];
  return{resolved,engine:{decide:async(action:any)=>({kind:'ask',requestId:'e1',action,reason:'asks'}),resolve:async(_id:string,choice:string)=>{resolved.push(choice);}} as any};
}

test('A5j post 1: «No to this tool» answers a plain false with {ambito:"strumento"}, and the engine keeps nothing (deny once)',async()=>{
  const f=fakeEngine();const answers:unknown[][]=[];
  const c=createApprovalCoordinator({engine:f.engine,answer:async(...args:any[])=>{answers.push(args);},interactive:true,mode:'default'});
  const action=permissionActionFromApproval(MCP);
  await c.request('s1','q1',action);
  await c.resolve('q1','deny-tool' as any);
  assert.deepEqual(answers.at(-1),['s1','q1',false,{ambito:'strumento'}]);
  assert.deepEqual(f.resolved,['deny-once'],'no rule and no grant: the engine hears a deny once');
});

test('A5j post 1: a yes never carries {ambito:"strumento"}, not even when a caller passes it',async()=>{
  for(const choice of ['allow-once','allow-session','allow-always'] as const){
    const f=fakeEngine();const answers:unknown[][]=[];
    const c=createApprovalCoordinator({engine:f.engine,answer:async(...args:any[])=>{answers.push(args);},interactive:true,mode:'default'});
    await c.request('s1','q1',permissionActionFromApproval(MCP));
    let refused=false;
    try{await c.resolve('q1',choice,{ambito:'strumento'} as any);}catch{refused=true;}
    assert.ok(answers.every(args=>!scoped(args)),`${choice}: a yes went out with the tool's scope`);
    assert.ok(refused,`${choice}: the scope with a yes is refused before any answer`);
  }
});

test('A5j post 1: «No to this tool» on a card that is not an outside tool sends a plain no, never the scope',async()=>{
  const f=fakeEngine();const answers:unknown[][]=[];
  const c=createApprovalCoordinator({engine:f.engine,answer:async(...args:any[])=>{answers.push(args);},interactive:true,mode:'default'});
  await c.request('s1','q1',permissionActionFromApproval({azione:{tipo:'shell',comando:'npm test'}}));
  await c.resolve('q1','deny-tool' as any);
  assert.deepEqual(answers.at(-1),['s1','q1',false]);
});

test('A5j post 2: the row is on the cards of a connector, a plugin and Tool Forge, after the four, and Deny stays highlighted',()=>{
  for(const card of [MCP,PLUGIN,FORGE,{action:{tool:'mcp_tool',server:'gh',attrezzo:'create_pr'}}]){
    const action=permissionActionFromApproval(card);
    assert.equal(action.noToThisTool,true,JSON.stringify(card));
    const choices=approvalChoicesFor(action);
    assert.deepEqual(choices.map(row=>row.digit),['1','2','3','4','6'],JSON.stringify(card));
    assert.equal(choices.at(-1)?.label,'approval.choice.noToTool');
    assert.equal(choices[approvalDefaultSelected(choices)]?.action,'approval-deny-once');
  }
});

test('A5j post 2: no row on any other card (a command, an outside card without its tool, a call written as text)',()=>{
  for(const card of [{azione:{tipo:'shell',comando:'npm test'}},{azione:{tipo:'mcp_tool',server:'gh'}},{azione:{tipo:'mcp_tool',server:'gh',attrezzo:''}},
    {azione:{tipo:'mcp_tool',server:'gh',attrezzo:'create_pr',semprePersona:true}},{azione:{tipo:'scrivi',percorso:'a.txt'}}]){
    const action=permissionActionFromApproval(card);
    assert.equal(action.noToThisTool,undefined,JSON.stringify(card));
    assert.ok(!approvalChoicesFor(action).some(row=>row.digit==='6'),JSON.stringify(card));
  }
});

test('A5j post 2: 6, a click and Enter answer it on an outside card; 5 still denies always in the full review; 6 does nothing elsewhere',()=>{
  const choices=approvalChoicesFor(permissionActionFromApproval(MCP));
  assert.deepEqual(approvalKeyOutcome('approval-deny-tool',{expanded:false,selected:3,escape:false,choices}),{kind:'answer',choice:'deny-tool',stop:false});
  assert.deepEqual(approvalKeyOutcome('approval-confirm',{expanded:false,selected:4,escape:false,choices}),{kind:'answer',choice:'deny-tool',stop:false});
  assert.equal(approvalClickChoice('aopt:4',choices),'deny-tool');
  assert.deepEqual(approvalKeyOutcome('approval-always',{expanded:false,selected:3,escape:false,choices}),{kind:'answer',choice:'allow-always',stop:false});
  assert.deepEqual(approvalKeyOutcome('approval-deny-always',{expanded:true,selected:3,escape:false,choices}),{kind:'answer',choice:'deny-always',stop:false});
  assert.deepEqual(approvalKeyOutcome('approval-deny-always',{expanded:false,selected:3,escape:false,choices}),{kind:'ignore'});
  const bash=approvalChoicesFor(permissionActionFromApproval({azione:{tipo:'shell',comando:'npm test'}}));
  assert.deepEqual(approvalKeyOutcome('approval-deny-tool',{expanded:false,selected:3,escape:false,choices:bash}),{kind:'ignore'});
  const once=approvalChoicesFor(permissionActionFromApproval({azione:{tipo:'shell',comando:'rm -r x',cancellazioneCritica:{percorso:'x'}}}));
  assert.deepEqual(approvalKeyOutcome('approval-deny-tool',{expanded:false,selected:1,escape:false,choices:once}),{kind:'ignore'});
});

test('A5j post 2: the card shows the row with the PC\'s words, and its full review keeps «[5] deny always»',()=>{
  const action=permissionActionFromApproval(MCP);
  const pending={requestId:'q1',sessionId:'s1',action,rawPayload:MCP.azione,reason:'asks'} as any;
  const text=approvalDialogLines(approvalDialogModel(pending,{expanded:false}),{columns:80}).map((line:any)=>line.kind==='text'?line.text:'').join('\n');
  assert.match(text,/\[6\] No to this tool until your next message/u);
  for(const digit of ['1','2','3','4'])assert.match(text,new RegExp(`\\[${digit}\\] `,'u'));
  const review=approvalDialogLines(approvalDialogModel(pending,{expanded:true}),{columns:80}).map((line:any)=>line.kind==='text'?line.text:'').join('\n');
  assert.match(review,/\[5\] deny always/u);
});

test('A5j post 2: on a short screen the card keeps its question above the five choices, and the packed full review keeps [5]',()=>{
  const action=permissionActionFromApproval(MCP);
  const argomenti=Object.fromEntries(Array.from({length:20},(_,i)=>[`field${i}`,`value ${i}`]));
  const pending={requestId:'q1',sessionId:'s1',action,rawPayload:{...MCP.azione,argomenti},reason:'asks'} as any;
  const fit=approvalDialogFit(approvalDialogModel(pending,{expanded:false}),{columns:80,maxRows:16});
  const rows=fit.lines.map((line:any)=>line.kind==='text'?line.text:'');
  assert.equal(fit.compact,false);
  const question=rows.indexOf('Call this tool?');
  assert.ok(question>=0,`the question is on the card\n${rows.join('\n')}`);
  assert.deepEqual(rows.slice(question+1,question+6).map(row=>row.trim().replace(/^›/u,'').slice(0,3)),['[1]','[2]','[3]','[4]','[6]']);
  const packed=approvalDialogFit(approvalDialogModel(pending,{expanded:true}),{columns:80,maxRows:7});
  assert.equal(packed.compact,true);
  assert.match(packed.lines.map((line:any)=>line.kind==='text'?line.text:'').join('\n'),/\[5\] Deny always/u);
});

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
function fakeRuntime({refuseScope=false}:{refuseScope?:boolean}={}){
  const sinks=new Map<string,Set<(event:any)=>void>>();const answers:any[]=[];
  let rows:any[]=[{sessionId:'main',parentId:null,depth:0}];
  const r:any={
    restore:async()=>({restored:0,total:0}),start:async()=>'main',listSessions:async()=>rows,export:()=>({eventi:[]}),
    subscribe(id:string,sink:(event:any)=>void){const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);return()=>set.delete(sink);},
    answerApproval:async(...args:any[])=>{answers.push(args);if(refuseScope&&scoped(args))throw Object.assign(new Error('This request has no folder to allow for the session'),{code:'QUERY_INVALID'});},
    cancel:async()=>{},close:async()=>{},
  };
  const emit=(id:string,event:any)=>{for(const sink of sinks.get(id)??[])sink(event);};
  return{r,answers,emit,setRows:(next:any[])=>{rows=next;},listeners:(id:string)=>sinks.get(id)?.size??0};
}

test('A5j post 5: a child\'s card answered «No to this tool» goes to the child\'s session, never to the root',async()=>{
  const f=fakeRuntime();let pending:any=null;
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onApproval:(p:any)=>{pending=p;}} as any);
  const id=(await c.initialize({initialPrompt:'DELEGATE'}))!;
  f.emit(id,{type:'RunStarted',runId:'r1'});
  f.setRows([{sessionId:'main',parentId:null,depth:0},{sessionId:'child',parentId:'main',depth:1,delegatedTask:'open the PR'}]);
  for(let i=0;i<40&&f.listeners('child')===0;i++)await tick(25);
  f.emit('child',{type:'ApprovalRequested',requestId:'q1',azione:MCP.azione});
  for(let i=0;i<20&&!pending;i++)await tick(5);
  assert.equal(pending?.sessionId,'child');
  await c.resolveApproval('q1','deny-tool' as any);
  assert.deepEqual(f.answers.filter(scoped),[['child','q1',false,{ambito:'strumento'}]]);
  assert.ok(f.answers.every(args=>args[0]!=='main'),'nothing went to the root');
  c.close();
});

test('A5j post 7: when the registry refuses the scope, a plain no leaves at once and the card closes',async()=>{
  const f=fakeRuntime({refuseScope:true});let pending:any=null;let closed=0;
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onApproval:(p:any)=>{if(p)pending=p;else closed++;}} as any);
  const id=(await c.initialize({initialPrompt:'hi'}))!;
  f.emit(id,{type:'RunStarted',runId:'r1'});
  f.emit(id,{type:'ApprovalRequested',requestId:'q1',azione:MCP.azione});
  for(let i=0;i<20&&!pending;i++)await tick(5);
  assert.equal(pending?.requestId,'q1');
  await c.resolveApproval('q1','deny-tool' as any);
  assert.deepEqual(f.answers.map(args=>args.slice(1)),[['q1',false,{ambito:'strumento'}],['q1',false]]);
  assert.ok(closed>=1,'the card closed');
  c.close();
});

test('A5j post 6: dontAsk and a run without a screen (-p, automations) answer an outside card without the scope',async()=>{
  for(const [interactive,mode] of [[false,'default'],[true,'dontAsk'],[false,'plan']] as const){
    const answers:unknown[][]=[];
    const engine={decide:async()=>({kind:'deny',code:'PERMISSION_REQUIRED',message:'no one to ask'}),resolve:async()=>{}} as any;
    const c=createApprovalCoordinator({engine,answer:async(...args:any[])=>{answers.push(args);},interactive,mode});
    await c.request('s1','q1',permissionActionFromApproval(MCP));
    assert.deepEqual(answers,[['s1','q1',false]],`${interactive} ${mode}`);
  }
  /* the scope is written in one place only, the person's answer on the card */
  for(const file of ['../../src/headless/run.ts','../../src/automations/kernel-runs.ts'])
    assert.equal(/strumento/u.test(readFileSync(new URL(file,import.meta.url),'utf8')),false,file);
});

/* Decision 375 (noise): twenty typical cards in the default mode with no rules, before and after — how many ask, and how many choices
   each shows. The engine is not touched by A5j, so the asks must not move; only the three outside cards gain a row. */
const TWENTY:Array<Record<string,unknown>>=[
  {tipo:'shell',comando:'npm test'},{tipo:'shell',comando:'git status'},{tipo:'shell',comando:'ls -la'},{tipo:'shell',comando:'git push origin main'},
  {tipo:'shell',comando:'rm notes.txt'},{tipo:'shell',comando:'npm install left-pad'},{tipo:'shell',comando:'curl https://example.com'},
  {tipo:'scrivi',percorso:'src/a.ts'},{tipo:'file_edit',percorso:'README.md'},{tipo:'leggi',percorso:'src/a.ts'},{tipo:'leggi',percorso:'../outside.txt'},
  {tipo:'web_fetch',url:'https://example.com'},{tipo:'mcp_tool',server:'gh',attrezzo:'create_pr'},{tipo:'plugin_tool',plugin:'jira',attrezzo:'open_issue'},
  {tipo:'forge_tool',attrezzo:'csv_to_json'},{tipo:'delega_sottotask',task:'run the tests'},{tipo:'document_create',percorso:'out.docx'},
  {tipo:'shell',comando:'git commit -m x'},{tipo:'scrivi',percorso:'.env'},{tipo:'shell',comando:'npx tsc --noEmit'},
];
test('A5j noise: twenty typical cards, the same asks; the sixth row only on the three outside cards',async()=>{
  const {createPermissionEngine}=await import('../../src/security/permission-engine.ts');
  const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:[]}});
  let asks=0,rows=0,sixth=0;
  for(const azione of TWENTY){
    const action=permissionActionFromApproval({azione});
    const decision=await engine.decide(action,{interactive:true,mode:'default',sessionId:'s'});
    if(decision.kind!=='ask')continue;
    asks++;const choices=approvalChoicesFor(decision.action);rows+=choices.length;if(choices.some(row=>row.digit==='6'))sixth++;
  }
  console.log(`[A5j noise] 20 cards: ${asks} ask, ${rows} choice rows, ${sixth} with the sixth row`);
  assert.equal(sixth,3);
});

test('A5j post 9: key 6 is in the keymap and in the generated command reference',()=>{
  const row=KEYBINDINGS.find(binding=>binding.id==='approval-deny-tool');
  assert.deepEqual(row&&{keys:row.keys,context:row.context},{keys:['6'],context:'approval'});
  const file=readFileSync(new URL('../../../docs/talos-cli/command-reference.md',import.meta.url),'utf8');
  assert.ok(file.includes('| `approval-deny-tool` | `approval` | `6` | No to this tool until your next message (connector, plugin and Tool Forge cards) |'));
});
