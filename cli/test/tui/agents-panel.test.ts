/*
 * Stage 6a (owner 01/10: agents as a full page, as Codex's command center and Claude Code's agent view; decisions 02/10 in
 * registro 12). The rows are compared with the golden frames of the approved mockup: the full page at 120×40 and at 80×24
 * (agents-ctrl-a-2), the footer pill. FE-048 moved the panel into a card of the right panel (test/tui/side-panel.test.ts).
 * Spinner glyphs are masked (they depend on the animation's instant).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {displayWidth} from '../../src/tui/text-width.ts';
import {withToast,AGENTS_CLOSED,agentsOrder,agentsPageRows,agentsPill,cycleAgentsSurface,moveAgentSelection,openAgentsPage,showAgentsSurface,type AgentCard} from '../../src/tui/agents-panel.ts';

const GOLDEN=JSON.parse(readFileSync(new URL('./fixtures/agents-golden.json',import.meta.url),'utf8'));
const SPIN=/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/gu;
const text=(rows:readonly (readonly {text:string}[])[])=>rows.map(r=>r.map(s=>s.text).join('').replace(/\s+$/u,'').replace(SPIN,'*'));
const golden=(lines:string[])=>lines.map(l=>l.replace(SPIN,'*'));

const QUESTION={q:'Should the declined-payment test hit the real sandbox, or a local fake?',options:['Local fake (fast, no network)','Stripe test sandbox']};
const card=(over:Partial<AgentCard>):AgentCard=>({id:'x',task:'',prompt:'',model:'qwen3-coder',state:'working',ok:true,startMs:0,endMs:null,tokens:0,activity:'',log:[],...over});
const a1=(over:Partial<AgentCard>={})=>card({id:'a1',task:'Audit the dependencies',prompt:'List outdated or vulnerable packages and propose safe upgrades.',...over});
const a2=(over:Partial<AgentCard>={})=>card({id:'a2',task:'Write e2e tests for checkout',prompt:'Cover guest checkout, saved cards and a declined payment.',state:'needs',question:QUESTION,...over});
const a3=(over:Partial<AgentCard>={})=>card({id:'a3',task:'Update the API docs',prompt:'Bring docs/api.md in line with the v2 routes.',...over});

const LOG=['Read package-lock.json','Ran npm audit --json','Checked 214 packages','Read the express changelog','Compared 4 upgrade paths'];
const pageCards=()=>[a1({tokens:1200,activity:'Compared 4 upgrade paths',log:LOG}),a2({tokens:1000,log:['Read src/checkout/','Wrote test/e2e/checkout.guest.spec.ts']}),a3({tokens:1200,activity:'Read docs/api.md',log:['Read docs/api.md']})];

test('the full page at 120 columns: tabs, groups, the selected agent\'s live log and task',()=>{
  const rows=agentsPageRows(pageCards(),{width:120,height:40,now:6000,tab:0,selectedId:'a1',glyph:'⠼'});
  assert.deepEqual(text(rows),golden(GOLDEN.page120));
});

test('the full page at 80 columns: the list above, the selected agent below, its question with numbered choices',()=>{
  const rows=agentsPageRows(pageCards(),{width:80,height:24,now:6000,tab:0,selectedId:'a2',glyph:'⠼'});
  assert.deepEqual(text(rows),golden(GOLDEN.page80));
});

test('the footer pill counts the live agents and who needs you; nothing when none is live (SCHEDA 27)',()=>{
  const pill=(cards:AgentCard[])=>agentsPill(cards).map(s=>s.text).join('');
  assert.equal(pill([a1(),a2(),a3()]),' ← 3 agents · 1 needs you ');
  assert.equal(pill([a1(),a3()]),' ← 2 agents ');
  /* B15 (desktop, on the LinkedIn photos, 09/10/2026): one agent is «1 agent», never «1 agents». */
  assert.equal(pill([a1()]),' ← 1 agent ');
  assert.equal(pill([a1(),a3({state:'done',endMs:1})]),' ← 1 agent ','a finished agent does not count');
  assert.deepEqual(agentsPill([a3({state:'done',endMs:1})]),[],'only finished agents: no pill');
  assert.equal(agentsPill([a1(),a2()],40).map(s=>s.text).join(''),' 1 needs you ','under 56 columns the short form');
  assert.equal(agentsPill([a1(),a3()],40).map(s=>s.text).join(''),' 2 agents ');
  assert.deepEqual(agentsPill([]),[]);
  assert.ok(GOLDEN.pillT6s.endsWith('← 3 agents · 1 needs you'));
});

