/*
 * A5i, CLI 0.6.17 (19/11/2026). In acceptEdits a filesystem command (cp, mv, rm, rmdir, mkdir, touch) goes without asking ONLY
 * when every operand, after what the shell would expand, lands inside the project, and never where Write/Edit stop.
 * Measured on 0.6.16 (f45c1dbed, engine only, nothing executed): `rm -rf ~/x`, `mv x ~/x`, `cp a ~/.claude/settings.json`,
 * `$HOME`, `${HOME}`, `%USERPROFILE%` and globs went alone (the CLI read `~/x` as a folder INSIDE the project, the shell sends it
 * to the person's home); cp/mv/rm/mkdir/touch/rmdir went alone into `.github`, `.vscode`, `.idea`, `.husky`, where Write asks;
 * `cp x --target-directory=.github` went alone; and `mkdir a<line break>node evil.js` went alone, a second command after a line
 * break (measured with two harmless mkdir in a temp folder: bash and PowerShell run the second one; cmd.exe stops at LF).
 * Sources: GNU Bash manual «Tilde Expansion»; Claude Code permission-modes docs (acceptEdits: filesystem commands inside the
 * working directory only); Hermes tools/approval_detection.py:20 (`~`, `$home`, `${home}` are the home); Codex
 * utils/absolute-path/src/lib.rs:28-36 (`~` is the home, never the base folder).
 * These tests NEVER run a command: the text goes to the recognizer and to the engine only.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,realpathSync,rmdirSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test,{after} from 'node:test';
import {acceptEditsFilesystemCommand,createPermissionEngine} from '../../src/security/permission-engine.ts';
import {controlPathCheckLoaded} from '../../src/security/control-path.ts';
import {cmdReadsDifferently,cmdUnreadableFileCommand} from '../../src/security/cmd-reading.ts';
import {compileRuleSet,evaluateRules} from '../../src/security/evaluate.ts';
import {segmentShellCommand} from '../../src/security/shell-segmentation.ts';

/* 23/11/2026 (first public CI run): the real path, so a Windows short TEMP (RUNNER~1) puts no «~» into the commands */
const base=realpathSync.native(mkdtempSync(path.join(tmpdir(),'talos-a5i-')));
const root=path.join(base,'project');mkdirSync(root);
const outside=path.join(base,'outside');mkdirSync(outside);
mkdirSync(path.join(root,'.github'));
const kind=process.platform==='win32'?'junction':'dir';
mkdirSync(path.join(root,'docs-real'));
/* a Claude Code worktree folder: there `skills` is a control folder at ITS root (path-policy.mjs cartelleAllaRadice + the copy rule) */
mkdirSync(path.join(root,'.claude','worktrees','w1'),{recursive:true});
const links=[path.join(root,'out-link'),path.join(root,'gh-link'),path.join(root,'root-link'),path.join(root,'.idea'),path.join(root,'loop-a'),path.join(base,'loop-b')];
symlinkSync(outside,links[0]!,kind);symlinkSync(path.join(root,'.github'),links[1]!,kind);symlinkSync(root,links[2]!,kind);
/* a protected NAME whose real place is an ordinary folder: Write asks by the name, so the command does too */
symlinkSync(path.join(root,'docs-real'),links[3]!,kind);
/* a loop of links: the real path cannot be resolved */
symlinkSync(links[5]!,links[4]!,kind);symlinkSync(links[4]!,links[5]!,kind);
/* the links go first, never followed: unlink (a junction on Windows) or rmdir, nothing recursive */
after(()=>{for(const l of links){try{unlinkSync(l);}catch{try{rmdirSync(l);}catch{}}}});

const engine=createPermissionEngine({projectRoot:root,rules:{allow:[],ask:[],deny:[]}});
const decide=(command:string,opts:{interactive?:boolean;sessionId?:string;mode?:any}={})=>engine.decide({tool:'Bash',command},{interactive:opts.interactive??true,mode:opts.mode??'acceptEdits',...(opts.sessionId?{sessionId:opts.sessionId}:{})}).then(d=>d.kind);
async function asks(command:string){
  assert.equal(acceptEditsFilesystemCommand(command,root),false,`recognizer: ${JSON.stringify(command)}`);
  for(const sessionId of ['root-session','child-session'])assert.equal(await decide(command,{sessionId}),'ask',`root and child: ${JSON.stringify(command)}`);
  assert.equal(await decide(command,{interactive:false}),'deny',`-p: ${JSON.stringify(command)}`);
}
const shape=(verb:string,target:string)=>verb==='cp'||verb==='mv'?`${verb} a.txt ${target}`:verb==='rm'?`rm -rf ${target}`:`${verb} ${target}`;
const VERBS=['cp','mv','rm','mkdir','touch','rmdir'];

test('(2) the home and variables: every verb asks for ~, ~/…, $HOME, ${HOME}, %USERPROFILE% and the other tilde forms',async()=>{
  for(const verb of VERBS)for(const target of ['~','~/qualcosa','~/.claude/settings.json','$HOME/x','${HOME}/x','%USERPROFILE%/x','~+/x','~root/x','x/$SUB'])
    await asks(shape(verb,target));
  await asks('cp a.txt ~/.claude/settings.json');
  await asks('rm -rf ~/qualcosa');
  await asks('mv x ~/qualcosa');
  await asks('touch "~/x"');
});

