/* FE-048, A8 of MAPPA-RIDISEGNO-2026-11-01: the left bar as pure rows. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hitElementAt,hitTargets} from '../../src/tui/hit-map.ts';
import {BAR_COLUMNS} from '../../src/tui/regions/frame-shape.ts';
import {BAR_GROUPS,BAR_TOP,barEntries,sideBarRows,type BarState} from '../../src/tui/regions/side-bar.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const state=(over:Partial<BarState>={}):BarState=>({width:BAR_COLUMNS,height:29,open:new Set(),selected:0,focused:false,sessions:[],...over});
const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');

test('every row fills the band exactly, at every height',()=>{
  for(let height=4;height<=60;height+=1){
    const rows=sideBarRows(state({height,open:new Set(['spaces','tools']),sessions:[{id:'s',title:'A very long conversation title indeed',mark:'✓',role:'ok',when:'18:09',current:false}]}));
    assert.equal(rows.length,height);
    for(const row of rows)assert.equal(displayWidth(text(row)),BAR_COLUMNS,text(row));
  }
});

test('the groups are closed by default, and their voices appear when opened',()=>{
  const closed=sideBarRows(state()).map(text).join('\n');
  assert.match(closed,/▸ Workspaces/u);assert.doesNotMatch(closed,/Notes/u);
  const open=sideBarRows(state({open:new Set(['spaces'])})).map(text).join('\n');
  assert.match(open,/▾ Workspaces/u);assert.match(open,/n Notes/u);
});

test('settings stays at the bottom, and only voices with a surface are drawn',()=>{
  const rows=sideBarRows(state()).map(text);
  assert.match(rows.at(-1)!,/i Settings/u);
  assert.equal(rows.join('\n').includes('Home'),false);
  for(const voice of [...BAR_TOP,...BAR_GROUPS.flatMap(group=>group.voices)])assert.match(voice.command,/^\/[a-z]+$/u);
});

test('a voice is its whole band and nothing else: the owner\'s «Fascia intera»',()=>{
  const rows=sideBarRows(state());
  const targets=hitTargets([{x:0,y:0,rows}]);
  const row=rows.findIndex(cells=>text(cells).includes('New session'));
  const hit=hitElementAt(targets,{row,col:0});
  assert.ok(hit.length>0);
  assert.equal(new Set(hit.map(target=>target.row)).size,1);
  assert.equal(Math.min(...hit.map(target=>target.from)),0);assert.equal(Math.max(...hit.map(target=>target.to)),BAR_COLUMNS-1);
  assert.deepEqual(hitElementAt(targets,{row:0,col:3}),[],'TALOS is not a target while Home has no page');
});

test('the keyboard walks the voices in the order drawn, the sessions included',()=>{
  const entries=barEntries({open:new Set(),height:29,sessions:[{id:'a',title:'A',mark:'✓',role:'ok',when:'',current:false}]});
  assert.deepEqual(entries.map(entry=>entry.kind==='voice'?entry.voice.id:entry.kind==='group'?entry.group.id:entry.session.id),['new','search','spaces','tools','a','settings']);
});

test('the selected voice shows it, only with the focus on the bar',()=>{
  assert.match(text(sideBarRows(state({focused:true,selected:0}))[2]!),/^ › \+ New session/u);
  assert.match(text(sideBarRows(state({focused:false,selected:0}))[2]!),/^ {3}\+ New session/u);
});