test('the tabs filter by state',()=>{
  const rows=text(agentsPageRows(pageCards(),{width:120,height:40,now:6000,tab:2,selectedId:'a1',glyph:'⠼'}));
  assert.ok(rows.some(r=>r.includes('Audit the dependencies')));
  assert.ok(!rows.some(r=>r.includes('Write e2e tests')),'Working hides the agent that needs you');
});

/* FE-048 (mockup `alt+a`): the card from 110 columns, the page below. */
test('Alt+A: closed → card → page → closed from 110 columns, closed → page → closed below',()=>{
  const place=(cardShown:boolean,columns:number)=>({cardShown,columns});
  assert.equal(cycleAgentsSurface(AGENTS_CLOSED,place(false,120)),'card');
  assert.equal(cycleAgentsSurface(AGENTS_CLOSED,place(true,120)),'page');
  assert.equal(cycleAgentsSurface(AGENTS_CLOSED,place(false,109)),'page');
  assert.equal(cycleAgentsSurface(AGENTS_CLOSED,place(false,110)),'card');
  const onPage=openAgentsPage(AGENTS_CLOSED,[a1()],null);
  assert.equal(cycleAgentsSurface(onPage,place(true,120)),'closed');
  assert.equal(cycleAgentsSurface(onPage,place(false,80)),'closed');
});

test('/agents shows the card when there is room, else the page; the page opens on the first that needs you',()=>{
  assert.equal(showAgentsSurface(AGENTS_CLOSED,{cardShown:false,columns:120}),'card');
  assert.equal(showAgentsSurface(AGENTS_CLOSED,{cardShown:true,columns:120}),'page');
  assert.equal(showAgentsSurface(AGENTS_CLOSED,{cardShown:false,columns:80}),'page');
  assert.deepEqual(openAgentsPage(AGENTS_CLOSED,[a1(),a2(),a3()],null).page,{tab:0,selectedId:'a2'});
  assert.deepEqual(openAgentsPage(AGENTS_CLOSED,[a1(),a3()],null).page,{tab:0,selectedId:'a1'});
  assert.deepEqual(openAgentsPage(AGENTS_CLOSED,[],null).page,{tab:0,selectedId:null});
});

test('↑/↓ wrap around the listed order; the page lists only its tab',()=>{
  const cards=[a1(),a2(),a3({state:'done',endMs:1})];
  assert.deepEqual(agentsOrder(cards).map(a=>a.id),['a2','a1','a3']);
  assert.deepEqual(agentsOrder(cards,2).map(a=>a.id),[],'nobody failed');
  assert.deepEqual(agentsOrder(cards,3).map(a=>a.id),[a3({state:'done',endMs:1}).ok?'a3':'',].filter(Boolean));
  assert.deepEqual(agentsOrder([a3({state:'done',endMs:1,ok:false})],2).map(a=>a.id),['a3'],'one that failed is an error');
  const order=agentsOrder(cards);
  assert.equal(moveAgentSelection(order,'a2',1),'a1');
  assert.equal(moveAgentSelection(order,'a3',1),'a2');
  assert.equal(moveAgentSelection(order,'a2',-1),'a3');
  assert.equal(moveAgentSelection(order,null,1),'a1','no choice counts as the first row, as drawn');
  assert.equal(moveAgentSelection([],null,1),null);
});

/* Stage 6b: the mockup's toast sits at the bottom right of whatever is on screen; on the page, at the right end of the last row. */
test('the toast takes the right end of the page\'s last row and leaves its words on the left',()=>{
  const rows=agentsPageRows(pageCards(),{width:120,height:20,now:6000,tab:0,selectedId:'a1',glyph:'*'});
  const last=(r:any[])=>r.at(-1)!.map((s:any)=>s.text).join('');
  const shown=withToast(rows,'Answer sent to the agent',120);
  assert.equal(shown.length,rows.length);
  assert.match(last(shown),/^ enter open[\s\S]* Answer sent to the agent $/u);
  assert.equal(last(shown).length,120);
  assert.deepEqual(withToast(rows,null,120),rows,'no toast, the rows as they were');
});

/* Stage 6c («tutto cliccabile»): the rows carry the mockup's `data-a` verbs. */
test('the page and the pill carry the mockup\'s click verbs',()=>{
  const actions=(rows:readonly (readonly {text:string;action?:string}[])[])=>new Set(rows.flatMap(row=>row.map(s=>s.action).filter(Boolean)));
  const page=actions(agentsPageRows(pageCards(),{width:120,height:40,now:6000,tab:0,selectedId:'a2',glyph:'*'}));
  for(const verb of ['atab:0','atab:1','atab:2','atab:3','agent:a1','agent:a2','agent:a3','areply:0','areply:1'])assert.ok(page.has(verb),`page lacks ${verb}`);
  assert.ok(agentsPill([a1()]).every(s=>s.action==='agents'));
});