test('(2) substitutions and globs ask: backtick, $(…), *, ?, […], {…}, the cmd caret',async()=>{
  for(const command of ['rm *.log','rm a?.txt','rm [ab].txt','cp {a,b}.txt dist','cp a.txt .gi^thub/f'])await asks(command);
  /* a substitution the engine already refused in 0.6.16 (measured: deny, a command it cannot split); the recognizer says no too */
  for(const command of ['cp a.txt `pwd`/x','cp a.txt $(pwd)/x']){
    assert.equal(acceptEditsFilesystemCommand(command,root),false,command);
    assert.equal(await decide(command),'deny',command);
  }
});

test('(2) a path TALOS cannot read the way the shell does asks: drive-relative, a quoted backslash, any backslash outside Windows',async()=>{
  await asks('cp a.txt C:evil.txt');
  await asks('cp a.txt "C:\\Users\\someone\\.bashrc"');
  await asks('cp a.txt ".gi\\thub/f"');
  /* the recognizer would read `sub....outside.txt` inside; cmd reads `sub\..\..\outside.txt`, outside the project */
  await asks('cp a.txt "sub\\..\\..\\outside.txt"');
  await asks("mkdir 'sub\\..\\..\\outside'");
  if(process.platform!=='win32')await asks('cp a.txt .gi\\thub/f');
});

test('(2) through a link: an operand whose real path is outside, or in a protected folder, asks (as Write does)',async()=>{
  await asks('cp a.txt out-link/f');
  await asks('mkdir out-link/new');
  await asks('cp a.txt gh-link/f');
  /* `rm -rf root-link/` follows the link: the whole project, which acceptEdits never deletes alone */
  await asks('rm -rf root-link/');
  await asks('cp a.txt .idea/workspace.xml');
  await asks('cp a.txt loop-a/f');
});

test('(3) parity with Write/Edit on the six protected folders, for every verb, in any capitals or with a trailing dot',async()=>{
  for(const dir of ['.git','.talos-cli','.github','.vscode','.idea','.husky']){
    assert.equal((await engine.decide({tool:'Write',resource:`${dir}/f`},{interactive:true,mode:'acceptEdits'})).kind,'ask',`Write ${dir}`);
    for(const verb of VERBS){await asks(shape(verb,`${dir}/f`));await asks(shape(verb,dir));}
  }
  await asks('cp a.txt .GitHub/workflows/x.yml');
  /* a folder that does not exist yet: no real path to fix the capitals, the name alone must be read */
  await asks('cp a.txt .VSCode/settings.json');
  await asks('cp a.txt .github./workflows/x.yml');
  await asks('cp a.txt ".husky /pre-commit"');
});

test('(4) options that carry a destination ask: --target-directory=…, -t, an option after an operand',async()=>{
  for(const command of ['cp x --target-directory=.github','cp --target-directory=dist x','cp -t dist x','mv -t ~ x','cp a.txt b.txt -t /etc','mv a.txt --target-directory=out'])await asks(command);
});

test('(5) a line break, carriage return or any line character never goes alone: it asks',async()=>{
  for(const br of ['\n','\r\n','\r','\u000b','\u000c','\u0085','\u2028','\u2029']){
    await asks(`mkdir a${br}node evil.js`);
    await asks(`mkdir a${br}mkdir b`);
  }
});

test('noise: 20 everyday commands inside the project still go alone in acceptEdits, at the root and in a child',async()=>{
  const abs=(p:string)=>path.join(root,p);
  const everyday=['mkdir build-out','mkdir -p src/components/ui','touch src/index.ts','touch -c README.md','cp src/a.ts src/b.ts','cp -r src/lib dist/lib',
    'mv old.txt new.txt','mv -f src/x.ts src/y.ts','rm build/out.js','rm -rf dist','rm -f tmp.log','rmdir empty-dir','rmdir -p a/b/c',
    `cp ${abs('a.txt')} ${abs('b.txt')}`,`mkdir ${abs('out')}`,'mv ./a.md ./docs/a.md','cp -p package.json package.backup.json','rm -r coverage',
    'touch .gitignore','mkdir "my folder"'];
  assert.equal(everyday.length,20);
  for(const command of everyday){
    assert.equal(acceptEditsFilesystemCommand(command,root),true,command);
    for(const sessionId of ['root-session','child-session'])assert.equal(await decide(command,{sessionId}),'allow',command);
  }
});

test('the other modes decide as before on the same commands: default asks, -p and dontAsk refuse, plan refuses, Full access goes',async()=>{
  for(const command of ['mkdir build-out','rm -rf ~/qualcosa','cp x .github/f','mkdir a\nnode evil.js']){
    assert.equal(await decide(command,{mode:'default'}),'ask',command);
    assert.equal(await decide(command,{mode:'default',interactive:false}),'deny',command);
    assert.equal(await decide(command,{mode:'dontAsk'}),'deny',command);
    assert.equal(await decide(command,{mode:'plan'}),'deny',command);
    assert.equal(await decide(command,{mode:'bypassPermissions'}),'allow',command);
  }
});

/* Point (1), commands only (owner 19/11/2026 «Solo la protezione», giudice): in acceptEdits a file command toward a TALOS control file
   asks, judged by the KERNEL's own rule (harness-ui/src/path-policy.mjs ePercorsoDiControllo, loaded by src/security/control-path.ts,
   the 0.7.0 file), never by a list copied into the CLI. Measured on 1a5dcec0c (engine): `cp x CLAUDE.md`, `cp x .talos/hooks.json`,
   `cp x .claude/settings.json` went by themselves in acceptEdits. Full access keeps its own rule for shell commands, as on the PC. */
