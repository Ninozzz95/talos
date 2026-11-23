/*
 * 0.7.0, the git cure (row 214): read-only git subcommands with an option that writes a file, runs a program or reads the repository's
 * history outside the project. git accepts any unambiguous prefix of a long option (git-scm.com/docs/gitcli) and short options grouped
 * or with their value attached; a template with `%G` verifies a signature (pretty-formats); `<rev>:<path>` reads from the repository's
 * root, not the project's. Each form below asks now (`notAllowed`); the forms after them stay free. Nothing runs: the evaluator only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const repo=fs.mkdtempSync(path.join(os.tmpdir(),'talos-git-options-'));
for(const folder of ['.git','src','sub'])fs.mkdirSync(path.join(repo,folder));
fs.writeFileSync(path.join(repo,'a.txt'),'x\n');fs.writeFileSync(path.join(repo,'src','a.ts'),'x\n');
const sub=path.join(repo,'sub');// a project that is a sub-folder of its repository
test.after(()=>fs.rmSync(repo,{recursive:true,force:true}));
const RULES={none:[],log:['Bash(git log:*)'],logshow:['Bash(git log:*)','Bash(git show:*)'],grepdiff:['Bash(git grep:*)','Bash(git diff:*)']} as const;
type Rules=keyof typeof RULES;
const decide=async(command:string,rules:Rules='none',root=repo)=>(await createPermissionEngine({projectRoot:root,rules:{allow:[...RULES[rules]],ask:[],deny:[]}}).decide({tool:'Bash',command},{interactive:true,mode:'default',sessionId:'s'})).kind;
const T='%h%x09%s';

/* [command, rule sets, project root] — each must NOT be allowed */
const NOT_ALLOWED:[string,Rules[],string][]=[
  /* 1. long options by any prefix git accepts, short ones grouped or attached */
  ['git grep --open=calc x',['none','grepdiff'],repo],
  ['git grep --open-files=calc x',['none','grepdiff'],repo],
  ['git log -p --ext',['none','log'],repo],
  ['git log -p --ext-dif',['none','log'],repo],
  ['git diff --ext',['none','grepdiff'],repo],
  ['git diff --outp=out.txt',['none','grepdiff'],repo],
  ['git show --outp=out.txt',['none','logshow'],repo],
  ['git log --format=%h --outp=out.txt',['none','log'],repo],
  [`git log --format="${T}" --outp=out.txt`,['none','log'],repo],
  ['git log --tex -p',['none','log'],repo],
  ['git grep -nO x',['none','grepdiff'],repo],
  ['git grep -nOcalc x',['none','grepdiff'],repo],
  ['git grep -O"x y" x',['none','grepdiff'],repo],
  ['git grep -O calc x',['none','grepdiff'],repo],
  ['git grep -Ocalc x',['none','grepdiff'],repo],
  /* 2. <rev>:<path> outside the project, or from the repository's root when the project is a sub-folder */
  ['git show HEAD:../fuori/x',['none','logshow'],sub],
  ['git show --format=%h HEAD:../fuori/x',['none','logshow'],sub],
  [`git show --format="${T}" HEAD:../fuori/x`,['none','logshow'],sub],
  ['git show HEAD:..\\fuori\\x',['none','logshow'],sub],
  [`git show --format=${T} HEAD:/fuori/x`,['none','logshow'],sub],
  ['git show HEAD:a.txt',['none','logshow'],sub],
  ['git show HEAD:../a.txt',['none','logshow'],repo],
  ['git grep x HEAD:../fuori',['none','grepdiff'],repo],
  ['git show HEAD:/a.txt',['none','logshow'],repo],// a path that starts at a root asks, even at the repository's root
  ['git show HEAD~1:./../a.txt',['none','logshow'],sub],// `./` that climbs still asks
  ['git show HEAD:.gitignore',['none','logshow'],sub],// a dot without the slash counts from the repository's root
  /* 2b. a pathspec with magic (`:/`, `:(top)`) counts from the repository's root too, after `--` as before it (found by a mutant) */
  ['git grep segreto -- :/',['none','grepdiff'],sub],
  ['git log -p -- :/a.txt',['none','log'],sub],
  ['git diff -- ":(top)a.txt"',['none','grepdiff'],sub],
  ['git ls-files :/',['none'],sub],
  ['git status -- :/',['none'],sub],
  /* 3. a verb-only rule does not cover a form that writes or runs */
  [`git log --output=out.txt --format="${T}"`,['none','log','logshow'],repo],
  [`git log --output out.txt --format="${T}"`,['none','log','logshow'],repo],
  [`git log --ext-diff -p --format="${T}"`,['none','log','logshow'],repo],
  [`git log --open-files-in-pager=calc --format="${T}"`,['none','log','logshow'],repo],
  /* 4. a signature check runs gpg */
  ['git log --format=%h%x09%G?',['none','log'],repo],
  ['git log --format=%G?',['none','log'],repo],
  ['git log --pretty=format:%GS',['none','log'],repo],
  ['git log --show-signature',['none','log'],repo],
  ['git log --show-sig --format=%h',['none','log'],repo],
  /* 5. judge v2493: on Windows cmd and git.exe read a single quote as a plain character: what the evaluator joins, git gets apart */
  ...(process.platform==='win32'?[
    ["git log --format='%h --output=pwn'",['none','log'],repo],
    ["git log --format='%s --output=..\\..\\pwn'",['none','log'],repo],
    ["git log --format=%h' --output=pwn '",['none','log'],repo],
    ["git grep x' --open-files-in-pager=calc '",['none','grepdiff'],repo],
    ["git log --format=%h' --output=pwn",['none','log'],repo],// an unclosed quote hides the rest of the line too
    ["git log --format='%h %s'",['none','log'],repo],// cmd gives git two words: git stops with an error, the card costs little
  ] as [string,Rules[],string][]:[]),
];
/* [command, rule sets, project root] — each stays allowed */
const STAY_FREE:[string,Rules[],string][]=[
  ['git log --output-indicator-new=+ --format=%h',['none','log'],repo],
  ['git diff --no-ext-diff',['none','grepdiff'],repo],
  ['git log -p --no-textconv --format=%h',['none','log'],repo],
  ['git log --oneline',['none','log'],repo],
  [`git log --format="${T}"`,['none','log','logshow'],repo],
  [`git log --format="${T}"`,['none','log','logshow'],sub],
  ['git show HEAD:a.txt',['none','logshow'],repo],
  ['git show HEAD~1:src/a.ts',['none','logshow'],repo],
  ['git show HEAD',['none','logshow'],sub],
  ['git grep -n TODO',['none','grepdiff'],repo],
  ['git grep -eO x',['none','grepdiff'],repo],// `O` is the value of -e here, the pattern
  ['git log -SFOO --format=%h',['none','log'],repo],// `FOO` is the value of -S
  ['git log -5 --format=%h',['none','log'],repo],
  ['git diff --stat',['none','grepdiff'],sub],
  ['git status',['none'],sub],
  [`git grep -n TODO ${path.join(repo,'src')}`,['none','grepdiff'],repo],// a drive path is a path, not <rev>:<path>
  ['git log -- ":(exclude)src"',['none','log'],repo],// at the repository's root a pathspec with magic stays inside
  ['git log --since=10:00 --format=%h',['none','log'],sub],// an option's value is not <rev>:<path>
  ['git show HEAD~1:./a.txt',['none','logshow'],sub],// judge v2495: `./` counts from the current folder, the project: inside
  ["git log --grep='fix'",['none','log'],repo],// no blank between the quotes: cmd splits the same words (git sees the quotes)
  ["git log --oneline --author='Rossi'",['none','log'],repo],
];

