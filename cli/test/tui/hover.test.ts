/*
 * Owner 01/11/2026: «hover deve essere preciso nel punto esatto». Cell by cell: the first and last cell of an element light up, the cell
 * just outside does not, and two places with the same action stay two elements (the rule at the end of SCHEDA-DECISIONI-PER-CLI).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hitAt,hitElementAt,hitTargetAt,hitTargets} from '../../src/tui/hit-map.ts';
import {createHover} from '../../src/tui/hover.ts';
import {createRowWriter} from '../../src/tui/row-writer.ts';

const targets=hitTargets([{x:2,y:1,rows:[[{text:'Sessioni',action:'view:sessions'},{text:'  '},{text:'chiudi',action:'pkey:Escape'},{text:' '},{text:'x',action:'pkey:Escape'}]]}]);

test('the element under a cell is exact: first cell, last cell, and the cell just outside',()=>{
  assert.equal(hitTargetAt(targets,{row:1,col:2})?.action,'view:sessions');
  assert.equal(hitTargetAt(targets,{row:1,col:9})?.action,'view:sessions');
  assert.equal(hitTargetAt(targets,{row:1,col:1}),null);
  assert.equal(hitTargetAt(targets,{row:1,col:10}),null);
  assert.equal(hitTargetAt(targets,{row:0,col:2}),null);
  assert.equal(hitAt(targets,{row:1,col:10}),null,'hover and click are the same cells');
});

test('two places with one action are two elements',()=>{
  const a=hitTargetAt(targets,{row:1,col:12})!,b=hitTargetAt(targets,{row:1,col:19})!;
  assert.equal(a.action,b.action);
  assert.notEqual(a.from,b.from);
  const painted:unknown[]=[];
  const hover=createHover({targetAt:cell=>hitElementAt(targets,cell),paint:shown=>painted.push(shown[0]?.from??null),defer:run=>run()});
  hover.move({row:1,col:12});hover.move({row:1,col:19});
  assert.deepEqual(painted,[12,19]);
});

test('nothing is painted while the target stays the same, and the last position of a tick decides',()=>{
  const painted:unknown[]=[];const shapes:boolean[]=[];const queue:(()=>void)[]=[];
  const hover=createHover({targetAt:cell=>hitElementAt(targets,cell),paint:shown=>painted.push(shown[0]?.from??null),shape:over=>shapes.push(over),defer:run=>queue.push(run)});
  hover.move({row:1,col:2});hover.move({row:1,col:3});hover.move({row:1,col:4});
  assert.equal(queue.length,1,'one report per cell, one look per tick');
  queue.shift()!();
  hover.move({row:1,col:5});queue.shift()!();
  assert.deepEqual(painted,[2],'the same element: no second paint');
  hover.move({row:1,col:10});queue.shift()!();
  assert.deepEqual(painted,[2,null]);assert.deepEqual(shapes,[true,false]);
});

test('a new frame under a still pointer is looked at again, and a press clears at once',()=>{
  let current=targets;const painted:unknown[]=[];
  const hover=createHover({targetAt:cell=>hitElementAt(current,cell),paint:shown=>painted.push(shown[0]?.from??null),defer:run=>run()});
  hover.move({row:1,col:2});
  current=[];hover.refresh();
  assert.deepEqual(painted,[2,null]);
  current=targets;hover.refresh();hover.clear();
  assert.deepEqual(painted,[2,null,2,null]);
});

function writer(){
  const writes:string[]=[];
  const stream={columns:40,rows:4,write(text:string){writes.push(text);return true;}};
  return{render:createRowWriter(stream as any),writes};
}

test('the writer paints exactly the element\'s cells and writes only its row; leaving writes the row back',()=>{
  const {render,writes}=writer();
  render('one\nSessioni chiudi\nthree\n');
  writes.length=0;
  render.hover([{row:1,from:0,to:7}]);
  assert.equal(writes.length,1);
  assert.ok(writes[0]!.includes('\u001b[7mSessioni\u001b[27m chiudi'),JSON.stringify(writes[0]));
  assert.ok(!writes[0]!.includes('one')&&!writes[0]!.includes('three'),'only its row');
  writes.length=0;
  render.hover([{row:1,from:0,to:7}]);
  assert.equal(writes.length,0,'the same element writes nothing');
  render.hover([]);
  assert.equal(writes.length,1);assert.ok(!writes[0]!.includes('\u001b[7m'));
});

test('a selection wins over the hover on its row, and the copy never reads the paint',()=>{
  const {render}=writer();
  render('one\nSessioni chiudi\n');
  render.hover([{row:1,from:0,to:7}]);
  assert.deepEqual(render.lines().slice(0,2),['one','Sessioni chiudi']);
});

test('after a frame the writer says so, for the hover to look again',()=>{
  const {render}=writer();let frames=0;
  render.onFrame(()=>{frames+=1;});
  render('one\n');render('one\n');render('two\n');
  assert.equal(frames,2,'a frame that wrote nothing says nothing');
});

test('a voice on two rows is one element, and the cell after its last character is nothing',()=>{
  const voice=hitTargets([{x:0,y:0,rows:[[{text:'   '},{text:'Name',action:'pitem:0',element:'pitem:0'},{text:'      '}],[{text:'     '},{text:'detail',action:'pitem:0',element:'pitem:0'}]]}]);
  assert.deepEqual(hitElementAt(voice,{row:1,col:6}).map(target=>[target.row,target.from,target.to]),[[0,3,6],[1,5,10]]);
  assert.deepEqual(hitElementAt(voice,{row:0,col:7}),[]);
  assert.equal(hitAt(voice,{row:0,col:7}),null,'and a click there does nothing');
});