test('(1) a file command toward a control file asks in acceptEdits, by the kernel\'s rule; -p refuses it; Full access keeps its rule',async()=>{
  assert.equal(controlPathCheckLoaded(),true,'the kernel\'s rule is loaded, so the answers below are its own');
  const commands=['cp x.txt CLAUDE.md','mv x.txt AGENTS.md','touch CLAUDE.md','rm CLAUDE.md','cp x.txt .talos/hooks.json','mkdir .talos','mkdir -p .talos/skills/new',
    'cp x.txt .claude/settings.json','cp x.txt .claude','rmdir .claude/agents','cp x.txt .harness-ui-hooks.json','cp x.txt .harness-ui-mcp.json','cp -r cfg skills','touch skills/a.md',
    'cp x.txt sub/.talos/hooks.json','cp x.txt AGENTS.md.',
    /* a copy INTO a folder writes the source's name there: a trailing slash, two sources, a folder on disk, a control folder copied */
    'cp CLAUDE.md docs/','cp CLAUDE.md AGENTS.md docs','cp CLAUDE.md docs-real','cp -r .talos backup/',
    /* mv and rm touch their source too */
    'mv CLAUDE.md old.md','rm -f .claude/settings.json',
    /* every operand of rm and touch, not only the last */
    'rm CLAUDE.md notes.md','touch .talos/x.json a.txt'];
  for(const command of commands){
    assert.equal(acceptEditsFilesystemCommand(command,root),true,`the recognizer alone still reads it inside: ${command}`);
    for(const sessionId of ['root-session','child-session'])assert.equal(await decide(command,{sessionId}),'ask',`acceptEdits: ${command}`);
    assert.equal(await decide(command,{interactive:false}),'deny',`-p: ${command}`);
    assert.equal(await decide(command,{mode:'default'}),'ask',`default: ${command}`);
    assert.equal(await decide(command,{mode:'dontAsk'}),'deny',`dontAsk: ${command}`);
    assert.equal(await decide(command,{mode:'bypassPermissions'}),'allow',`Full access: ${command}`);
  }
  /* near names that are not control files still go, and so does a copy that only READS a control file into a new file */
  for(const command of ['cp x.txt CLAUDE.txt','mkdir talos','touch docs/claude.md.bak','cp x.txt src/skills.ts','cp CLAUDE.md backup.md','cp .talos/hooks.json notes/hooks-copy.json'])
    assert.equal(await decide(command),'allow',command);
});

test('(1) when the kernel\'s rule cannot be loaded, or the command cannot be read, a file command asks (fail closed)',async()=>{
  const {acceptEditsWritesControlFile}=await import('../../src/security/permission-engine.ts');
  assert.equal(acceptEditsWritesControlFile('cp a.txt b.txt',root),false,'with the kernel\'s rule an ordinary copy writes no control file');
  assert.equal(acceptEditsWritesControlFile('cp a.txt b.txt',root,null),true,'without the rule it may: ask');
  assert.equal(acceptEditsWritesControlFile('mkdir build-out',root,null),true);
  assert.equal(acceptEditsWritesControlFile('cp a.txt b.txt',root,()=>{throw new Error('broken rule');}),true,'a rule that throws: ask');
  assert.equal(acceptEditsWritesControlFile('npm test',root),true,'not a file command it can read: ask');
});

/* Small round before the reviewer (giudice, «preparation», read on 4f0e42133): a folder prepared elsewhere and then MOVED or copied
   into place under a control name. `skills` is a control folder only at a root (the project's or a Claude Code worktree's). */
test('(1) preparation: a folder moved or copied into place under a control name asks; a source ending in . or .. asks',async()=>{
  const asksHere=async(command:string)=>{
    for(const sessionId of ['root-session','child-session'])assert.equal(await decide(command,{sessionId}),'ask',`acceptEdits: ${command}`);
    assert.equal(await decide(command,{interactive:false}),'deny',`-p: ${command}`);
  };
  /* the giudice's three and their obvious kin: the project root as destination already asks (acceptEditsFilesystemCommand, abs===root) */
  for(const command of ['mv tmp/skills .','mv tmp/skills ./','cp -r tmp/a/. .','mv tmp/CLAUDE.md .','mv tmp/.talos .','mv -t . tmp/skills','cp -t . tmp/skills'])
    await asksHere(command);
  /* already asking on 4f0e42133 (measured): the worktree's own folder is a control path for the kernel; kept as guards for mv into a
     folder, now judged like cp (the destination and each source's name inside it) */
  for(const command of ['mv tmp/skills .claude/worktrees/w1','mv tmp/skills .claude/worktrees/w1/','mv tmp/a tmp/skills .claude/worktrees/w1'])
    await asksHere(command);
  /* red on 4f0e42133: a source ending in . or .. brings a folder's content, whose names the command does not show */
  for(const command of ['cp -r tmp/a/. docs','cp -r tmp/a/./ docs','cp -r tmp/a/.. docs','mv tmp/a/. docs'])
    await asksHere(command);
  /* still alone: an ordinary move into an ordinary folder, and `skills` below the root */
  for(const command of ['mv tmp/notes.md docs-real','mv tmp/notes.md docs-real/','mv tmp/skills docs-real'])
    assert.equal(await decide(command),'allow',command);
});