test('git cure: options that write or run, <rev>:<path> outside, a signature check: none is allowed without a card',async()=>{
  const allowed:string[]=[];
  for(const [command,ruleSets,root] of NOT_ALLOWED)for(const rules of ruleSets)if(await decide(command,rules,root)==='allow')allowed.push(`${rules}${root===sub?' (sub-folder)':''}: ${command}`);
  assert.deepEqual(allowed,[],`allowed without a card:\n${allowed.join('\n')}`);
});

test('git cure: the plain read-only forms stay free, at the repository root and in a sub-folder project',async()=>{
  const asked:string[]=[];
  for(const [command,ruleSets,root] of STAY_FREE)for(const rules of ruleSets)if(await decide(command,rules,root)!=='allow')asked.push(`${rules}${root===sub?' (sub-folder)':''}: ${command}`);
  assert.deepEqual(asked,[],`asks now:\n${asked.join('\n')}`);
});

test('git cure: a rule that names the whole option is still obeyed; a verb-only rule on a git command that writes anyway still holds',async()=>{
  const engine=createPermissionEngine({projectRoot:repo,rules:{allow:['Bash(git log --output=report.txt)','Bash(git commit:*)'],ask:[],deny:[]}});
  assert.equal((await engine.decide({tool:'Bash',command:'git log --output=report.txt'},{interactive:true,mode:'default',sessionId:'s'})).kind,'allow');
  assert.equal((await engine.decide({tool:'Bash',command:'git commit -m "msg"'},{interactive:true,mode:'default',sessionId:'s'})).kind,'allow','not a read-only subcommand: the rule says it');
});
