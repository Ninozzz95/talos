/* Giro piccolo of A2 (judge v2244): the Home as a page (Alt+H) has the mockup's group headings, not filters (bozzetto-cli-retro/index.html:959-961),
   and each filter of New session says its own empty line, in the form of «No projects yet.». */
import assert from 'node:assert/strict';
import test from 'node:test';
import {homeSheet,shelfSheet} from '../../src/tui/panel/commands.ts';
import {pageRows} from '../../src/tui/panel/page.ts';
import {panelClick,panelKey} from '../../src/tui/panel/sheet.ts';

const text=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('').trimEnd());
const home=()=>homeSheet([{id:'s1',title:'Flaky login',state:'waiting',when:'1m'}]);

test('Alt+H: no filter row, the three groups stand as headings in the mockup\'s order',()=>{
  const body=home().panel.tabs[0]!.body as any;
  assert.equal(body.filters,undefined);
  const rows=text(pageRows(home().panel,120,30,{terminalColumns:120}));
  assert.ok(!rows.some(row=>/\bAll\s+Start a job/u.test(row)),rows.join('\n'));
  const at=(word:string)=>rows.findIndex(row=>row.trim()===word);
  assert.ok(at('Start a job')>0&&at('Pick up your work')>at('Start a job')&&at('Organize your work')>at('Pick up your work'),rows.join('\n'));
  assert.deepEqual(body.items.map((item:any)=>item.group),['Start a job','Start a job','Start a job','Pick up your work','Pick up your work','Organize your work','Organize your work','Organize your work']);
});

test('Alt+H: the keys no longer offer a filter, and [ ] or Tab move nothing',()=>{
  const sheet=home();
  const keys=text(pageRows(sheet.panel,120,30,{terminalColumns:120})).at(-1)!;
  assert.doesNotMatch(keys,/next filter|\[ \] filter/u,keys);
  assert.deepEqual(panelKey(sheet.panel,{name:']'}).panel.tabs[0]!.body,sheet.panel.tabs[0]!.body);
});

test('New session: each empty filter says its own line',()=>{
  const sheet=shelfSheet({data:()=>({projects:[],now:0,glyph:'·'}),mode:{color:false,unicode:true},colors:()=>null},undefined,{tab:0,current:''});
  const empty=(filter:number)=>text(pageRows(panelClick(sheet.panel,`pfilter:${filter}`).panel,120,30,{terminalColumns:120})).join('\n');
  assert.match(empty(0),/No projects yet\./u);
  assert.match(empty(1),/No recent folders yet\./u);
  assert.match(empty(2),/No quick folders here\./u);
  assert.match(empty(3),/No disks found\./u);
});
