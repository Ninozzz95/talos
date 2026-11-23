/* FE-048, A9 of MAPPA-RIDISEGNO-2026-11-01: the right panel as pure rows. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hitElementAt,hitTargets} from '../../src/tui/hit-map.ts';
import {PANEL_COLUMNS} from '../../src/tui/regions/frame-shape.ts';
import {agentsCard,contextCard,openBodies,PANEL_CARDS,sidePanelRows,type PanelCard,type PanelState} from '../../src/tui/regions/side-panel.ts';
import type {AgentCard} from '../../src/tui/agents-panel.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const row=(text:string)=>[{text,roles:['dim']}];
const cards:PanelCard[]=[
  {id:'context',title:'Context',summary:'42%',rows:[row('one'),row('two')]},
  {id:'agents',title:'Agents',summary:'1 running',rows:[row('three'),row('four'),row('five')]},
];
const state=(over:Partial<PanelState>={}):PanelState=>({width:PANEL_COLUMNS,height:20,title:'Session details',cards,open:new Set(['context','agents']),selected:0,focused:false,...over});
const text=(cells:readonly {text:string}[])=>cells.map(segment=>segment.text).join('');

test('every row fills the band exactly, at every height',()=>{
  for(let height=1;height<=40;height+=1){
    const rows=sidePanelRows(state({height}));
    assert.equal(rows.length,height);
    for(const cells of rows)assert.equal(displayWidth(text(cells)),PANEL_COLUMNS,text(cells));
  }
});

test('a card shows its summary, and folds when closed',()=>{
  const open=sidePanelRows(state()).map(text).join('\n');
  assert.match(open,/▾ Context\s+42% /u);assert.match(open,/one/u);
  const closed=sidePanelRows(state({open:new Set()})).map(text).join('\n');
  assert.match(closed,/▸ Context\s+42% /u);assert.doesNotMatch(closed,/one/u);
});

test('when the rows run out the least recent card folds, never the selected one, and no row is cut',()=>{
  assert.deepEqual([...openBodies(state({height:8}))],['context'],'the last card folds first');
  assert.deepEqual([...openBodies(state({height:8,selected:1}))],['agents'],'the selected one stays');
  assert.deepEqual([...openBodies(state({height:20}))],['context','agents']);
});

test('a head is one element across the band; a body lights up nowhere',()=>{
  const rows=sidePanelRows(state());const targets=hitTargets([{x:0,y:0,rows}]);
  const hit=hitElementAt(targets,{row:1,col:20});
  assert.equal(new Set(hit.map(target=>target.row)).size,1);
  assert.equal(Math.min(...hit.map(target=>target.from)),0);assert.equal(Math.max(...hit.map(target=>target.to)),PANEL_COLUMNS-1);
  assert.deepEqual(hitElementAt(targets,{row:2,col:5}),[]);
});

const agent=(over:Partial<AgentCard>):AgentCard=>({id:'x',task:'Audit',prompt:'',model:null,state:'working',ok:true,startMs:0,endMs:null,tokens:0,activity:'',log:[],...over} as AgentCard);

test('the agents card lists the live ones, a finished one stays out, a question is what it shows',()=>{
  const card=agentsCard([agent({id:'a',activity:'Reading'}),agent({id:'b',state:'needs',task:'Tests',question:{q:'Which sandbox?',options:[]}}),agent({id:'c',state:'done',task:'Docs'})],38);
  assert.equal(card.summary,'2 running · 1 waiting');
  const shown=card.rows.map(text).join('\n');
  assert.match(shown,/Audit +\S+\n {2}Reading/u);assert.match(shown,/asks: Which sandbox/u);assert.doesNotMatch(shown,/Docs/u);
});

test('an agent in the card is one element and opens the page on it',()=>{
  const card=agentsCard([agent({id:'a',activity:'Reading'})],38);
  const rows=sidePanelRows({...state(),cards:[card]});const targets=hitTargets([{x:0,y:0,rows}]);
  const hit=hitElementAt(targets,{row:2,col:5});
  assert.deepEqual([...new Set(hit.map(target=>target.action))],['agentpage:a']);
  assert.equal(new Set(hit.map(target=>target.row)).size,2,'the task and what it does light up together');
});

test('the context card: the share, the bar, the amounts; an unknown window draws no number',()=>{
  const card=contextCard({percent:42,contextTokens:84_000,windowTokens:200_000} as any,38);
  assert.equal(card.summary,'42%');
  assert.match(card.rows.map(text).join('\n'),/█+░+\n84\.0k of 200k|█+░+\n84k of 200k/u);
  const none=contextCard(null,38);
  assert.equal(none.summary,'?');assert.equal(none.rows.length,1);
});

test('an agent at work in the card moves and counts, and the seconds keep their column',()=>{
  const card=agentsCard([agent({id:'a',startMs:1000,task:'A task with a long enough name to reach the seconds column'})],38,{now:66000,glyph:'⠙'});
  const row=text(card.rows[0]!);
  assert.ok(row.startsWith('⠙ A task'),row);assert.ok(row.endsWith('1m 05s')||/\d+s$/u.test(row),row);
  assert.equal(displayWidth(row),37);
});

test('the keys know the same cards the panel draws',()=>{assert.deepEqual([...PANEL_CARDS],['context','agents']);});
