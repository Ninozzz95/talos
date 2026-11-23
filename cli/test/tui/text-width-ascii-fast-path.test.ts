/* P-C (0.5.0 start-up/resume work): printable ASCII is by far the commonest text in a transcript, and the grapheme
   segmenter was run on every character of it while a long session was laid out (28,000 lines ≈ 390 ms in `wrapDisplay`,
   ≈ 610 ms in `truncateMiddle`, measured 07/10 on this machine). The helpers now skip the segmenter for lines made only
   of U+0020–U+007E, where every UTF-16 unit is its own grapheme (UAX #29: the only multi-code-point ASCII cluster is
   CR×LF, and both are controls outside the range).
   Two kinds of proof here: (1) a counter on `Intl.Segmenter.prototype.segment` — the fast path must be taken for
   printable ASCII and must NOT be taken for anything else (tab, DEL, ESC, CR, any non-ASCII); (2) a differential fuzz
   against the previous implementation pasted verbatim below as the oracle. */
import assert from 'node:assert/strict';
import test from 'node:test';
import stringWidth from 'string-width';
import {displayWidth,splitGraphemes,truncateDisplay,truncateMiddle,wrapDisplay} from '../../src/tui/text-width.ts';

/* ---- oracle: text-width.ts as it was before the fast path (R1 gate E4/E16 version), kept verbatim ---- */
const oracleSegmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const oSplit=(text:string)=>[...oracleSegmenter.segment(text)].map(x=>x.segment);
const oWidth=(text:string)=>stringWidth(String(text));
function oTruncateDisplay(text:string,width:number){if(oWidth(text)<=width)return text;if(width<=1)return '…';let out='',used=0;for(const g of oSplit(text)){const w=oWidth(g);if(used+w+1>width)break;out+=g;used+=w;}return `${out}…`;}
function oTruncateMiddle(text:string,width:number){
  if(oWidth(text)<=width)return text;if(width<=1)return '…';
  const graphemes=oSplit(text);const budget=width-1;let head='',tail='',used=0,left=0,right=graphemes.length-1;
  while(left<=right){
    const takeTail=oWidth(tail)<=oWidth(head);const g=takeTail?graphemes[right]!:graphemes[left]!;const w=oWidth(g);
    if(used+w>budget)break;used+=w;
    if(takeTail){tail=g+tail;right--;}else{head+=g;left++;}
  }
  return `${head}…${tail}`;
}
function oWrapDisplay(text:string,width:number):string[]{
  const limit=Math.max(1,Math.floor(width));const rows:string[]=[];
  for(const line of String(text).split('\n')){
    let row='',used=0;
    for(const g of oSplit(line)){const w=oWidth(g);if(used+w>limit&&row!==''){rows.push(row);row='';used=0;}row+=g;used+=w;}
    rows.push(row);
  }
  return rows;
}

/* ---- counting how often the segmenter is consulted ---- */
function segmenterCalls<T>(run:()=>T):{result:T;calls:number}{
  const proto=Intl.Segmenter.prototype as {segment:(input:string)=>unknown};const original=proto.segment;let calls=0;
  proto.segment=function(this:unknown,input:string){calls++;return original.call(this,input);};
  try{const result=run();return {result,calls};}finally{proto.segment=original;}
}

