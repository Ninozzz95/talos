import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {completeProjectPath} from '../../src/tui/file-completion.ts';

/* R4 Q-R4-8 (gate D.7, Claude Code 2.1.280): files come before folders. */
test('file completion never escapes the project root and sorts files first',async()=>{
  const projectRoot=await mkdtemp(join(tmpdir(),'talos-complete-'));
  await mkdir(join(projectRoot,'alpha dir'));await writeFile(join(projectRoot,'alpha.txt'),'x');
  assert.deepEqual(await completeProjectPath(projectRoot,'@../'),[]);
  const rows=await completeProjectPath(projectRoot,'@a');
  assert.equal(rows[0]?.directory,false);assert.match(rows[0]?.value??'',/alpha\.txt/u);
});
