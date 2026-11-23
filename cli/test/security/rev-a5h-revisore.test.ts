/*
 * Reviewer of A5f + A5h (19/11/2026). Only text given to the engine and fake cards: no command is ever run, no file is written by a
 * tested action. Runs unchanged on 0.6.16 (f45c1dbed), A5f (92f1ed153) and A5h (ddb05d609); prints `REV-A5H {...}` so the three can
 * be compared character by character. On the trees before A5h the `child` flag is ignored by the engine (it does not know it).
 */
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {approvalChoicesFor} from '../../src/tui/overlays/approval-dialog.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const NONE={allow:[],ask:[],deny:[]};
const ALLOW_ALL={allow:['Bash(*)','Write(*)','Edit(*)'],ask:[],deny:[]};
const ASK_ALL={allow:[],ask:['Bash(*)','Write(*)','Edit(*)','TalosService(*)'],deny:[]};
const act=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione:{...azione}} as any);
const mk=(rules:any,mode:string)=>createPermissionEngine({projectRoot:ROOT,rules:structuredClone(rules),mode,classifier:async()=>'ask',persistRule:async()=>{}} as any);
const choices=(a:any)=>approvalChoicesFor(a).map((r:any)=>r.action.replace('approval-','')).join('/');
const show=(d:any)=>d.kind==='ask'?`card:${choices(d.action)}`:d.kind==='allow'?`allow:${d.source}`:`deny:${d.code}`;
const widestYes=(a:any)=>approvalChoicesFor(a).some((r:any)=>r.action==='approval-session')?'allow-session':'allow-once';
const child=(a:Record<string,unknown>)=>({...a,sempreNonBasta:true});
const out:Record<string,unknown>={};
let controlPath:any=null;
try{controlPath=await import('../../src/security/control-path.ts');}catch{controlPath=null;}

/* 1. SECURITY: commands and writes that touch a control file, built in pieces. Card in acceptEdits and Full access (an ask rule for
   everything, so the card is drawn), and with no rule in acceptEdits (what the mode does by itself). */
const SHELL_ATTACKS=[
  'cp hooks.json .talos','cp hooks.json .talos/','mv settings.json .claude','cp -r cfg skills','cp -t .talos hooks.json',
  "cp evil.json '.talos\\hooks.json'",'cp evil.json ".talos\\hooks.json"','cp evil.json .talos\\hooks.json',
  'Copy-Item evil.json -Destination .talos','Set-Content -Path:.talos/hooks.json -Value x','sort -o.claude/settings.json in.txt',
  'cd .git && echo x > config','git -C . config core.hooksPath .talos','echo $(cat x) > .talos/hooks.json',
  'Set-Content (Join-Path .talos hooks.json) x','cp a ".TALOS/HOOKS.JSON"','cp a .talos/../.talos/hooks.json','cp a ".tal""os/hooks.json"',
  'cp a sub\\..\\.talos\\hooks.json','cp a AGENTS.md.','cp a CLAUDE.md::$DATA','cp a C:\\Users\\x\\.claude\\settings.json','tar -xf evil.tar',
  'tee .talos/hooks.json','cp notes.txt CLAUDE.md','cp a ~/.claude/settings.json','cp a .Claude/Settings.json',
];
const WRITE_ATTACKS=['.TALOS/hooks.json','.talos\\hooks.json','sub/../.claude/settings.json','skills/x.md','SKILLS/x.md','agents.md','AGENTS.md.',
  'C:\\project\\.talos\\x.json','.harness-ui-hooks.json','.mcp-trust/x','src/app.ts'];