/* The cmd cure (reviewer of A5i R1-R5, RAPPORTO-REVISORE-CLI-0617; giudice 19/11/2026 with four additions). On Windows every command
   runs as `cmd /d /s /c "<command>"` (brokered-executor.ts:361-362), and cmd reads a line its own way: only `"` quotes, `\"` is a real
   quote, its built-in commands split on `, ; =`, `!VAR!` expands. Measured by the reviewer with harmless mkdir in a fake profile:
   `mkdir 'x&mkdir second'` runs the second mkdir, `mkdir x,..\escaped-comma` makes a folder outside. All of it was already so in
   0.6.16. These tests run nothing: the text goes to the recognizer, to the rules and to the engine. */
const R1=["mkdir 'x&mkdir y&'","mkdir 'x&cd ..&mkdir escaped&'","touch 'a&echo pwned>CLAUDE.md&'","mkdir 'x|mkdir y'"];
const R1B=["rmdir 'a .git /s /q '","rmdir 'a .claude /s /q '","mkdir 'a .talos '","rmdir 'a .github '"];
const R2=['rmdir x,.git,/s,/q','rmdir x,.claude,/s,/q','mkdir x,.talos','rmdir x,..\\sibling,/s,/q','mkdir x,..\\..\\escaped','mkdir x=..\\escaped','mkdir x;..\\escaped'];
/* (a) giudice: a backslash before a double quote, for every command, not only file commands */
const QUOTE_ESCAPE=['mkdir "a\\" & mkdir y & \\""','git log "a\\" & mkdir y & \\""','touch "x\\" y"'];
/* (b) giudice: `, ; =` and any single quote for every cmd built-in, by any spelling of its name, and behind `&&` or `@` */
const BUILTINS=['md x,y','rd x;y','del a,b','erase a=b','copy a.txt,..\\x.txt b','move a,b c','ren a=b c','rename a,b c','type a,b',"del 'x'","MD 'x'",
  'cd sub && mkdir a,b','@mkdir a,b','mkdir,x','rd x\\;y','mkdir.exe a,b'];
const R3=['rm -rf !USERPROFILE!/Documents/x','mkdir !TEMP!/x'];
/* R7 and their kin: what models write every day on Windows stays readable */
const CMD_NOISE=['mkdir src\\components','rmdir build\\tmp','mkdir "my folder"','git log --format="%h %s"','echo 50%','git commit -m "fix type, move on"',
  'npm run build -- --env=prod','git log "a & b"'];

test('cmd: the reviewer\'s R1, R1b, R2, R3 and the giudice\'s (a) and (b) are not readable for cmd, on every system (text only)',()=>{
  for(const command of [...R1,...R1B,...R2,...QUOTE_ESCAPE,...BUILTINS,...R3]){
    assert.equal(cmdReadsDifferently(command,true),true,`cmd reads it differently: ${command}`);
    assert.equal(cmdUnreadableFileCommand(command,true),true,`not a readable file command: ${command}`);
    assert.equal(acceptEditsFilesystemCommand(command,root,true),false,`accept edits never says yes alone: ${command}`);
  }
  /* rm is no cmd built-in and `;` is no operator for cmd (fourth round, G1: no built-in heads a piece of this line), so the rules read
     it as cmd does; the single quotes stay in rm's arguments, so accept edits still asks */
  assert.equal(cmdUnreadableFileCommand("rm 'a;mkdir b'",true),true);
  assert.equal(cmdReadsDifferently("rm 'a;mkdir b'",true),false);
  assert.equal(cmdReadsDifferently("rm 'a b'",true),false,'a quoted name with no built-in head and no operator: no rule is lifted');
  /* `^'` is an escaped quote for both readers: the `&` after it is live for both, so the recognizer splits there as cmd does */
  assert.equal(cmdReadsDifferently("git log a^'b&c",true),false);
  assert.equal(cmdUnreadableFileCommand('mkdir a!b',true),true,'any ! in a file command');
  assert.equal(cmdUnreadableFileCommand("touch 'a b'",true),true,'any single quote in a file command, built-in or not');
  /* %NAME% expands for cmd even inside double quotes; a lone % and a blank in between do not make a name */
  for(const command of ['git log "%USERPROFILE%"','git log %PATH:~0,5%'])assert.equal(cmdReadsDifferently(command,true,['USERPROFILE','Path']),true,command);
  assert.equal(cmdReadsDifferently('git log --format=%h%n',true,['USERPROFILE','Path']),false,'G2: `h` holds no value');
  /* the shell is not cmd: a quoted folder name is read as the shell reads it */
  assert.equal(acceptEditsFilesystemCommand("mkdir 'my folder'",root,false),true);
  assert.equal(cmdUnreadableFileCommand("mkdir 'my folder'",true),true,'cmd makes two folders, the recognizer one');
  /* R3: `!` asks on every system, as `$` and `%` already did */
  for(const command of R3)assert.equal(acceptEditsFilesystemCommand(command,root,false),false,command);
  /* a backslash the recognizer takes as an escape in front of an operator is no escape for cmd */
  for(const command of ['git log a\\&calc',"git log 'a\\'&calc'","git log '\"' \"&calc\""])assert.equal(cmdReadsDifferently(command,true),true,command);
  for(const command of CMD_NOISE){
    assert.equal(cmdReadsDifferently(command,true),false,`still readable: ${command}`);
    assert.equal(cmdUnreadableFileCommand(command,true),false,`still readable: ${command}`);
  }
});

