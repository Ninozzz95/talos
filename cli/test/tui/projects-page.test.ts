/* C11b of the redesign: the Projects page, as the CLI mockup draws it (bozzetto-cli-retro/index.html:562, :647, :723, :1152-1159). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {projectsSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {projectDetail,projectItems,projectLastTime,projectsOf,type ProjectSession} from '../../src/tui/panel/projects-page.ts';
import {asPage,COMMAND_PAGES,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey,renderBody} from '../../src/tui/panel/sheet.ts';
import {BAR_GROUPS,sideBarRows} from '../../src/tui/regions/side-bar.ts';
import {BAR_COLUMNS} from '../../src/tui/regions/frame-shape.ts';
import {SLASH_COMMANDS,parseSlashCommand,slashCommandGroup} from '../../src/tui/slash-commands.ts';
import {footerModelRow,headerRow} from '../../src/tui/components/chrome-rows.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(text).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const NOW=new Date(2026,10,19,15,0).getTime();
const day=(back:number,hour=10)=>new Date(2026,10,19-back,hour,0).toISOString();
const session=(id:string,fields:Partial<ProjectSession>={}):ProjectSession=>({id,title:`Session ${id}`,project:'shop-api',path:'C:/p/shop-api',parent:null,state:'concluded',at:day(0),requests:10,tokens:1000,...fields});
const SESSIONS=[
  session('a',{requests:40,tokens:200_000}),session('b',{requests:26,tokens:44_000,state:'waiting',at:day(0,12)}),
  session('child',{parent:'a',requests:999,tokens:999_999}),
  session('d',{project:'docs-site',path:'C:/p/docs-site',at:day(1),requests:39,tokens:176_000}),
  session('o',{project:'ops-tools',path:'C:/p/ops-tools',at:day(76),requests:null,tokens:null}),
];
const ROWS=projectsOf(SESSIONS,{current:'shop-api',here:'C:/p/shop-api',folders:['C:/p/docs-site','C:/p/landing-2026']});

test('one project per `project` of the top-level sessions, the most recent first; trusted folders with none come last',()=>{
  assert.deepEqual(ROWS.map(row=>row.name),['shop-api','docs-site','ops-tools','landing-2026']);
  const shop=ROWS[0]!;
  assert.deepEqual(shop.sessions.map(row=>row.id),['b','a'],'a sub-agent is not a session of the project; the latest stands first');
  assert.equal(shop.requests,66);assert.equal(shop.tokens,244_000);assert.equal(shop.last,day(0,12));
  assert.equal(ROWS[2]!.requests,null,'nobody measured it: no number is made up');
  assert.deepEqual(ROWS[3],{name:'landing-2026',path:'C:/p/landing-2026',sessions:[],last:null,requests:null,tokens:null});
  const bare=projectsOf([],{current:'shop-api',here:'C:/p/shop-api'});
  assert.deepEqual(bare.map(row=>[row.name,row.path]),[['shop-api','C:/p/shop-api']],'this folder is a project even before its first session');
  const nameless=projectsOf([session('x',{project:null,path:'C:/q/tools'}),session('y',{project:null,path:null})],{current:'here',here:'C:/q/here'});
  assert.deepEqual(nameless.map(row=>row.name).sort(),['here','tools']);
});

test('the rows speak the mockup: sessions, requests to the model, tokens; when it was last opened',()=>{
  const items=projectItems(ROWS,NOW);
  assert.deepEqual(items.map(item=>item.desc),['2 sessions · 66 requests to the model · 244k tokens','1 session · 39 requests to the model · 176k tokens','1 session','No sessions yet']);
  assert.deepEqual(items.map(item=>item.meta),['Last time today','Last time yesterday','Last time Sep 4','Never opened']);
  assert.equal(projectItems([{...ROWS[0]!,requests:1}],NOW)[0]!.desc,'2 sessions · 1 request to the model · 244k tokens');
  assert.equal(projectLastTime('not a date',NOW),'Never opened');
  assert.equal(items[0]!.search,'C:/p/shop-api','the folder is searchable, as the mockup\'s `cerca:p.dir`');
});

test('the detail: Project, its name and folder, at most six recent sessions; an empty one says so',()=>{
  const many=projectsOf(Array.from({length:8},(_,index)=>session(`s${index}`,{at:day(index)})),{current:'shop-api',here:'C:/p/shop-api'});
  const rows=projectDetail(many[0],40,{now:NOW}).map(text);
  assert.deepEqual(rows.slice(0,5),['Project','shop-api','C:/p/shop-api','','Recent sessions']);
  assert.equal(rows.length,11,'six sessions under the heading');
  assert.match(rows[5]!,/^✓ Session s0 {2}/u);
  assert.deepEqual(projectDetail(ROWS[3],40,{now:NOW}).map(text),['Project','landing-2026','C:/p/landing-2026','','No sessions in this project yet.']);
  const plain=projectDetail(ROWS[0],40,{now:NOW,unicode:false}).map(text);
  assert.match(plain[5]!,/^\? Session b/u,'the waiting session keeps its mark without unicode');
  assert.match(plain[6]!,/^v Session a/u,'a concluded one says v, not ✓, without unicode');
});

test('the page: title, the count under it, «All N», n opens a project, Enter starts a new session here',()=>{
  const page=asPage(projectsSheet(ROWS,{current:'shop-api',now:NOW}));
  assert.equal(page.panel.title,'Projects');assert.equal(page.panel.sub,'4 projects · 3 with sessions');
  const body=page.panel.tabs[0]!.body;assert.equal(body.kind,'list');
  if(body.kind!=='list')return;
  assert.deepEqual(body.filters?.map(filter=>filter.name),['All 4']);
  assert.deepEqual(body.keys?.map(key=>[key.key,key.label]),[['n','open a project']]);
  assert.equal(body.enter,'new session here');
  assert.ok(COMMAND_PAGES.has('projects'));
  const empty=all(pageRows(asPage(projectsSheet([])).panel,80,24));
  assert.match(empty,/No projects\. A project starts when you open a session on a folder\./u);
});

test('Enter on this folder opens New session on «How»; another folder starts there; one nobody located is only named; n opens New session',()=>{
  const page=asPage(projectsSheet(ROWS,{current:'shop-api',now:NOW}));
  assert.deepEqual(press(page,'Enter').action,{kind:'openNew',tab:1});
  const down=press(page,'ArrowDown').sheet!;
  assert.deepEqual(press(down,'Enter').action,{kind:'openFolder',path:'C:/p/docs-site'});
  assert.deepEqual(press(page,'n').action,{kind:'openNew',tab:0});
  const lost=asPage(projectsSheet([{name:'gone',path:null,sessions:[],last:null,requests:null,tokens:null}],{current:'shop-api'}));
  assert.deepEqual(press(lost,'Enter').action,{kind:'notice',text:'To work there, start TALOS in that folder: gone'});
});

test('the frames at 80×24 and 120×40 fit, and show the list with its detail',()=>{
  const out:string[]=[];
  for(const [w,h] of [[80,24],[120,40]] as const){
    const rows=pageRows(asPage(projectsSheet(ROWS,{current:'shop-api',now:NOW})).panel,w,h,{terminalColumns:w});
    assert.equal(rows.length,h);
    for(const row of rows)assert.ok(displayWidth(text(row))<=w,`${w}: ${text(row)}`);
    const frame=all(rows);
    assert.match(frame,/Projects/u);assert.match(frame,/shop-api/u);assert.match(frame,/Last time today/u);assert.match(frame,/2 sessions · 66 requests to the model/u);
    if(w===120)assert.match(frame,/Recent sessions/u,'from 100 columns the detail stands beside the list');
    out.push(`--- ${w}x${h}`,frame);
  }
  const dir=process.env.TALOS_FRAMES_DIR;
  if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/projects-frames.txt`,out.join('\n')+'\n');}
});

test('two doors: /projects in the Work group, «p Projects» in the bar after Deep research, the header folder opens it',()=>{
  assert.ok(SLASH_COMMANDS.some(command=>command.name==='projects'));
  assert.equal(slashCommandGroup('projects'),'work');
  assert.equal(SLASH_COMMANDS.find(command=>command.name==='projects')!.description,'Find the workspaces and the sessions linked to them');
  assert.equal(parseSlashCommand('/projects').name,'projects');
  const spaces=BAR_GROUPS.find(group=>group.id==='spaces')!.voices.map(voice=>voice.id);
  assert.deepEqual(spaces.slice(-2),['research','projects']);
  assert.deepEqual(BAR_GROUPS.find(group=>group.id==='spaces')!.voices.at(-1),{id:'projects',key:'p',command:'/projects'});
  const bar=sideBarRows({width:BAR_COLUMNS,height:29,open:new Set(['spaces']),selected:0,focused:false,sessions:[]}).map(text);
  const research=bar.findIndex(row=>row.includes('Deep research'));
  assert.match(bar[research+1]!,/^ {3}p Projects/u);
  const header=headerRow({width:100,workspace:'~/projects/shop-api',branch:'main'} as any);
  assert.equal(header.find(segment=>segment.text.includes('~/projects/shop-api'))?.action,'open:projects');
});

/* Small round (judge v2242, «mockup to the letter»): the lone «All N» filter of index.html:1154, and the folder of the footer, index.html:845 */
test('Projects shows its one filter «All N», as the mockup does; any other list with one filter still hides it',()=>{
  for(const [w,h] of [[80,24],[120,40]] as const){
    const rows=pageRows(asPage(projectsSheet(ROWS,{current:'shop-api',now:NOW})).panel,w,h,{terminalColumns:w}).map(text);
    const at=rows.findIndex(row=>row.includes(' All 4 '));
    assert.ok(at>0,`${w}: the filter row is drawn\n${rows.join('\n')}`);
    assert.ok(at<rows.findIndex(row=>row.includes('shop-api')&&row.includes('Last time')),'above the list');
    for(const row of rows)assert.ok(displayWidth(row)<=w,`${w}: ${row}`);
  }
  const other=renderBody({kind:'list',sel:0,items:[{id:'a',label:'Alpha'}],filters:[{name:'All 1'}]},80,10).map(text).join('\n');
  assert.doesNotMatch(other,/All 1/u,'the common rule stands for the other pages: one filter alone is not drawn');
  const two=renderBody({kind:'list',sel:0,items:[{id:'a',label:'Alpha'}],filters:[{name:'All 1'},{name:'Done 0'}]},80,10).map(text).join('\n');
  assert.match(two,/All 1 .*Done 0/u,'two filters are drawn as before');
});

