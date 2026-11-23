/*
 * Stage 7.16 (mockup diff «Changes main · 3 files · +17 −5 · not committed»; Claude Code /diff: git diff HEAD plus the
 * untracked files — owner 03/10, «new»): the rows of the /diff sheet from `git diff HEAD` and the untracked files.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {diffSubtitle,gitDiffFiles,patchOf,untrackedDiffFile} from '../../src/tui/diff-files.ts';

const GIT=[
  'diff --git a/src/auth/login.ts b/src/auth/login.ts','index 1111111..2222222 100644','--- a/src/auth/login.ts','+++ b/src/auth/login.ts',
  '@@ -38,3 +38,3 @@ export async function login(page)','   await page.fill("#email", user.email)','-  await page.waitForTimeout(500)','+  await waitForSession(page)',
  'diff --git a/docs/old.md b/docs/old.md','deleted file mode 100644','index 3333333..0000000','--- a/docs/old.md','+++ /dev/null','@@ -1,2 +0,0 @@','-# Old','-gone',
  'diff --git a/src/new.ts b/src/new.ts','new file mode 100644','index 0000000..4444444','--- /dev/null','+++ b/src/new.ts','@@ -0,0 +1 @@','+export const x=1;',
  'diff --git a/a.ts b/b.ts','similarity index 90%','rename from a.ts','rename to b.ts','index 5555555..6666666 100644','--- a/a.ts','+++ b/b.ts','@@ -1 +1 @@','-old','+new',
  'diff --git a/logo.png b/logo.png','index 7777777..8888888 100644','Binary files a/logo.png and b/logo.png differ',''].join('\n');

test('git diff HEAD: each file with its counts, what happened to it, and its hunks as the mockup draws them',()=>{
  const files=gitDiffFiles(GIT);
  assert.deepEqual(files.map(file=>[file.path,file.add,file.del,file.note]),[
    ['src/auth/login.ts',1,1,'modified'],['docs/old.md',0,2,'deleted'],['src/new.ts',1,0,'added'],['b.ts',1,1,'renamed from a.ts'],['logo.png',0,0,'binary']]);
  assert.deepEqual(files[0]!.hunks,['@@ -38,3 +38,3 @@ export async function login(page)','   await page.fill("#email", user.email)','-  await page.waitForTimeout(500)','+  await waitForSession(page)']);
  assert.deepEqual(files[4]!.hunks,[]);
  assert.deepEqual(gitDiffFiles(''),[]);
});

test('an untracked file is «new», all its lines added; a binary one or a very large one says so without lines',()=>{
  assert.deepEqual(untrackedDiffFile('notes.txt','one\ntwo\n'),{path:'notes.txt',add:2,del:0,note:'new',hunks:['@@ -0,0 +1,2 @@','+one','+two']});
  assert.deepEqual(untrackedDiffFile('empty.txt',''),{path:'empty.txt',add:0,del:0,note:'new',hunks:[]});
  assert.deepEqual(untrackedDiffFile('img.png',null),{path:'img.png',add:0,del:0,note:'new · binary',hunks:[]});
});

test('the subtitle is the mockup\'s, and a clean tree says so; a patch is the file\'s own diff',()=>{
  const files=gitDiffFiles(GIT);
  assert.equal(diffSubtitle('main',files),'main · 5 files · +3 −4 · not committed');
  assert.equal(diffSubtitle('main',files.slice(0,1)),'main · 1 file · +1 −1 · not committed');
  assert.equal(diffSubtitle('main',[]),'main · no changes since the last commit');
  assert.equal(diffSubtitle(null,files.slice(0,1)),'1 file · +1 −1 · not committed','a detached HEAD names no branch');
  assert.equal(patchOf(files[0]!),'--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n@@ -38,3 +38,3 @@ export async function login(page)\n   await page.fill("#email", user.email)\n-  await page.waitForTimeout(500)\n+  await waitForSession(page)\n');
});