test('SICUREZZA: control files named in pieces',async()=>{
  const r:Record<string,string>={};
  for(const comando of SHELL_ATTACKS){
    const row:string[]=[];
    for(const mode of ['acceptEdits','bypassPermissions']){const d:any=await mk(ASK_ALL,mode).decide(act(child({tipo:'shell',comando})),{interactive:true,mode,child:true} as any);row.push(`${mode}=${show(d)}`);}
    const ae:any=await mk(NONE,'acceptEdits').decide(act(child({tipo:'shell',comando})),{interactive:true,mode:'acceptEdits',child:true} as any);row.push(`acceptEdits/none=${show(ae)}`);
    const root:any=await mk(NONE,'acceptEdits').decide(act({tipo:'shell',comando}),{interactive:true,mode:'acceptEdits'} as any);row.push(`root acceptEdits/none=${show(root)}`);
    if(controlPath)row.push(`names=${controlPath.namesControlFile(act({tipo:'shell',comando}),ROOT)}`);
    r[`shell ${comando}`]=row.join(' | ');
  }
  for(const percorso of WRITE_ATTACKS){
    const row:string[]=[];
    for(const mode of ['acceptEdits','bypassPermissions']){const d:any=await mk(ASK_ALL,mode).decide(act(child({tipo:'scrivi',toolCallId:'c',percorso})),{interactive:true,mode,child:true} as any);row.push(`${mode}=${show(d)}`);}
    if(controlPath)row.push(`names=${controlPath.namesControlFile(act({tipo:'scrivi',percorso}),ROOT)}`);
    r[`write ${percorso}`]=row.join(' | ');
  }
  /* a grandchild, a delegate and the root: only the origin flag counts */
  r['grandchild shell npm test acceptEdits']=show(await mk(ASK_ALL,'acceptEdits').decide(act(child({tipo:'shell',comando:'npm test'})),{interactive:true,mode:'acceptEdits',child:true} as any));
  r['root marked npm test acceptEdits']=show(await mk(ASK_ALL,'acceptEdits').decide(act(child({tipo:'shell',comando:'npm test'})),{interactive:true,mode:'acceptEdits'} as any));
  /* a tool outside the six, marked: connector, notes, research, delegation */
  for(const azione of [{tipo:'mcp_tool',server:'gh',attrezzo:'x'},{tipo:'notes_create'},{tipo:'delega_sottotask'},{tipo:'leggi',percorso:'src/a.ts'},{tipo:'web_fetch',url:'https://x.test'}])
    r[`outside ${azione.tipo}`]=show(await mk(ASK_ALL,'acceptEdits').decide(act(child(azione)),{interactive:true,mode:'acceptEdits',child:true} as any));
  /* a reason key the CLI list does not name: a made-up kernel key keeps nothing special; the known ones keep the mark */
  for(const extra of [{soloUnaVolta:true},{cartaForzata:true},{percorsoSegreto:'.env'},{segreto:false},{trifecta:false},{rete:false},{wslRoot:null}])
    r[`extra ${JSON.stringify(extra)}`]=show(await mk(ASK_ALL,'acceptEdits').decide(act(child({tipo:'shell',comando:'npm test',...extra})),{interactive:true,mode:'acceptEdits',child:true} as any));
  out.sicurezza=r;
});

/* 2. «FOR THIS SESSION» THAT LASTS TOO LONG: a child's widest yes in acceptEdits, then other cards in the same engine */
test('SESSIONE: what a child\'s «for this session» given in acceptEdits answers afterwards',async()=>{
  const r:Record<string,string>={};
  for(const [n,rules] of [['none',NONE],['askAll',ASK_ALL]] as const){
    const e=mk(rules,'acceptEdits');const npm=child({tipo:'shell',comando:'npm test'});
    const first:any=await e.decide(act(npm),{interactive:true,mode:'acceptEdits',child:true} as any);r[`${n} first`]=show(first);
    if(first.kind==='ask')await e.resolve(first.requestId,widestYes(first.action));
    const steps:Array<[string,Record<string,unknown>,string,boolean]>=[
      ['same child acceptEdits',npm,'acceptEdits',true],['other child acceptEdits',npm,'acceptEdits',true],['child default',npm,'default',true],['child auto',npm,'auto',true],['child plan',npm,'plan',true],
      ['root default',{tipo:'shell',comando:'npm test'},'default',false],['root acceptEdits',{tipo:'shell',comando:'npm test'},'acceptEdits',false],
      ['child acceptEdits other command',child({tipo:'shell',comando:'npm run build'}),'acceptEdits',true],['child acceptEdits npm test && rm -rf x',child({tipo:'shell',comando:'npm test && rm -rf x'}),'acceptEdits',true],
      ['child -p default',npm,'default',true]];
    for(const [label,azione,mode,isChild] of steps){const d:any=await e.decide(act(azione),{interactive:label.includes('-p')?false:true,mode,...(isChild?{child:true}:{})} as any);r[`${n} ${label}`]=show(d);if(d.kind==='ask')await e.resolve(d.requestId,'deny-once');}
  }
  out.sessione=r;
});

/* 3/4. -p and dontAsk: decisions of a child's cards, 20 commands x modes x rules (compared across trees) */
const EVERYDAY:Array<Record<string,unknown>>=[
  {tipo:'shell',comando:'npm test'},{tipo:'shell',comando:'git status'},{tipo:'shell',comando:'git diff'},{tipo:'shell',comando:'ls -la'},
  {tipo:'shell',comando:'npm run build'},{tipo:'shell',comando:'node scripts/check.mjs'},{tipo:'shell',comando:'git add src/app.ts'},
  {tipo:'shell',comando:'git commit -m "fix"'},{tipo:'shell',comando:'npx tsc --noEmit'},{tipo:'shell',comando:'cat package.json'},
  {tipo:'shell',comando:'rg TODO src'},{tipo:'shell',comando:'python -m pytest'},{tipo:'shell',comando:'mkdir -p out'},
  {tipo:'shell',comando:'type .computer-use-luoghi.json.bak'},{tipo:'scrivi',percorso:'src/app.ts'},{tipo:'scrivi',percorso:'README.md'},
  {tipo:'file_edit',percorso:'src/util.ts'},{tipo:'leggi',percorso:'src/app.ts'},{tipo:'scrivi',percorso:'test/app.test.ts'},
  {tipo:'shell',comando:'curl https://example.com',rete:true}];
