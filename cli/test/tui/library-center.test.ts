import assert from 'node:assert/strict';
import test from 'node:test';
import {createLibraryCenterModel,moveLibraryCenterSelection,renderLibraryCenterLines,selectedLibraryEntry,setLibraryCenterPreview,setLibraryCenterDuplicateScan} from '../../src/tui/overlays/library-center.ts';

const row:any={
  id:'lib\\a\u001b[2J',name:'Doc\u202E name\nnext',mediaType:'text/markdown',fileType:'document',origin:'uploaded',
  creator:{type:'persona',model:null,provider:null},session:null,createdAt:null,updatedAt:null,
  context:{token:'@.harness-ui-library/lib-a/contenuto',autoAttach:false,autoSubmit:false,persistence:'composer-only-until-send'}
};
const snapshot:any={state:'ready',rows:[row],error:null,legacyRows:[]};

test('M9-D RED — Library Center renders provenance and explicit context policy',()=>{
  const text=renderLibraryCenterLines(createLibraryCenterModel(snapshot,0)).join('\n');
  /* R2 (gate §1.5, Q-R2-10): the kernel's `origine`/`formato` values are shown in English (persona → you, modello → model,
     markdown → Markdown), never raw. */
  for(const token of ['Library Center','text/markdown','Creator: you','explicit','auto-attach no','auto-submit no','@.harness-ui-library/lib-a/contenuto'])assert.match(text,new RegExp(token,'iu'));
});

test('M9-D RED — Library Center renders safe preview and duplicate completeness state',()=>{
  let model=createLibraryCenterModel(snapshot,0);
  model=setLibraryCenterPreview(model,{id:row.id,name:row.name,mediaType:'text/markdown',size:10,mode:'text',text:'hello',truncated:false,reason:null});
  model=setLibraryCenterDuplicateScan(model,{id:row.id,state:'partial',sha256:'a'.repeat(64),duplicateIds:['lib-b'],unreadableIds:['lib-big'],verifiedUnique:false});
  const text=renderLibraryCenterLines(model).join('\n');
  assert.match(text,/Preview/u);assert.match(text,/hello/u);assert.match(text,/partial/u);assert.match(text,/lib-b/u);assert.match(text,/lib-big/u);
});

test('M9-D RED — Library Center neutralizes controls bidi line breaks and backslashes',()=>{
  const lines=renderLibraryCenterLines(createLibraryCenterModel(snapshot,0));const text=lines.join('\n');
  assert.equal(text.includes('\u001b'),false);assert.equal(text.includes('\u202e'),false);
  assert.equal(lines.some(line=>line.includes('name\nnext')),false);
  assert.match(text,/\\u001b/u);assert.match(text,/\\u202e/u);assert.match(text,/\\\\/u);
});

test('M9-D RED — selection is bounded and clears stale preview/duplicate detail',()=>{
  const second={...row,id:'lib-b',name:'Second'};
  let model=createLibraryCenterModel({...snapshot,rows:[row,second]},0);
  model=setLibraryCenterPreview(model,{id:row.id,name:row.name,mediaType:'text/plain',size:1,mode:'text',text:'x',truncated:false,reason:null});
  model=moveLibraryCenterSelection(model,1);
  assert.equal(selectedLibraryEntry(model)?.id,'lib-b');assert.equal(model.preview,null);assert.equal(model.duplicateScan,null);
  model=moveLibraryCenterSelection(model,99);assert.equal(model.selected,1);
  model=moveLibraryCenterSelection(model,-99);assert.equal(model.selected,0);
});

test('M9-D RED — invalid Library state is visible rather than guessed',()=>{
  const invalid:any={state:'invalid',rows:[],error:{code:'LIBRARY_STORE_INVALID',message:'broken metadata'},legacyRows:[]};
  const text=renderLibraryCenterLines(createLibraryCenterModel(invalid,0)).join('\n');
  assert.match(text,/LIBRARY_STORE_INVALID/u);assert.match(text,/broken metadata/u);
});
