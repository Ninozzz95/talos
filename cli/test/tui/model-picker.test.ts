/* C7a of the redesign: the model picker's capability filters, groups, stars and the sentence when a level is not offered; the file of favourites is the kernel's. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {modelSheet,sheetStep,type ModelRow,type SheetState} from '../../src/tui/panel/commands.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {listItems,panelClick,panelKey} from '../../src/tui/panel/sheet.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(text).join('\n');
const model=(id:string,over:Partial<ModelRow>={}):ModelRow=>({id,name:id.slice(id.lastIndexOf('/')+1),provider:'OpenRouter',contextWindow:100_000,desc:'d',caps:'',efforts:['default'],...over});
const MODELS=[model('or:qwen/qwen3',{reasons:true,tools:true,contextWindow:262_000,efforts:['default','low','high']}),model('or:zai/glm',{tools:true}),model('or:openai/sol',{images:true,reasons:true,tools:true,efforts:['default','max']}),model('or:local/gem',{free:true})];
const options={current:'or:qwen/qwen3',providerLabel:'OpenRouter',effort:'high',scale:['default','low','high','max']};
const open=(view={})=>asPage(modelSheet(MODELS,{...options,...view}));
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const items=(sheet:SheetState)=>{const body=sheet.panel.tabs[0]!.body;return body.kind==='list'?listItems(body):[];};

test('the capability row is the PC\'s, a key or a click turns one on, and they add up',()=>{
  const sheet=open();
  assert.match(all(pageRows(sheet.panel,120,30)),/1 {2}Reasons {2}2 {2}Sees images {2}3 {2}Uses tools {2}4 {2}Free {2}5 {2}Context 200k\+/u);
  const reasons=press(sheet,'1').sheet!;
  assert.deepEqual(items(reasons).map(item=>item.id),['or:qwen/qwen3','or:openai/sol']);
  assert.match(all(pageRows(reasons.panel,120,30)),/✓ Reasons/u);
  const both=press(reasons,'2').sheet!;
  assert.deepEqual(items(both).map(item=>item.id),['or:openai/sol']);
  const clicked=sheetStep(both,panelClick(both.panel,'pkey:1')).sheet!;
  assert.deepEqual(items(clicked).map(item=>item.id),['or:openai/sol'],'the click turned one off');
  assert.equal(items(press(clicked,'2').sheet!).length,4);
});

test('nothing matches: it says so, and z clears filters and search',()=>{
  let sheet=press(press(open(),'4').sheet!,'5').sheet!;
  assert.equal(items(sheet).length,0);
  assert.match(all(pageRows(sheet.panel,120,30)),/No model matches\. Try fewer filters or another word\./u);
  sheet=press(sheet,'/').sheet!;sheet=press(sheet,'x').sheet!;sheet=press(sheet,'Enter').sheet!;
  sheet=press(sheet,'z').sheet!;
  assert.equal(items(sheet).length,4);
  const body=sheet.panel.tabs[0]!.body;assert.equal(body.kind==='list'?body.filter??'':'x','','the search went too');
});

test('groups: in use, favourites, recently used, then by author, and a search has no groups',()=>{
  const sheet=open({favourites:['or:openai/sol'],recent:['or:local/gem']});
  assert.deepEqual(items(sheet).map(item=>item.id),['or:qwen/qwen3','or:openai/sol','or:local/gem','or:zai/glm']);
  const shown=all(pageRows(sheet.panel,120,36));
  for(const word of ['In use','Favourites','Recently used','zai'])assert.match(shown,new RegExp(`^ *${word}`,'mu'),word);
  assert.match(shown,/\* sol/u,'a star');
  let searched=press(sheet,'/').sheet!;searched=press(searched,'g').sheet!;
  assert.doesNotMatch(all(pageRows(searched.panel,120,36)),/Favourites/u);
});

test('f stars the model under the cursor, and the app is told; a star off too',()=>{
  const sheet=press(open(),'f');
  assert.deepEqual(sheet.action,{kind:'modelFavourite',id:'or:qwen/qwen3',on:true});
  assert.deepEqual(press(sheet.sheet!,'f').action,{kind:'modelFavourite',id:'or:qwen/qwen3',on:false});
});

test('a level the model does not offer: the whole sentence, and the page keeps its keys free of hidden ones',()=>{
  const sheet=open({effort:'max'});
  assert.match(all(pageRows(sheet.panel,120,36)),/You chose “max”: this model receives “default”\./u);
  assert.doesNotMatch(all(pageRows(open({effort:'low'}).panel,120,36)),/You chose/u);
  assert.doesNotMatch(all(pageRows(open().panel,120,36)),/ 1 {4}2 {4}3/u);
});

test('Where it runs: the providers, and Enter goes to them',()=>{
  const sheet=open({places:[{id:'or',label:'OpenRouter',meta:'In use'},{id:'ol',label:'Ollama',meta:''}]});
  assert.deepEqual(sheet.panel.tabs.map(tab=>tab.name),['Models','Where it runs']);
  const where=press(sheet,'Tab').sheet!;
  assert.equal(where.panel.tab,1);
  assert.deepEqual(press(where,'Enter').action,{kind:'runCommand',name:'provider'});
  assert.equal(press(where,'Escape').sheet,null);
});
