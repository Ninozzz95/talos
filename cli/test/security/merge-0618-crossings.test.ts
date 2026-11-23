/*
 * 0.7.0, the merge of 0.6.18 (security reviewer of 21/11/2026, attacks A1-A5; judge v2451, list items 12-17): attacks where the two
 * lines meet. Real engine, real coordinator, real card; invented names (`fintoserver`, `pcfinto-zz9`), the engine only decides: no
 * network, and Windows' share setting is passed in (`remoteToLocalLinks`), never read.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';
import {approvalChoicesFor,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';
type Mode='default'|'acceptEdits'|'plan'|'auto'|'dontAsk'|'bypassPermissions';

const ROOT=process.cwd();
const card=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione}) as any;
const MODES:Mode[]=['default','acceptEdits','plan','auto','dontAsk','bypassPermissions'];
function setup({deny=[] as string[],allow=[] as string[],mode='default' as Mode,links='on' as 'on'|'off'|'unknown'}={}){
  const persisted:unknown[]=[];const answers:unknown[][]=[];let current=mode;
  const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:[...allow],ask:[],deny:[...deny]},classifier:async()=>'allow',persistRule:async(...args:unknown[])=>{persisted.push(args);},remoteToLocalLinks:()=>links} as any) as any;
  const coordinator=createApprovalCoordinator({engine,answer:async(...args:unknown[])=>{answers.push(args);},interactive:true,mode:()=>current}) as any;
  return{engine,coordinator,persisted,answers,setMode:(m:Mode)=>{current=m;}};
}
const shell=(comando:string,extra:Record<string,unknown>={})=>({tipo:'shell',comando,toolCallId:'t',...extra});
const mcp=(tool:string,extra:Record<string,unknown>={})=>({tipo:'mcp_tool',nome:`mcp__fintoserver__${tool}`,server:'fintoserver',attrezzo:tool,toolCallId:`c-${tool}`,...extra});
const plugin=(p:string,tool:string,extra:Record<string,unknown>={})=>({tipo:'plugin_tool',nome:`plugin__${p}__${tool}`,plugin:p,attrezzo:tool,toolCallId:`p-${tool}`,...extra});
const ALL_KEYS=['approval-once','approval-session','approval-always','approval-deny-once','approval-deny-always','approval-deny-tool','approval-confirm','approval-cancel','interrupt'];
function keyChoices(choices:any){
  const out=new Set<string>();
  for(const expanded of [false,true])for(let selected=0;selected<choices.length;selected+=1)for(const key of ALL_KEYS){const o=approvalKeyOutcome(key,{expanded,selected,escape:false,choices}) as any;if(o.kind==='answer')out.add(o.choice);}
  return out;
}
const acts=(a:unknown)=>approvalChoicesFor(a as any).map((c:{action:string})=>c.action);

/* A1: a card that is «only once» AND «for this session» (a lifted child card in acceptEdits or Full access) */
for(const mode of ['acceptEdits','bypassPermissions'] as const){
  test(`A1 ${mode}: a child card with soloUnaVolta+sempreNonBasta: two choices, no key gives session or always, nothing stays`,async()=>{
    const s=setup({mode});
    const raw=shell('npm test',{sempreNonBasta:true,soloUnaVolta:true});
    const r=await s.coordinator.request('s1','q1',card(raw),{child:true});
    assert.equal(r.pending,true);
    assert.equal(r.action.onlyOnce,true);assert.equal(r.action.sessionOnly,true,'lifted: it carries sessionOnly too');
    const choices=approvalChoicesFor(r.action);
    assert.deepEqual(acts(r.action),['approval-once','approval-deny-once']);
    const reach=keyChoices(choices);
    assert.ok(!reach.has('allow-session')&&!reach.has('allow-always')&&!reach.has('deny-always'),`keys: ${[...reach]}`);
    await s.coordinator.resolve('q1','allow-session');
    const r2=await s.coordinator.request('s1','q2',card(raw),{child:true});assert.equal(r2.pending,true,'the same child card asks again');
    await s.coordinator.resolve('q2','allow-always');
    assert.deepEqual(s.persisted,[],'no rule');
    const root=await s.engine.decide(card(shell('npm test')),{interactive:true,mode:'default',sessionId:'s1'});
    assert.equal(root.kind,'ask','the root command asks again: no session yes stayed');
    const child=await s.engine.decide(card(shell('npm test',{sempreNonBasta:true})),{interactive:true,mode,sessionId:'s1',child:true});
    /* in Full access the lifted card passes by the mode (as the root does): never by a session yes left behind */
    if(mode==='bypassPermissions')assert.ok(!(child.kind==='allow'&&child.source==='session'),`child: ${JSON.stringify(child).slice(0,80)}`);
    else assert.equal(child.kind,'ask','the child without soloUnaVolta asks again');
    const rootSame=await s.engine.decide(card(shell('npm test')),{interactive:true,mode,sessionId:'s1'});
    assert.ok(!(rootSame.kind==='allow'&&rootSame.source==='session'),'root in the same mode: no session yes');
  });
}

