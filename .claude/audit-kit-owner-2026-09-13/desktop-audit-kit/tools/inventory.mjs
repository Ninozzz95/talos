import fs from 'node:fs/promises';
import {inventory, assertPinnedClean} from '../lib/inventory.mjs';
try {
  const [repo,out,commit,...extra]=process.argv.slice(2);
  if (!repo || !out || extra.length) throw new Error('Usage: node tools/inventory.mjs REPO OUTPUT.json [EXPECTED_FULL_COMMIT]');
  const result=await inventory(repo);
  if (commit) assertPinnedClean(result,commit);
  await fs.writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({commit:result.commit,files:result.files.length,dirty:result.worktree_dirty,desktop_tested:false}));
} catch(e) {console.error(e.message);process.exitCode=1;}