test('cmd, (d): with a shell that is not cmd nothing changes, and on Windows the 20 everyday and the 10 mv/cp get no new card',()=>{
  const abs=(p:string)=>path.join(root,p);
  const everyday=['mkdir build-out','mkdir -p src/components/ui','touch src/index.ts','touch -c README.md','cp src/a.ts src/b.ts','cp -r src/lib dist/lib',
    'mv old.txt new.txt','mv -f src/x.ts src/y.ts','rm build/out.js','rm -rf dist','rm -f tmp.log','rmdir empty-dir','rmdir -p a/b/c',
    `cp ${abs('a.txt')} ${abs('b.txt')}`,`mkdir ${abs('out')}`,'mv ./a.md ./docs/a.md','cp -p package.json package.backup.json','rm -r coverage',
    'touch .gitignore','mkdir "my folder"'];
  const moves=['mv notes.md docs/','mv notes.md docs','mv src/old-name src/new-name','mv a.ts b.ts src/','cp -r src/lib src/lib-copy','cp -r assets docs/',
    'mv build/out.js dist/out.js','cp -r templates/base templates/new','mv README.old.md docs/README.md','cp -r fixtures test/'];
  assert.equal(everyday.length+moves.length,30);
  for(const command of [...everyday,...moves,...R1,...R1B,...R2,...QUOTE_ESCAPE,...BUILTINS,...CMD_NOISE]){
    assert.equal(cmdReadsDifferently(command,false),false,`not cmd: ${command}`);
    assert.equal(cmdUnreadableFileCommand(command,false),false,`not cmd: ${command}`);
  }
  /* card by card: the cure adds a card where the answer with cmd differs from the answer without it */
  const newCards=[...everyday,...moves].filter(command=>acceptEditsFilesystemCommand(command,root,true)!==acceptEditsFilesystemCommand(command,root,false));
  assert.deepEqual(newCards,[],'no new card on the 30');
  for(const command of [...everyday,...moves])assert.equal(acceptEditsFilesystemCommand(command,root,false),true,command);
});

const judged=(allow:string[],command:string,shellIsCmd:boolean)=>evaluateRules(compileRuleSet({allow,ask:[],deny:[]}).rules,{tool:'Bash',command},{projectRoot:root,shellIsCmd});

test('cmd, R4: an allow rule never covers a command cmd reads differently; it asks WITHOUT a rule (text only, every system)',()=>{
  for(const [rule,command] of [['Bash(mkdir:*)',"mkdir 'x&mkdir y&'"],['Bash(rmdir:*)',"rmdir 'a .git /s /q '"],['Bash(mkdir:*)','mkdir x,..\\..\\escaped'],
    ['Bash(git log:*)','git log "a\\" & mkdir y & \\""'],['Bash(git log:*)',"git log 'a&mkdir y'"],['Bash(mkdir:*)','mkdir !TEMP!/x']] as const){
    const decision=judged([rule],command,true);
    assert.equal(decision.effect,'ask',`${rule} on ${command}`);
    /* a read-only verb's rule may already ask by itself, naming the rule (verbOnlyAllowDowngrade); the others ask by the cure alone */
    if(!command.startsWith('git '))assert.equal(decision.rule,undefined,`rule-less, so Full access still runs it: ${command}`);
  }
  /* the same rule and command where the shell is not cmd: as before, the rule covers it */
  assert.equal(judged(['Bash(mkdir:*)'],"mkdir 'x&mkdir y&'",false).effect,'allow');
  /* readable commands keep their rule on cmd too */
  for(const [rule,command] of [['Bash(mkdir:*)','mkdir build-out'],['Bash(git log:*)','git log --format="%h %s"'],['Bash(mkdir:*)','mkdir "my folder"']] as const)
    assert.equal(judged([rule],command,true).effect,'allow',command);
});

/* Third round (reviewer's recheck of c5ea0ee9a; owner and giudice v2304): `dir` and `mklink` are cmd built-ins too. Read on c5ea0ee9a:
   `dir x,..\..\outside` went by the built-in allowance for read-only commands (evaluate.ts), in default, dontAsk and -p, listing names
   outside the project if cmd splits on `,` as for its other built-ins (Microsoft's cmd page lists `,` and `=` among the delimiters;
   deduced, not run). Text only. */
const DIR_MKLINK=['dir x,..\\..\\outside','dir x=..\\..\\outside','dir "x",..\\..\\outside','dir x;..\\..\\outside',"dir 'x y'",
  'mklink a,..\\..\\outside b','mklink a=b c',"mklink 'a b' c",'cd src && dir x,..\\..\\outside','@dir x,..'];