/* A2: «No to this tool», then another tool of the same server / plugin */
test('A2 MCP: no to the tool, then a session yes to another tool of the same server covers only that one',async()=>{
  const s=setup();
  const r=await s.coordinator.request('s1','q1',card(mcp('crea')));assert.equal(r.pending,true);
  await s.coordinator.resolve('q1','deny-tool');
  assert.deepEqual(s.answers.at(-1),['s1','q1',false,{ambito:'strumento'}]);
  const r2=await s.coordinator.request('s1','q2',card(mcp('unisci')));assert.equal(r2.pending,true,'another tool asks');
  await s.coordinator.resolve('q2','allow-session');
  const ctx={interactive:true,mode:'default' as const,sessionId:'s1'};
  assert.equal((await s.engine.decide(card(mcp('unisci')),ctx)).kind,'allow','unisci for the session');
  assert.equal((await s.engine.decide(card(mcp('crea')),ctx)).kind,'ask','crea asks again');
  assert.equal((await s.engine.decide(card(mcp('cancella')),ctx)).kind,'ask','a third one asks');
  assert.equal((await s.engine.decide(card({tipo:'mcp_tool',nome:'mcp__altroserver__unisci',server:'altroserver',attrezzo:'unisci',toolCallId:'x'}),ctx)).kind,'ask','the same name on another server asks');
  assert.deepEqual(s.persisted,[]);
});
test('A2 plugin: no to the tool on alfa/uno; a session yes on alfa/due covers neither alfa/uno nor beta/due',async()=>{
  const s=setup();const ctx={interactive:true,mode:'default' as const,sessionId:'s1'};
  const a1=card(plugin('alfa','uno'));assert.equal(a1.noToThisTool,true);
  assert.deepEqual(acts(a1),['approval-once','approval-session','approval-always','approval-deny-once','approval-deny-tool']);
  await s.coordinator.request('s1','q1',a1);await s.coordinator.resolve('q1','deny-tool');
  await s.coordinator.request('s1','q2',card(plugin('alfa','due')));await s.coordinator.resolve('q2','allow-session');
  assert.equal((await s.engine.decide(card(plugin('alfa','due')),ctx)).kind,'allow');
  assert.equal((await s.engine.decide(card(plugin('alfa','uno')),ctx)).kind,'ask');
  assert.equal((await s.engine.decide(card(plugin('beta','due')),ctx)).kind,'ask');
  assert.deepEqual(s.persisted,[]);
});
test('A2 the tool scope never with a yes, and deny-tool on a card without the mark is a plain no',async()=>{
  const s=setup();
  await s.coordinator.request('s1','q1',card(mcp('crea')));
  await assert.rejects(s.coordinator.resolve('q1','allow-once',{ambito:'strumento'}),/APPROVAL_SCOPE_NOT_ALLOWED/);
  assert.equal(s.answers.length,0,'nothing said to the kernel');
  await assert.rejects(s.coordinator.resolve('q1','deny-once',{ambito:'strumento'}),/APPROVAL_SCOPE_NOT_ALLOWED/);
  await s.coordinator.request('s1','q2',card(shell('npm test')));
  await s.coordinator.resolve('q2','deny-tool');
  assert.deepEqual(s.answers.at(-1),['s1','q2',false]);
  const p=card(mcp('crea',{semprePersona:true}));assert.equal(p.noToThisTool,undefined);
  assert.ok(!acts(p).includes('approval-deny-tool'));
  const once=card(mcp('crea',{soloUnaVolta:true}));
  assert.ok(!keyChoices(approvalChoicesFor(once)).has('deny-tool'));
});

