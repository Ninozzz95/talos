/*
 * Stage 7.20 (mockup notes «today · Sep 29», «4 items», «empty»; owner 03/10: the links beside the Markdown): the project's
 * notes as the /notes sheet shows them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {noteViews} from '../../src/tui/note-views.ts';
import type {NoteView} from '../../src/services/notes-facade.ts';

const NOW=Date.parse('2026-10-01T15:00:00Z');
const note=(over:Partial<NoteView>):NoteView=>({id:'n',title:'N',content:'',format:'markdown',formatEvidence:'persisted',writer:'persona',writerEvidence:'persisted',createdAt:null,updatedAt:null,relations:[],...over});

test('the line under the title: items for a list, the first words otherwise, empty when there are none',()=>{
  const views=noteViews([
    note({id:'a',content:'## Release checklist\n- Bump the version\n- Run the full e2e suite\n- **Check** the changelog\n- Tag and publish',updatedAt:'2026-10-01T09:00:00Z'}),
    note({id:'b',content:'## Search ranking\nBoost **exact** title matches, then recency. Later: synonyms.',createdAt:'2026-09-29T09:00:00Z'}),
    note({id:'c',content:'## Only a heading\n'}),
    note({id:'d',content:'- one thing'}),
    note({id:'e',content:'```\ncode only\n```\n`run` it now'}),
  ],{now:NOW,offsetMinutes:0});
  assert.deepEqual(views.map(v=>[v.meta,v.desc]),[['today','4 items'],['Sep 29','Boost exact title matches, then recency'],['','empty'],['','1 item'],['','code only']]);
  assert.equal(views[0]!.markdown.startsWith('## Release checklist'),true);
});

test('each link in words; a link whose target is gone keeps its id',()=>{
  const [view]=noteViews([note({relations:[
    {schema:'talos.cli.note-relation.v1',noteId:'n',target:{kind:'task',id:'t1'},createdAt:'',state:'available',label:'Rate limit /search'},
    {schema:'talos.cli.note-relation.v1',noteId:'n',target:{kind:'session',id:'7f3a2c'},createdAt:'',state:'available',label:null},
    {schema:'talos.cli.note-relation.v1',noteId:'n',target:{kind:'research',id:'r9'},createdAt:'',state:'dangling',label:'Old'},
  ]})],{now:NOW,offsetMinutes:0});
  assert.deepEqual(view!.links,['task · Rate limit /search','conversation · 7f3a2c','research · r9']);
});
