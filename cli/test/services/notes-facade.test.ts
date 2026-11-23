import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createNotesFacade} from '../../src/services/notes-facade.ts';

const note={
  id:'n-1',
  titolo:'Design note',
  contenuto:'# Plan\nKeep the relation explicit.',
  formato:'markdown',
  origine:'persona',
  creataAlle:'2026-09-21T10:00:00.000Z',
  aggiornataAlle:'2026-09-21T11:00:00.000Z'
};

function publicNote(row:any){
  return{
    id:row.id,
    titolo:row.titolo,
    contenuto:row.contenuto,
    formato:row.formato==='markdown'||row.formato==='testo'?row.formato:(String(row.contenuto).startsWith('#')?'markdown':'testo'),
    creataAlle:row.creataAlle??null,
    aggiornataAlle:row.aggiornataAlle??null,
    origine:row.origine==='persona'||row.origine==='modello'?row.origine:'modello'
  };
}

function fixture(){
  const relations:any[]=[];
  const writes:any[]=[];
  const deletes:any[]=[];
  const notes:any[]=[{...note}];
  const sessions=new Map<string,any[]>([
    ['s-1',[{tipo:'intestazione',sessionId:'s-1',taskId:'libero:chat',task:{consegna:'chat'}}]],
    ['r-1',[{tipo:'intestazione',sessionId:'r-1',taskId:'ricerca',task:{ricercaId:'r-1',ricercaDomanda:'Verify explicit IDs'}}]],
    ['not-research',[{tipo:'intestazione',sessionId:'not-research',taskId:'libero:chat',task:{consegna:'normal'}}]]
  ]);
  const tasks=new Map<string,any>([['t-1',{id:'t-1',titolo:'Ship notes center'}]]);
  const deps:any={
    loadNotesStore:async()=>({
      formaPubblicaNota:publicNote,
      elencaNote:async()=>notes,
      leggiNota:async({id}:any)=>notes.find(row=>row.id===id)??null,
      creaNota:async(input:any)=>{const row={...note,id:'n-new',titolo:input.title,contenuto:input.content,origine:input.origine};notes.push(row);return row;},
      aggiornaNota:async({id,...patch}:any)=>{const row=notes.find(value=>value.id===id);if(!row)throw Object.assign(new Error('missing'),{code:'NOTE_NOT_FOUND'});if(patch.title!==undefined)row.titolo=patch.title;if(patch.content!==undefined)row.contenuto=patch.content;return row;},
      eliminaNota:async({id}:any)=>{const index=notes.findIndex(value=>value.id===id);if(index>=0)notes.splice(index,1);}
    }),
    loadTaskStore:async()=>({leggiAttivita:async({id}:any)=>tasks.get(id)??null}),
    loadSessionStore:async()=>({leggiRegistro:async({sessionId}:any)=>sessions.get(sessionId)??null}),
    listRelations:async()=>relations.map(row=>structuredClone(row)),
    writeRelation:async(record:any)=>{writes.push(structuredClone(record));relations.push(structuredClone(record));},
    deleteRelation:async(record:any)=>{deletes.push(structuredClone(record));const index=relations.findIndex(row=>row.noteId===record.noteId&&row.target.kind===record.target.kind&&row.target.id===record.target.id);if(index>=0)relations.splice(index,1);},
    now:()=>new Date('2026-09-21T12:00:00.000Z')
  };
  return{deps,relations,writes,deletes,notes,sessions,tasks};
}

function facade(f:any){
  return createNotesFacade({
    repoRoot:'/repo',
    projectRoot:'/project',
    paths:{dataRoot:'/data',sessionsRoot:'/sessions'} as any
  },f.deps);
}

test('M9-B RED — passive list preserves stable note ids and provenance without mutating relation storage',async()=>{
  const f=fixture();
  const snapshot=await facade(f).list();
  assert.equal(snapshot.state,'ready');
  assert.equal(snapshot.rows[0]?.id,'n-1');
  assert.equal(snapshot.rows[0]?.writer,'persona');
  assert.equal(snapshot.rows[0]?.writerEvidence,'persisted');
  assert.equal(snapshot.rows[0]?.format,'markdown');
  assert.equal(snapshot.rows[0]?.formatEvidence,'persisted');
  assert.deepEqual(f.writes,[]);
  assert.deepEqual(f.deletes,[]);
});

test('M9-B RED — derived format and legacy writer are labelled as derived rather than falsely persisted',async()=>{
  const f=fixture();
  f.notes[0]={...note,formato:undefined,origine:undefined};
  const row=(await facade(f).list()).rows[0]!;
  assert.equal(row.format,'markdown');
  assert.equal(row.formatEvidence,'derived-content');
  assert.equal(row.writer,'modello');
  assert.equal(row.writerEvidence,'derived-legacy-default');
});

test('M9-B RED — session link validates the exact session id before writing one relation',async()=>{
  const f=fixture();
  const result=await facade(f).link('n-1','session','s-1');
  assert.equal(result.changed,true);
  assert.equal(result.relation.noteId,'n-1');
  assert.deepEqual(result.relation.target,{kind:'session',id:'s-1'});
  assert.equal(f.writes.length,1);
});

