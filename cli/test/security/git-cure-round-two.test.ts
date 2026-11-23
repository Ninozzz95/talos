/*
 * 0.7.0, the git cure, round 2 (judge v2509, from the security reviewer's red of 22/11/2026). Nothing runs: the evaluator only.
 * (a) a word `<rev>:<path>` is judged as a path too: a network path, a path from a root or one that climbs, with a colon in it, asks.
 * (b) rg with `--pre`, `--pre-glob` or `--hostname-bin` (rg runs the program they name) is not read-only, nor covered by `Bash(rg:*)`.
 * (c) on Windows cmd removes a `^` outside double quotes (single ones are plain characters to it): such a line is not read-only.
 * (d) taken out (judge v2534): a rule that names the option that writes or runs, with `:*`, does NOT lift the card. Obeying it skipped
 *     the project boundary, and a read outside the project passed without a card (`Bash(rg --pre:*)`). Each pair below asks.
 * (e) an exact git option (`--text`) is not read as a prefix of one that runs (`--textconv`): git takes the exact name first.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const WINDOWS=process.platform==='win32';
const repo=fs.mkdtempSync(path.join(os.tmpdir(),'talos-git-round-two-'));
for(const folder of ['.git','src','sub'])fs.mkdirSync(path.join(repo,folder));
fs.writeFileSync(path.join(repo,'a.txt'),'x\n');fs.writeFileSync(path.join(repo,'src','a.ts'),'x\n');
const sub=path.join(repo,'sub');
test.after(()=>fs.rmSync(repo,{recursive:true,force:true}));
const decide=async(command:string,allow:string[]=[],root=repo)=>(await createPermissionEngine({projectRoot:root,rules:{allow,ask:[],deny:[]}}).decide({tool:'Bash',command},{interactive:true,mode:'default',sessionId:'s'})).kind;
const RULE_SETS=(command:string)=>[[],[`Bash(git ${command.split(' ')[1]}:*)`]];

/* (a) each asks, with no rule and with the subcommand's rule, at the repository's root */
const REVISION_AS_PATH=[
  'git diff /nessun-ospite/fuori/f.txt:s a.txt',
  'git diff --no-index /nessun-ospite/fuori/f.txt:s a.txt',
  'git log -- ../fuori/x:s',
  'git diff --no-index ../fuori/x:s a.txt',
  ...(WINDOWS?[
    'git diff --no-index \\\\nessun-ospite\\c\\x:s a.txt',
    'git diff \\\\nessun-ospite\\c\\x:s a.txt',
    'git diff //nessun-ospite/c/x:s a.txt',
    'git show \\\\nessun-ospite\\c\\x:s',
    'git diff \\Users\\x\\f.exe:Zone.Identifier a.txt',
    'git grep --no-index -e x \\Users\\x\\f.exe:Zone.Identifier',
    'git log -- ..\\fuori\\x:s',
    'git diff --no-index -- ..\\fuori\\x:s a.txt',
  ]:[]),
];
const REVISION_STAYS_FREE:[string,string][]=[
  ['git show HEAD:a.txt',repo],['git show origin/main:x',repo],['git show HEAD~1:src/a.ts',repo],['git diff HEAD:a.txt HEAD:src/a.ts',repo],
  ['git show HEAD:./a.txt',sub],['git diff --no-index a.txt src/a.ts',repo],
  ['git diff --no-index a.txt:s a.txt',sub],// --no-index: a file's stream inside the project, never <rev>:<path> (mutant A2-01)
];

test('git cure round 2 (a): a <rev>:<path> word is judged as a path too, and one outside asks',async()=>{
  const allowed:string[]=[];
  for(const command of REVISION_AS_PATH)for(const rules of RULE_SETS(command))if(await decide(command,rules)==='allow')allowed.push(`${rules.join(',')||'none'}: ${command}`);
  assert.deepEqual(allowed,[],`allowed without a card:\n${allowed.join('\n')}`);
  const asked:string[]=[];
  for(const [command,root] of REVISION_STAYS_FREE)for(const rules of RULE_SETS(command))if(await decide(command,rules,root)!=='allow')asked.push(`${rules.join(',')||'none'}: ${command}`);
  assert.deepEqual(asked,[],`asks now:\n${asked.join('\n')}`);
});

/* (b) each asks with no rule and with Bash(rg:*); the forms after them stay free */
const RG_RUNS=['rg --pre=calc x','rg --pre calc x','rg --pre=.\\cattivo.bat x','rg --pre-glob=* --pre=calc x','rg --pre-glob *.pdf x',
  'rg --hostname-bin=calc --hyperlink-format=default x','rg --hostname-bin calc x','rg --pr=calc x','rg "--pre=calc" x','rg -n x --pre calc src'];
const RG_STAYS_FREE=['rg -n TODO src','rg --pcre2 x','rg --hidden x','rg -p x','rg --no-pre x','rg --hyperlink-format=default x',
  'rg TODO ./pre'];// a word that is no option, whatever it spells (mutant B-06)

