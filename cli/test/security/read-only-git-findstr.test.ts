/*
 * F-P-001 / F-P-002 (stress test 0.5.0, owner's tester 08/10/2026): `findstr /i benign notes.txt` and
 * `git -C repo status` were asked for (refused in a run nobody can answer) although they only read. The read-only list
 * knew neither `findstr` nor git's global options before the subcommand. Both are read-only now — and the forms that
 * write, run a program or read where the boundary cannot see stay out:
 *   git: `--output=<file>` (diff/log/show write it), `-O`/`--open-files-in-pager` (grep runs a program), `--ext-diff`,
 *        any global option but `-C <dir>`, `--no-optional-locks`, `--no-pager` (`-c` sets config, `--exec-path`…);
 *   findstr: `/F:<file>`, `/G:<file>`, `/D:<dirs>` name files or folders through a switch the path check reads as a switch.
 * Claude Code's read-only git commands and Codex's safe-command list take the same shape: known subcommands, no flag that writes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileRules,evaluateRules} from '../../src/security/evaluate.ts';
import {isReadOnlyShellCommand} from '../../src/security/rule-parser.ts';

test('F-P-002: git status, diff and log are read-only after -C <dir>, --no-optional-locks and --no-pager',()=>{
  for(const command of ['git -C w21repo status --short','git -C w21repo status','git --no-optional-locks -C w21repo status --short','git --no-pager log --oneline -5','git -C sub diff HEAD~1','git status'])
    assert.equal(isReadOnlyShellCommand(command),true,command);
});

test('F-P-002 the other way: git forms that write, run a program or change config are not read-only',()=>{
  for(const command of ['git -C w21repo show --output=w22.txt HEAD','git diff --output w.txt','git log --output=x.txt','git grep -O notepad foo','git grep --open-files-in-pager=vim foo','git diff --ext-diff',
    'git -c core.pager=evil status','git --exec-path=/tmp status','git --git-dir=/elsewhere/.git status','git -C','git -C repo','git --no-pager','git -C repo commit -m x'])
    assert.equal(isReadOnlyShellCommand(command),false,command);
});

test('the decision itself: with no rule, git -C <dir> status is allowed inside the project; git grep -O and diff --output are not',()=>{
  const root=mkdtempSync(join(tmpdir(),'talos-fp002-'));
  try{
    mkdirSync(join(root,'w21repo'));writeFileSync(join(root,'notes.txt'),'benign\n');
    const rules=compileRules({allow:[],ask:[],deny:[]} as any);
    const decide=(command:string)=>evaluateRules(rules,{tool:'Bash',command} as any,{projectRoot:root}).effect;
    assert.equal(decide('git -C w21repo status --short'),'allow');
    assert.equal(decide('findstr /i benign notes.txt'),'allow');
    assert.notEqual(decide('git grep -Ocalc.exe benign'),'allow','a program named by -O is not run without asking');
    assert.notEqual(decide('git diff --output=w.txt'),'allow','a file written by --output is not written without asking');
    assert.notEqual(decide('git -C .. status'),'allow','-C outside the project is judged by the boundary');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('F-P-001: findstr reads; its switches that name files or folders do not count as read-only',()=>{
  for(const command of ['findstr /i benign notes.txt','findstr "BENIGN" *.txt','FINDSTR /N /C:"a b" notes.txt'])
    assert.equal(isReadOnlyShellCommand(command),process.platform==='win32'||!command.startsWith('FINDSTR'),command);
  for(const command of ['findstr /F:list.txt x','findstr /g:words.txt notes.txt','findstr /D:C:\\Users x *.txt'])
    assert.equal(isReadOnlyShellCommand(command),false,command);
});
