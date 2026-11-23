/*
 * Stage 6c (owner 01/10 «tutto cliccabile», decisions 02/10; registro 12). As the approved mockup marks its clickable
 * segments (`data-a`, `click(verb:arg)`), a styled segment may carry an action; Codex's mouse works on the most recently
 * painted layout, so the targets are rebuilt after each paint from where each block of rows was laid out (Ink's
 * measureElement: layout coordinates, which are the screen's in the full screen). A click on a target (press and release on it) runs its action.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hitAt,hitTargets} from '../../src/tui/hit-map.ts';

const seg=(text:string,action?:string)=>({text,roles:[],...(action?{action}:{})});

test('the targets of a block of rows laid out at a place on the screen, cell by cell',()=>{
  const targets=hitTargets([{x:35,y:2,rows:[[seg(' '),seg(' All 3 ','atab:0'),seg(' '),seg(' Needs you 1 ','atab:1')],[seg('nothing here')],[seg('› '),seg('Audit the deps','agent:a1')]]}]);
  assert.deepEqual(targets,[
    {row:2,from:36,to:42,action:'atab:0'},
    {row:2,from:44,to:56,action:'atab:1'},
    {row:4,from:37,to:50,action:'agent:a1'},
  ]);
  assert.equal(hitAt(targets,{row:2,col:36}),'atab:0');
  assert.equal(hitAt(targets,{row:2,col:43}),null,'the space between two targets');
  assert.equal(hitAt(targets,{row:4,col:50}),'agent:a1');
  assert.equal(hitAt(targets,{row:3,col:40}),null);
});

test('wide characters take two cells; a later block on top wins where they overlap',()=>{
  const targets=hitTargets([
    {x:0,y:0,rows:[[seg('漢字','word'),seg(' x','x')]]},
    {x:0,y:0,rows:[[seg('  '),seg('top','over')]]},
  ]);
  assert.equal(hitAt(targets,{row:0,col:1}),'word','the second cell of a wide character');
  assert.equal(hitAt(targets,{row:0,col:2}),'over','the block drawn later is on top');
  assert.equal(hitAt(targets,{row:0,col:5}),'x');
});

test('an empty segment that carries an action covers no cell',()=>{
  assert.deepEqual(hitTargets([{x:4,y:1,rows:[[seg('','ghost'),seg('ok','real')]]}]),[{row:1,from:4,to:5,action:'real'}]);
});

/* Stage 6c, the transcript: an item laid out partly above or below its region is clipped there, so a title hidden above the
   view never takes a click meant for the header or the composer. */
test('a block clipped to its region keeps only the rows inside it',()=>{
  const rows=[[seg('▸ Thought for 4s','toggle:r1')],[seg('body')],[seg('● Read 2 files','toggle:g1')]];
  assert.deepEqual(hitTargets([{x:0,y:1,rows,clip:{top:2,bottom:3}}]),[{row:3,from:0,to:13,action:'toggle:g1'}]);
  assert.deepEqual(hitTargets([{x:0,y:1,rows,clip:{top:0,bottom:2}}]),[{row:1,from:0,to:15,action:'toggle:r1'}]);
});
