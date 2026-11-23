/* D2 of MAPPA-RIDISEGNO: a card fits the window, and the selected choice is always on screen. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fitCardRows} from '../../src/tui/card-fit.ts';
import type {CardRow} from '../../src/tui/question-card-rows.ts';

const row=(text:string,action?:string):CardRow=>[{text,roles:[],...(action?{action}:{})}];
const card=(selected:number):CardRow[]=>[row('╭─ title'),row('│ why it asks'),row('│ detail'),...Array.from({length:8},(_,index)=>row(`│${index===selected?' › ':'   '}option ${index}`,`opt:${index}`)),row('│ keys'),row('╰──╯')];
const text=(rows:readonly CardRow[])=>rows.map(cells=>cells.map(cell=>cell.text).join(''));

test('a card that fits is left as it is',()=>{
  const rows=card(0);
  assert.deepEqual(fitCardRows(rows,rows.length),rows);
  assert.deepEqual(fitCardRows(rows,40),rows);
});

test('at every height the title, the closing row and the selected choice stay',()=>{
  for(let height=3;height<card(0).length;height+=1)for(let selected=0;selected<8;selected+=1){
    const shown=text(fitCardRows(card(selected),height));
    assert.ok(shown.length<=height,`${shown.length} rows at ${height}`);
    assert.equal(shown[0],'╭─ title');assert.equal(shown.at(-1),'╰──╯');
    assert.ok(shown.some(line=>line.includes(` › option ${selected}`)),`option ${selected} left the view at ${height}`);
  }
});

test('what is left over goes to the body, from the top, in order',()=>{
  const shown=text(fitCardRows(card(0),12));
  assert.deepEqual(shown.slice(0,3),['╭─ title','│ why it asks','│ detail']);
  assert.equal(shown.filter(line=>line.includes('option')).length,8);
});

test('a card with no choices keeps its top',()=>{
  const rows=[row('╭─'),row('│ a'),row('│ b'),row('│ c'),row('╰╯')];
  assert.deepEqual(text(fitCardRows(rows,3)),['╭─','│ a','╰╯']);
});

const described=(selected:number):CardRow[]=>[row('╭─ title'),row('│ '),...Array.from({length:6},(_,index)=>[row(`│${index===selected?' › ':'   '}${index+1}. option`,`opt:${index}`),row(`│     what ${index+1} does`)]).flat(),row('╰──╯')];
test('a choice and its description enter and leave together, at every height',()=>{
  for(let height=4;height<14;height+=1)for(let selected=0;selected<6;selected+=1){
    const shown=text(fitCardRows(described(selected),height));
    assert.ok(shown.length<=height);
    assert.ok(shown.some(line=>line.includes(` › ${selected+1}. option`)),`choice ${selected} left the view at ${height}`);
    for(let index=1;index<=6;index+=1)if(shown.some(line=>line.includes(`what ${index} does`)))assert.ok(shown.some(line=>line.includes(`${index}. option`)),`at ${height}: a description without its choice ${index}`);
  }
});
