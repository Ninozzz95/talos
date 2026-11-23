/*
 * Stage 3, MCP elicitation card (owner 02/10; mockup `elicitCard`, golden frames step-17-server-mcp-che-chiedono-t12s at
 * 120×40 and 80×24). A form opens with the server's fields (defaults filled), ↑/↓ moves, typing edits, space toggles,
 * Enter sends («Review and send»), Esc cancels; the url request shows the domain in clear and opens the page only on Enter
 * (Codex: never by itself), d declines. The answer is the MCP response the kernel validates ({action, content}).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {elicitCardClick,elicitCardKey,elicitCardRows,openElicitCard,type ElicitCardState} from '../../src/tui/elicit-card.ts';
import type {CardRow} from '../../src/tui/question-card-rows.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/elicit-card-golden.json',import.meta.url),'utf8')) as {frames:Record<string,{text:string[];style:string[]}>};
const FORM={requestId:'e-1',server:'github',mode:'form' as const,message:'needs details to create the pull request',requestedSchema:{type:'object',required:['repo'],properties:{
  repo:{type:'string',title:'Repository',default:'acme/shop-api'},base:{type:'string',title:'Base branch',default:'main'},
  draft:{type:'boolean',title:'Draft pull request',default:true},labels:{type:'array',title:'Labels',items:{type:'string',enum:['auth','tests','bug']},default:['auth','tests']},
  count:{type:'integer',title:'Reviewers needed'}}}};
const form=()=>openElicitCard(FORM);
const text=(rows:CardRow[])=>rows.map(r=>r.map(s=>s.text).join('').replace(/\s+$/u,''));
const style=(rows:CardRow[])=>rows.map(r=>{let x=0;const out:Array<{start:number;end:number;roles:string}>=[];
  for(const s of r){const n=[...s.text].length;const roles=[...s.roles].sort().join(',');const last=out.at(-1);
    if(roles&&n){if(last&&last.roles===roles&&last.end===x)last.end=x+n;else out.push({start:x,end:x+n,roles});}x+=n;}
  return out.map(o=>`${o.start}+${o.end-o.start}:${o.roles}`).join(' ');});
function keys(state:ElicitCardState,...list:Array<string|{name:string;text?:string}>){
  let outcome:ReturnType<typeof elicitCardKey>['outcome']={kind:'none'};
  for(const k of list){const key=typeof k==='string'?(k.length===1?{name:k===' '?'space':k,text:k}:{name:k}):k;({state,outcome}=elicitCardKey(state,key));}
  return{state,outcome};
}

for(const [size,width] of [['120x40',120],['80x24',80]] as const){
  test(`the form matches the approved mockup at ${size}, text and style (its four fields)`,()=>{
    const four={...FORM,requestedSchema:{...FORM.requestedSchema,properties:Object.fromEntries(Object.entries(FORM.requestedSchema.properties).filter(([k])=>k!=='count'))}};
    const rows=elicitCardRows(openElicitCard(four),width);
    assert.deepEqual(text(rows),golden.frames[size]!.text);
    assert.deepEqual(style(rows),golden.frames[size]!.style);
  });
}

test('typing edits the highlighted text field, space toggles, Enter sends the values in their kinds',()=>{
  /* repo: three backspaces and xyz; draft: space turns it off; labels: the mockup's space walks the options and toggles each
     (auth off, tests off, bug on); count: 3 */
  const {state,outcome}=keys(form(),'backspace','backspace','backspace','x','y','z','down','down',' ','down',' ',' ',' ','down','3','return');
  assert.equal(state.fields[0]!.value,'acme/shop-xyz');
  assert.equal(outcome.kind,'send');
  const content=(outcome as any).response.content;
  assert.deepEqual([(outcome as any).response.action,content.repo,content.base,content.draft,content.count],['accept','acme/shop-xyz','main',false,3]);
  assert.deepEqual(content.labels,['bug']);
});

test('a required field left empty keeps the card open and says which; Esc cancels',()=>{
  const empty=keys(form(),...Array.from({length:13},()=>'backspace')).state;
  const {state,outcome}=keys(empty,'return');
  assert.equal(outcome.kind,'none');
  assert.equal(state.missing,'repo');
  assert.deepEqual(keys(form(),'escape').outcome,{kind:'send',response:{action:'cancel'}});
});

test('an optional empty field is left out of the content; a number that is not a number is not sent',()=>{
  const {outcome}=keys(form(),'down','backspace','backspace','backspace','backspace','return');
  assert.equal((outcome as any).response.content.base,undefined);
  const bad=keys(form(),'down','down','down','down','x','return');
  assert.equal(bad.outcome.kind,'none');assert.equal(bad.state.missing,'count');
});

test('a url request: the domain in clear, Enter opens it, d declines, Esc cancels — never opened by itself',()=>{
  const url=openElicitCard({requestId:'e-2',server:'linear',mode:'url',message:'Sign in to Linear so the server can read your issues.',url:'https://linear.app/oauth/authorize?x=1',domain:'linear.app'});
  const rows=text(elicitCardRows(url,120));
  assert.ok(rows[0]!.includes('linear (MCP server) asks you to open a page'));
  assert.ok(rows.some(r=>r.includes('https://linear.app/oauth/authorize?x=1')));
  assert.ok(rows.some(r=>r.includes('domain: linear.app · opens in your browser, never inside TALOS')));
  assert.ok(rows.some(r=>r.includes('Open in browser     Decline    enter open · d decline · esc cancel')));
  assert.deepEqual(keys(url,'return').outcome,{kind:'open',url:'https://linear.app/oauth/authorize?x=1',response:{action:'accept'}});
  assert.deepEqual(keys(url,'d').outcome,{kind:'send',response:{action:'decline'}});
  assert.deepEqual(keys(url,'escape').outcome,{kind:'send',response:{action:'cancel'}});
});

/* Stage 6c «tutto cliccabile» (mockup `click`: efield, eaccept, edecline). A field's name selects it; «Review and send» and
   «Open in browser» are Enter; «Decline» is the MCP spec's explicit decline, while Esc stays the dismissal (cancel). */
test('a click selects a field, sends or opens like Enter, and declines',()=>{
  const state=form();
  const picked=elicitCardClick(state,'field:2')!;
  assert.equal(picked.state.sel,2);assert.deepEqual(picked.outcome,{kind:'none'});
  assert.deepEqual(elicitCardClick(state,'send'),elicitCardKey(state,{name:'return'}));
  assert.deepEqual(elicitCardClick(state,'decline'),{state,outcome:{kind:'send',response:{action:'decline'}}});
  assert.equal(elicitCardClick(state,`field:${state.fields.length}`),null,'one past the last field');
  assert.equal(elicitCardClick({...state,missing:'repo'},'field:1')!.state.missing,undefined,'choosing a field clears the «missing» line, as ↑/↓ do');
  const url=openElicitCard({requestId:'e-2',server:'linear',mode:'url',message:'Sign in',url:'https://linear.app/oauth',domain:'linear.app'} as any);
  assert.deepEqual(elicitCardClick(url,'open'),elicitCardKey(url,{name:'return'}));
  assert.deepEqual(elicitCardClick(url,'decline'),elicitCardKey(url,{name:'d',text:'d'}));
  assert.equal(elicitCardClick(state,'approve'),null);
});