test('DECISIONI: one card at a time, every mode, both rule sets, with the person and with -p',async()=>{
  const r:Record<string,string>={};
  for(const interactive of [true,false])for(const mode of ['default','acceptEdits','plan','auto','dontAsk','bypassPermissions'])for(const [n,rules] of [['none',NONE],['allowAll',ALLOW_ALL]] as const){
    const row:string[]=[];
    for(const azione of [...EVERYDAY,...SHELL_ATTACKS.map(comando=>({tipo:'shell',comando}))]){const a=azione.tipo==='leggi'?azione:child(azione);const d:any=await mk(rules,mode).decide(act(a),{interactive,mode,child:true} as any);row.push(d.kind==='ask'?'ask':d.kind==='allow'?`allow:${d.source}`:`deny:${d.code}`);}
    r[`${interactive?'person':'-p'} ${mode}/${n}`]=row.join(',');
  }
  out.decisioni=r;
});

/* 5. NOISE, in sequence (decision 375): the person presses the widest yes the card offers */
test('RUMORE: sequences',async()=>{
  const seq=async(rules:any,mode:string,prefix:Array<[Record<string,unknown>,string,boolean]>,cmds:Array<Record<string,unknown>>,isChild=true)=>{
    const e=mk(rules,mode);let cards=0;const dup=new Map<string,number>();
    for(const [azione,choice,pc] of prefix){const d:any=await e.decide(act(azione),{interactive:true,mode,...(pc?{child:true}:{})} as any);if(d.kind==='ask')await e.resolve(d.requestId,choice as any);}
    for(const azione of cmds){const d:any=await e.decide(act(azione),{interactive:true,mode,...(isChild?{child:true}:{})} as any);if(d.kind==='ask'){cards++;const k=JSON.stringify(d.action);dup.set(k,(dup.get(k)??0)+1);await e.resolve(d.requestId,widestYes(d.action));}}
    return `${cards}`;
  };
  const r:Record<string,string>={};
  const twice=[...EVERYDAY,...EVERYDAY];const kid=twice.map(a=>a.tipo==='leggi'?a:child(a));
  for(const mode of ['default','acceptEdits','plan','auto','bypassPermissions'])for(const [n,rules] of [['none',NONE],['allowAll',ALLOW_ALL]] as const){
    r[`child 20x2 ${mode}/${n}`]=await seq(rules,mode,[],kid);r[`root 20x2 ${mode}/${n}`]=await seq(rules,mode,[],twice,false);
  }
  const npm5=Array.from({length:5},()=>child({tipo:'shell',comando:'npm test'}));
  for(const mode of ['default','acceptEdits']){
    r[`child npm test x5 ${mode}`]=await seq(NONE,mode,[],npm5);
    r[`child write src/app.ts x5 ${mode} askAll`]=await seq(ASK_ALL,mode,[],Array.from({length:5},()=>child({tipo:'scrivi',percorso:'src/app.ts'})));
    r[`root session then child x3 ${mode}`]=await seq(NONE,mode,[[{tipo:'shell',comando:'npm test'},'allow-session',false]],npm5.slice(0,3));
    r[`root always then child x3 ${mode}`]=await seq(NONE,mode,[[{tipo:'shell',comando:'npm test'},'allow-always',false]],npm5.slice(0,3));
    r[`child session then root x3 ${mode}`]=await seq(NONE,mode,[[child({tipo:'shell',comando:'npm test'}),'allow-session',true]],Array.from({length:3},()=>({tipo:'shell',comando:'npm test'})),false);
  }
  out.rumore=r;
});

/* the coordinator: a card without an origin (the person watching the child's session directly) */
test('ORIGINE: without the child flag the coordinator keeps the mark',async()=>{
  const c=createApprovalCoordinator({engine:mk(NONE,'acceptEdits'),answer:async()=>{},interactive:true,mode:'acceptEdits'});
  const direct:any=await c.request('child','q1',act(child({tipo:'shell',comando:'npm test'})));
  const viaOrigin:any=await (c.request as any)('child','q2',act(child({tipo:'shell',comando:'npm test'})),{child:true});
  out.origine={direct:direct.pending?choices(direct.action):'auto',viaOrigin:viaOrigin.pending?choices(viaOrigin.action):'auto'};
});

test('REPORT',()=>{console.log('REV-A5H '+JSON.stringify(out));});
