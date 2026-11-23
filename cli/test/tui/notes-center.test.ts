import assert from 'node:assert/strict';
import test from 'node:test';
import {createNotesCenterModel,moveNotesCenterSelection,renderNotesCenterLines,selectedNote} from '../../src/tui/overlays/notes-center.ts';

const row:any={
  id:'n\\1\u001b[2J',
  title:'Design\u202E note\nnext',
  content:'Body\u0007text',
  format:'markdown',
  formatEvidence:'persisted',
  writer:'persona',
  writerEvidence:'persisted',
  createdAt:'2026-09-21T10:00:00.000Z',
  updatedAt:'2026-09-21T11:00:00.000Z',
  relations:[
    {noteId:'n\\1\u001b[2J',target:{kind:'session',id:'s-1'},state:'available',label:null,createdAt:'2026-09-21T12:00:00.000Z'},
    {noteId:'n\\1\u001b[2J',target:{kind:'task',id:'t-1'},state:'dangling',label:null,createdAt:'2026-09-21T12:00:00.000Z'}
  ]
};
const snapshot:any={state:'ready',rows:[row],error:null};

test('M9-B RED — Notes Center renders durable id, provenance and explicit relation states',()=>{
  const text=renderNotesCenterLines(createNotesCenterModel(snapshot,0)).join('\n');
  /* R2 (gate §1.5, Q-R2-10): the kernel's `origine`/`formato` values are shown in English (persona → you, modello → model,
     markdown → Markdown), never raw. */
  for(const token of ['Notes','Markdown','persisted','Writer: you','session','s-1','task','t-1','available','dangling'])assert.match(text,new RegExp(token,'u'));
});

test('M9-B RED — Notes Center neutralizes controls bidi line breaks and backslashes',()=>{
  const lines=renderNotesCenterLines(createNotesCenterModel(snapshot,0));
  const text=lines.join('\n');
  assert.equal(text.includes('\u001b'),false);
  assert.equal(text.includes('\u202e'),false);
  assert.equal(text.includes('\u0007'),false);
  assert.equal(lines.some(line=>line.includes('note\nnext')),false);
  assert.match(text,/\\u001b/u);
  assert.match(text,/\\u202e/u);
  assert.match(text,/\\u0007/u);
  assert.match(text,/\\\\/u);
});

test('M9-B RED — selection remains bounded and selectedNote preserves the stable note id',()=>{
  const second={...row,id:'n-2',title:'Second',relations:[]};
  let model=createNotesCenterModel({...snapshot,rows:[row,second]},0);
  model=moveNotesCenterSelection(model,1);assert.equal(model.selected,1);
  assert.equal(selectedNote(model)?.id,'n-2');
  model=moveNotesCenterSelection(model,99);assert.equal(model.selected,1);
  model=moveNotesCenterSelection(model,-99);assert.equal(model.selected,0);
});

test('M9-B RED — invalid relation/store state is visible rather than guessed',()=>{
  const invalid:any={state:'invalid',rows:[],error:{code:'NOTES_STORE_INVALID',message:'broken row'}};
  const text=renderNotesCenterLines(createNotesCenterModel(invalid,0)).join('\n');
  assert.match(text,/NOTES_STORE_INVALID/u);
  assert.match(text,/broken row/u);
});
