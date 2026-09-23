import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  appendTranscriptMessage,appendTranscriptWarning,createTranscriptModel,reduceTranscriptEvent,
  transcriptItemRaw,transcriptItemText,
} from '../../src/tui/transcript-model.ts';
import {
  createTranscriptSearchState,moveTranscriptSearchSelection,selectedTranscriptMatch,
  transcriptSearchLines,transcriptSearchMatches,
} from '../../src/tui/overlays/transcript-search.ts';
import {
  TRANSCRIPT_COPY_MAX_BYTES,osc52CopySequence,transcriptViewportForIndex,
} from '../../src/tui/components/transcript.ts';
import {resolveKeybinding} from '../../src/tui/keybindings.ts';

function sample(){
  let model=createTranscriptModel();
  model=appendTranscriptMessage(model,{id:'u1',role:'user',text:'Fix the parser'});
  model=appendTranscriptMessage(model,{id:'a1',role:'assistant',text:'I will inspect parser.ts'});
  model=reduceTranscriptEvent(model,{type:'tool.started',toolCallId:'t1',toolName:'grep',eventId:'seq:1'});
  model=reduceTranscriptEvent(model,{type:'tool.completed',toolCallId:'t1',content:'parser.ts:42'});
  model=appendTranscriptWarning(model,'Provider fallback to backup','seq:2');
  return model.items;
}

test('M4-B RED — literal and fuzzy search preserve transcript chronology and expose stable ids',()=>{
  const items=sample();
  const literal=transcriptSearchMatches(items,'parser','literal');
  assert.deepEqual(literal.map(row=>row.itemId),['message:u1','message:a1','tool:t1']);
  const fuzzy=transcriptSearchMatches(items,'prsr','fuzzy');
  assert.deepEqual(fuzzy.map(row=>row.itemId),['message:u1','message:a1','tool:t1']);
  assert.deepEqual(transcriptSearchMatches(items,'','literal').map(row=>row.itemId),items.map(row=>row.id));

  const selected=selectedTranscriptMatch(literal,'message:a1');
  assert.equal(selected?.itemId,'message:a1');
  assert.equal(moveTranscriptSearchSelection(literal,'message:a1',1),'tool:t1');
  assert.equal(moveTranscriptSearchSelection(literal,'missing',1),'message:u1');
});

test('M4-B RED — search selection remains id-based when chronology changes around it',()=>{
  let model=createTranscriptModel();
  model=appendTranscriptMessage(model,{id:'a',role:'assistant',text:'needle alpha'});
  model=appendTranscriptMessage(model,{id:'b',role:'assistant',text:'needle beta'});
  const first=transcriptSearchMatches(model.items,'needle','literal');
  assert.equal(selectedTranscriptMatch(first,'message:b')?.itemId,'message:b');
  model=appendTranscriptWarning(model,'needle warning');
  const second=transcriptSearchMatches(model.items,'needle','literal');
  assert.equal(selectedTranscriptMatch(second,'message:b')?.itemId,'message:b');
});

test('M4-B RED — raw and copy serializers escape terminal and bidi controls without losing stable meaning',()=>{
  let model=createTranscriptModel();
  model=appendTranscriptMessage(model,{id:'evil',role:'assistant',text:'safe\u001b]52;c;ATTACK\u0007\u202Ehidden\nnext'});
  const item=model.items[0]!;
  const normal=transcriptItemText(item);
  const raw=transcriptItemRaw(item);
  for(const value of [normal,raw]){
    assert.equal(value.includes('\u001b'),false);assert.equal(value.includes('\u0007'),false);assert.equal(value.includes('\u202e'),false);
    assert.match(value,/\\u001b/u);assert.match(value,/\\u0007/u);assert.match(value,/\\u202e/u);
  }
  assert.match(raw,/"kind": "message"/u);assert.match(raw,/"id": "message:evil"/u);
});

test('M4-B RED — OSC52 copy is explicit write-only base64 and bounded without silent truncation',()=>{
  const text='TALOS\nselected text';
  const sequence=osc52CopySequence(text);
  assert.match(sequence,/^\u001b\]52;c;[A-Za-z0-9+/=]+\u0007$/u);
  const payload=sequence.slice('\u001b]52;c;'.length,-1);
  assert.equal(Buffer.from(payload,'base64').toString('utf8'),text);
  assert.equal(sequence.includes('?'),false);
  assert.throws(()=>osc52CopySequence('x'.repeat(TRANSCRIPT_COPY_MAX_BYTES+1)),(error:any)=>error?.code==='TRANSCRIPT_COPY_LIMIT');
});

test('M4-B RED — viewport jump reveals the selected match without corrupting unseen state',()=>{
  const view={offset:0,pageSize:5,unseen:4,followingTail:true};
  assert.deepEqual(transcriptViewportForIndex(view,20,4),{offset:15,pageSize:5,unseen:4,followingTail:false});
  assert.deepEqual(transcriptViewportForIndex(view,20,19),{offset:0,pageSize:5,unseen:0,followingTail:true});
});

test('M4-B RED — search overlay reports match count mode selected id and sanitized preview',()=>{
  const items=sample();
  const state=createTranscriptSearchState('message:a1');
  const next={...state,query:'parser',mode:'literal' as const};
  const lines=transcriptSearchLines({items,state:next,raw:false});
  assert.match(lines[0]??'',/Transcript search · literal/u);
  assert.match(lines[0]??'',/2\/3/u);
  assert.match(lines.join('\n'),/I will inspect parser\.ts/u);
  const rawLines=transcriptSearchLines({items,state:{...next,raw:true},raw:true});
  assert.match(rawLines.join('\n'),/"id": "message:a1"/u);
});

test('M4-B RED — transcript actions use resolver-supported chords and preserve Ctrl+C',async()=>{
  assert.equal(resolveKeybinding('t',{meta:true},['composer','transcript','global']),'transcript-search');
  assert.equal(resolveKeybinding('r',{meta:true},['composer','transcript','global']),'transcript-raw');
  assert.equal(resolveKeybinding('c',{meta:true},['composer','transcript','global']),'transcript-copy');
  assert.equal(resolveKeybinding('c',{ctrl:true},['composer','transcript','global']),'interrupt');
  const {assertValidKeymap}=await import('../../src/tui/keymap-resolver.ts');
  assert.equal(resolveKeybinding('q',{meta:true},['composer','transcript','global'],assertValidKeymap({'transcript-search':['Alt+Q']})),'transcript-search');
});

test('M4-B RED — app owns search/raw/copy locally and approval preempts the transcript overlay',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/transcriptSearchMatches/u);assert.match(source,/transcriptSearchLines/u);
  assert.match(source,/action==='transcript-search'/u);assert.match(source,/action==='transcript-raw'/u);assert.match(source,/action==='transcript-copy'/u);
  assert.match(source,/osc52CopySequence/u);assert.match(source,/stdout\.write/u);
  assert.match(source,/setTranscriptSearch\(null\)/u);
  assert.match(source,/if\(next\)setTranscriptSearch\(null\)/u);
  assert.doesNotMatch(source,/OSC 52.*\?/u);
});
