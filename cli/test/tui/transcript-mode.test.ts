/*
 * Stage 7.12 (mockup `transcriptKey`/`transcriptFrame`; Claude Code fullscreen transcript mode): the keys of the transcript
 * mode and its top and bottom rows, as the approved mockup writes them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {openTranscriptMode,transcriptModeHeader,transcriptModeHelp,transcriptModeHits,transcriptModeKey,transcriptModeMarks,transcriptModeOpen,transcriptModePromptOf,transcriptModePromptRow,transcriptModeStamp,transcriptModeStatus,transcriptModeTurn,type TranscriptModeItem,type TranscriptModeState} from '../../src/tui/transcript-mode.ts';
import type {SegRow} from '../../src/tui/panel/sheet.ts';

const text=(row:SegRow)=>row.map(s=>s.text).join('').replace(/\s+$/u,'');
const style=(row:SegRow)=>{let x=0;const out:string[]=[];for(const s of row){const n=[...s.text].length;if(s.roles.length&&n)out.push(`${x}+${n}:${[...s.roles].sort().join(',')}`);x+=n;}return out.join(' ');};
const ITEMS:TranscriptModeItem[]=[{id:'u1',prompt:true,text:'Show me how sessions are refreshed'},{id:'a1',prompt:false,text:'Sessions refresh in session.ts'},
  {id:'u2',prompt:true,text:'The login e2e test is flaky'},{id:'r1',prompt:false,text:'thinking about the session cookie'},{id:'a2',prompt:false,text:'It waits for the session cookie now'}];
const press=(state:TranscriptModeState,...names:string[])=>{let s=state;let effect='none';for(const name of names){const out=transcriptModeKey(s,{name},ITEMS);s=out.state;effect=out.effect;}return{state:s,effect};};

test('the top and bottom rows are the mockup\'s',()=>{
  const header=transcriptModeHeader(8);
  assert.equal(text(header),' Transcript · 8 messages   / search · n/N next · { } prompts · [ to terminal scrollback · v editor · q back');
  assert.equal(style(header),'0+11:acc,b 11+13:dim 24+83:faint');
  const editing=transcriptModeStatus(openTranscriptMode({search:true}));
  assert.equal(text(editing),' /▍');assert.equal(style(editing),'0+2:acc');
  assert.equal(text(transcriptModeStatus(openTranscriptMode())),' / to search');
});

test('/ searches live, Enter keeps the matches, n/N go through them; Esc drops the search',()=>{
  let {state}=press(openTranscriptMode(),'/','s','e','s','s','i','o','n');
  assert.deepEqual(state.hits,['u1','a1','r1','a2']);assert.equal(state.at,'a2','the newest match');
  assert.match(text(transcriptModeStatus(state)),/^ \/session▍ {3}4 matches$/u);
  ({state}=press(state,'Enter'));assert.equal(state.editing,false);
  assert.equal(text(transcriptModeStatus(state)),' match 4 of 4 for "session" · n next · N previous');
  ({state}=press(state,'n'));assert.equal(state.at,'r1');({state}=press(state,'N','N'));assert.equal(state.at,'u1','N wraps to the oldest');
  ({state}=press(state,'/','x','Escape'));assert.deepEqual([state.query,state.hits],['',[]]);
  assert.deepEqual(transcriptModeHits(ITEMS,'  COOKIE '),['r1','a2'],'any case, trimmed');
});

test('arrows and j/k move item by item, { } between prompts, g/G to the ends; [ v and q are the app\'s',()=>{
  let {state}=press(openTranscriptMode(),'ArrowUp');assert.equal(state.at,'r1');
  ({state}=press(state,'k','k'));assert.equal(state.at,'a1');
  ({state}=press(state,'}'));assert.equal(state.at,'u2');({state}=press(state,'{'));assert.equal(state.at,'u1');
  ({state}=press(state,'{'));assert.equal(state.at,'u1','no prompt before the first');
  ({state}=press(state,'j','ArrowDown','ArrowDown','ArrowDown'));assert.equal(state.at,null,'the last item is the end');
  ({state}=press(state,'g'));assert.equal(state.at,'u1');({state}=press(state,'G'));assert.equal(state.at,null);
  assert.equal(press(state,'[').effect,'scrollback');assert.equal(press(state,'v').effect,'editor');
  for(const key of ['q','Escape'])assert.equal(press(state,key).effect,'close');
  assert.equal(transcriptModeKey(state,{name:'o',ctrl:true},ITEMS).effect,'close');
  assert.equal(press(state,'x').effect,'none');
});

test('+1 completa: the full view opens every item; o/Enter closes one, d switches to compact where o opens one',()=>{
  const ids=ITEMS.map(item=>item.id);
  let {state}=press(openTranscriptMode());
  assert.equal(state.full,true,'Ctrl+O opens the full view');
  assert.deepEqual([...transcriptModeOpen(state,ids)],ids);
  ({state}=press(state,'k','o'));assert.equal(state.at,'r1');
  assert.deepEqual([...transcriptModeOpen(state,ids)],['u1','a1','u2','a2'],'o closes the item in view');
  ({state}=press(state,'Enter'));assert.deepEqual([...transcriptModeOpen(state,ids)],ids,'Enter opens it again');
  ({state}=press(state,'G','o'));assert.deepEqual([...transcriptModeOpen(state,ids)],['u1','a1','u2','r1'],'at the end, the last item');
  ({state}=press(state,'d'));assert.equal(state.full,false);assert.deepEqual([...transcriptModeOpen(state,ids)],[],'compact: nothing open');
  ({state}=press(state,'g','o'));assert.deepEqual([...transcriptModeOpen(state,ids)],['u1']);
  ({state}=press(state,'d'));assert.deepEqual([...transcriptModeOpen(state,ids)],ids,'d back to full drops the single changes');
});

test('+1 completa: ? lists the keys and closes before q; f forks only from your prompt',()=>{
  let {state,effect}=press(openTranscriptMode(),'?');
  assert.equal(state.help,true);
  const rows=transcriptModeHelp(state).map(text);
  assert.equal(rows[0],' Transcript keys');
  assert.ok(rows.includes('   d       compact view: one line per item'),rows.join('\n'));
  assert.ok(rows.includes('   f       on your prompt: a new conversation from before it'));
  ({state,effect}=press(state,'q'));assert.deepEqual([state.help,effect],[false,'none'],'q closes the list first');
  assert.equal(press(state,'q').effect,'close');
  ({state,effect}=press(state,'?','j'));assert.equal(state.help,true,'the keys still work under the list');
  assert.equal(press(openTranscriptMode(),'g','f').effect,'fork');
  assert.equal(press(openTranscriptMode(),'g','j','f').effect,'none','not on an answer');
  assert.equal(press(openTranscriptMode(),'f').effect,'none','the end is an answer');
});

test('+1 completa: the prompt row, the marks, the stamp and the turn f forks before',()=>{
  assert.equal(transcriptModePromptOf(ITEMS,'r1'),'The login e2e test is flaky');
  assert.equal(transcriptModePromptOf(ITEMS,'u2'),null,'the prompt itself is in view');
  assert.equal(transcriptModePromptOf(ITEMS,null),null);
  assert.equal(text(transcriptModePromptRow('The login\n e2e test is flaky',20)),' › The login e2e t…');
  assert.equal(style(transcriptModePromptRow('x',20)),'0+3:acc 3+1:dim');
  assert.deepEqual(transcriptModeMarks('Session and session',' SESSION '),[{text:'Session',hit:true},{text:' and ',hit:false},{text:'session',hit:true}]);
  assert.deepEqual(transcriptModeMarks('abc',''),[{text:'abc',hit:false}]);
  const at=new Date(2026,9,3,9,5).getTime();
  assert.equal(transcriptModeStamp({at,model:'gpt-5-mini'}),' · 09:05 · gpt-5-mini');
  assert.equal(transcriptModeStamp(undefined),'');
  const turns=[{runId:'r3',text:'again'},{runId:'r2',text:'other'},{runId:'r1',text:'again'}];
  assert.equal(transcriptModeTurn(['again','other','again'],2,turns),'r3','the second «again» is the newer turn');
  assert.equal(transcriptModeTurn(['again','other','again'],0,turns),'r1');
  assert.equal(transcriptModeTurn(['missing'],0,turns),null);
});
