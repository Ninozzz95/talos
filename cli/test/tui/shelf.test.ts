/* FE-052: the shelf the owner chose, in its three forms. A shelf is a project, a disk a session. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hitElementAt,hitTargets} from '../../src/tui/hit-map.ts';
import {listItems,panelClick,panelKey,panelRows,hintRow} from '../../src/tui/panel/sheet.ts';
import {homeSheet,leaveSheet,sheetStep,shelfSheet} from '../../src/tui/panel/commands.ts';
import {Pixels,shelfBackgroundsCached,shelfForm,shelfAutomation,shelfPick,shelfProjects,shelfRows,shelfText,type ShelfProject,type ShelfView} from '../../src/tui/panel/shelf.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const FULL={color:true,unicode:true};
const colors={accent:'#c98b32',background:'#080b11',foreground:'#ece9e2',warning:'#e3b341',success:'#7ccf8a'};
const projects:ShelfProject[]=[
  {name:'shop-api',sessions:[{id:'a',title:'Flaky login',state:'working',context:72,agents:2,startedAtMs:1000},{id:'b',title:'Session store',state:'waiting',context:41,agents:0},{id:'c',title:'Prices',state:'stopped',context:18,agents:0},{id:'d',title:'Refunds',state:'done',context:91,agents:0}]},
  {name:'docs-site',sessions:[{id:'e',title:'API guide',state:'done',context:null,agents:0}]},
  {name:'ops-tools',sessions:[]},
];
const view=(over:Partial<ShelfView>={}):ShelfView=>({projects,selected:0,now:136_000,glyph:'⠙',...over});
const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');

test('the form follows the page and the colours: rich from 92×14 (a 20-row window), the list under 60×12',()=>{
  assert.equal(shelfForm(120,30,FULL),'rich');assert.equal(shelfForm(92,14,FULL),'rich');
  assert.equal(shelfForm(91,20,FULL),'simple');assert.equal(shelfForm(92,13,FULL),'simple');
  assert.equal(shelfForm(120,30,{color:false,unicode:true}),'simple');
  assert.equal(shelfForm(120,30,{color:true,unicode:false}),'simple');
  assert.equal(shelfForm(59,30,FULL),'list');assert.equal(shelfForm(120,11,FULL),'list');
});

for(const [w,h] of [[120,30],[92,20],[160,45],[80,24],[60,12],[59,30],[40,11]] as const)test(`no cell leaves the page at ${w}×${h}`,()=>{
  const rows=shelfRows(view({automation:{title:'Nightly backup',minutes:12}}),w,h,{mode:FULL,colors});
  assert.ok(rows.length<=h,`${rows.length} rows`);
  for(const row of rows)assert.ok(displayWidth(text(row))<=w,text(row));
});

test('the rich scene carries the true text in plain cells: names, percents, seconds, sub-agents',()=>{
  const all=shelfRows(view({automation:{title:'Nightly backup',minutes:12}}),120,30,{mode:FULL,colors}).map(text).join('\n');
  for(const word of ['shop-api','Flaky login','72%','▪▪','⠙ 2m 15s','Nightly backup'])assert.ok(all.includes(word),`${word} is not there`);
  assert.ok(all.includes('?%'),'an unknown context says so, never zero');
});

test('a disk is one element across its rows; the wall and the wood light up nowhere',()=>{
  const rows=shelfRows(view(),120,30,{mode:FULL,colors});const targets=hitTargets([{x:0,y:0,rows}]);
  const row=rows.findIndex(cells=>text(cells).includes('Flaky login')),col=text(rows[row]!).indexOf('Flaky login');
  const hit=hitElementAt(targets,{row,col});
  assert.ok(new Set(hit.map(target=>target.row)).size>=4,'the whole disk');
  assert.ok(hit.every(target=>target.action==='shelf:session:a'));
  assert.deepEqual(hitElementAt(targets,{row:0,col:1}),[]);
});

test('the background is painted once, and again only for another shelf or size',()=>{
  const first=()=>shelfRows(view(),100,24,{mode:FULL,colors});
  first();const after=shelfBackgroundsCached();first();first();
  assert.equal(shelfBackgroundsCached(),after);
  shelfRows(view({selected:1}),100,24,{mode:FULL,colors});
  assert.equal(shelfBackgroundsCached(),after+1);
});

test('a frame that only ticks changes a few rows, not the page',()=>{
  const a=shelfRows(view({now:136_000,glyph:'⠙'}),120,30,{mode:FULL,colors}).map(text);
  const b=shelfRows(view({now:137_000,glyph:'⠹'}),120,30,{mode:FULL,colors}).map(text);
  const changed=a.filter((row,index)=>row!==b[index]).length;
  assert.ok(changed>0&&changed<=2,`${changed} rows changed`);
});

test('without colour or Unicode the simple form has no hex role and, in ASCII, no block',()=>{
  const plain=shelfRows(view(),80,24,{mode:{color:false,unicode:false},colors:null});
  assert.ok(plain.every(row=>row.every(segment=>!segment.roles.some(role=>/^[fg]:/u.test(role)))));
  assert.ok(plain.every(row=>/^[\x20-\x7e⠙]*$/u.test(text(row))),plain.map(text).join('\n'));
});

test('an empty shelf says so, and a small window names each project with its sessions',()=>{
  assert.match(text(shelfRows(view({projects:[]}),120,30,{mode:FULL,colors})[0]!),/No/u);
  const rows=shelfRows(view(),50,10,{mode:FULL,colors}).map(text).join('\n');
  assert.match(rows,/shop-api.*4 sessions.*1 working/u);
});

test('in words, the same facts',()=>{
  const lines=shelfText(view());
  assert.ok(lines.some(line=>line.includes('shop-api')));
  assert.ok(lines.some(line=>line.includes('Flaky login')&&line.includes('72%')));
});

test('three shelves stand even with one project, and the page ends with the chosen disk in words',()=>{
  const rows=shelfRows(view({projects:[projects[0]!]}),120,30,{mode:FULL,colors});
  const wood=rows.filter(row=>row.some(segment=>segment.roles.includes('f:#8c6038')||segment.roles.some(role=>/^f:#[6-9][0-9a-f]4/u.test(role)))).length;
  assert.ok(rows.length>=25,String(rows.length));assert.ok(wood>=3,String(wood));
  assert.match(text(rows.at(-1)!),/Flaky login +72% · 2 sub-agents · 2m 15s/u);
});

test('a conversation with no known context and one that waits say so in words',()=>{
  const row=(disk:number,selected=0)=>text(shelfRows(view({disk,selected}),120,30,{mode:FULL,colors}).at(-1)!);
  assert.match(row(1),/41% · waiting/u);
  assert.match(row(0,1),/\?% · done/u);
});

test('in words, as the mockup says them: no glyph, the sub-agents, and the automation to come last',()=>{
  const lines=shelfText(view({automation:{title:'Nightly backup',minutes:12}}));
  assert.deepEqual(lines,['Project shop-api.','Conversation Flaky login: context 72%, 2m 15s, 2 sub-agents.','Conversation Session store: context 41%, waiting for you.',
    'Conversation Prices: context 18%, stopped.','Conversation Refunds: context 91%, done.','Project docs-site.','Conversation API guide: context ?, done.','Project ops-tools.','Coming: Nightly backup in 12 minutes.']);
  assert.equal(shelfText(view({automation:{title:'Soon',minutes:1}})).at(-1),'Coming: Soon in 1 minute.');
  assert.equal(shelfText(view()).at(-1),'Project ops-tools.','no automation, no line');
});

test('plain mode (the screen reader): the page is the list in words, the same at any size, nothing drawn',()=>{
  const paint={data:()=>view({automation:{title:'Nightly backup',minutes:12}}),mode:{color:false,unicode:false,plain:true},colors:()=>null};
  const lines=(width:number,height:number)=>(shelfSheet(paint).panel.tabs[2]!.body as any).lines(width,height,0).map(text);
  assert.deepEqual(lines(120,40),shelfText(paint.data()));
  assert.deepEqual(lines(80,24),shelfText(paint.data()),'the scene would be the simple rows here');
  assert.ok(lines(40,30).every((line:string)=>displayWidth(line)<=40),'a long line goes on below, it never leaves the page');
  assert.ok(lines(40,30).join(' ').includes('Coming: Nightly backup in 12 minutes.'));
  const drawn=(shelfSheet({...paint,mode:{color:false,unicode:false}}).panel.tabs[2]!.body as any).lines(80,24,0).map(text);
  assert.notDeepEqual(drawn,lines(80,24),'without plain, the drawing as before');
  assert.match(text((shelfSheet({...paint,data:()=>view({projects:[]})}).panel.tabs[2]!.body as any).lines(80,24,0)[0]),/No conversations yet/u);
});

test('plain mode: «e list» leaves the keys, since the words are the list already; out of plain it stays, and e still toggles',()=>{
  const hints=(mode:any)=>text(hintRow(shelfSheet({data:()=>view(),mode,colors:()=>null}).panel));
  assert.doesNotMatch(hints({color:false,unicode:false,plain:true}),/\be +list\b/u);
  assert.match(hints({color:false,unicode:false,plain:true}),/←\/→ +project/u,'the other keys stay');
  assert.match(hints(FULL),/\be +list\b/u);assert.match(hints({color:false,unicode:false}),/\be +list\b/u);
  const sheet=shelfSheet({data:()=>view(),mode:FULL,colors:()=>colors});
  assert.equal(sheetStep(sheet,panelKey(sheet.panel,{name:'e'})).sheet?.context?.shelf?.pick.list,true);
});

test('only the dashed disk speaks in the warning tone: the other notices of the pages keep none',()=>{
  const data=()=>view({projects:[{name:'here',sessions:[]},{name:'lost',sessions:[]}]});
  const sheet=shelfSheet({data,mode:FULL,colors:()=>colors},undefined,{tab:0,current:'here'});
  const action=sheetStep(sheet,panelKey(panelKey(sheet.panel,{name:'ArrowDown'}).panel,{name:'Enter'})).action as any;
  assert.equal(action.kind,'notice');assert.equal('tone' in action,false);
});

test('a click on the dashed disk says when the automation starts, and the page stays',()=>{
  const paint={data:()=>view({automation:{title:'Nightly backup',minutes:12}}),mode:FULL,colors:()=>colors};
  const sheet=shelfSheet(paint);
  const step=sheetStep(sheet,{panel:sheet.panel,effect:{kind:'key',key:'shelf:automation',index:null,item:null}} as any);
  assert.deepEqual(step.action,{kind:'notice',text:'Nightly backup: starts in 12 minutes',tone:'warn'},'yellow, as the mockup (index.html:2532)');
  assert.equal(step.sheet?.name,'shelf');assert.deepEqual(step.sheet?.context?.shelf?.pick,{selected:0,disk:0,list:false});
  assert.equal(shelfPick({selected:0,disk:0,list:false},projects,'shelf:automation',{title:'Soon',minutes:1}).notice,'Soon: starts in 1 minute');
  assert.deepEqual(shelfPick({selected:0,disk:0,list:false},projects,'shelf:automation',null),{pick:{selected:0,disk:0,list:false}},'gone meanwhile: nothing to say');
  const rows=shelfRows(paint.data(),120,30,{mode:FULL,colors}),targets=hitTargets([{x:0,y:0,rows}]);
  const row=rows.findIndex(cells=>text(cells).includes('Nightly backup')),col=text(rows[row]!).indexOf('Nightly backup');
  assert.ok(hitElementAt(targets,{row,col}).every(target=>target.action==='shelf:automation'),'the click reaches the dashed disk');
});

test('the drive stands on the emptiest shelf from 116 columns, and only where it fits',()=>{
  const dark=(w:number)=>shelfRows(view(),w,30,{mode:FULL,colors}).flat().some(segment=>segment.roles.includes('f:#f0ead9')||segment.roles.includes('g:#f0ead9'));
  assert.equal(dark(120),true);assert.equal(dark(100),false);
  const full=Array.from({length:3},(_,index):ShelfProject=>({name:`p${index}`,sessions:projects[0]!.sessions.map(session=>({...session,id:`${index}${session.id}`}))}));
  assert.equal(shelfRows(view({projects:full}),120,30,{mode:FULL,colors}).flat().some(segment=>segment.roles.includes('f:#f0ead9')),false,'no room: four disks on each');
});

test('the drive blinks only while the chosen shelf works',()=>{
  const lit=(state:'working'|'done',now:number)=>shelfRows(view({now,projects:[{name:'a',sessions:[{id:'x',title:'X',state,context:1,agents:0,startedAtMs:0}]}]}),120,30,{mode:FULL,colors}).flat().some(segment=>segment.roles.some(role=>role.endsWith('#ff5a3c')));
  assert.equal(lit('working',0),true);assert.equal(lit('working',500),false,'a third of the time it is dark');assert.equal(lit('done',0),false);
});

test('rows become shelves: the home folder first even when empty, sub-agents are dots and no disks',()=>{
  const row=(id:string,project:string|null,parent:string|null=null,state:'working'|'done'='done')=>({id,title:id,project,parent,state,context:null,startedAtMs:null});
  const shelves=shelfProjects([row('a','other'),row('b',null),row('c',null,'b','working'),row('d','other','a'),row('e','third')],'home');
  assert.deepEqual(shelves.map(shelf=>shelf.name),['home','other','third']);
  assert.equal(shelves[0]!.sessions[0]!.agents,1,'the child at work');
  assert.equal(shelves[1]!.sessions[0]!.agents,0,'a child that ended');
  assert.equal(shelves.flatMap(shelf=>shelf.sessions).length,3);
  assert.deepEqual(shelfProjects([row('z','other')],'home').map(shelf=>[shelf.name,shelf.sessions.length]),[['home',0],['other',1]]);
});

test('the dashed disk is the next active automation; a late one says a minute, and none, no disk',()=>{
  const at=(minutes:number)=>new Date(1_000_000+minutes*60_000).toISOString();
  const rows=[{name:'Later',active:true,nextRunAt:at(90)},{name:'Off',active:false,nextRunAt:at(1)},{name:'Soon',active:true,nextRunAt:at(12)},{name:'Never',active:true,nextRunAt:null}];
  assert.deepEqual(shelfAutomation(rows,1_000_000),{title:'Soon',minutes:12});
  assert.deepEqual(shelfAutomation([{name:'Late',active:true,nextRunAt:at(-5)}],1_000_000),{title:'Late',minutes:1});
  assert.equal(shelfAutomation([rows[1]!,rows[3]!],1_000_000),null);
  assert.equal(shelfAutomation([],1_000_000),null);
});

test('half blocks: two colours in a cell, one colour, and the empty one',()=>{
  const canvas=new Pixels(3,2);canvas.set(0,0,0xff0000);canvas.set(0,1,0x00ff00);canvas.set(1,0,0x0000ff);canvas.set(1,1,0x0000ff);
  const row=canvas.rows()[0]!;
  assert.equal(text(row),'▀█ ');
  assert.deepEqual(row[0]!.roles,['f:#ff0000','g:#00ff00']);
});

test('a short window keeps the chosen shelf in view, and a full shelf the chosen disk',()=>{
  const short=shelfRows(view({selected:2}),120,14,{mode:FULL,colors}).map(text).join('\n');
  assert.ok(short.includes('ops-tools'));assert.ok(!short.includes('shop-api'),'two shelves fit');
  const many:ShelfProject[]=[{name:'long',sessions:Array.from({length:7},(_,index)=>({id:String(index),title:`Disk ${index}`,state:'done' as const,context:10,agents:0}))}];
  const shown=(disk:number)=>shelfRows(view({projects:many,disk}),120,30,{mode:FULL,colors}).map(text).join('\n');
  assert.ok(shown(0).includes('Disk 3'));assert.ok(!shown(0).includes('Disk 4'));
  assert.ok(shown(6).includes('Disk 6'));assert.ok(!shown(6).includes('Disk 2'));
});

test('the chosen disk shows: its edge takes the accent, and only its edge',()=>{
  const paint=(disk:number)=>shelfRows(view({disk}),120,30,{mode:FULL,colors}).flat().filter(segment=>segment.action==='shelf:session:a').flatMap(segment=>segment.roles).join(' ');
  assert.notEqual(paint(0),paint(1));
});

test('the e key asks for the list whatever fits, and the list names the disks of the chosen shelf',()=>{
  const rows=shelfRows(view({list:true,disk:1}),120,30,{mode:FULL,colors}).map(text).join('\n');
  assert.ok(rows.includes('Session store'));assert.ok(!rows.includes('API guide'),'the other shelf stays closed');
  assert.ok(!rows.includes('does not fit'),'nobody asked why');
});

test('keys: ←/→ the project, ↑/↓ the disk, e the list, Enter opens; no session, nothing opens',()=>{
  const start={selected:0,disk:3,list:false};
  assert.deepEqual(shelfPick(start,projects,'ArrowRight').pick,{selected:1,disk:0,list:false},'a shelf with one disk');
  assert.equal(shelfPick(start,projects,'ArrowLeft').pick.selected,2,'it wraps');
  assert.equal(shelfPick(start,projects,'ArrowDown').pick.disk,3,'it stops at the last');
  assert.equal(shelfPick(start,projects,'ArrowUp').pick.disk,2);
  assert.equal(shelfPick({...start,disk:0},projects,'ArrowUp').pick.disk,0);
  assert.equal(shelfPick(start,projects,'e').pick.list,true);
  assert.equal(shelfPick(start,projects,'Enter').open,'d');
  assert.equal(shelfPick({selected:2,disk:0,list:false},projects,'Enter').open,undefined,'an empty shelf');
  assert.equal(shelfPick(start,[],'ArrowRight').pick.selected,0);
});

test('clicks: a project chooses it, a disk chooses it, the chosen disk opens',()=>{
  const start={selected:0,disk:0,list:false};
  assert.equal(shelfPick(start,projects,'shelf:project:1').pick.selected,1);
  assert.equal(shelfPick(start,projects,'shelf:project:9').pick.selected,0);
  const second=shelfPick(start,projects,'shelf:session:b');
  assert.deepEqual(second,{pick:{selected:0,disk:1,list:false}});
  assert.equal(shelfPick(second.pick,projects,'shelf:session:b').open,'b');
  assert.deepEqual(shelfPick(start,projects,'shelf:session:gone'),{pick:start});
});

test('the page: ←/→, ↑/↓ and Enter say themselves once, the arrows move, Enter resumes, Esc closes',()=>{
  const paint={data:()=>view(),mode:FULL,colors:()=>colors};
  const sheet=shelfSheet(paint);
  const hints=text(hintRow(sheet.panel));
  assert.equal(hints.split('←/→').length,2);assert.equal(hints.split('↑/↓').length,2);assert.ok(!hints.includes('Arrow'));
  const moved=sheetStep(sheet,panelKey(sheet.panel,{name:'ArrowDown'})).sheet!;
  assert.equal(moved.context?.shelf?.pick.disk,1);
  assert.deepEqual(sheetStep(moved,panelKey(moved.panel,{name:'Enter'})).action,{kind:'resume',id:'b'});
  assert.deepEqual(sheetStep(sheet,panelClick(sheet.panel,'pkey:enter')).action,{kind:'resume',id:'a'});
  assert.equal(sheetStep(moved,panelKey(moved.panel,{name:'Escape'})).sheet,null);
});

test('New session: the form says the model by name, m opens /model, Continue hands over what was chosen',()=>{
  const how={model:'qwen3-coder',efforts:['low','medium','high'],effort:'medium',mode:'default',plan:false};
  const sheet=shelfSheet({data:()=>view(),mode:FULL,colors:()=>colors},undefined,{tab:1,current:'shop-api',how});
  const body=sheet.panel.tabs[1]!.body as any;
  assert.deepEqual(body.fields.map((field:any)=>field.label),['Model','Reasoning','Workspace access','Optional planner']);
  assert.equal(body.fields[0].value,'qwen3-coder');
  assert.equal(body.submit,'Continue on shop-api');
  assert.deepEqual(sheetStep(sheet,panelKey(sheet.panel,{name:'m'})).action,{kind:'runCommand',name:'model'});
  const moved=panelKey(panelKey(panelKey(panelKey(sheet.panel,{name:'ArrowDown'}).panel,{name:' '}).panel,{name:'ArrowDown'}).panel,{name:' '}).panel;
  assert.deepEqual(sheetStep(sheet,panelKey(moved,{name:'Enter'})).action,{kind:'newSetup',effort:'high',mode:'acceptEdits',plan:false});
});

test('New session: no levels, no reasoning row, and the choice says null',()=>{
  const sheet=shelfSheet({data:()=>view(),mode:FULL,colors:()=>colors},undefined,{tab:1,current:'x',how:{model:'m',efforts:[],effort:'',mode:'default',plan:false}});
  assert.deepEqual((sheet.panel.tabs[1]!.body as any).fields.map((field:any)=>field.label),['Model','Workspace access','Optional planner']);
  assert.equal((sheetStep(sheet,panelKey(sheet.panel,{name:'Enter'})).action as any).effort,null);
});

test('New session: this folder goes on to How, another with a path opens it, one with no path only says how',()=>{
  const data=()=>view({projects:[{name:'here',sessions:[]},{name:'there',path:'C:/there',sessions:[]},{name:'lost',sessions:[]}]});
  const sheet=shelfSheet({data,mode:FULL,colors:()=>colors},undefined,{tab:0,current:'here'});
  const enter=(index:number)=>{const panel=index?panelKey(index>1?panelKey(sheet.panel,{name:'ArrowDown'}).panel:sheet.panel,{name:'ArrowDown'}).panel:sheet.panel;return sheetStep(sheet,panelKey(panel,{name:'Enter'}));};
  assert.equal(enter(0).sheet!.panel.tab,1);
  assert.deepEqual(enter(1).action,{kind:'openFolder',path:'C:/there'});
  assert.equal((enter(2).action as any).kind,'notice');
});

test('leaving a folder says what stops, staying comes first, and only Stop goes on',()=>{
  const sheet=leaveSheet('C:/there',['The turn in progress stops.']);
  assert.match(panelRows(sheet.panel,80,14).map(text).join('\n'),/The turn in progress stops\./u);
  assert.equal(sheetStep(sheet,panelKey(sheet.panel,{name:'Enter'})).action,null);
  const second=panelKey(sheet.panel,{name:'ArrowDown'}).panel;
  assert.deepEqual(sheetStep(sheet,panelKey(second,{name:'Enter'})).action,{kind:'openFolder',path:'C:/there',confirmed:true});
});

test('New session: the planner chosen in the form goes with the choice',()=>{
  const sheet=shelfSheet({data:()=>view(),mode:FULL,colors:()=>colors},undefined,{tab:1,current:'x',how:{model:'m',efforts:[],effort:'',mode:'default',plan:false}});
  const onPlanner=panelKey(panelKey(sheet.panel,{name:'ArrowDown'}).panel,{name:'ArrowDown'}).panel;
  const chosen=panelKey(onPlanner,{name:' '}).panel;
  assert.equal((sheetStep(sheet,panelKey(chosen,{name:'Enter'})).action as any).plan,true);
});

test('New session: the trusted folders stand beside the projects, once each, and a path can be typed',()=>{
  const data=()=>view({projects:[{name:'here',sessions:[]},{name:'there',path:'C:\\Work\\there',sessions:[]}]});
  const sheet=shelfSheet({data,mode:FULL,colors:()=>colors},undefined,{tab:0,current:'here',here:'C:/work/here',folders:['C:/work/here','c:/work/there/','D:/other']});
  const body=sheet.panel.tabs[0]!.body as any;
  assert.deepEqual(body.items.map((item:any)=>[item.label,item.id]),[['here','C:/work/here'],['there','C:\\Work\\there'],['other','D:/other']]);
  const typing=sheetStep(sheet,panelKey(sheet.panel,{name:'p'})).sheet!;
  assert.ok(typing.panel.edit,'the row to type in');
  let panel=typing.panel;for(const ch of 'E:/x')panel=panelKey(panel,{name:ch}).panel;
  assert.deepEqual(sheetStep(typing,panelKey(panel,{name:'Enter'})).action,{kind:'openFolder',path:'E:/x'});
  assert.equal(sheetStep(typing,panelKey(typing.panel,{name:'Enter'})).action,null,'nothing typed, nothing opens');
});

test('New session: a long path never takes the room of the name, and Enter still opens the whole path',()=>{
  const long='C:/Users/someone/AppData/Local/Temp/a/very/long/way/down/to/the/folder/other-project';
  const data=()=>view({projects:[{name:'here',sessions:[]}]});
  const sheet=shelfSheet({data,mode:FULL,colors:()=>colors},undefined,{tab:0,current:'here',folders:[long]});
  const item=(sheet.panel.tabs[0]!.body as any).items[1];
  assert.equal(item.label,'other-project');assert.ok(item.meta.length<=24,item.meta);
  assert.deepEqual(sheetStep(sheet,panelKey(panelKey(sheet.panel,{name:'ArrowDown'}).panel,{name:'Enter'})).action,{kind:'openFolder',path:long});
});

test('New session: a project known by name and the trusted folder of that name are one row, and it opens',()=>{
  const data=()=>view({projects:[{name:'here',sessions:[]},{name:'other',sessions:[]}]});
  const sheet=shelfSheet({data,mode:FULL,colors:()=>colors},undefined,{tab:0,current:'here',folders:['D:/work/other']});
  assert.deepEqual((sheet.panel.tabs[0]!.body as any).items.map((item:any)=>item.label),['here','other']);
  assert.deepEqual(sheetStep(sheet,panelKey(panelKey(sheet.panel,{name:'ArrowDown'}).panel,{name:'Enter'})).action,{kind:'openFolder',path:'D:/work/other'});
});

test('Alt+H: the Home as a page keeps the groups as headings, a session resumes and a command runs',()=>{
  const sheet=homeSheet([{id:'s1',title:'Flaky login',state:'waiting',when:'1m'}]);
  assert.deepEqual([(sheet.panel.tabs[0]!.body as any).items[3].label,(sheet.panel.tabs[0]!.body as any).items[3].meta],['? Flaky login','waiting for you · 1m'],'the same row as the Home');
  const body=sheet.panel.tabs[0]!.body as any;
  const ids=(group:string)=>listItems(body).filter(item=>item.group===group).map(item=>item.id);
  assert.equal(listItems(body).length,8);
  assert.deepEqual(ids('Start a job'),['close','run:library','run:research']);
  assert.deepEqual(ids('Pick up your work'),['resume:s1','run:resume']);
  assert.deepEqual(ids('Organize your work'),['run:tasks','run:notes','run:automations']);
  const go=(index:number)=>{let panel=sheet.panel;for(let step=0;step<index;step+=1)panel=panelKey(panel,{name:'ArrowDown'}).panel;return sheetStep(sheet,panelKey(panel,{name:'Enter'}));};
  assert.equal(go(0).action,null,'Conversation goes back to the prompt');assert.equal(go(0).sheet,null);
  assert.deepEqual(go(1).action,{kind:'runCommand',name:'library'});
  assert.deepEqual(go(3).action,{kind:'resume',id:'s1'});
});

test('New session: each tab says its own line, and the shelf has only its legend under a tab that names it',()=>{
  const sheet=shelfSheet({data:()=>view(),mode:FULL,colors:()=>colors},undefined,{tab:0,current:'x'});
  assert.deepEqual(sheet.panel.tabs.map(tab=>tab.sub),[undefined,'How does TALOS work here?','Your conversations, as disks on a shelf']);
  const first=(sheet.panel.tabs[2]!.body as any).lines(120,24,0)[0];
  assert.match(text(first),/^ disk: conversation/u);assert.doesNotMatch(text(first),/Beta/u);
});
