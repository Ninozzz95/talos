/*
 * Stage 6c «tutto cliccabile» (mockup `slash`, `theme`, `exit`, `p*`; Claude Code fullscreen: «Click a suggestion in the
 * / command or @ file list to accept it», «Click an option in a select menu to choose it»; OpenCode #12395). Every overlay
 * goes through ONE fit (scroll-window.ts), so a line may carry an action there: each row it wraps to keeps it, and the
 * drawn panel says where it was laid out (inside its border) so a click on a row runs the line's action.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fitOverlay,renderFittedOverlay} from '../../src/tui/overlays/scroll-window.ts';
import {commandMenuOverlay} from '../../src/tui/components/command-menu.ts';
import {themePickerOverlay} from '../../src/tui/overlays/theme-picker.ts';
import {EXIT_CHOICES,exitWithAgentsOverlay} from '../../src/tui/exit-with-agents.ts';
import {fileCompletionOverlay} from '../../src/tui/file-completion.ts';

const h=(type:unknown,props:any,...children:unknown[])=>({type,props:props??{},children});
const Ink={Box:'Box',Text:'Text'};

test('a line\'s action follows it into the window, on every row it wraps to; chrome and the more marker carry none',()=>{
  const content={head:[{text:'Commands'}],sections:[{lines:[{text:'/help · show the keys',action:'slash:/help'},{text:'/model · choose the model and how hard it thinks about the answer',action:'slash:/model'},{text:'/exit · leave',action:'slash:/exit'}],selected:0}],foot:[{text:'enter run'}]};
  const fitted=fitOverlay(content,{columns:30,maxRows:9});
  const body=fitted.rows.filter(row=>row.role==='body');
  assert.equal(body.length,5);
  for(const row of body)assert.match(row.action??'',/^slash:\//u,`«${row.text}» keeps its line's action`);
  assert.ok(body.filter(row=>row.action==='slash:/model').length>=2,'the wrapped line keeps its action on every row');
  const short=fitOverlay(content,{columns:30,maxRows:6});
  assert.ok(short.rows.some(row=>row.role==='more'),'the window is cut');
  for(const row of [...fitted.rows,...short.rows].filter(row=>row.role!=='body'))assert.equal(row.action,undefined,`«${row.text}» is not a target`);
});

test('the drawn panel registers its rows inside its border; without actions or a register, nothing',()=>{
  const fitted=fitOverlay({sections:[{lines:[{text:'Forge',action:'theme:0'},{text:'Calm',action:'theme:1'}],selected:0}]},{columns:20,maxRows:6});
  const calls:any[]=[];
  const box:any=renderFittedOverlay(h,Ink,fitted,{hit:(key,node,rows)=>calls.push({key,node,rows}),hitKey:'theme'});
  box.props.ref('node');
  assert.equal(calls.length,1);assert.equal(calls[0].key,'theme');
  assert.deepEqual(calls[0].rows[0],[],'the top border row');
  assert.deepEqual(calls[0].rows[1].map((s:any)=>[s.text,s.action??null]),[[' ',null],['Forge','theme:0']]);
  assert.deepEqual(calls[0].rows[2].map((s:any)=>[s.text,s.action??null]),[[' ',null],['Calm','theme:1']]);
  const bare:any=renderFittedOverlay(h,Ink,fitOverlay({sections:[{lines:[{text:'x',action:'a'}]}]},{columns:20,maxRows:2}),{hit:(key,node,rows)=>calls.push({key,node,rows}),hitKey:'bare'});
  bare.props.ref('n2');
  assert.deepEqual(calls[1].rows[0].map((s:any)=>[s.text,s.action??null]),[['x','a']],'no border: the rows start at the box');
  const none:any=renderFittedOverlay(h,Ink,fitOverlay({sections:[{lines:[{text:'x'}]}]},{columns:20}),{hit:()=>{throw new Error('no actions, no register');},hitKey:'k'});
  assert.equal(none.props.ref,undefined);
});

test('the menus name what a click does: the `/` list runs its command, the theme list shows a theme, the exit prompt chooses',()=>{
  const menu=commandMenuOverlay({text:'/mo',selected:0});
  const rows=menu.sections[0]!.lines;
  assert.ok(rows.length>0);
  for(const line of rows)assert.match(line.action??'',/^slash:\/\S+$/u);
  assert.ok(rows.some(line=>line.action==='slash:/model'),'/model is in the list for «/mo»');
  const themes=themePickerOverlay({selected:2,current:'forge',colors:true}).sections[0]!.lines;
  themes.forEach((line,index)=>assert.equal(line.action,`theme:${index}`));
  const exit=exitWithAgentsOverlay(0,2).sections[0]!.lines;
  exit.forEach((line,index)=>assert.equal(line.action,`exit:${index}`));
  assert.equal(exit.length,EXIT_CHOICES.length);
});

test('the `@` list: a click on a path inserts it, as Tab does',()=>{
  const rows=[{value:'README.md',directory:false},{value:'src/',directory:true}] as any;
  const lines=fileCompletionOverlay({token:'@',rows,selected:0}).sections[0]!.lines;
  assert.deepEqual(lines.map(line=>line.action),['file:0','file:1']);
});