test('cmd, third round: dir and mklink are cmd built-ins; `, ; =` and a single quote ask, plain dir still goes',async()=>{
  for(const command of DIR_MKLINK){
    assert.equal(cmdReadsDifferently(command,true),true,`cmd reads it differently: ${command}`);
    assert.equal(cmdReadsDifferently(command,false),false,`not cmd: ${command}`);
  }
  /* no rule: the built-in allowance of read-only commands no longer covers it; with a rule of the verb, neither does the rule */
  for(const command of ['dir x,..\\..\\outside','dir x=..\\..\\outside','dir "x",..\\..\\outside'])
    assert.notEqual(judged([],command,true).effect,'allow',`allowance: ${command}`);
  assert.equal(judged(['Bash(mklink:*)'],'mklink a,..\\..\\outside b',true).effect,'ask','rule: mklink');
  /* the same text when the shell is not cmd: the allowance answers as before */
  assert.equal(judged([],'dir x,..\\..\\outside',false).effect,'allow');
  for(const command of ['dir','dir /b','dir src','dir "my folder"','dir ..'])
    assert.equal(cmdReadsDifferently(command,true),false,`plain dir stays readable: ${command}`);
  if(process.platform==='win32'){
    const plainEngine=createPermissionEngine({projectRoot:root,rules:{allow:[],ask:[],deny:[]}});
    const by=(command:string,mode:any,interactive=true)=>plainEngine.decide({tool:'Bash',command},{interactive,mode}).then(d=>d.kind);
    for(const command of ['dir x,..\\..\\outside','dir x=..\\..\\outside','dir "x",..\\..\\outside']){
      assert.equal(await by(command,'default'),'ask',`default: ${command}`);
      assert.equal(await by(command,'dontAsk'),'deny',`dontAsk: ${command}`);
      assert.equal(await by(command,'default',false),'deny',`-p: ${command}`);
    }
    for(const command of ['dir','dir /b','dir src','dir "my folder"'])assert.equal(await by(command,'default'),'allow',`plain dir: ${command}`);
  }
});

/* Fourth round (bugfixer of 0.6.17, findings 1 and 2; owner 19/11 «Sì, li curiamo»; giudice v2309). G1: `, ; =` and a single quote count
   only in the PIECE a cmd built-in heads, cut where cmd cuts (`& && | ||`, line breaks; not inside double quotes, not after `^`).
   G2: `%NAME%` counts only when NAME can hold a value (the child's environment, cmd's dynamic names, the executor's additions).
   Measured 19/11 with echo only, a fake environment, `cmd /d /s /c`: `[%h%x09%s]` stays text; `[%h%TALOS_PROVA_G2%s]` prints
   `[%hVALOREs]`. Text only here: nothing runs. */
const BUGFIXER_SEVEN=['npm test -- --reporter=dot && dir','npm run build -- --mode=production && dir dist','npx vitest run --reporter=verbose & type log.txt',
  'cd src && dir && npm test -- --watch=false','node build.js --mode=prod && copy dist\\out.js docs\\out.js','git commit -m "fix; move files" --author="A <a@b.c>"',
  'type package.json | findstr version='];
const SEVEN_RULES=['Bash(npm:*)','Bash(npx:*)','Bash(dir:*)','Bash(type:*)','Bash(cd:*)','Bash(node:*)','Bash(copy:*)','Bash(git commit:*)'];
test('cmd, fourth round G1: a separator outside a built-in\'s piece is read as cmd reads it; the reviewer\'s forms still ask',async()=>{
  for(const command of BUGFIXER_SEVEN){
    assert.equal(cmdReadsDifferently(command,true,[]),false,`readable for cmd: ${command}`);
    assert.equal(judged(SEVEN_RULES,command,true).effect,'allow',`the rules cover it again, as in 0.6.16: ${command}`);
  }
  assert.equal(judged([],'type package.json | findstr version=',true).effect,'allow','the read-only allowance covers it again');
  /* still read differently: a separator or a quote in a built-in's piece, a head that runs another command or cannot be read */
  for(const command of [...R1,...R1B,...R2,'npm test && dir x,..\\..\\outside','npm run x -- --a=b & mkdir a,b','echo x | md a;b',"npm test & del 'x y'",
    'if exist x mkdir a,b','call mkdir a,b','cmd /c mkdir a,b','start mkdir a,b',',mkdir a,b','=mkdir a,b','m^kdir a,b','"mkdir" a,b','npm test & @md a,b',
    'echo "a & b" && mkdir x,y','npm x\nmkdir a,b','npm x\rmkdir a,b',"if exist x del 'a b'","echo 'x\nmkdir a,b\ny'"])
    assert.equal(cmdReadsDifferently(command,true,[]),true,`read differently: ${command}`);
  /* not a cut for cmd: `^&` and `&` inside double quotes keep the built-in's piece whole */
  for(const command of ['mkdir a ^& npm x=y','mkdir "a & b" x=y'])assert.equal(cmdReadsDifferently(command,true,[]),true,command);
  /* an external program named with a path is no built-in */
  assert.equal(cmdReadsDifferently('"C:\\tools\\mkdir.exe" a,b',true,[]),false);
  if(process.platform==='win32'){
    const ruled=createPermissionEngine({projectRoot:root,rules:{allow:[...SEVEN_RULES],ask:[],deny:[]}});
    for(const command of BUGFIXER_SEVEN.slice(0,6))for(const [mode,interactive] of [['default',true],['dontAsk',true],['default',false]] as const)
      assert.equal((await ruled.decide({tool:'Bash',command},{interactive,mode})).kind,'allow',`${mode}${interactive?'':' -p'}: ${command}`);
    /* `rm 'a;mkdir b'`, in every mode: no rule ⇒ default asks, accept edits asks (any quote), dontAsk/-p/plan refuse, Full access runs;
       with Bash(rm:*) the rule covers it (cmd gives rm the names `'a;mkdir` and `b'`, both inside; the quote-around-a-blank reading is
       on the 0.6.18 list) */
    const rm="rm 'a;mkdir b'";
    assert.equal(await decide(rm,{mode:'default'}),'ask');assert.equal(await decide(rm),'ask','accept edits');
    assert.equal(await decide(rm,{mode:'dontAsk'}),'deny');assert.equal(await decide(rm,{mode:'default',interactive:false}),'deny');
    assert.equal(await decide(rm,{mode:'plan'}),'deny');assert.equal(await decide(rm,{mode:'bypassPermissions'}),'allow');
    const rmRuled=createPermissionEngine({projectRoot:root,rules:{allow:['Bash(rm:*)'],ask:[],deny:[]}});
    assert.equal((await rmRuled.decide({tool:'Bash',command:rm},{interactive:true,mode:'default'})).kind,'allow');
  }
});

