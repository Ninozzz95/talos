import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {completeProjectPath} from '../../src/tui/file-completion.ts';
import {resolveProjectReferences} from '../../src/tui/project-references.ts';

test('M3-C resolves quoted text references as structured project-relative attachments',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-m3c-ref-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'notes'));await writeFile(join(root,'notes','a b.txt'),'hello π','utf8');
  const rows=await resolveProjectReferences({projectRoot:root,prompt:'review @"notes/a b.txt"'});
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0],{kind:'text',path:'notes/a b.txt',mimeType:'text/plain',bytes:8,text:'hello π'});
});

test('M3-C canonical project boundary rejects a symlink escape and completion does not advertise it',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-m3c-root-'));const outside=await mkdtemp(join(tmpdir(),'talos-m3c-out-'));
  t.after(()=>Promise.all([rm(root,{recursive:true,force:true}),rm(outside,{recursive:true,force:true})]));
  await writeFile(join(outside,'secret.txt'),'outside','utf8');
  await symlink(outside,join(root,'escape'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(()=>resolveProjectReferences({projectRoot:root,prompt:'read @escape/secret.txt'}),(error:any)=>error?.code==='PROJECT_REFERENCE_OUTSIDE_WORKSPACE');
  const rows=await completeProjectPath(root,'@e');
  assert.equal(rows.some(row=>row.value.includes('escape')),false);
});

test('M3-C detects images by bytes, rejects generic binary and enforces text item budget',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-m3c-kind-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  await writeFile(join(root,'picture.bin'),png);
  const image=(await resolveProjectReferences({projectRoot:root,prompt:'look @picture.bin'}))[0]!;
  assert.equal(image.kind,'image');assert.equal(image.mimeType,'image/png');assert.equal(image.bytes,png.length);
  if(image.kind==='image')assert.equal(Buffer.from(image.dataBase64,'base64').equals(png),true);

  await writeFile(join(root,'blob.bin'),Buffer.from([0,1,2,3,4,5]));
  await assert.rejects(()=>resolveProjectReferences({projectRoot:root,prompt:'read @blob.bin'}),(error:any)=>error?.code==='ATTACHMENT_BINARY_UNSUPPORTED');

  await writeFile(join(root,'huge.txt'),Buffer.alloc(256*1024+1,0x61));
  await assert.rejects(()=>resolveProjectReferences({projectRoot:root,prompt:'read @huge.txt'}),(error:any)=>error?.code==='ATTACHMENT_TEXT_TOO_LARGE');
});