test('git cure round 2 (b): rg with an option that runs a program is not read-only, and Bash(rg:*) does not cover it',async()=>{
  const allowed:string[]=[];
  for(const command of RG_RUNS)for(const rules of [[],['Bash(rg:*)']])if(await decide(command,rules)==='allow')allowed.push(`${rules.join(',')||'none'}: ${command}`);
  assert.deepEqual(allowed,[],`allowed without a card:\n${allowed.join('\n')}`);
  const asked:string[]=[];
  for(const command of RG_STAYS_FREE)for(const rules of [[],['Bash(rg:*)']])if(await decide(command,rules)!=='allow')asked.push(`${rules.join(',')||'none'}: ${command}`);
  assert.deepEqual(asked,[],`asks now:\n${asked.join('\n')}`);
});

/* (c) Windows only: each asks with no rule and with a rule naming its verb (and its git subcommand); the forms after them stay free */
const CARET:[string,string][]=[
  ['type ^C:\\Windows\\win.ini',repo],['cat ^..\\x',repo],["cat '^..\\x'",repo],['git log --out^put=o.txt',repo],
  ['git grep --open-files-in-pa^ger=calc x',repo],['git show HEAD:./.^./x',sub],['rg x ^..\\fuori',repo],
];
const CARET_STAYS_FREE=['grep "^foo" a.txt','rg "^fn " src','git log --grep="^fix" --oneline','cat a.txt'];
const verbRules=(command:string)=>[[],[`Bash(${command.split(' ')[0]}:*)`],...(command.startsWith('git ')?[[`Bash(git ${command.split(' ')[1]}:*)`]]:[])];

test('git cure round 2 (c): on Windows a read-only line with a caret outside double quotes asks',{skip:!WINDOWS},async()=>{
  const allowed:string[]=[];
  for(const [command,root] of CARET)for(const rules of verbRules(command))if(await decide(command,rules,root)==='allow')allowed.push(`${rules.join(',')||'none'}: ${command}`);
  assert.deepEqual(allowed,[],`allowed without a card:\n${allowed.join('\n')}`);
  const asked:string[]=[];
  for(const command of CARET_STAYS_FREE)for(const rules of verbRules(command))if(await decide(command,rules)!=='allow')asked.push(`${rules.join(',')||'none'}: ${command}`);
  assert.deepEqual(asked,[],`asks now:\n${asked.join('\n')}`);
});

/* (d), the other way round (judge v2537): [rule, command] — each asks, whether the rule names the option or less */
const NAMES_THE_OPTION:[string,string][]=[
  ['Bash(git log --output:*)','git log --output o.txt'],['Bash(git log --output:*)','git log --output o.txt --oneline'],
  ['Bash(git show --ext-diff:*)','git show --ext-diff HEAD'],['Bash(git grep -O:*)','git grep -O calc x'],
  ['Bash(git log --show-signature:*)','git log --show-signature'],['Bash(rg --pre:*)','rg --pre calc x'],
  ['Bash(rg --pre:*)','rg --pre calc x ../fuori'],// the read outside the project that obeying the rule let through
];
const NAMES_LESS:[string,string][]=[
  ['Bash(git log:*)','git log --output o.txt'],['Bash(git:*)','git show --ext-diff HEAD'],['Bash(git -C . log:*)','git -C . log --output o.txt'],
  ['Bash(git log --oneline:*)','git log --oneline --output o.txt'],['Bash(rg:*)','rg --pre calc x'],
  /* the reviewer's forms: rule words cmd reads otherwise (a single quote, a caret), and a line cmd splits otherwise */
  ...(WINDOWS?[["Bash(cat \"a'b\":*)","cat \"a'b\" '../x'"],['Bash(findstr /^f:x:*)','findstr /^f:x y'],
    ["Bash(git log --output:*)","git log --output o.txt '..\\x y'"]] as [string,string][]:[]),
];

test('git cure round 2 (d) taken out: a rule naming the option that writes or runs, or naming less, does not lift the card',async()=>{
  const allowed:string[]=[];
  for(const [rule,command] of [...NAMES_THE_OPTION,...NAMES_LESS])if(await decide(command,[rule])==='allow')allowed.push(`${rule}: ${command}`);
  assert.deepEqual(allowed,[],`allowed without a card:\n${allowed.join('\n')}`);
});

/* (e) stays free with no rule and the subcommand's rule; the prefixes that are not an exact option still ask */
const EXACT_TEXT=['git show --text','git diff --text','git log -p --text --format=%h','git grep --text x'];
const STILL_PREFIX=['git show --textc','git log --tex -p','git show --textconv HEAD','git diff --te'];

test('git cure round 2 (e): --text is an exact option, not a prefix of --textconv',async()=>{
  const asked:string[]=[];
  for(const command of EXACT_TEXT)for(const rules of RULE_SETS(command))if(await decide(command,rules)!=='allow')asked.push(`${rules.join(',')||'none'}: ${command}`);
  assert.deepEqual(asked,[],`asks now:\n${asked.join('\n')}`);
  const allowed:string[]=[];
  for(const command of STILL_PREFIX)for(const rules of RULE_SETS(command))if(await decide(command,rules)==='allow')allowed.push(`${rules.join(',')||'none'}: ${command}`);
  assert.deepEqual(allowed,[],`allowed without a card:\n${allowed.join('\n')}`);
});
