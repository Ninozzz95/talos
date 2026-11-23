/*
 * Stage 7.22 (mockup memory «TALOS.md · line 4 · learned Sep 27 · you · Sep 20»; owner 03/10: Project = the project's files
 * line by line and its facts, You = the preferences): the rows of /memory.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileRows,memoryRows} from '../../src/tui/memory-views.ts';
import type {MemoryView} from '../../src/services/memory-facade.ts';

const NOW=Date.parse('2026-10-01T15:00:00Z');

test('each item of a list in an instruction file is a row: its first sentence, the rest, and its line',()=>{
  const rows=fileRows([{label:'TALOS.md',path:'/w/TALOS.md',content:'# Shop\n\n## Tools\n- Use **pnpm**, never npm. The lockfile is pnpm-lock.yaml; npm install breaks the workspace links.\n- Tests: vitest units, Playwright e2e\n```\n- not a rule\n```\n* `pnpm e2e` runs the browsers!\nplain text'}]);
  assert.deepEqual(rows.map(row=>[row.label,row.desc,row.meta,row.file?.line]),[
    ['Use pnpm, never npm','The lockfile is pnpm-lock.yaml; npm install breaks the workspace links.','TALOS.md · line 4',4],
    ['Tests: vitest units, Playwright e2e','','TALOS.md · line 5',5],
    ['pnpm e2e runs the browsers','','TALOS.md · line 9',9]]);
  assert.equal(rows[0]!.file?.path,'/w/TALOS.md');
});

test('a preference goes to You, the rest to Project; who wrote it and when',()=>{
  const view=(over:Partial<MemoryView>):MemoryView=>({id:'m',title:'T',content:'C',kind:null,createdAt:null,updatedAt:null,
    provenance:{writer:'persona',writerEvidence:'persisted',scope:'global',scopeEvidence:'derived-store-contract',projectId:null,sessionId:null,source:null},
    duplicateControl:{} as any,usage:{status:'unavailable',reason:'store-does-not-persist-memory-usage'},cost:{status:'unavailable',reason:'store-does-not-persist-memory-cost'},...over});
  const {project,you}=memoryRows([
    view({id:'a',title:'API errors are RFC 9457',kind:'project_fact',updatedAt:'2026-09-27T10:00:00Z',provenance:{...view({}).provenance,writer:'modello'}}),
    view({id:'b',title:'Short answers',content:'Prefers short paragraphs.',kind:'preference',createdAt:'2026-09-20T10:00:00Z'}),
    view({id:'c',title:'Release steps',content:'Release steps',kind:'procedure',updatedAt:'2026-10-01T09:00:00Z'}),
  ],{now:NOW,offsetMinutes:0});
  assert.deepEqual(project.map(row=>[row.id,row.meta,row.desc]),[['a','learned Sep 27','C'],['c','you · today','']]);
  assert.deepEqual(you.map(row=>[row.id,row.meta,row.desc]),[['b','you · Sep 20','Prefers short paragraphs.']]);
});