test('cmd, fourth round G2: %NAME% counts only when NAME can hold a value; where cmd reads the percents again, every one counts',async()=>{
  const none:string[]=[];
  /* the bugfixer's: undefined names stay text, so the line is read as TALOS reads it (and an «always» for it holds) */
  for(const command of ['git log --format="%h%x09%s"','git log --format=%h%n','git log --date=format:%Y-%m-%d','echo 50%','git log --format="%h %s"'])
    assert.equal(cmdReadsDifferently(command,true,none),false,command);
  /* the bugfixer's (B), bug-0617-rumore.test.ts: «allow always», then the identical command goes (this process has no `h` nor `x09`).
     0.7.0 block 1, item 7: `git log --format="%h%x09%s"` itself no longer asks (git-log-format-template.test.ts); with `--author=`,
     outside the plain options, the template is judged as before, so it asks and the «always» is proved on it */
  {
    const always=createPermissionEngine({projectRoot:root,rules:{allow:[],ask:[],deny:[]},persistRule:async()=>{}});
    assert.equal((await always.decide({tool:'Bash',command:'git log --format="%h%x09%s"'},{interactive:true,mode:'default'})).kind,'allow','item 7');
    const command='git log --author=x --format="%h%x09%s"';
    const first=await always.decide({tool:'Bash',command},{interactive:true,mode:'default'});assert.equal(first.kind,'ask');
    await always.resolve((first as {requestId:string}).requestId,'allow-always');
    assert.equal((await always.decide({tool:'Bash',command},{interactive:true,mode:'default'})).kind,'allow','asked again after «always»');
  }
  /* names that hold a value: the environment (any capitals), the overlapping stretch, the modifier after `:` */
  assert.equal(cmdReadsDifferently('git log --format="%h%x09%s"',true,['X09']),true,'x09 defined');
  assert.equal(cmdReadsDifferently('git log %h%TALOS_PROVA_G2%s',true,['talos_prova_g2']),true,'the stretch after an undefined %h% (measured)');
  assert.equal(cmdReadsDifferently('git log %Path:~0,3%',true,['PATH']),true);
  assert.equal(cmdReadsDifferently('git log %UserProfile%',true,['USERPROFILE']),true);
  /* by default the names of this process's environment, compared without capitals (PATH exists on every system; Windows calls it Path) */
  assert.equal(cmdReadsDifferently('git log %path%',true),true,'this process has PATH');
  /* cmd's dynamic names and the executor's additions, with an empty environment; (f) `=` names, __CD__, __APPDIR__ */
  for(const name of ['cd','DATE','time','RANDOM','errorlevel','CMDEXTVERSION','cmdcmdline','HIGHESTNUMANODENUMBER','__CD__','__APPDIR__','=C:','=ExitCode',
    'NODE_OPTIONS','GIT_CONFIG_COUNT','git_config_key_0','GIT_CONFIG_VALUE_12'])
    assert.equal(cmdReadsDifferently(`git log %${name}%`,true,none),true,name);
  assert.equal(cmdReadsDifferently('git log %%',true,none),true,'an empty name: in doubt');
  /* (e) giudice: a head that sets or re-reads the percents (set, setlocal, call, cmd, start, for, if, or unreadable): every %NAME% counts */
  for(const command of ['set X=..\\..\\out & call git log %X%','git log %h% & set A=1','setlocal & git log %h%','git log %h% | call x','cmd /c git log %h%x09%s',
    'start git log %h%','if 1==1 git log %h%','for %i in (a) do git log %h%','git log %h% & ,x','git log %h% & "mkdir','git log %h% & m^kdir'])
    assert.equal(cmdReadsDifferently(command,true,none),true,`(e): ${command}`);
  /* !NAME! is unchanged: it counts even when undefined */
  assert.equal(cmdReadsDifferently('git commit -m "Wow!Great!"',true,none),true);
});

/* Fourth round, closing (reviewer's recheck of 24247353e; giudice v2315). A descriptor redirection (`2>&1`, `>&2`, `2>&-`) is no cut
   for cmd, and the recognizer drops it (shell-segmentation.ts:19,90-99): cutting there made `mkdir a 2>&1 ,..\escaped` a piece headed
   by `1`, so the separator after it no longer counted. A piece that starts with a redirection (`2>&1 mkdir …`, `>&2 …`,
   `2>/dev/null …`) has a head TALOS does not read: the whole line counts. Text only. */
const REDIRECTED=['mkdir a 2>&1 ,..\\escaped','rmdir x 2>&1 ,.git,/s,/q','dir x 2>&1 ,..\\..\\outside','mkdir a >&2 =..\\escaped','md a 2>&- ,..\\escaped',
  '2>&1 mkdir x,..\\escaped','2>&1 rd x,.git,/s,/q','2>/dev/null mkdir x,..\\escaped','>&2 mkdir x,..\\escaped','2>&1 dir x,..\\..\\outside','1>&2 mkdir a,b',
  '<&3 mkdir a,b','md a <&3 ,..\\escaped'];
