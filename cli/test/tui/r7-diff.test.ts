/*
 * Stage 7.16 (mockup diff; Claude Code /diff — owner 03/10: untracked files «new», tabs Now and By turn): /diff on a real
 * git repository in a temporary folder — the subtitle with the branch and the counts, a modified file and an untracked one,
 * c copies a file's patch (the test profile's clipboard is a file), By turn says when no turn changed a file; outside git
 * /diff says it needs git. Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',TAB='\t';
let n=0;const project=()=>{const root=join(env.root,`diff-${++n}`);mkdirSync(root,{recursive:true});return root;};
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');
const git=(cwd:string,...args:string[])=>execFileSync('git',['-c','user.name=t','-c','user.email=t@example.invalid','-c','core.autocrlf=false',...args],{cwd,windowsHide:true,stdio:'pipe'});

test('stage 7.16: /diff on a repository — the mockup\'s sheet with a modified file and an untracked one; c copies the patch',async()=>{
  const root=project();git(root,'init','-q','-b','main');
  writeFileSync(join(root,'login.ts'),'one\ntwo\nthree\n');git(root,'add','.');git(root,'commit','-q','-m','start');
  writeFileSync(join(root,'login.ts'),'one\nTWO\nthree\n');writeFileSync(join(root,'notes.txt'),'fresh\nlines\n');
  const clip=join(root,'..',`clip-${n}.txt`);const before=process.env.TALOS_CLIPBOARD_FILE;process.env.TALOS_CLIPBOARD_FILE=clip;
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/diff');app.press(ENTER);
    const s=await app.waitFor('the sheet',x=>/── Changes main · 2 files · \+3 −1 · not committed/u.test(x.text));
    assert.match(s.text,/^  Now   By turn/mu);
    assert.match(s.text,/› login\.ts +\+1 −1 +│ login\.ts  modified/u);
    assert.match(s.text,/ {3}notes\.txt +\+2 −0/u);
    assert.match(s.text,/│ -two/u);assert.match(s.text,/│ \+TWO/u);
    assert.match(s.text,/o open in editor {3}c copy patch {3}tab next tab {3}esc close/u);
    await app.type('c');
    await app.waitFor('the toast',x=>/Patch copied · login\.ts/u.test(flat(x.lines)));
    for(let i=0;i<40;i++){try{if(readFileSync(clip,'utf8'))break;}catch{/* not yet */}await sleep(25);}
    assert.equal(readFileSync(clip,'utf8'),'--- a/login.ts\n+++ b/login.ts\n@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n');
    app.press(TAB);
    await app.waitFor('By turn',x=>/No turn of this conversation changed a file yet\./u.test(x.text));
  }finally{app.unmount();if(before===undefined)delete process.env.TALOS_CLIPBOARD_FILE;else process.env.TALOS_CLIPBOARD_FILE=before;}
});

test('stage 7.16: By turn shows what a turn of this conversation changed, from its checkpoint',async()=>{
  const root=project();git(root,'init','-q','-b','main');
  /* the checkpoint reads its «before» copy through git: the repository's own setting keeps this machine's CRLF out of it */
  git(root,'config','core.autocrlf','false');
  writeFileSync(join(root,'a.txt'),'a\n');git(root,'add','.');git(root,'commit','-q','-m','start');
  /* the turn TALOS took in this conversation (session s1, as the fixture resumes it) */
  const store=createCheckpointStore({rootDir:env.paths.checkpointsRoot!,projectRoot:root});
  const handle=await store.begin({operation:'start',sessionId:'s1'});writeFileSync(join(root,'a.txt'),'a\nb\n');await handle.finalize();
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/diff');app.press(ENTER);
    await app.waitFor('the sheet',x=>/── Changes main · 1 file · \+1 −0 · not committed/u.test(x.text));
    app.press(TAB);
    const s=await app.waitFor('By turn',x=>/› A turn +\+1 −0/u.test(x.text));
    assert.match(s.text,/│ a\.txt  modified/u);assert.match(s.text,/│ \+b/u);
  }finally{app.unmount();}
});

test('stage 7.16: a clean tree says so; outside a repository /diff says it needs git',async()=>{
  const clean=project();git(clean,'init','-q','-b','main');writeFileSync(join(clean,'a.txt'),'a\n');git(clean,'add','.');git(clean,'commit','-q','-m','start');
  const app=await mountR5a({cols:120,rows:40,root:clean,paths:env.paths});
  try{
    await app.type('/diff');app.press(ENTER);
    await app.waitFor('clean',x=>/── Changes main · no changes since the last commit/u.test(x.text)&&/Nothing changed since the last commit\./u.test(x.text));
  }finally{app.unmount();}
  /* the temporary profile's own folder is not a repository */
  const outside=join(env.root,'..',`not-git-${Date.now()}`);mkdirSync(outside,{recursive:true});
  const plain=await mountR5a({cols:120,rows:40,root:outside,paths:env.paths});
  try{
    await plain.type('/diff');plain.press(ENTER);
    await plain.waitFor('needs git',x=>/This folder is not a git repository: \/diff needs git\./u.test(flat(x.lines)));
  }finally{plain.unmount();}
});
