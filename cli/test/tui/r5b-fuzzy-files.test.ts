/*
 * R5b D6 (owner decision Q-R5-16; plan Part III items 2 and 5): `@` searches the whole project, not one folder by prefix.
 * An own bounded walker (no new dependency): `.gitignore` files respected (the root's and nested ones), `.git` and
 * `node_modules` never walked, a junction or link to a folder never followed (the R4 guard), names with control or bidi
 * characters never drawn, and a cap that is SAID when reached. A file whose name contains the query ranks above
 * folder-only matches (Claude Code 2.1.280). The list says where its rows come from and how many were found, so nothing is
 * cut silently. `@` alone and `@folder/` still browse one folder (R4).
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {buildProjectFileIndex,gitignoreRules,isIgnored,rankProjectFiles} from '../../src/tui/project-file-index.ts';
import {completeProjectFiles,fileCompletionOverlay} from '../../src/tui/file-completion.ts';
import {fitOverlay} from '../../src/tui/overlays/scroll-window.ts';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

async function project(t:any){
  const root=await mkdtemp(join(tmpdir(),'talos-r5b-fuzzy-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const dir of ['src/util','src/parser','parser','dist','node_modules/pkg','.git/objects','docs/drafts','lib/deep/deeper'])await mkdir(join(root,...dir.split('/')),{recursive:true});
  const files=['src/util/strings.js','src/parser.ts','src/app.ts','src/myapp.ts','parser/a.ts','dist/bundle.js','node_modules/pkg/index.js','.git/objects/x','docs/drafts/plan.md','docs/keep.md','lib/deep/deeper/strings-extra.ts','README.md','debug.log','src/application-main.ts','src/zapp.ts'];
  for(const file of files)await writeFile(join(root,...file.split('/')),'x');
  await writeFile(join(root,'.gitignore'),'# build output\ndist/\n*.log\n!keep.log\n/README.md\n');
  await writeFile(join(root,'docs','.gitignore'),'drafts/\n');
  return root;
}
const paths=(rows:ReadonlyArray<{path:string}>)=>rows.map(row=>row.path);

test('R5b D6: the .gitignore rules — comments, negation, folder-only, anchored, any depth, ** ',()=>{
  const rules=gitignoreRules('# c\n\ndist/\n*.log\n!keep.log\n/README.md\ndocs/**/tmp\n**/cache\n','');
  assert.equal(isIgnored(rules,'dist',true),true);assert.equal(isIgnored(rules,'dist',false),false,'dist/ is for folders only');
  assert.equal(isIgnored(rules,'a/b/debug.log',false),true,'a name without a slash matches at any depth');
  assert.equal(isIgnored(rules,'keep.log',false),false,'negated');
  assert.equal(isIgnored(rules,'README.md',false),true);assert.equal(isIgnored(rules,'src/README.md',false),false,'/README.md is anchored');
  assert.equal(isIgnored(rules,'docs/a/b/tmp',true),true);assert.equal(isIgnored(rules,'x/y/cache',true),true);
  const nested=gitignoreRules('drafts/\n','docs');
  assert.equal(isIgnored(nested,'docs/drafts',true),true);assert.equal(isIgnored(nested,'drafts',true),false,'a nested file rules its own folder');
});