test('the folder in the second footer row opens Projects; the branch beside it stays as it was, no click',()=>{
  const base={mode:'default',noSandbox:false,queueCount:0,model:'qwen3',snapshot:{windowTokens:100,percent:42} as any,workspace:'~/projects/shop-api',branch:'main'};
  const wide=footerModelRow({...base,width:120} as any)!;
  const folder=wide.find(segment=>segment.text.includes('~/projects/shop-api'))!;
  assert.equal(folder.action,'open:projects');assert.equal(folder.text.includes('main'),false,'the folder and the branch are two pieces');
  const branch=wide.find(segment=>segment.text.includes('main'))!;
  assert.equal(branch.text,' · main');assert.equal(branch.action,undefined,'a click on the branch does not open Projects');
  assert.match(text(wide),/ · ~\/projects\/shop-api · main$/u,'the words are the same as before');
  assert.equal(footerModelRow({...base,width:80} as any),null,'under 100 columns there is no second row (the 80×24 frame)');
  for(let width=100;width<=240;width+=1){
    const row=footerModelRow({...base,width,workspace:`~/projects/${'a-very-long-folder-name/'.repeat(5)}still`} as any)!;
    assert.ok(displayWidth(text(row))<=width,`${width}: ${text(row)}`);
    for(const segment of row.filter(value=>value.action==='open:projects'))assert.equal(segment.text.includes(' · main'),false,`${width}: the branch is never inside the click`);
    if(/~\/projects.* · main$/u.test(text(row)))assert.ok(row.some(segment=>segment.action==='open:projects'),`${width}: a folder cut in the middle still opens Projects`);
  }
  const alone=footerModelRow({...base,width:120,branch:null} as any)!;
  assert.equal(alone.find(segment=>segment.text.includes('shop-api'))?.action,'open:projects','with no branch the folder opens Projects too');
  let cut=0;
  for(let width=100;width<=240;width+=1){
    const row=footerModelRow({...base,width,workspace:`~/${'f'.repeat(90)}`,branch:'b'.repeat(90)} as any)!;
    if(!text(row).includes(' · bbb'))cut+=1;
    for(const segment of row.filter(value=>value.action==='open:projects'))assert.equal(segment.text.includes('bbb'),false,`${width}: a cut that ate the « · » puts no branch inside the click`);
  }
  assert.ok(cut>0,'some widths cut the « · » away');
  const onlyBranch=footerModelRow({...base,width:120,workspace:''} as any)!;
  assert.deepEqual(onlyBranch.filter(segment=>segment.action==='open:projects'),[],'with no folder there is nothing to open');
  assert.match(text(onlyBranch),/ · main$/u);
});