/* A3: a session yes given BEFORE an «only once» card */
test('A3: session yes on shell, MCP and plugin, then the soloUnaVolta card of the same: it never passes, in any mode',async()=>{
  const s=setup();
  const pairs:[Record<string,unknown>,Record<string,unknown>][]=[
    [shell('npm test'),shell('npm test',{soloUnaVolta:true})],
    [mcp('crea'),mcp('crea',{soloUnaVolta:true})],
    [plugin('alfa','uno'),plugin('alfa','uno',{soloUnaVolta:true})],
  ];
  let i=0;
  for(const [plain] of pairs){i+=1;await s.coordinator.request('s1',`g${i}`,card(plain));await s.coordinator.resolve(`g${i}`,'allow-session');}
  for(const [plain,once] of pairs){
    assert.equal((await s.engine.decide(card(plain),{interactive:true,mode:'default',sessionId:'s1'})).kind,'allow','the session yes holds for the plain card');
    for(const mode of MODES){
      const d=await s.engine.decide(card(once),{interactive:true,mode,sessionId:'s1'});
      assert.notEqual(d.kind,'allow',`${String(once.tipo)} ${mode}: the soloUnaVolta card does not pass with the session yes`);
      const dc=await s.engine.decide(card({...once,sempreNonBasta:true}),{interactive:true,mode,sessionId:'s1',child:true});
      assert.notEqual(dc.kind,'allow',`${String(once.tipo)} ${mode} child`);
    }
  }
});
test('A3 bis: a session yes on a lifted child card does not answer a card with the strong marks of the same command',async()=>{
  const s=setup({mode:'acceptEdits'});
  const r=await s.coordinator.request('s1','q1',card(shell('npm run build',{sempreNonBasta:true})),{child:true});
  assert.equal(r.pending,true);
  assert.deepEqual(acts(r.action),['approval-once','approval-session','approval-deny-once']);
  await s.coordinator.resolve('q1','allow-session');
  const ctx={interactive:true,mode:'acceptEdits' as const,sessionId:'s1'};
  assert.equal((await s.engine.decide(card(shell('npm run build')),ctx)).kind,'allow','root: the same command (as 0.6.16)');
  const again=await s.engine.decide(card(shell('npm run build',{sempreNonBasta:true})),{...ctx,child:true});
  assert.equal(again.kind==='allow'&&again.source,'session','child: the same command passes with its session yes');
  /* the root with the chain mark is NOT lifted: only the child */
  const rootMarked=await s.engine.decide(card(shell('npm run lint',{sempreNonBasta:true})),ctx);
  assert.equal(rootMarked.kind,'ask');
  if(rootMarked.kind==='ask')assert.deepEqual(acts(rootMarked.action),['approval-once','approval-deny-once'],'marked root: once or no');
  for(const extra of [{soloUnaVolta:true},{fileDiControllo:true},{rete:true},{semprePersona:true},{cancellazioneCritica:{percorso:'C:/',motivo:'x'}},{wslRoot:{distro:'finta',utente:'root'}}]){
    const d=await s.engine.decide(card(shell('npm run build',extra)),ctx);
    assert.notEqual(d.kind,'allow',`mark ${Object.keys(extra)[0]}`);
    const dc=await s.engine.decide(card(shell('npm run build',{...extra,sempreNonBasta:true})),{...ctx,child:true});
    assert.notEqual(dc.kind,'allow',`child, mark ${Object.keys(extra)[0]}`);
  }
});