test('R5b D6: the walker skips what is ignored, .git and node_modules, and never follows a link to a folder',async t=>{
  const root=await project(t);
  const outside=await mkdtemp(join(tmpdir(),'talos-r5b-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
  await writeFile(join(outside,'secret.txt'),'x');
  let linked=true;try{await symlink(outside,join(root,'escape'),process.platform==='win32'?'junction':'dir');}catch{linked=false;}
  /* A link to a folder INSIDE the project is not followed either: it would list the same files twice, or loop. */
  let inside=true;try{await symlink(join(root,'src'),join(root,'alias-src'),process.platform==='win32'?'junction':'dir');}catch{inside=false;}
  const index=await buildProjectFileIndex(root);
  const all=paths(index.entries);
  for(const gone of ['dist','dist/bundle.js','node_modules','node_modules/pkg/index.js','.git','.git/objects/x','debug.log','README.md','docs/drafts','docs/drafts/plan.md'])assert.ok(!all.includes(gone),`${gone} is not offered`);
  for(const kept of ['src','src/util/strings.js','docs/keep.md','.gitignore','lib/deep/deeper/strings-extra.ts'])assert.ok(all.includes(kept),`${kept} is offered`);
  assert.equal(index.capped,false);
  if(linked){assert.ok(!all.some(path=>path.startsWith('escape')),'the junction is not walked');t.diagnostic('junction guard exercised');}
  else t.diagnostic('the link could not be created here: the junction guard was NOT exercised');
  if(inside){assert.ok(!all.some(path=>path.startsWith('alias-src')),'a link to a folder inside is not walked');t.diagnostic('inside-link guard exercised');}
  else t.diagnostic('the inside link could not be created here: NOT exercised');
  const small=await buildProjectFileIndex(root,{maxEntries:5});
  assert.equal(small.entries.length,5);assert.equal(small.capped,true,'the cap is said, not hidden');
});

test('R5b D6: ranking — a name that starts with the query, then contains it, files above folder-only matches, then the path, then letters in order',async t=>{
  const root=await project(t);const index=await buildProjectFileIndex(root);
  assert.deepEqual(paths(rankProjectFiles(index,'strings')).slice(0,2),['src/util/strings.js','lib/deep/deeper/strings-extra.ts']);
  const parser=paths(rankProjectFiles(index,'parser'));
  assert.ok(parser.indexOf('src/parser.ts')<parser.indexOf('parser'),'the file whose name contains the query is above the folder');
  const app=paths(rankProjectFiles(index,'app'));
  assert.ok(app.indexOf('src/app.ts')<app.indexOf('src/myapp.ts'),'a name that starts with it is above one that only contains it');
  assert.ok(app.indexOf('src/application-main.ts')<app.indexOf('src/zapp.ts'),'even when its path is longer');
  assert.ok(paths(rankProjectFiles(index,'src/ut')).includes('src/util/strings.js'),'a query with a slash matches the path');
  assert.ok(paths(rankProjectFiles(index,'sutst')).includes('src/util/strings.js'),'letters in order');
  assert.deepEqual(rankProjectFiles(index,'zzzz'),[]);
});

test('R5b D6: the list says where its rows come from, how many were found, and when it shows only the first ones',async t=>{
  const root=await project(t);
  await mkdir(join(root,'many'));for(let i=0;i<70;i++)await writeFile(join(root,'many',`note-${i}.md`),'x');
  const found=await completeProjectFiles(root,'@strin');
  assert.equal(found.rows[0]!.value,'@src/util/strings.js');
  assert.deepEqual(found.source,{kind:'project',found:2,shown:2,capped:false,max:found.source.max});
  const text=(content:any)=>fitOverlay(content,{maxRows:10,columns:90}).rows.map(row=>row.text).join('\n');
  assert.match(text(fileCompletionOverlay({token:'@strin',rows:found.rows,selected:0,source:found.source})),/Project search, \.gitignore respected: 2 found/u);
  const many=await completeProjectFiles(root,'@note');
  assert.equal(many.rows.length,50);assert.equal(many.source.found,70);
  assert.match(text(fileCompletionOverlay({token:'@note',rows:many.rows,selected:0,source:many.source})),/first 50 of 70 shown/u);
  const folder=await completeProjectFiles(root,'@src/');
  assert.equal(folder.source.kind,'folder');assert.ok(folder.rows.some(row=>row.value==='@src/util/'),'@folder/ still browses the folder');
  assert.match(text(fileCompletionOverlay({token:'@src/',rows:folder.rows,selected:0,source:folder.source})),/In src\//u);
});

test('R5b D6 in the real app: @ and part of a name find a file deep in the project; Tab inserts it',async t=>{
  const env=hermeticProfile();after(()=>env.restore());
  const root=await project(t);
  const app=await mountR5a({cols:100,rows:30,root,paths:env.paths});
  try{
    await app.type('look at @strin');
    /* Each key starts a search; the list shown is the one for the whole query once typing stops. */
    const s=await app.waitFor('the project search',x=>/Project search, \.gitignore respected: 2 found/u.test(x.text));
    assert.match(s.text,/› @src\/util\/strings\.js/u);
    app.press('\t');
    await app.waitFor('inserted',x=>/│ › look at @src\/util\/strings\.js/u.test(x.text));
    await sleep(50);
  }finally{app.unmount();}
});
