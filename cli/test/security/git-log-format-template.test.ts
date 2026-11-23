/*
 * 0.7.0 block 1, item 7 (list from 0.6.18): `git log --format="%h%x09%s"` asked for a card in every mode, with or without
 * `Bash(git log:*)`: `%h%` was read as a Windows variable and the template as a path (evaluate.ts, readOnlyCommandStaysInside). The
 * template of `--format=`/`--pretty=` is printed by git, never opened. It passes now — only in a read-only `git log`/`git show` with
 * plain options, without `$`, a backtick or a control character; a `%NAME%` cmd would expand still asks (cmd-reading.ts).
 * The twelve forms that pass and the twelve that still ask, with the built-in defaults and with the verb rules. Nothing runs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {gitPrettyFormatValues} from '../../src/security/rule-parser.ts';

const WINDOWS=process.platform==='win32';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'talos-git-template-'));
fs.mkdirSync(path.join(root,'src'));fs.mkdirSync(path.join(root,'sub'));fs.writeFileSync(path.join(root,'a.txt'),'x\n');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const RULES={none:[],verb:['Bash(git log:*)','Bash(git show:*)']} as const;
const decide=async(rules:keyof typeof RULES,command:string)=>(await createPermissionEngine({projectRoot:root,rules:{allow:[...RULES[rules]],ask:[],deny:[]}}).decide({tool:'Bash',command},{interactive:true,mode:'default',sessionId:'s'})).kind;

const PASS=[
  'git log --format="%h%x09%s"',
  'git log --format=%h%x09%s',
  'git show --format="%h%x09%s" HEAD',
  'git log --pretty=format:"%h%x09%an%x09%s"',
  'git log --pretty=tformat:%H%x09%P',
  'git log -5 --format="%h%x09%ad" --date=short',
  'git -C sub log --format="%h%x09%s"',
  'git log --format="%h%x09%s" -- src',
  'git show -s --format="%H%x09%P" HEAD',
  'git log --no-merges --format="%an%x09%ae"',
  'git --no-pager log --format="%h%x09%s"',
  'git log --format="%C(auto)%h%Creset%x09%s"',
];
/* [command, rule sets where it must not be allowed, Windows only] */
const STILL_ASK:[string,(keyof typeof RULES)[],boolean][]=[
  ['git log --output=log.txt --format="%h%x09%s"',['none'],false],// with Bash(git log:*) the rule allows it, as before this item
  ['git log -o log.txt --format="%h%x09%s"',['none','verb'],true],
  ['git log --format="%USERPROFILE%"',['none','verb'],true],
  ['git log --format="%h%TEMP%s"',['none','verb'],true],
  ['git log --format="$(whoami)"',['none','verb'],false],
  ['git log --format="`whoami`"',['none','verb'],false],
  ['git log --format="%h%x09%s" | node x.js',['none','verb'],false],
  ['git log --format="%h%x09%s" & del a.txt',['none','verb'],false],
  ['git log --format="%h%x09%s" > log.txt',['none','verb'],false],
  ['git log --format="%h%x09%s" -- ../fuori',['none','verb'],false],
  ['git -c core.pager=x log --format="%h%x09%s"',['none','verb'],false],
  ['git log --format=../fuori -- ../fuori',['none','verb'],false],// the same text as a path is still judged
  /* judge v2493 (reviewer CORRECTNESS): on Windows cmd and git.exe read a single quote as a plain character, so the «template» is two
     words for git; no template is left out when the line holds one */
  ["git log --format='%s --output=../../../pwn'",['none','verb'],true],
  ["git log --format='%h%x09%s --output=../../../pwn'",['none','verb'],true],
  ["git log --format='%h%x09%s --output=pwn'",['none','verb'],true],
];

test('item 7: the twelve git log/show forms with a template pass without a card, with the defaults and with the verb rules',async()=>{
  for(const rules of ['none','verb'] as const)for(const command of PASS)assert.equal(await decide(rules,command),'allow',`${rules}: ${command}`);
});

test('item 7: the twelve forms that write, run, expand or read outside still ask (or are refused)',async()=>{
  for(const [command,ruleSets,windowsOnly] of STILL_ASK){
    if(windowsOnly&&!WINDOWS)continue;
    for(const rules of ruleSets)assert.notEqual(await decide(rules,command),'allow',`${rules}: ${command}`);
  }
});

test('item 7: only a plain template of a read-only git log/show is left out of the path check',()=>{
  assert.deepEqual(gitPrettyFormatValues('git log --format="%h%x09%s" --pretty=format:%an'),['%h%x09%s','format:%an']);
  assert.deepEqual(gitPrettyFormatValues('GIT log --format=%h'),WINDOWS?['%h']:[],'the verb is folded only where the platform folds it');
  for(const command of [
    'git diff --format=%h%x09%s','git grep --format=%h','git status --format=%h',// not log or show
    'git log -o x --format=%h','git log --output=x --format=%h','git log --ext-diff --format=%h','git log --author=x --format=%h','git log --author=a-s --format=%h',// an option outside the plain ones, even one ending like a plain one
    'git -c a=b log --format=%h','git log --format="a$b"','git log --format="a`b"','git log --format="a\tb"','node log --format=%h',
  ])assert.deepEqual(gitPrettyFormatValues(command),[],command);
  assert.deepEqual(gitPrettyFormatValues('git log --format=%h -- -o'),['%h'],'after -- every word is a path, never an option');
});