test('cmd, fourth round closing: a descriptor redirection is no cut, and a piece that starts with a redirection is read as the whole line',async()=>{
  for(const command of REDIRECTED)assert.equal(cmdReadsDifferently(command,true,[]),true,`read differently: ${command}`);
  for(const [rule,command] of [['Bash(mkdir:*)','mkdir a 2>&1 ,..\\escaped'],['Bash(rmdir:*)','rmdir x 2>&1 ,.git,/s,/q'],['Bash(mkdir:*)','mkdir a >&2 =..\\escaped'],
    ['Bash(md:*)','md a 2>&- ,..\\escaped'],['Bash(mkdir:*)','2>&1 mkdir x,..\\escaped'],['Bash(rd:*)','2>&1 rd x,.git,/s,/q'],['Bash(mkdir:*)','2>/dev/null mkdir x,..\\escaped'],
    ['Bash(mkdir:*)','>&2 mkdir x,..\\escaped'],['Bash(mkdir:*)','1>&2 mkdir a,b']] as const)
    assert.notEqual(judged([rule],command,true).effect,'allow',`${rule}: ${command}`);
  for(const command of ['dir x 2>&1 ,..\\..\\outside','2>&1 dir x,..\\..\\outside'])assert.notEqual(judged([],command,true).effect,'allow',`allowance: ${command}`);
  /* the same redirections after an everyday command keep it readable */
  for(const command of ['npm test 2>&1','npm test -- --a=b 2>&1 && dir','git log --format=%h%x09%s 2>&1','node x.js >&2'])
    assert.equal(cmdReadsDifferently(command,true,[]),false,`still readable: ${command}`);
  if(process.platform==='win32'){
    const plainEngine=createPermissionEngine({projectRoot:root,rules:{allow:[],ask:[],deny:[]}});
    for(const command of ['dir x 2>&1 ,..\\..\\outside','2>&1 dir x,..\\..\\outside']){
      assert.equal((await plainEngine.decide({tool:'Bash',command},{interactive:true,mode:'dontAsk'})).kind,'deny',`dontAsk: ${command}`);
      assert.equal((await plainEngine.decide({tool:'Bash',command},{interactive:true,mode:'acceptEdits'})).kind,'ask',`accept edits: ${command}`);
    }
  }
});

test('cmd, (c): outside Windows a line break with an allow rule splits into two commands; the second is judged on its own',()=>{
  /* read on shell-segmentation.ts:107-109: LF, CR and CRLF end a segment, so `Bash(git log:*)` covers `git log` only. A guard, no cure */
  for(const br of ['\n','\r\n','\r']){
    const command=`git log${br}node evil.js`;
    assert.equal(segmentShellCommand(command).length,2,JSON.stringify(command));
    for(const shellIsCmd of [false,true])assert.notEqual(judged(['Bash(git log:*)'],command,shellIsCmd).effect,'allow',JSON.stringify(command));
  }
  assert.equal(judged(['Bash(git log:*)'],'git log',false).effect,'allow');
});

test('cmd, R5: `link/../x` is walked as the shell walks it, climbing from where the link leads (every system)',async()=>{
  /* out-link leads outside, root-link to the project itself: `..` from there is outside the project, though `victim` reads inside */
  for(const command of ['rm -rf out-link/../victim','mkdir out-link/../escaped','cp a.txt out-link/../x.txt','mkdir root-link/../escaped'])await asks(command);
  /* a `..` through ordinary folders, existing or not, still goes alone */
  for(const command of ['mkdir src/../build-out','cp a.txt docs-real/../b.txt']){
    assert.equal(acceptEditsFilesystemCommand(command,root),true,command);
    assert.equal(await decide(command),'allow',command);
  }
});

test('cmd, on Windows through the engine: R1, R1b, R2, (a), (b), R3 ask in accept edits and are refused with -p; the noise still goes',
  {skip:process.platform!=='win32'&&'cmd.exe is the shell only on Windows'},async()=>{
  for(const command of [...R1,...R1B,...R2,...QUOTE_ESCAPE.filter(c=>!c.startsWith('git ')),...BUILTINS.filter(c=>/^(md|rd|del|erase|mkdir|rmdir) /u.test(c)),...R3])await asks(command);
  for(const command of ['mkdir src\\components','rmdir build\\tmp','mkdir "my folder"']){
    assert.equal(acceptEditsFilesystemCommand(command,root),true,command);
    assert.equal(await decide(command),'allow',command);
  }
  /* R4 through the engine: the rules no longer say yes; Full access is unchanged */
  const ruled=createPermissionEngine({projectRoot:root,rules:{allow:['Bash(mkdir:*)','Bash(rmdir:*)'],ask:[],deny:[]}});
  const by=(command:string,mode:any,interactive=true)=>ruled.decide({tool:'Bash',command},{interactive,mode}).then(d=>d.kind);
  for(const command of ["mkdir 'x&mkdir y&'","rmdir 'a .git /s /q '",'mkdir x,..\\escaped']){
    assert.equal(await by(command,'default'),'ask',`default: ${command}`);
    assert.equal(await by(command,'acceptEdits'),'ask',`acceptEdits: ${command}`);
    assert.equal(await by(command,'dontAsk'),'deny',`dontAsk: ${command}`);
    assert.equal(await by(command,'default',false),'deny',`-p: ${command}`);
    assert.equal(await by(command,'bypassPermissions'),'allow',`Full access unchanged: ${command}`);
  }
  assert.equal(await by('mkdir build-out','default'),'allow','a readable mkdir keeps its rule');
});
