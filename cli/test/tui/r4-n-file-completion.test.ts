/*
 * R4 lane N — Q-R4-8 / gate E8, E13: `@` completion lists one folder at a time by prefix, with `/` separators on screen,
 * `\` accepted on input, never `//`, folders ending in `/`, files before folders (Claude Code 2.1.280, 2026-09-22: "@ file
 * suggestions rank a file whose name contains the query above folder-only matches", gate D.7), only inside the workspace
 * (the junction/symlink guard of workspace-identity.ts), in a bounded list with an empty-state line.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {FILE_COMPLETION_MAX_ROWS,completeProjectPath,fileCompletionOverlay} from '../../src/tui/file-completion.ts';
import {fitOverlay} from '../../src/tui/overlays/scroll-window.ts';

async function project(t:any){
  const root=await mkdtemp(join(tmpdir(),'talos-r4n-complete-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src','util'),{recursive:true});
  await writeFile(join(root,'src','index.js'),'x');await writeFile(join(root,'src','util','strings.js'),'x');
  await writeFile(join(root,'README.md'),'x');
  return root;
}
const values=(rows:Array<{value:string}>)=>rows.map(row=>row.value);

test('R4-N a folder token lists its entries with one slash, files first, folders ending in /',async t=>{
  const root=await project(t);
  assert.deepEqual(values(await completeProjectPath(root,'@src/')),['@src/index.js','@src/util/']);
  assert.deepEqual(values(await completeProjectPath(root,'@src/i')),['@src/index.js']);
  assert.deepEqual(values(await completeProjectPath(root,'@src/util/')),['@src/util/strings.js']);
  assert.deepEqual(values(await completeProjectPath(root,'@')),['@README.md','@src/']);
  for(const token of ['@src/','@src//','@src\\','@src\\\\u','@src/util//']){
    for(const value of values(await completeProjectPath(root,token)))assert.doesNotMatch(value,/\/\/|\\/u,`${token} → ${value}`);
  }
});

test('R4-N a backslash is accepted on input and shown as a forward slash',async t=>{
  const root=await project(t);
  assert.deepEqual(values(await completeProjectPath(root,'@src\\')),['@src/index.js','@src/util/']);
  assert.deepEqual(values(await completeProjectPath(root,'@src\\u')),['@src/util/']);
  assert.deepEqual(values(await completeProjectPath(root,'@..\\')),[]);
});

test('R4-N results stay inside the workspace: no parent escape, no junction or symlink that leaves it',async t=>{
  const root=await project(t);
  const outside=await mkdtemp(join(tmpdir(),'talos-r4n-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
  await writeFile(join(outside,'secret.txt'),'x');
  let linked=true;
  try{await symlink(outside,join(root,'escape'),process.platform==='win32'?'junction':'dir');}catch{linked=false;}
  assert.deepEqual(await completeProjectPath(root,'@../'),[]);
  assert.deepEqual(await completeProjectPath(root,'@src/../../'),[]);
  if(linked){
    assert.equal(values(await completeProjectPath(root,'@')).some(value=>value.includes('escape')),false,'the link to a folder outside is not offered');
    assert.deepEqual(await completeProjectPath(root,'@escape/'),[],'nothing behind the link is listed');
    t.diagnostic('junction guard exercised');
  }else t.diagnostic('the link could not be created here: the junction guard was NOT exercised');
});

test('R4-N the list is bounded inside its budget, keeps the highlight in view, and says when nothing matches',async t=>{
  const root=await project(t);
  await mkdir(join(root,'many'));
  for(let i=0;i<30;i++)await writeFile(join(root,'many',`file-${String(i).padStart(2,'0')}.txt`),'x');
  const rows=await completeProjectPath(root,'@many/');
  assert.equal(rows.length,30);
  const fitted=fitOverlay(fileCompletionOverlay({token:'@many/',rows,selected:25}),{maxRows:Math.min(40,FILE_COMPLETION_MAX_ROWS),columns:60});
  assert.ok(fitted.rows.length+(fitted.border?2:0)<=FILE_COMPLETION_MAX_ROWS,`${fitted.rows.length} rows`);
  assert.ok(fitted.rows.some(row=>row.tone==='selected'&&row.text.includes('file-25.txt')),'the highlighted row is in view');
  assert.ok(fitted.rows.some(row=>/↑ \d+ more/u.test(row.text)),'the rows above are counted');
  const none=fitOverlay(fileCompletionOverlay({token:'@src/x',rows:[],selected:0}),{maxRows:FILE_COMPLETION_MAX_ROWS,columns:60});
  assert.deepEqual(none.rows.filter(row=>row.role==='body').map(row=>row.text),['No files match src/x']);
  const emptyFolder=fitOverlay(fileCompletionOverlay({token:'@',rows:[],selected:0}),{maxRows:FILE_COMPLETION_MAX_ROWS,columns:60});
  assert.deepEqual(emptyFolder.rows.filter(row=>row.role==='body').map(row=>row.text),['No files in this folder']);
  const emptySub=fitOverlay(fileCompletionOverlay({token:'@src\\',rows:[],selected:0}),{maxRows:FILE_COMPLETION_MAX_ROWS,columns:60});
  assert.deepEqual(emptySub.rows.filter(row=>row.role==='body').map(row=>row.text),['No files in src/']);
});
