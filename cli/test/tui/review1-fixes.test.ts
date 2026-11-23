/*
 * Independent review by Codex, pass 1 (owner 02/10; findings verified in registro 12). Four confirmed defects:
 *   1. an MCP form's values reached the terminal's scrollback at exit, while the kernel keeps them out of the history on
 *      purpose (owner decision: on screen the receipt stays, at exit only the fields' titles);
 *   2. on a free-text question a saved note left the card in a state only Esc could leave;
 *   4. a frame whose drawing stops halfway was flushed with the DEC 2026 begin and no end;
 *   6. numeric pre-release identifiers beyond 2^53 compared as equal.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {formatExitOutput} from '../../src/tui/exit-output.ts';
import {appendTranscriptAnswers,createTranscriptModel} from '../../src/tui/transcript-model.ts';
import {openQuestionCard,questionCardKey,type QuestionCardState} from '../../src/tui/question-card.ts';
import {batchSynchronizedFrames,BSU,ESU} from '../../src/tui/frame-batcher.ts';
import {compareReleaseVersions} from '../../src/update/check.ts';

test('1 · an MCP form\'s values stay on screen but never reach the scrollback left at exit',()=>{
  const model=appendTranscriptAnswers(createTranscriptModel(),'elicit:e-1',[{title:'API token',answer:'tok-SECRET-123'},{title:'Repository',answer:'acme/shop-api'}],{valuesOnScreenOnly:true});
  const item=model.items.at(-1) as any;
  assert.equal(item.pairs[0].answer,'tok-SECRET-123','on screen, during the session, the receipt is whole');
  const out=formatExitOutput({sessionId:'s1',items:[{kind:'message',id:'m1',role:'user',text:'open the PR',streaming:false},...model.items] as any},{mode:'transcript'});
  assert.doesNotMatch(out,/tok-SECRET-123|acme\/shop-api/u,`no value at exit:\n${out}`);
  assert.match(out,/API token · sent/u);assert.match(out,/Repository · sent/u);
  const question=appendTranscriptAnswers(createTranscriptModel(),'question:q-1',[{title:'Approach',answer:'Wait for the cookie'}]);
  assert.match(formatExitOutput({sessionId:'s1',items:[{kind:'message',id:'m1',role:'user',text:'open the PR',streaming:false},...question.items] as any},{mode:'transcript'}),/Approach +Wait for the cookie/u,'a model question\'s answers stay as they were');
});

test('2 · after a note, a free-text question can still be answered',()=>{
  let state:QuestionCardState=openQuestionCard({requestId:'r',questions:[{id:'q1',question:'What should the branch be called?'}],now:0,timeoutMs:null});
  const press=(name:string,text?:string)=>{const result=questionCardKey(state,{name,...(text?{text}:{})});state=result.state;return result.outcome;};
  press('tab');for(const ch of 'keep it short')press(ch,ch);press('return');
  for(const ch of 'fix-login')press(ch,ch);
  press('return');
  assert.equal(state.review,true,'the answer moved the card to its review');
  const outcome=press('return');
  assert.deepEqual((outcome as any).response?.answers,{q1:'fix-login'});
  assert.deepEqual((outcome as any).response?.notes,{q1:'keep it short'});
});

test('2b · Esc on a note of a free-text question goes back to the answer, not to a dead end',()=>{
  let state:QuestionCardState=openQuestionCard({requestId:'r',questions:[{id:'q1',question:'Name?'}],now:0,timeoutMs:null});
  const press=(name:string,text?:string)=>{state=questionCardKey(state,{name,...(text?{text}:{})}).state;};
  press('tab');press('escape');press('a','a');
  assert.equal((state.editing as any)?.text,'a');
});

test('2c · what was written before the note is kept',()=>{
  let state:QuestionCardState=openQuestionCard({requestId:'r',questions:[{id:'q1',question:'Name?'}],now:0,timeoutMs:null});
  const press=(name:string,text?:string)=>{state=questionCardKey(state,{name,...(text?{text}:{})}).state;};
  for(const ch of 'fix')press(ch,ch);press('tab');for(const ch of 'n')press(ch,ch);press('tab');
  for(const ch of '-login')press(ch,ch);
  assert.equal((state.editing as any)?.text,'fix-login');
  assert.deepEqual(state.notes,{q1:'n'});
});

test('4 · a frame interrupted halfway is closed when it is flushed, never left synchronized',async()=>{
  const writes:string[]=[];const s={write(chunk:any){writes.push(String(chunk));return true;}};const restore=batchSynchronizedFrames(s);
  s.write(BSU);s.write('half a frame');
  await Promise.resolve();
  assert.deepEqual(writes,[`${BSU}half a frame${ESU}`]);
  s.write(BSU);s.write('again');restore();
  assert.equal(writes.at(-1),`${BSU}again${ESU}`,'restoring closes it too');
});

test('6 · numeric pre-release identifiers of any size compare as numbers',()=>{
  assert.equal(compareReleaseVersions('1.0.0-beta.9007199254740993','1.0.0-beta.9007199254740992'),1);
  assert.equal(compareReleaseVersions('1.0.0-beta.10','1.0.0-beta.9'),1);
  assert.equal(compareReleaseVersions('1.0.0-beta.0010','1.0.0-beta.10'),0,'leading zeros do not change the number');
});