/* A4: deny rules, and no rule saved by a refusal */
test('A4: a deny rule wins over a lifted child, soloUnaVolta, no to the tool, a control file, in every mode',async()=>{
  const s=setup({deny:['Bash(npm test)','Mcp(fintoserver:crea)','Write(segreto-finto.txt)']});
  for(const mode of MODES){
    const ctx={interactive:true,mode,sessionId:'s1'};
    for(const [raw,child] of [[shell('npm test'),false],[shell('npm test',{sempreNonBasta:true}),true],[shell('npm test',{soloUnaVolta:true}),false],[mcp('crea'),false],[mcp('crea',{soloUnaVolta:true}),false],[{tipo:'scrivi',percorso:'segreto-finto.txt',fileDiControllo:true,toolCallId:'w'},false]] as const){
      const d=await s.engine.decide(card(raw as Record<string,unknown>),{...ctx,...(child?{child:true}:{})});
      assert.equal(d.kind,'deny',`${mode} ${JSON.stringify(raw).slice(0,60)}`);
    }
  }
  assert.deepEqual(s.persisted,[]);
});
test('A4 bis: deny-once, deny-tool and deny-always on the cards that offer no «always» save nothing',async()=>{
  const s=setup({mode:'acceptEdits'});
  const cards:[Record<string,unknown>,boolean][]=[[shell('npm test',{soloUnaVolta:true}),false],[shell('npm test',{sempreNonBasta:true}),true],[shell('npm test',{sempreNonBasta:true,soloUnaVolta:true}),true],[mcp('crea'),false],[mcp('crea',{soloUnaVolta:true}),false],[{tipo:'scrivi',percorso:'.talos/finto.json',fileDiControllo:true,toolCallId:'w'},false]];
  let i=0;let seen=0;
  for(const [raw,child] of cards)for(const choice of ['deny-once','deny-tool','deny-always'] as const){
    i+=1;const r=await s.coordinator.request('s1',`d${i}`,card(raw),child?{child:true}:undefined);
    if(!r.pending)continue;seen+=1;
    const offersAlways=acts(r.action).includes('approval-always');
    await s.coordinator.resolve(`d${i}`,choice);
    if(!(offersAlways&&choice==='deny-always'))assert.deepEqual(s.persisted,[],`${choice} on ${JSON.stringify(raw).slice(0,70)}`);
    s.persisted.length=0;
  }
  assert.ok(seen>=15,`cards seen ${seen}`);
});

/* A5: a path toward another computer in all 6 modes (an invented host) */
const UNC_READ={tipo:'leggi',percorso:'\\\\pcfinto-zz9\\condivisa\\a.txt',toolCallId:'r',percorsoDiRete:{ospite:'pcfinto-zz9',via:'stringa'}};
const UNC_WRITE={tipo:'scrivi',percorso:'\\\\pcfinto-zz9\\condivisa\\a.txt',toolCallId:'w',percorsoDiRete:{ospite:'pcfinto-zz9',via:'stringa'}};
const UNC_SHELL=shell('type \\\\pcfinto-zz9\\condivisa\\a.txt');
for(const links of ['on','unknown','off'] as const){
  test(`A5 links ${links}: file and shell toward another computer, 6 modes, root and child`,async()=>{
    for(const mode of MODES){
      const s=setup({mode,links});
      for(const [label,raw] of [['read',UNC_READ],['write',UNC_WRITE],['shell',UNC_SHELL],['shell-child',{...UNC_SHELL,sempreNonBasta:true}],['read-child',{...UNC_READ,sempreNonBasta:true}]] as const){
        const child=label.endsWith('child');
        for(const interactive of [true,false]){
          const d=await s.engine.decide(card(raw as Record<string,unknown>),{interactive,mode,sessionId:'s1',...(child?{child:true}:{})});
          const row=`${mode}|${label}|${interactive?'i':'p'}|${d.kind}${d.kind==='allow'?':'+d.source:d.kind==='deny'?':'+d.code:''}`;
          if(d.kind==='allow'&&!label.startsWith('shell'))assert.ok(mode==='bypassPermissions'&&links==='off',`a file toward another computer passed: ${row}`);
          if(d.kind==='allow'&&label.startsWith('shell')&&mode==='bypassPermissions')assert.equal(links,'off',`shell in Full access: ${row}`);
        }
        const r=await s.coordinator.request('s1',`n-${label}`,card(raw as Record<string,unknown>),child?{child:true}:undefined);
        if(r.pending&&r.action.sensitive==='network'){
          await s.coordinator.resolve(`n-${label}`,'allow-session');
          const again=await s.engine.decide(card(raw as Record<string,unknown>),{interactive:true,mode,sessionId:'s1',...(child?{child:true}:{})});
          assert.ok(!(again.kind==='allow'&&again.source==='session'),`a session yes stayed on ${mode} ${label}`);
        }
      }
      assert.deepEqual(s.persisted,[]);
    }
  });
}
