/* C11c (A2): New session's «Where we work» with the mockup's four filters (bozzetto-cli-retro/index.html:1288, 1300-1302, 469; frame 31). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {sheetStep,shelfSheet} from '../../src/tui/panel/commands.ts';
import {pageRows} from '../../src/tui/panel/page.ts';
import {listItems,panelClick,panelKey} from '../../src/tui/panel/sheet.ts';
import type {ShelfView} from '../../src/tui/panel/shelf.ts';

const view=():Omit<ShelfView,'selected'|'disk'|'list'>=>({projects:[{name:'shop-api',path:'C:/projects/shop-api',sessions:[]},{name:'docs-site',path:'C:/projects/docs-site',sessions:[]}],now:0,glyph:'·'});
const paint={data:view,mode:{color:false,unicode:true},colors:()=>null};
const picks={recent:[{name:'shop-api',path:'C:/projects/shop-api'},{name:'landing-2026',path:'C:/projects/landing-2026'}],
  quick:[{name:'Desktop',path:'C:/Users/me/Desktop'},{name:'Documents',path:'C:/Users/me/Documents'}],disks:[{name:'C:',path:'C:\\'},{name:'D:',path:'D:\\'}]};
const open=()=>shelfSheet(paint,undefined,{tab:0,current:'shop-api',here:'C:/projects/shop-api',picks});
const text=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('').trimEnd());
const body=(panel:any)=>panel.tabs[0].body;
const shown=(panel:any)=>listItems(body(panel)).map(item=>item.label);

test('the four filters stand over the list in the mockup\'s order, Project first',()=>{
  const sheet=open();
  assert.deepEqual(body(sheet.panel).filters.map((filter:any)=>filter.name),['Project','Recently used','Quick pick','Disk']);
  assert.deepEqual(shown(sheet.panel),['shop-api','docs-site']);
  const rows=text(pageRows(sheet.panel,80,23,{terminalColumns:80}));
  assert.ok(rows.some(row=>/^ +Project +Recently used +Quick pick +Disk$/u.test(row)),rows.join('\n'));
});

test('the row of keys says [ ] filter after / search and before tab, as the mockup\'s (index.html:469, 472)',()=>{
  const keys=text(pageRows(open().panel,120,30,{terminalColumns:120})).at(-1)!;
  assert.match(keys,/\/ search +\[ \] filter +tab next tab +esc close/u,keys);
});

test('] and [ walk the filters, and each shows its own folders',()=>{
  let panel=open().panel;
  panel=panelKey(panel,{name:']'}).panel;assert.deepEqual(shown(panel),['shop-api','landing-2026']);
  panel=panelKey(panel,{name:']'}).panel;assert.deepEqual(shown(panel),['Desktop','Documents']);
  panel=panelKey(panel,{name:']'}).panel;assert.deepEqual(shown(panel),['C:','D:']);
  panel=panelKey(panel,{name:']'}).panel;assert.deepEqual(shown(panel),['shop-api','docs-site'],'round');
  panel=panelKey(panel,{name:'['}).panel;assert.deepEqual(shown(panel),['C:','D:']);
  assert.deepEqual(shown(panelClick(open().panel,'pfilter:2').panel),['Desktop','Documents'],'a click on a filter');
  assert.deepEqual(shown(panelClick(open().panel,'pkey:]').panel),['shop-api','landing-2026'],'a click on [ ] filter');
});

test('Enter: this folder goes on to How whatever the filter, another folder opens as a typed path does',()=>{
  const sheet=open();
  const at=(filter:number,down:number)=>{let panel=panelClick(sheet.panel,`pfilter:${filter}`).panel;for(let step=0;step<down;step+=1)panel=panelKey(panel,{name:'ArrowDown'}).panel;return sheetStep(sheet,panelKey(panel,{name:'Enter'}));};
  assert.equal(at(1,0).sheet!.panel.tab,1,'the recent row of this folder');
  assert.deepEqual(at(1,1).action,{kind:'openFolder',path:'C:/projects/landing-2026'});
  assert.deepEqual(at(2,0).action,{kind:'openFolder',path:'C:/Users/me/Desktop'});
  assert.deepEqual(at(3,1).action,{kind:'openFolder',path:'D:\\'});
});

test('Enter: a folder that only shares this one\'s name is another folder, and it opens',()=>{
  const sheet=shelfSheet(paint,undefined,{tab:0,current:'shop-api',here:'C:/projects/shop-api',picks:{...picks,recent:[{name:'shop-api',path:'D:/old/shop-api'}]}});
  const panel=panelClick(sheet.panel,'pfilter:1').panel;
  assert.equal(listItems(body(panel))[0]!.badge,undefined);
  assert.deepEqual(sheetStep(sheet,panelKey(panel,{name:'Enter'})).action,{kind:'openFolder',path:'D:/old/shop-api'});
});

test('the shelf tab keeps the suggestions: a key there and back to Where we work, the filters still have their rows',()=>{
  const sheet=shelfSheet(paint,undefined,{tab:2,current:'shop-api',here:'C:/projects/shop-api',picks});
  const after=sheetStep(sheet,panelKey(sheet.panel,{name:'ArrowDown'})).sheet!;
  assert.deepEqual(after.context?.shelf?.picks,picks);
  assert.deepEqual(shown(panelClick(panelClick(after.panel,'ptab:0').panel,'pfilter:3').panel),['C:','D:']);
});

test('the detail names the folder and its whole path, and this folder carries «here» in every filter',()=>{
  const panel=panelClick(open().panel,'pfilter:1').panel;
  const item=listItems(body(panel))[0]!;
  assert.equal(item.badge,'here');
  const detail=text(body(panel).detail(item,40));
  assert.deepEqual(detail.slice(0,2),['shop-api','C:/projects/shop-api']);
});

test('with no suggestions read yet the projects are as before and the other filters are empty, never invented',()=>{
  const sheet=shelfSheet(paint,undefined,{tab:0,current:'shop-api'});
  assert.deepEqual(shown(sheet.panel),['shop-api','docs-site']);
  assert.deepEqual(shown(panelKey(sheet.panel,{name:']'}).panel),[]);
});