test('M9-B RED — task link validates the exact task id, never a title',async()=>{
  const f=fixture();
  await facade(f).link('n-1','task','t-1');
  assert.equal(f.writes.length,1);
  // A title is not id syntax, so it is refused before lookup (5d7112f24); an id-shaped title is still never matched.
  await assert.rejects(()=>facade(f).link('n-1','task','Ship notes center'),(error:any)=>error?.code==='NOTE_LINK_TARGET_INVALID');
  f.tasks.set('t-2',{id:'t-2',titolo:'ship-notes'});
  await assert.rejects(()=>facade(f).link('n-1','task','ship-notes'),(error:any)=>error?.code==='NOTE_LINK_TARGET_NOT_FOUND');
  assert.equal(f.writes.length,1);
});

test('M9-B RED — research link accepts only a persisted research-session identity',async()=>{
  const f=fixture();
  await facade(f).link('n-1','research','r-1');
  assert.equal(f.writes.length,1);
  await assert.rejects(()=>facade(f).link('n-1','research','not-research'),(error:any)=>error?.code==='NOTE_LINK_TARGET_NOT_FOUND');
  assert.equal(f.writes.length,1);
});

test('M9-B RED — missing note or target fails before relation write',async()=>{
  const f=fixture();
  await assert.rejects(()=>facade(f).link('missing','session','s-1'),(error:any)=>error?.code==='NOTE_NOT_FOUND');
  await assert.rejects(()=>facade(f).link('n-1','session','missing'),(error:any)=>error?.code==='NOTE_LINK_TARGET_NOT_FOUND');
  assert.deepEqual(f.writes,[]);
});

test('M9-B RED — the same explicit edge is idempotent while different explicit edges coexist',async()=>{
  const f=fixture();const api=facade(f);
  assert.equal((await api.link('n-1','session','s-1')).changed,true);
  assert.equal((await api.link('n-1','session','s-1')).changed,false);
  assert.equal((await api.link('n-1','task','t-1')).changed,true);
  assert.equal(f.writes.length,2);
  const row=(await api.list()).rows[0]!;
  assert.deepEqual(row.relations.map(link=>link.target),[{kind:'session',id:'s-1'},{kind:'task',id:'t-1'}]);
});

test('M9-B RED — unlink removes only the exact requested edge',async()=>{
  const f=fixture();const api=facade(f);
  await api.link('n-1','session','s-1');await api.link('n-1','task','t-1');
  const result=await api.unlink('n-1','session','s-1');
  assert.equal(result.changed,true);
  assert.equal(f.deletes.length,1);
  const row=(await api.list()).rows[0]!;
  assert.deepEqual(row.relations.map(link=>link.target),[{kind:'task',id:'t-1'}]);
});

test('M9-B RED — a deleted target remains a visible dangling relation and passive list does not rewrite it',async()=>{
  const f=fixture();const api=facade(f);
  await api.link('n-1','task','t-1');
  f.tasks.delete('t-1');f.writes.length=0;f.deletes.length=0;
  const relation=(await api.list()).rows[0]!.relations[0]!;
  assert.equal(relation.state,'dangling');
  assert.equal(relation.target.id,'t-1');
  assert.deepEqual(f.writes,[]);
  assert.deepEqual(f.deletes,[]);
});

test('M9-B RED — relation metadata cannot resurrect a note deleted outside the relation layer',async()=>{
  const f=fixture();const api=facade(f);
  await api.link('n-1','session','s-1');
  f.notes.length=0;
  const snapshot=await api.list();
  assert.deepEqual(snapshot.rows,[]);
});

test('M9-B RED — relationship identity is ids only and does not expose cwd/project paths as authority',async()=>{
  const f=fixture();const api=facade(f);
  await api.link('n-1','research','r-1');
  const row=(await api.list()).rows[0]!;
  const serialized=JSON.stringify(row.relations);
  assert.equal(serialized.includes('/project'),false);
  assert.equal(serialized.includes('/data'),false);
  assert.deepEqual(row.relations[0]?.target,{kind:'research',id:'r-1'});
  assert.equal(row.relations[0]?.label,'Verify explicit IDs');
});

test('M9-B RED — composer reference is explicit, quoted, non-mutating and names the stable note id',async()=>{
  const f=fixture();const api=facade(f);
  const before=structuredClone(f.notes);
  const text=await api.composerReference('n-1');
  assert.match(text,/note:n-1/u);
  assert.match(text,/Reference content/u);
  assert.match(text,/Design note/u);
  assert.match(text,/Keep the relation explicit/u);
  assert.deepEqual(f.notes,before);
  assert.deepEqual(f.writes,[]);
});

test('M9-B RED — CLI Notes operations route through the typed facade rather than direct notes-store imports',async()=>{
  const source=await readFile(new URL('../../src/commands/services-cli.ts',import.meta.url),'utf8');
  assert.match(source,/createNotesFacade/u);
  const start=source.indexOf('export async function runNotesCommand');
  const end=source.indexOf('export async function runTasksCommand',start);
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end);
  assert.doesNotMatch(body,/importTalosModule\([^)]*notes-store\.mjs/u);
  for(const method of ['list','add','update','delete','link','unlink'])assert.match(body,new RegExp('notes\\.'+method+'\\(','u'));
});
