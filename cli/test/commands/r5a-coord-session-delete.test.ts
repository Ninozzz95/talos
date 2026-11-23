/* R5a (coordinator wiring, lane R hand-back): Q-R5-10 / E6 — a session's kept command outputs are deleted WITH the session.
   `talos session delete <id>` removed the kernel's session file and left `<dataRoot>/tool-output/<id>/` behind. */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {runSessionCommand} from '../../src/commands/session-cli.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

test('R5a E6: deleting a session also deletes its kept tool outputs, and only its own',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-sdel-'));
  const paths={dataRoot:join(root,'data'),sessionsRoot:join(root,'sessions')};
  for(const id of ['s1','s2']){await mkdir(join(paths.dataRoot,'tool-output',id),{recursive:true});await writeFile(join(paths.dataRoot,'tool-output',id,'out.txt'),'kept output\n');}
  const registry={ripristina:async()=>({}),elenca:()=>[{sessionId:'s1',conclusa:true},{sessionId:'s2',conclusa:true}]};
  const out:string[]=[];
  const ctx={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:root,paths,repoRoot:REPO_ROOT,createRuntimeContext:async()=>({registry,runtime:{}})} as any;
  assert.equal(await runSessionCommand(ctx,['delete','s1']),0);
  assert.equal(existsSync(join(paths.dataRoot,'tool-output','s1')),false,'the deleted session\'s outputs are gone');
  assert.equal(existsSync(join(paths.dataRoot,'tool-output','s2','out.txt')),true,'another session\'s outputs stay');
});
