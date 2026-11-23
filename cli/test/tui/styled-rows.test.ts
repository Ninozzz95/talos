/* Stage 3: the one role → Ink style mapping used by the cards drawn from the approved mockup (components/styled-rows.ts). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderStyledRows,roleStyle} from '../../src/tui/components/styled-rows.ts';

/* Stage 7: the mockup's classes (MOCKUP-FASE-UI-2026-10-01.html:44-48), colour for colour: .c-inv and .c-pill are the
   accent behind text in the background colour (not the terminal's inverse), .c-hl the highlight behind the text, .c-band and
   .c-code a surface, .c-add/.c-del/.c-warnbg a colour on its tinted background. Without colour the attributes stay. */
const colors={background:'#080b11',foreground:'#ebe5db',accent:'#c98b32',muted:'#8f8d89',faint:'#75736f',success:'#7ccf8a',warning:'#e3b341',danger:'#f07a7a',
  band:'#17191e',code:'#14171c',highlight:'#5a4224',addBackground:'#141e1c',delBackground:'#1f151a',warnBackground:'#1f1c16'};

test("each mockup role becomes the mockup's style; colourless terminals keep the attributes",()=>{
  assert.deepEqual(roleStyle(['acc','b'],colors),{color:'#c98b32',bold:true});
  assert.deepEqual(roleStyle(['dim','i'],colors),{color:'#8f8d89',italic:true});
  assert.deepEqual(roleStyle(['faint'],colors),{color:'#75736f'});
  assert.deepEqual(roleStyle(['inv'],colors),{color:'#080b11',backgroundColor:'#c98b32'});
  assert.deepEqual(roleStyle(['pill'],colors),{color:'#080b11',backgroundColor:'#c98b32',bold:true});
  assert.deepEqual(roleStyle(['hl'],colors),{color:'#ebe5db',backgroundColor:'#5a4224'});
  assert.deepEqual(roleStyle(['band','b'],colors),{backgroundColor:'#17191e',bold:true});
  assert.deepEqual(roleStyle(['code'],colors),{backgroundColor:'#14171c'});
  assert.deepEqual(roleStyle(['acc','b','u'],colors),{color:'#c98b32',bold:true,underline:true},'the url card underlines the domain');
  assert.deepEqual(roleStyle(['ok'],colors),{color:'#7ccf8a'});
  assert.deepEqual(roleStyle(['add'],colors),{color:'#7ccf8a',backgroundColor:'#141e1c'});
  assert.deepEqual(roleStyle(['warn'],colors),{color:'#e3b341'});
  assert.deepEqual(roleStyle(['warnbg'],colors),{color:'#e3b341',backgroundColor:'#1f1c16'});
  assert.deepEqual(roleStyle(['err'],colors),{color:'#f07a7a'});
  assert.deepEqual(roleStyle(['del'],colors),{color:'#f07a7a',backgroundColor:'#1f151a'});
  assert.deepEqual(roleStyle(['acc','band'],colors),{color:'#c98b32',backgroundColor:'#17191e'},'a coloured text on a band');
  /* two roles on one property: the class defined later in the mockup's sheet wins, whatever the order of the roles */
  assert.deepEqual(roleStyle(['inv','acc'],colors),{color:'#080b11',backgroundColor:'#c98b32'},'.c-inv after .c-acc');
  assert.deepEqual(roleStyle(['acc','dim'],colors),{color:'#c98b32'},'.c-acc after .c-dim');
  assert.deepEqual(roleStyle(['hl','acc','b'],colors),{color:'#ebe5db',backgroundColor:'#5a4224',bold:true},'.c-hl after .c-acc');
  assert.deepEqual(roleStyle([],colors),{});
  assert.deepEqual(roleStyle(['acc','b'],{}),{bold:true},'no colour: bold stays');
  assert.deepEqual(roleStyle(['faint'],{}),{dimColor:true},"no colour: faint is the terminal's dim");
  assert.deepEqual(roleStyle(['pill'],{}),{bold:true,inverse:true},"no colour: a pill is the terminal's inverse");
  assert.deepEqual(roleStyle(['inv'],{}),{inverse:true});
  assert.deepEqual(roleStyle(['warnbg'],{}),{inverse:true});
});

test('rows render as one non-wrapping line each, plain segments as plain text',()=>{
  const h=(type:any,props:any,...children:any[])=>({type,props,children});
  const Ink={Box:'Box',Text:'Text'};
  const tree:any=renderStyledRows(h,Ink,[[{text:'╭─ ',roles:['acc']},{text:'TALOS asks',roles:['acc','b']},{text:' x',roles:[]}],[{text:'plain',roles:[]}]],colors);
  assert.equal(tree.type,'Box');assert.equal(tree.children.length,2);
  const [first,second]=tree.children;
  assert.equal(first.props.wrap,'truncate');
  assert.deepEqual(first.children.map((c:any)=>typeof c==='string'?c:[c.props.color,c.props.bold??null,c.children[0]]),[['#c98b32',null,'╭─ '],['#c98b32',true,'TALOS asks'],' x']);
  assert.deepEqual(second.children,['plain']);
});

/* Stage 7.3 (gate probe 02/10): an empty row (`[S('')]`, the sheet's blank rows) became an Ink Text with no content, which Ink
   lays out zero rows high — the sheet drew shorter than the mockup and every click target below it slid one row. An empty
   row keeps its row. */
test('an empty row still takes its row on screen',()=>{
  const h=(type:any,props:any,...children:any[])=>({type,props,children});
  const tree:any=renderStyledRows(h,{Box:'Box',Text:'Text'},[[{text:'',roles:[]}],[],[{text:'x',roles:[]}]],colors);
  assert.deepEqual(tree.children.map((row:any)=>row.children.join('')),[' ',' ','x']);
});