test('FE-048 the timeline: a band for each agent in the order they began, an open one reaches the edge, and it fits',()=>{
  const cards=[a1({startMs:5_000,endMs:null}),a2({startMs:0,endMs:null}),a3({state:'done',startMs:1_000,endMs:2_000})];
  const rows=agentsPageRows(cards,{width:100,height:20,now:10_000,view:1,tab:0,selectedId:null,glyph:'⠙'});
  const lines=rows.map(row=>row.map(segment=>segment.text).join(''));
  assert.match(lines.join('\n'),/Delegations over time/u);assert.match(lines.join('\n'),/3 agents/u);
  assert.ok(rows.every(row=>displayWidth(row.map(segment=>segment.text).join(''))<=100));
  const bandRows=rows.filter(row=>row.some(segment=>segment.roles.some(role=>role.startsWith('f:'))));
  assert.equal(bandRows.length,3);
  const ofRow=(row:readonly {roles:readonly string[]}[],role:string)=>row.some(segment=>segment.roles.includes(role));
  assert.ok(ofRow(bandRows[0]!,'f:accent')||ofRow(bandRows[0]!,'f:warning'),'an agent at work');
  assert.ok(ofRow(bandRows[1]!,'f:success'),'one that finished well');
  assert.equal(agentsPageRows([],{width:100,height:12,now:0,view:1,tab:0,selectedId:null,glyph:'⠙'}).some(row=>row.some(segment=>/No agents here/u.test(segment.text))),true);
});

test('FE-048 one that was stopped is neither an error nor finished work, and the list orders who waits, who failed, who works, who ended',()=>{
  const failed=card({id:'f',state:'done',ok:false,endMs:1}),finished=card({id:'d',state:'done',ok:true,endMs:1}),stopped=card({id:'s',state:'done',ok:false,stopped:true,endMs:1}),working=card({id:'w'}),waiting=card({id:'n',state:'needs'});
  const cards=[stopped,finished,working,failed,waiting];
  assert.deepEqual(agentsOrder(cards).map(a=>a.id),['n','f','w','d','s']);
  assert.deepEqual([1,2,3,4].map(tab=>agentsOrder(cards,tab).map(a=>a.id)),[['n'],['f'],['d'],['s']]);
  const page=(id:string)=>text(agentsPageRows(cards,{width:120,height:24,now:6000,tab:0,selectedId:id,glyph:'*'})).join('\n');
  assert.match(page('s'),/ All 5 .* Waiting for you 1 .* Errors 1 .* Finished 1 .* Stopped 1/u);
  assert.match(page('s'),/stopped · qwen3-coder/u);assert.match(page('f'),/did not finish · qwen3-coder/u);
});

test('FE-048 the foot offers only the keys the selected agent takes, and the Timeline only its own',()=>{
  const foot=(cards:AgentCard[],selectedId:string|null,view=0)=>text(agentsPageRows(cards,{width:120,height:20,now:6000,view,tab:0,selectedId,glyph:'*'})).at(-1)!;
  assert.match(foot([a1()],'a1'),/x stop/u);assert.doesNotMatch(foot([a1()],'a1'),/space reply/u);
  assert.match(foot([a2()],'a2'),/space reply · x stop/u);
  const ended=a3({state:'done',endMs:1});
  assert.doesNotMatch(foot([ended],'a3'),/x stop|space reply/u);assert.match(foot([ended],'a3'),/enter open/u);
  assert.doesNotMatch(foot([],null),/x stop|enter open/u);
  assert.equal(foot([a1()],null,1),' ←/→ list');
});

test('FE-048 the two views are one click each, and the filters belong to the list',()=>{
  const verbs=(view:number)=>agentsPageRows(pageCards(),{width:120,height:30,now:6000,view,tab:0,selectedId:'a1',glyph:'*'}).flat().flatMap(segment=>(segment as {action?:string}).action?[(segment as {action?:string}).action!]:[]);
  for(const verb of ['aview:0','aview:1','atab:4'])assert.ok(verbs(0).includes(verb),verb);
  assert.ok(verbs(1).includes('aview:0'));assert.ok(!verbs(1).some(verb=>verb.startsWith('atab:')),'no filter on a chart');
});
