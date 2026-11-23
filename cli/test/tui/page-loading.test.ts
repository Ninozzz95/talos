/* The one rule for what may be heavy (owner 01/11): under 100 ms nothing, then still words, from 2 s the sign and the seconds. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPageLoader,loadingPanel,loadingRow} from '../../src/tui/panel/loading.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';
import {pageRows} from '../../src/tui/panel/page.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');

test('still words for two seconds, then the sign and the seconds; without motion the sign stands and the seconds count',()=>{
  assert.equal(text(loadingRow('Loading sessions',1999,{now:0})).trim(),'Loading sessions');
  assert.equal(text(loadingRow('Loading sessions',2000,{now:0})).trim(),'⠋ Loading sessions · 2s');
  assert.equal(text(loadingRow('Loading sessions',64_000,{now:80})).trim(),'⠙ Loading sessions · 1m 04s');
  assert.equal(text(loadingRow('Loading sessions',3000,{now:80,motion:false})).trim(),'⠋ Loading sessions · 3s');
});

test('the page counts by itself from the frame\'s clock, and has no keys of its own but Esc',()=>{
  const panel=loadingPanel('Tasks','Loading tasks',1000);
  const row=(now:number)=>pageRows(panel,80,12,{now}).map(text).join('\n');
  assert.match(row(1500),/ Loading tasks/u);assert.doesNotMatch(row(1500),/·/u);
  assert.match(row(4000),/Loading tasks · 3s/u);
  assert.doesNotMatch(row(1500),/move/u);
  assert.equal(panelKey(panel,{name:'Escape'}).effect.kind,'close');
});

/* a clock of our own: no test here waits */
function bench(){
  let clock=0;const timers:{at:number;run:()=>void}[]=[];
  const loader=createPageLoader<string>({now:()=>clock,later:(run,ms)=>{const timer={at:clock+ms,run};timers.push(timer);return timer;},cancel:timer=>{const at=timers.indexOf(timer as any);if(at>=0)timers.splice(at,1);}});
  const pass=async(ms:number)=>{clock+=ms;for(const timer of [...timers].filter(row=>row.at<=clock)){timers.splice(timers.indexOf(timer),1);timer.run();}await new Promise(done=>setImmediate(done));};
  return{loader,pass};
}
function page(loader:ReturnType<typeof bench>['loader'],{busy=false}={}){
  const out={shown:0,sheet:null as string|null,onPage:false};
  const set=(given:string|null)=>{if(!loader.letThrough(given,out.onPage))return;out.sheet=given;out.onPage=false;};
  return{out,set,hooks:{show:()=>{out.shown+=1;out.onPage=true;},apply:(result:string|null)=>set(result),free:()=>!busy&&!out.sheet}};
}

test('a command faster than 100 ms shows no page at all',async()=>{
  const {loader,pass}=bench();const {out,set,hooks}=page(loader);
  let finish=()=>{};const task=loader.run(hooks,()=>new Promise<void>(done=>{finish=()=>{set('result');done();};}));
  await pass(99);finish();await task;await pass(1000);
  assert.equal(out.shown,0);assert.equal(out.sheet,'result');
});

test('past 100 ms the page opens, and a result that comes at once waits for its 300 ms',async()=>{
  const {loader,pass}=bench();const {out,set,hooks}=page(loader);
  let finish=()=>{};const task=loader.run(hooks,()=>new Promise<void>(done=>{finish=()=>{set('result');done();};}));
  await pass(100);assert.equal(out.shown,1);assert.equal(out.onPage,true);
  await pass(50);finish();await pass(0);
  assert.equal(out.sheet,null,'still held');assert.equal(out.onPage,true);
  await pass(250);await task;
  assert.equal(out.sheet,'result');
});

test('Esc on the page closes it, and what arrives after is dropped',async()=>{
  const {loader,pass}=bench();const {out,set,hooks}=page(loader);
  let finish=()=>{};const task=loader.run(hooks,()=>new Promise<void>(done=>{finish=()=>{set('late');done();};}));
  await pass(120);set(null);
  await pass(500);finish();await task;await pass(500);
  assert.equal(out.sheet,null);
  set('next');assert.equal(out.sheet,'next','the next command opens as ever');
});

test('a task that fails closes the page, and its error still reaches the caller',async()=>{
  const {loader,pass}=bench();const {out,hooks}=page(loader);
  let fail=(_:Error)=>{};const task=loader.run(hooks,()=>new Promise<void>((_,reject)=>{fail=reject;}));const failed=assert.rejects(task,/no/u);
  await pass(150);fail(new Error('no'));await pass(0);await pass(300);
  await failed;
  assert.equal(out.sheet,null);assert.equal(out.onPage,false,'the screen is told to close: apply(null) went past the gate');
});

test('with something already open no page takes its place',async()=>{
  const {loader,pass}=bench();const {out,hooks}=page(loader,{busy:true});
  let finish=()=>{};const task=loader.run(hooks,()=>new Promise<void>(done=>{finish=done;}));
  await pass(500);finish();await task;
  assert.equal(out.shown,0);
});
