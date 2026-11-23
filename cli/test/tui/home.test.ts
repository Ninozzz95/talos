/* FE-048, owner 01/11: the first screen is the Home, the prompt under it. What falls at each width and height is the Frontend's order. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {homeRows,type HomeInput,type HomeSession} from '../../src/tui/components/home.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const sessions:HomeSession[]=[{id:'a',title:'Flaky login',state:'progress',when:'1m'},{id:'b',title:'Session store',state:'waiting',when:'18:09'},{id:'c',title:'Prices',state:'toResume',when:'3d'},{id:'d',title:'Docs',state:'concluded',when:'yesterday'}];
const medal=()=>Array.from({length:11},()=>[{text:'M'.repeat(20),roles:[]}]);
const home=(over:Partial<HomeInput>={})=>homeRows({width:120,height:30,workspace:'~/projects/shop-api',model:'qwen3-coder',provider:'openrouter',sessions,loadingMs:0,now:0,glyph:'⠙',motion:true,unicode:true,medal,...over});
const all=(over:Partial<HomeInput>={})=>home(over).map(text).join('\n');

test('from 100 columns everything: medal, words, the list and the agent beside it',()=>{
  const screen=all();
  for(const word of ['MMMM','Where shall we pick up?','Projects, conversations and tools','Open a project','alt+o','No operations are started automatically.','Pick up your work','alt+h','⠙ Flaky login','in progress','All sessions','Before your next request','Your agent','qwen3-coder','openrouter'])assert.ok(screen.includes(word),word);
});

test('80-99: the right column falls, each row keeps its state',()=>{
  const screen=all({width:90});
  assert.ok(!screen.includes('Before your next request'));assert.ok(screen.includes('waiting for you'));assert.ok(screen.includes('MMMM'));
});

test('64-79: the medal from 20 rows of the page, a 26-row window; rows lose their state',()=>{
  assert.ok(all({width:70,height:20}).includes('MMMM'));
  assert.ok(!all({width:70,height:19}).includes('MMMM'));
  assert.ok(all({width:70,height:19}).includes('Where shall we pick up?'));
  assert.ok(!all({width:70}).includes('waiting for you'));
});

test('60-63: no medal; title and the button stay, rows keep sign, title and when',()=>{
  const screen=all({width:62});
  assert.ok(!screen.includes('MMMM'));assert.ok(screen.includes('Open a project'));assert.ok(screen.includes('Projects, conversations'));assert.match(screen,/\? Session store +18:09/u);
});

test('under 60 the sentence falls too; «No operations…» stays with the head',()=>{
  const screen=all({width:50});
  assert.ok(!screen.includes('Projects, conversations'));assert.ok(screen.includes('No operations'));
});

test('under 10 rows of the page no head, under 6 only the project',()=>{
  const low=all({height:9});assert.ok(!low.includes('Where shall we'));assert.ok(!low.includes('No operations'));assert.ok(low.includes('Pick up your work'));
  assert.deepEqual(home({height:5}).map(text).map(line=>line.trim()),['~/projects/shop-api']);
});

for(const [width,height] of [[120,34],[120,24],[100,24],[80,18],[60,18],[50,14],[40,6],[150,11],[110,10]] as const)test(`nothing leaves the centre at ${width}×${height}`,()=>{
  for(const state of [sessions,[],null]){
    const rows=home({width,height,sessions:state});
    assert.ok(rows.length<=height,`${rows.length} rows`);
    for(const row of rows)assert.ok(displayWidth(text(row))<=width,text(row));
  }
});

test('a long list stops before the prompt, and All sessions stays',()=>{
  const many=Array.from({length:30},(_,index):HomeSession=>({id:String(index),title:`Session ${index}`,state:'concluded',when:''}));
  const rows=home({sessions:many,height:24}).map(text);
  assert.ok(rows.length<=24,String(rows.length));assert.ok(rows.some(row=>row.includes('All sessions')));
});

test('loading is never empty: the sign and the seconds from 2 s, the empty words only when the list says so',()=>{
  assert.match(all({sessions:null}),/Loading sessions/u);assert.doesNotMatch(all({sessions:null}),/Your sessions will appear/u);
  assert.match(all({sessions:null,loadingMs:3000}),/Loading sessions · 3s/u);
  assert.match(all({sessions:[]}),/Open a project or a conversation\./u);
});

test('a session opens by its row, the button by its own, and hover lights one element',()=>{
  const flat=home().flat();
  assert.ok(flat.some(segment=>segment.action==='session:a'&&segment.text.includes('Flaky')));
  assert.ok(flat.some(segment=>segment.action==='open:new'));
  assert.ok(flat.some(segment=>segment.action==='open:resume'));
  assert.ok(flat.some(segment=>segment.action==='open:home'));
  assert.ok(flat.filter(segment=>segment.action).every(segment=>segment.element===segment.action));
});

test('no model yet: it says so, and the row opens the providers',()=>{
  const flat=home({model:null}).flat();
  assert.ok(flat.some(segment=>segment.action==='open:provider'&&/no model chosen yet/u.test(segment.text)));
});

test('in ASCII no Unicode sign, and no medal when none is given',()=>{
  const screen=all({unicode:false,medal:null,glyph:'-'});
  assert.ok(!screen.includes('MMMM'));assert.doesNotMatch(screen,/[■✓│]/u);
});
