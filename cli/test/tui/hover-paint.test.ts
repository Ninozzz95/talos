/*
 * FE-048, review of the Frontend (01/11): the hover has its own paint. In full colour a soft background, 16% toward the text (the mockup's
 * `toward(bg, foreground, 0.16)`); the inverse of a selection only where colours are poor.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {footerModeRow,footerModelRow,footerZenRow,headerRow} from '../../src/tui/components/chrome-rows.ts';
import {agentsCount,type AgentCard} from '../../src/tui/agents-panel.ts';
import {sideBarRows,BAR_GROUPS} from '../../src/tui/regions/side-bar.ts';
import {createRowWriter} from '../../src/tui/row-writer.ts';
import {highlightRow,lightRow,tintRow} from '../../src/tui/selection.ts';
import {terminalTrueColor} from '../../src/tui/terminal-capabilities.ts';

const COLORS={background:'#000000',foreground:'#ffffff'};
const E='\u001b[';

test('the range takes the step toward the text, and the cell after it is as it was',()=>{
  assert.equal(tintRow('abcd',1,2,COLORS),`a${E}48;2;41;41;41mbc${E}49md`);
});

test('each cell keeps its own background underneath: a band and the chat take the same step',()=>{
  const row=`${E}48;2;100;100;100mab${E}49mcd`;
  const out=tintRow(row,0,3,COLORS);
  assert.ok(out.includes(`${E}48;2;125;125;125m`),out);
  assert.ok(out.includes(`${E}48;2;41;41;41m`),'the part with no background of its own starts from the theme\'s');
});

test('past the range the row\'s own background comes back, and a colour of the text stays',()=>{
  const out=tintRow(`${E}48;2;10;20;30m${E}38;2;1;2;3mabcd`,0,1,COLORS);
  assert.match(out,/48;2;10;20;30m[^\u001b]*$/u);
  assert.ok(out.includes(`${E}38;2;1;2;3m`));
});

test('a hover is not a selection: no inverse in full colour',()=>{
  assert.equal(tintRow('abcd',0,3,COLORS).includes(`${E}7m`),false);
  assert.equal(highlightRow('abcd',0,3).includes(`${E}7m`),true,'the inverse stays for the selection');
});

const writerWith=(tint:boolean)=>{
  const chunks:string[]=[];const writer=createRowWriter({write:(chunk:string)=>{chunks.push(chunk);return true;},columns:10,rows:2});
  writer('hello\nworld');
  if(tint)writer.hoverTint(()=>COLORS);
  chunks.length=0;writer.hover([{row:0,from:0,to:4}]);
  return chunks.join('');
};
test('the writer mixes where it is told the colours, and falls back to inverse where it is not',()=>{
  assert.ok(writerWith(true).includes('48;2;41;41;41m'));
  assert.ok(writerWith(false).includes(`${E}7m`));
});

test('full colour as a terminal announces it',()=>{
  assert.equal(terminalTrueColor({COLORTERM:'truecolor'}),true);
  assert.equal(terminalTrueColor({WT_SESSION:'x'}),true);
  assert.equal(terminalTrueColor({TERM:'xterm-256color'}),false);
  assert.equal(terminalTrueColor({}),false);
});

const footer={mode:'default',noSandbox:false,queueCount:0,width:120,model:'qwen3',snapshot:{windowTokens:100,percent:42} as any,workspace:'~/p',branch:'main'};
const actions=(row:readonly {action?:string}[]|null)=>(row??[]).map(segment=>segment.action).filter(Boolean);

test('what lights up in the footer does something: the mode, the context, the model',()=>{
  assert.deepEqual(actions(footerModeRow(footer)),['frame:mode']);
  /* C11b: the folder opens Projects; the branch beside it is no target (bozzetto-cli-retro/index.html:845) */
  assert.deepEqual(actions(footerModelRow(footer)),['open:model','open:context','open:projects']);
  assert.deepEqual(actions(footerModeRow({...footer,width:90})),['frame:mode','open:context'],'the only row, under 100 columns');
  assert.deepEqual(actions(footerZenRow(footer)),['frame:mode','open:context']);
});

test('the header has no «To do» target any more (owner decision 3): Review is the only click at the right',()=>{
  /* C11b: the folder at the left opens Projects (bozzetto-cli-retro/index.html:723) */
  assert.deepEqual(actions(headerRow({workspace:'~/p',branch:null,width:120,tabs:true})),['open:projects','centre:review']);
});

test('Zen keeps the agents at the right end, and the mode and the context never leave',()=>{
  const card={id:'a',task:'t',prompt:'',model:null,state:'working',ok:true,startMs:0,endMs:null,tokens:0,activity:'',log:[]} as AgentCard;
  const right=[...agentsCount([card])];
  const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
  const wide=text(footerZenRow({...footer,zenRight:right}));
  assert.match(wide,/^ .*ctx 42%.* 1 agent $/u);
  assert.equal(wide.length,120);
  assert.match(text(footerZenRow({...footer,width:28,zenRight:right})),/ask before edits · ctx 42%$/u,'no room: the right end gives way');
});

test('a long bar slides so that the selected row stays in view, and the bottom voices stay',()=>{
  const open=new Set(BAR_GROUPS.map(group=>group.id));
  const base={width:26,height:10,open,focused:true,sessions:[]};
  const rows=(selected:number)=>sideBarRows({...base,selected}).map(row=>row.map(segment=>segment.text).join(''));
  for(let selected=0;selected<14;selected+=1){
    const shown=rows(selected);
    assert.equal(shown.length,10);
    assert.ok(shown.some(row=>row.startsWith(' › ')),`row ${selected} left the view`);
  }
});

test('under a card the footer keeps the mode and the context, and says no key that does not work there',()=>{
  const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
  assert.match(text(footerModeRow(footer)),/shift\+tab/u);
  const under=text(footerModeRow({...footer,cardOpen:true}));
  assert.doesNotMatch(under,/shift\+tab|\? keys/u);assert.match(under,/ask before edits/u);
  assert.match(text(footerModeRow({...footer,width:90,cardOpen:true})),/ask before edits.*ctx 42%/u);
});

test('FE-052: on pixel art both colours brighten, cell by cell, and the colours after the range come back',()=>{
  const row=`${E}38;2;100;0;0m${E}48;2;0;100;0m▀${E}38;2;0;0;100m▀▀`;
  const out=lightRow(row,0,1,COLORS);
  assert.ok(out.includes(`${E}38;2;134;56;56m`),'the top half');
  assert.ok(out.includes(`${E}48;2;56;134;56m`),'the bottom half');
  assert.ok(out.includes(`${E}38;2;56;56;134m`),'a colour that changes inside the range');
  assert.ok(out.endsWith(`${E}38;2;0;0;100m${E}48;2;0;100;0m▀`),'the third cell is as it was');
});

test('FE-052: a label as light as the text still shows the pointer, where a step toward the text would not',()=>{
  const paper=`${E}48;2;236;233;226mabc`;
  assert.notEqual(lightRow(paper,1,1,{background:'#080b11',foreground:'#ece9e2'}),paper);
  assert.ok(tintRow(paper,1,1,{background:'#080b11',foreground:'#ece9e2'}).includes(`${E}48;2;236;233;226mb`),'why the scene needs its own');
});
