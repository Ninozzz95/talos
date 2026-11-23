/* B2 of MAPPA-RIDISEGNO: a page is a sheet with more room. Tabs and filters slide, one row of keys with the rest behind `?`, a toast row. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {displayWidth} from '../../src/tui/text-width.ts';
import {filtersRow,pageKeyRows,pageRows,pageWideFrom,slidingRow,tabsRow} from '../../src/tui/panel/page.ts';
import {listItems,one,panelClick,panelKey,type ListBody,type Panel} from '../../src/tui/panel/sheet.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const voice=(name:string)=>[{text:` ${name} `,roles:[]},{text:' ',roles:[]}];
const items=[{label:'Alpha',meta:'open'},{label:'Beta',meta:'done'},{label:'Gamma',meta:'open'}];
const list=(over:Partial<ListBody>={}):ListBody=>({kind:'list',items,sel:0,enter:'open',...over});
const page=(body=list()):Panel=>({...one('Tasks','3 tasks',body),page:true});
const filters=[{name:'All'},{name:'Open',match:(item:{meta?:string})=>item.meta==='open'},{name:'Done',match:(item:{meta?:string})=>item.meta==='done'}];

test('a window of voices: all of them when they fit, the active one always, and a mark where more are hidden',()=>{
  const voices=['one','two','three','four','five','six'].map(voice);
  assert.equal(text(slidingRow(voices,0,80)).includes('six'),true);
  for(let active=0;active<6;active+=1){
    const row=text(slidingRow(voices,active,20));
    assert.ok(displayWidth(row)<=20,row);
    assert.ok(row.includes(['one','two','three','four','five','six'][active]!),`the active voice left: ${row}`);
  }
  assert.match(text(slidingRow(voices,0,20)),/›$/u);
  assert.match(text(slidingRow(voices,5,20)),/^‹ /u);
});

test('tabs carry their click, and the active one stands out',()=>{
  const panel:Panel={title:'Models',tab:1,tabs:[{name:'Providers',body:list()},{name:'System',body:list()}]};
  const row=tabsRow(panel,60);
  assert.ok(row.some(segment=>segment.action==='ptab:0'));
  assert.ok(row.find(segment=>segment.action==='ptab:1')!.roles.includes('inv'));
});

test('filters: `[` and `]` change them on a page, the list follows, and a click chooses one',()=>{
  let panel=page(list({filters}));
  panel=panelKey(panel,{name:']'}).panel;
  assert.deepEqual(listItems(panel.tabs[0]!.body as ListBody).map(item=>item.label),['Alpha','Gamma']);
  panel=panelKey(panel,{name:']'}).panel;
  assert.deepEqual(listItems(panel.tabs[0]!.body as ListBody).map(item=>item.label),['Beta']);
  panel=panelKey(panel,{name:'['}).panel;panel=panelKey(panel,{name:'['}).panel;panel=panelKey(panel,{name:'['}).panel;
  assert.equal((panel.tabs[0]!.body as ListBody).filterAt,2,'it wraps around');
  panel=panelClick(panel,'pfilter:1').panel;
  assert.equal((panel.tabs[0]!.body as ListBody).filterAt,1);
  assert.ok(filtersRow(panel.tabs[0]!.body as ListBody,40).find(segment=>segment.text.includes('Open'))!.roles.includes('acc'));
});

test('`[`, `]` and `?` stay text while a filter or an edit is typed, and off a page',()=>{
  const typing=page(list({filters,filterable:true,filtering:true}));
  const typed=panelKey(typing,{name:'['}).panel;
  assert.equal((typed.tabs[0]!.body as ListBody).filter,'[');
  const editing={...page(),edit:{label:'Name',value:''}};
  assert.equal(panelKey(editing,{name:'?'}).panel.edit?.value,'?');
  const sheet=one('Tasks','',list({filters}));
  assert.equal((panelKey(sheet,{name:']'}).panel.tabs[0]!.body as ListBody).filterAt,undefined);
  assert.equal(panelKey(sheet,{name:'?'}).panel.moreKeys,undefined);
});

test('one row of keys: what does not fit goes behind `?`, Esc stays, and `?` opens the second row',()=>{
  const body=list({keys:[{key:'n',label:'new note'},{key:'e',label:'edit the note'},{key:'d',label:'delete'},{key:'x',label:'export it'}],filterable:true});
  const narrow=pageKeyRows(page(body),44);
  assert.equal(narrow.length,1);
  const row=text(narrow[0]!);
  assert.ok(displayWidth(row.trimEnd())<=44,row);
  assert.match(row,/\? more/u);assert.match(row,/esc close/u);
  const open=pageKeyRows(panelKey(page(body),{name:'?'}).panel,44);
  assert.equal(open.length,2);assert.match(open.map(text).join(''),/export it/u);
  assert.equal(pageKeyRows(page(body),160).length,1);
  assert.doesNotMatch(text(pageKeyRows(page(body),160)[0]!),/\? more/u,'all fit: no `?`');
});

test('a page has exactly its height, says a toast on its own row, and closes with Esc',()=>{
  const rows=pageRows(page(),80,20,{toast:'Saved'});
  assert.equal(rows.length,20);
  assert.match(text(rows[0]!),/^── Tasks 3 tasks ─+ ✕$/u);
  assert.match(text(rows.at(-2)!),/✓ Saved/u);
  assert.equal(panelKey(page(),{name:'Escape'}).effect.kind,'close');
});

test('side by side from 84 columns of page, in a terminal of at least 100',()=>{
  assert.equal(pageWideFrom(120),84);
  assert.equal(pageWideFrom(99),Number.POSITIVE_INFINITY);
  const body=list({detail:item=>[[{text:`detail of ${item.label}`,roles:[]}]]});
  assert.match(pageRows(page(body),90,10,{terminalColumns:150}).map(text).join('\n'),/Alpha.*│ .*detail of Alpha/u);
  assert.doesNotMatch(pageRows(page(body),90,10,{terminalColumns:90}).map(text).join('\n'),/Alpha.*│ .*detail of Alpha/u);
});

test('a long diff scrolls on a page, says what is left, and starts again on the next file',()=>{
  const hunks=Array.from({length:40},(_,index)=>`+line ${index}`);
  const diff={kind:'diff' as const,sel:0,off:0,files:[{path:'a.ts',add:40,del:0,note:'',hunks},{path:'b.ts',add:1,del:0,note:'',hunks:['+other']}]};
  let panel:Panel={...one('Review','',diff),page:true};
  const shown=()=>pageRows(panel,120,12,{terminalColumns:120}).map(text).join('\n');
  assert.match(shown(),/↓ \d+ more/u);
  panel=panelKey(panel,{name:'PageDown'}).panel;
  assert.match(shown(),/line 8\b/u);assert.doesNotMatch(shown(),/line 0\b/u);
  panel=panelKey(panel,{name:'ArrowDown'}).panel;
  assert.match(shown(),/\+other/u);assert.equal((panel.tabs[0]!.body as any).off,0);
});

test('a narrow page scrolls its file too, and says what is left',()=>{
  const hunks=Array.from({length:40},(_,index)=>`+line ${index}`);
  let panel:Panel={...one('Review','',{kind:'diff',sel:0,off:0,files:[{path:'a.ts',add:40,del:0,note:'',hunks}]}),page:true};
  assert.match(pageRows(panel,70,12,{terminalColumns:70}).map(text).join('\n'),/↓ \d+ more/u);
  panel=panelKey(panel,{name:'PageDown'}).panel;
  assert.doesNotMatch(pageRows(panel,70,12,{terminalColumns:70}).map(text).join('\n'),/line 0\b/u);
});

test('a page note in the warning tone: its mark takes the theme warning, the words stay the same; every other note as before',()=>{
  const noteRow=(tone?:'warn')=>pageRows(page(),80,12,{note:'Weekly report: starts in 42 minutes',...(tone?{noteTone:tone}:{})}).find(row=>text(row).includes('Weekly report'))!;
  assert.deepEqual(noteRow('warn')[0],{text:' · ',roles:['warn']},'the mockup\'s mark (index.html:509, 2532)');
  assert.deepEqual(noteRow()[0],{text:' · ',roles:['faint']},'a note with no tone keeps its faint mark');
  assert.equal(text(noteRow('warn')),text(noteRow()),'without colour the same words: the tone is colour only');
  assert.deepEqual(noteRow('warn')[1]!.roles,['dim']);
});
