/* R1 lane X (E10, Q-R1-4): what TALOS leaves in the scrollback after it leaves the alternate screen. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {formatExitOutput,resumableSessionId,type TuiExitSnapshot} from '../../src/tui/exit-output.ts';
import type {TranscriptItem} from '../../src/tui/transcript-model.ts';

const user=(id:string,text:string):TranscriptItem=>({kind:'message',id,role:'user',text,streaming:false});
const assistant=(id:string,text:string):TranscriptItem=>({kind:'message',id,role:'assistant',text,streaming:false});
const tool=(id:string,name:string,argsText:string,status:any='completed'):TranscriptItem=>({kind:'tool',id,name,status,argsText,liveOutput:'',finalOutput:'line one\nline two',startedAt:1,endedAt:2,outcome:null});
const conversation:TranscriptItem[]=[
  user('u1','hello'),
  {kind:'reasoning',id:'r1',text:'private thinking',streaming:false},
  tool('t1','read_file','{"path":"README.md"}'),
  tool('t2','shell','{"comando":"ls"}'), // the kernel's own argument key
  assistant('a1','OK\nsecond line\n'),
  {kind:'warning',id:'w1',text:'Help\n/exit quits'},
];
const snap=(items:readonly TranscriptItem[],sessionId:string|null='s-123'):TuiExitSnapshot=>({sessionId,items});

test('R1 X transcript mode: You/TALOS blocks, one line per tool row, then the resume line',()=>{
  assert.equal(formatExitOutput(snap(conversation)),[
    'You','hello','',
    /* R2 (Q-R2-3, lane T table): tool rows show the English label and the primary argument, never the kernel name or raw JSON.
       R3 gate E1/E2 (owner Q-R3-1/2): the exit transcript prints the ONE row formatter's line — one space, dictionary words
       (`done`, never the enum `completed`); a command with no reported exit code says `done`. */
    'Read file README.md · done',
    'Shell ls · done','',
    'TALOS','OK','second line','',
    'To resume this session: talos --resume s-123','',
  ].join('\n'));
});

test('R1 X resume mode reduces the output to the resume line only (Q-R1-4 setting)',()=>{
  assert.equal(formatExitOutput(snap(conversation),{mode:'resume'}),'To resume this session: talos --resume s-123\n');
});

test('R1 X an empty session leaves nothing, in both modes, even with a valid id (Qwen gating, C10)',()=>{
  const onlyChrome=[{kind:'warning',id:'w',text:'Welcome'} as TranscriptItem,assistant('a','   ')];
  for(const mode of ['transcript','resume'] as const){
    assert.equal(formatExitOutput(snap([]),{mode}),'');
    assert.equal(formatExitOutput(snap(onlyChrome),{mode}),'');
    assert.equal(formatExitOutput(null,{mode}),'');
  }
  assert.equal(resumableSessionId(snap(onlyChrome)),null);
});

test('R1 X the resume line needs a valid id; the transcript is still printed without one',()=>{
  for(const bad of [null,'','a b','../x','--help','id;rm -rf /','x'.repeat(129),'s-1\u001b[2J','a..b']){
    const out=formatExitOutput(snap(conversation,bad as any));
    assert.doesNotMatch(out,/resume/u,String(bad));
    assert.match(out,/^You\nhello\n/u);
    assert.equal(formatExitOutput(snap(conversation,bad as any),{mode:'resume'}),'');
    assert.equal(resumableSessionId(snap(conversation,bad as any)),null);
  }
  assert.equal(resumableSessionId(snap(conversation,'0f8a2c3e-1b2c-4d5e-8f90-a1b2c3d4e5f6')),'0f8a2c3e-1b2c-4d5e-8f90-a1b2c3d4e5f6');
});

test('R1 X no ANSI without colour; model text is sanitised so it cannot drive the terminal',()=>{
  const hostile=[user('u','hi\u001b[2J'),assistant('a','\u001b]0;pwned\u0007done\r\nnext'),tool('t','x\u001b[31m','a\nb')];
  const plain=formatExitOutput(snap(hostile));
  assert.doesNotMatch(plain,/\u001b|\u0007|\r/u);
  assert.match(plain,/hi\\u001b\[2J/u);
  assert.match(plain,/done\nnext/u);
  /* R2 (Q-R2-3, lane T table): tool rows show the English label and the primary argument, never the kernel name or raw JSON. */
  assert.match(plain,/^X\\u001b\[31m · done$/mu); // R3 gate E2: the dictionary word, never the enum
});

test('R1 X colour styles only the labels and the dim rows; the text itself stays sanitised',()=>{
  const out=formatExitOutput(snap([user('u','hi\u001b[2J'),tool('t','read','{}'),assistant('a','OK')]),{color:true});
  assert.match(out,/^\u001b\[1mYou\u001b\[22m$/mu);
  assert.match(out,/^\u001b\[1mTALOS\u001b\[22m$/mu);
  assert.match(out,/^\u001b\[2mRead · done\u001b\[22m$/mu); // R2 Q-R2-3: label, no raw JSON; R3 E2: a word, not the enum
  assert.match(out,/^\u001b\[2mTo resume this session:\u001b\[22m talos --resume s-123$/mu);
  assert.match(out,/hi\\u001b\[2J/u);
  assert.equal(out.replace(/\u001b\[(?:1|2|22)m/gu,''),formatExitOutput(snap([user('u','hi\u001b[2J'),tool('t','read','{}'),assistant('a','OK')])));
});

test('R1 X tool rows stay one line: long or multi-line arguments are folded and cut',()=>{
  const out=formatExitOutput(snap([user('u','go'),tool('t','write_file',`{"path":"a.txt",\n"content":"${'z'.repeat(200)}"}`,'failed')]));
  /* R2 (Q-R2-3, lane T table): tool rows show the English label and the primary argument, never the kernel name or raw JSON. */
  const row=out.split('\n').find(line=>line.startsWith('Write file'))!;
  assert.match(row,/^Write file a\.txt · failed$/u); // R3 Q-R3-1: one space between label and target
  assert.ok(!row.includes('{'),row);
  assert.ok(row.length<=120,String(row.length));
});

test('R1 X failed and cancelled runs leave one line; streaming text is kept as received',()=>{
  const items:TranscriptItem[]=[user('u','go'),assistant('a','partial'),{kind:'run',id:'r',status:'cancelled',sessionId:'s-123',runId:'run-1',message:'Cancelled by user\nmore'},{kind:'run',id:'r2',status:'completed',sessionId:'s-123',runId:'run-2',message:''}];
  (items[1] as any).streaming=true;
  assert.equal(formatExitOutput(snap(items)),['You','go','','TALOS','partial','','Run cancelled · Cancelled by user','','To resume this session: talos --resume s-123',''].join('\n'));
});
