/*
 * R4 lane F — "after an update" needs a real build id (owner decision Q-R4-4 (i)(a): a new CLI version OR a new build commit;
 * development builds are always 1.0.0). `currentBuildId` reads the commit of the checkout the running CLI comes from, the
 * way git stores it (HEAD, a branch ref, packed-refs, a linked worktree's `.git` file and `commondir`), without spawning git;
 * an installed copy with no checkout has none (null), and then the version alone decides. A pinned constant cannot do this:
 * it changes only when someone edits it.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {bootPlan,currentBuildId} from '../../src/tui/launch-state.ts';

const roots:string[]=[];after(()=>{for(const root of roots)rmSync(root,{recursive:true,force:true});});
const A='0123456789abcdef0123456789abcdef01234567';const B='89abcdef0123456789abcdef0123456789abcdef';
function tree(files:Record<string,string>){const root=mkdtempSync(join(tmpdir(),'r4-f-build-'));roots.push(root);for(const [file,text] of Object.entries(files)){const path=join(root,...file.split('/'));mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,text);}return root;}

test('Q-R4-4: the build id is the commit of the checkout the CLI runs from (branch ref, detached, packed)',()=>{
  const branch=tree({'repo/.git/HEAD':'ref: refs/heads/main\n','repo/.git/refs/heads/main':`${A}\n`,'repo/cli/dist/tui/x.js':''});
  assert.equal(currentBuildId(join(branch,'repo','cli','dist','tui')),A);
  const detached=tree({'repo/.git/HEAD':`${B}\n`,'repo/cli/src/tui/x.ts':''});
  assert.equal(currentBuildId(join(detached,'repo','cli','src','tui')),B);
  const packed=tree({'repo/.git/HEAD':'ref: refs/heads/lane/x\n','repo/.git/packed-refs':`# pack-refs with: peeled fully-peeled sorted\n${B} refs/heads/other\n${A} refs/heads/lane/x\n`,'repo/cli/x':''});
  assert.equal(currentBuildId(join(packed,'repo','cli')),A);
});

test('Q-R4-4: a linked worktree is followed to its own HEAD and to the shared refs',()=>{
  const root=tree({
    'main/.git/HEAD':'ref: refs/heads/main\n','main/.git/refs/heads/main':`${B}\n`,
    'main/.git/worktrees/wt/HEAD':'ref: refs/heads/feature\n','main/.git/worktrees/wt/commondir':'../..\n',
    'main/.git/packed-refs':`${A} refs/heads/feature\n`,
    'wt/cli/dist/x.js':'',
  });
  writeFileSync(join(root,'wt','.git'),`gitdir: ${join(root,'main','.git','worktrees','wt')}\n`);
  assert.equal(currentBuildId(join(root,'wt','cli','dist')),A);
});

test('Q-R4-4: no checkout, or one that cannot be read, has no build id; the version alone decides then',()=>{
  const none=tree({'app/cli/dist/x.js':''});
  assert.equal(currentBuildId(join(none,'app','cli','dist')),null);
  const broken=tree({'repo/.git/HEAD':'ref: refs/heads/gone\n','repo/cli/x':''});
  assert.equal(currentBuildId(join(broken,'repo','cli')),null);
  const odd=tree({'repo/.git/HEAD':'not a ref\n','repo/cli/x':''});
  assert.equal(currentBuildId(join(odd,'repo','cli')),null);
});

test('Q-R4-4: the running CLI has a build id here (this test runs from a git checkout), and a new commit replays the full boot',()=>{
  const id=currentBuildId();
  assert.match(id??'',/^[0-9a-f]{40}$/u,'this worktree is a git checkout');
  const data=tree({});
  assert.equal(bootPlan({dataRoot:data,version:'1.0.0',build:A,now:1}).mode,'full');
  assert.equal(bootPlan({dataRoot:data,version:'1.0.0',build:A,now:2}).mode,'short');
  assert.equal(bootPlan({dataRoot:data,version:'1.0.0',build:B,now:3}).mode,'full','a new commit is an update');
});
