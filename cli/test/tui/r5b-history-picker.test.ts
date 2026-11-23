/*
 * R5b (owner answer 2026-09-25, "I tuoi messaggi passati"): /history lists the messages sent in this project — this session's
 * and the kept ones of earlier sessions — newest first; typing filters; Enter puts the chosen one back in the composer
 * (a collapsed paste stays collapsed) without sending it; Esc closes. Before R5b /history did not exist.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {filterHistory,historyPickerOverlay,historyRowText} from '../../src/tui/overlays/history-picker.ts';
import {createPromptHistoryStore} from '../../src/tui/prompt-history-store.ts';
import {slashCommandGroup} from '../../src/tui/slash-commands.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B',ESC='\x1b',CTRL_U='\x15';
let n=0;const project=()=>{const root=join(env.root,`history-picker-${++n}`);mkdirSync(root,{recursive:true});return root;};

test('R5b /history rows: one line each, a paste shown collapsed, a filter that ignores case',()=>{
  const pasted='a\nb\nc';const text=`look at ${pasted} please`;const start=text.indexOf(pasted);
  assert.equal(historyRowText({text,collapsedPastes:[{start,end:start+pasted.length,chars:pasted.length,lines:3}]}),'look at [Pasted text #1 +2 lines] please'/* UI Phase 1 (owner 27/09): the placeholder is Claude Code's `[Pasted text #N +X lines]`, X = the line breaks */);
  assert.equal(historyRowText({text:'two\nlines',collapsedPastes:[]}),'two ⏎ lines');
  const rows=[{text:'Alpha one',collapsedPastes:[]},{text:'beta two',collapsedPastes:[]}];
  assert.deepEqual(filterHistory(rows,'ALP').map(row=>row.text),['Alpha one']);
  assert.deepEqual(filterHistory([...rows,{text:'/status',collapsedPastes:[]}],'').map(row=>row.text),['Alpha one','beta two'],'commands are not listed');
  const empty=historyPickerOverlay({rows:[],picker:{query:'',selected:0},width:80});
  assert.match(empty.sections[0]!.lines[0]!.text,/No messages sent in this project yet/u);
  assert.equal(slashCommandGroup('history' as any),'session');
});

test('R5b /history in the real app: kept and new messages, newest first; typing filters; Enter fills the composer without sending',async()=>{
  const root=project();
  await createPromptHistoryStore({paths:env.paths,projectRoot:root,secrets:[]}).append({text:'from an earlier session',collapsedPastes:[]});
  const app=await mountR5a({cols:100,rows:32,root,paths:env.paths});
  try{
    await sleep(250);
    await app.type('alpha one');app.press(ENTER);await app.waitFor('sent',()=>app.calls.includes('resume alpha one'));
    await app.type('/history');app.press(ENTER);
    let s=await app.waitFor('the list',x=>/Your messages/u.test(x.text)&&/from an earlier session/u.test(x.text));
    /* stage 7.4: the mockup's sheet — rows « › text» and «   text», the time at the right */
    const rows=s.lines.filter(line=>/^ (›| ) {1,2}\S/u.test(line));const at=(needle:string)=>rows.findIndex(line=>line.includes(needle));
    assert.equal(at('/history'),-1,'a command is not one of your messages');
    assert.ok(at('alpha one')>=0&&at('alpha one')<at('from an earlier session'),`newest first:\n${s.text}`);
    /* the sheet filters after «/» (its key row says «/ search»); Enter ends the filter, Enter again chooses */
    await app.type('/');await app.type('earl');
    s=await app.waitFor('filtered',x=>/ \/ earl/u.test(x.text)&&/1 of 2/u.test(x.text));
    app.press(ENTER);await sleep(60);app.press(ENTER);
    await app.waitFor('in the composer',x=>/│ › from an earlier session/u.test(x.text)&&!/Your messages/u.test(x.text));
    const sends=app.calls.filter(call=>call.startsWith('resume ')).length;await sleep(200);
    assert.equal(app.calls.filter(call=>call.startsWith('resume ')).length,sends,'choosing does not send');
    app.press(CTRL_U);await app.waitFor('composer cleared',x=>/│ › (?:Ask TALOS, \/ for commands, @ for files)?\s*│/u.test(x.text));/* Ctrl+U: cut to the line start */
    await app.type('/history');app.press(ENTER);await app.waitFor('the list again',x=>/Your messages/u.test(x.text));
    app.press(DOWN);app.press(ESC);
    await app.waitFor('Esc closed it',x=>!/Your messages/u.test(x.text));
  }finally{app.unmount();}
});