/* ---- seeded generator (mulberry32) so a failure is reproducible ---- */
function rng(seed:number){return ()=>{seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
const PRINTABLE=Array.from({length:0x7f-0x20},(_,i)=>String.fromCharCode(0x20+i));
const NON_FAST=['\t','\r','\x7f','\x00','\x1b[31m','\x1b[0m','é','é','界','👍🏽','🇮🇹','👨‍👩‍👧','☺','​','ｱ','…',' ','\ud83d'];
function fuzzString(next:()=>number){
  const pick=<T,>(a:T[])=>a[Math.floor(next()*a.length)]!;
  const length=next()<0.15?Math.floor(next()*4):Math.floor(next()*300);
  const parts:string[]=[];for(let i=0;i<length;i++)parts.push(next()<0.04?'\n':next()<0.15?pick(LATIN):pick(PRINTABLE));
  const mode=next();
  if(mode<0.5)return parts.join('');
  if(mode<0.8){parts.splice(Math.floor(next()*(parts.length+1)),0,pick(NON_FAST));return parts.join('');}
  const extra=1+Math.floor(next()*4);for(let i=0;i<extra;i++)parts.splice(Math.floor(next()*(parts.length+1)),0,pick(NON_FAST));
  return parts.join('');
}
/* P-C2: beyond ASCII, the text of this product is Italian prose with typographic punctuation, arrows and box drawing. */
const LATIN=['é','è','à','ù','ì','ò','ç','ñ','ü','ß','Æ','ø','Å','œ','ž','Ω','ж','—','–','…','“','”','‘','’','•','†','→','←','↑','↓','⇒','│','─','┌','└','▌','█','▶','©','®','°','±','×','÷','·','«','»','¿','¡'];
const WIDTHS=[-3,0,0.5,1,1.5,2,2.7,3,4,5,8,13,40,80,120,Infinity,NaN];

test('printable ASCII never reaches the grapheme segmenter',()=>{
  const line='The quick brown fox jumps over the lazy dog 0123456789 ~!@#$%^&*()_+{}|:"<>?[]\\;\',./';
  const text=`${line}\n\n${line} ${line}`;
  const {calls}=segmenterCalls(()=>{
    splitGraphemes(line);wrapDisplay(text,17);wrapDisplay(text,1);wrapDisplay(text,10_000);
    truncateDisplay(line,20);truncateMiddle(line,20);truncateMiddle('/c/Users/person/Desktop/projects/x',12);displayWidth(line);
  });
  assert.equal(calls,0,'a line of U+0020–U+007E must be measured and cut without Intl.Segmenter');
});

test('anything that is not printable ASCII still goes through the segmenter and gives the same answer',()=>{
  for(const text of ['a\tb','áb','界bc','a\x7fb','a\rb','\x1b[31mred\x1b[0m','plain 👍🏽 plain','ab\ud83dcd','ＡＢＣé','naïve­','x​y','á—b','d‍g']){
    const cases:Array<[string,()=>unknown,()=>unknown]>=[
      ['splitGraphemes',()=>splitGraphemes(text),()=>oSplit(text)],
      ['wrapDisplay',()=>wrapDisplay(text,3),()=>oWrapDisplay(text,3)],
      ['truncateDisplay',()=>truncateDisplay(text,4),()=>oTruncateDisplay(text,4)],
      ['truncateMiddle',()=>truncateMiddle(text,4),()=>oTruncateMiddle(text,4)],
    ];
    for(const [name,run,oracle] of cases){
      const {result,calls}=segmenterCalls(run);
      assert.deepEqual(result,oracle(),`${name}(${JSON.stringify(text)})`);
      if(name!=='truncateDisplay'&&name!=='truncateMiddle')assert.ok(calls>0,`${name}(${JSON.stringify(text)}) must use the segmenter`);
    }
  }
});

test('the fast path is the same function as the old one: differential fuzz (seeded, 1,000 strings)',()=>{
  const next=rng(0x7a105);
  for(let i=0;i<1000;i++){
    const text=fuzzString(next);const tag=`#${i} ${JSON.stringify(text.length>90?`${text.slice(0,90)}…`:text)}`;
    assert.deepEqual(splitGraphemes(text),oSplit(text),`splitGraphemes ${tag}`);
    assert.equal(displayWidth(text),oWidth(text),`displayWidth ${tag}`);
    for(const w of WIDTHS){
      assert.deepEqual(wrapDisplay(text,w),oWrapDisplay(text,w),`wrapDisplay(${w}) ${tag}`);
      assert.equal(truncateDisplay(text,w),oTruncateDisplay(text,w),`truncateDisplay(${w}) ${tag}`);
      assert.equal(truncateMiddle(text,w),oTruncateMiddle(text,w),`truncateMiddle(${w}) ${tag}`);
    }
  }
});

test('boundaries of the fast path, pinned by hand',()=>{
  assert.deepEqual(wrapDisplay('',5),['']);
  assert.deepEqual(wrapDisplay('abc',3),['abc']);
  assert.deepEqual(wrapDisplay('abcdef',3),['abc','def']);
  assert.deepEqual(wrapDisplay('abcdefg',3),['abc','def','g']);
  assert.deepEqual(wrapDisplay('abc',0),['a','b','c']);
  assert.deepEqual(wrapDisplay('a\n\nb',4),['a','','b']);
  assert.deepEqual(wrapDisplay('ab\n',4),['ab','']);
  assert.deepEqual(wrapDisplay('abcd',2.9),['ab','cd']);
  assert.deepEqual(splitGraphemes(''),[]);
  assert.deepEqual(splitGraphemes('a b'),['a',' ','b']);
  assert.equal(truncateDisplay('abcdefghij',6),'abcde…');
  assert.equal(truncateDisplay('abcdefghij',10),'abcdefghij');
  assert.equal(truncateDisplay('abcdefghij',2),'a…');
  assert.equal(truncateDisplay('abcdefghij',1),'…');
  assert.equal(truncateMiddle('abcdefghij',6),'ab…hij');
  assert.equal(truncateMiddle('abcdefghij',2),'…j');
  assert.equal(truncateMiddle('abcdefghij',1),'…');
  assert.equal(truncateMiddle('abcdefghij',10),'abcdefghij');
});

/* ---- P-C2 (measured on the owner's real sessions, 07/10: after the ASCII path, stringWidth 106 ms + splitGraphemes 62 ms + the row
   estimate 282 ms of a 2.1 s resume were Italian prose: accents, “typographic” quotes, —, …, arrows and box drawing are not ASCII) ----
   The class below is not a guess: it is every BMP code point of the candidate blocks that the runtime's own Intl.Segmenter calls one
   grapheme AND string-width 8.2.2 calls one column wide, and all 3,381,921 ordered pairs of it segment as two graphemes (checked once
   with the generator, scripts/gen-simple-class.mjs). Combining marks, ZWJ/ZWSP, bidi controls, variation selectors, wide and emoji forms
   are outside it and keep the full path. The tests pin the class to the runtime, so a Node/ICU or string-width change turns them red. */
const CANDIDATE_BLOCKS:Array<[number,number]>=[[0x20,0x7e],[0xa0,0x2ff],[0x370,0x52f],[0x2010,0x205e],[0x2190,0x22ff],[0x2500,0x25ff]];
const MUST_STAY_SLOW:Array<[number,number]>=[[0x300,0x36f],[0x483,0x489],[0x2000,0x200f],[0x202a,0x202e],[0x2060,0x206f],[0xfe00,0xfe0f],[0x3000,0x303f],[0x4e00,0x4e20],[0xac00,0xac10],[0xff21,0xff30]];

test('P-C2 Latin prose with typographic punctuation, arrows and box drawing never reaches the segmenter',()=>{
  const line='Perché “l’avvio” è già così — naïve café Ærø Ω жук … → ← │ ─ ┌ └ ▌ █ ▶ © ® ° ± × ÷ · « » ¿ ¡   †';
  const {calls}=segmenterCalls(()=>{
    splitGraphemes(line);wrapDisplay(`${line}\n${line}`,17);wrapDisplay(line,1);truncateDisplay(line,20);truncateMiddle(line,20);displayWidth(line);
  });
  assert.equal(calls,0,'the product\'s own non-ASCII text must be laid out without Intl.Segmenter');
});

test('P-C2 the class is exactly what the runtime says: a candidate code point takes the fast path iff it is one grapheme and one column',()=>{
  let inside=0;
  for(const [from,to] of CANDIDATE_BLOCKS)for(let cp=from;cp<=to;cp++){
    const ch=String.fromCodePoint(cp);
    const expected=oSplit(ch).length===1&&oWidth(ch)===1;
    const {result,calls}=segmenterCalls(()=>splitGraphemes(ch));
    assert.equal(calls===0,expected,`U+${cp.toString(16).toUpperCase().padStart(4,'0')} (${JSON.stringify(ch)}): the class and the runtime disagree`);
    assert.deepEqual(result,oSplit(ch));
    if(expected){inside++;assert.equal(displayWidth(ch),1);assert.deepEqual(wrapDisplay(ch+ch,1),[ch,ch]);}
  }
  assert.ok(inside>1800,`the class has ${inside} code points; the generator found 1,839`);
});

test('P-C2 everything that can join, vanish or widen stays on the full path, and gives the oracle\'s answer',()=>{
  for(const [from,to] of MUST_STAY_SLOW)for(let cp=from;cp<=to;cp++){
    const text=`a${String.fromCodePoint(cp)}b`;
    const {result,calls}=segmenterCalls(()=>splitGraphemes(text));
    assert.ok(calls>0,`U+${cp.toString(16).toUpperCase()} must reach the segmenter`);
    assert.deepEqual(result,oSplit(text));
    assert.equal(displayWidth(text),oWidth(text));
  }
});

test('P-C2 random pairs and triples of class members segment and measure like the oracle',()=>{
  const members:string[]=[];
  for(const [from,to] of CANDIDATE_BLOCKS)for(let cp=from;cp<=to;cp++){const ch=String.fromCodePoint(cp);if(oSplit(ch).length===1&&oWidth(ch)===1)members.push(ch);}
  const next=rng(0xc0ffee);const pick=()=>members[Math.floor(next()*members.length)]!;
  for(let i=0;i<20_000;i++){
    const text=pick()+pick()+(i%2?pick():'');
    assert.deepEqual(splitGraphemes(text),oSplit(text),JSON.stringify(text));
    assert.equal(displayWidth(text),oWidth(text),JSON.stringify(text));
  }
});

test('P-C2 truncation and wrapping of Latin prose are the oracle\'s, at every width',()=>{
  const line='Perché “l’avvio” è già così — naïve café, Ærø: Ω жук … → │ ─ ▌ █ ▶ © ° ± × « » ¿';
  for(let width=-1;width<=line.length+3;width++){
    assert.deepEqual(wrapDisplay(line,width),oWrapDisplay(line,width),`wrapDisplay(${width})`);
    assert.equal(truncateDisplay(line,width),oTruncateDisplay(line,width),`truncateDisplay(${width})`);
    assert.equal(truncateMiddle(line,width),oTruncateMiddle(line,width),`truncateMiddle(${width})`);
  }
});
