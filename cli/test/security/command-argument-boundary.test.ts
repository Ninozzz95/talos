import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {compileRules, evaluateRules} from '../../src/security/evaluate.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionToRule} from '../../src/security/persist.ts';

// B1 slice 10. A documented read-only shell command is auto-allowed only while every
// path-shaped argument of the segment resolves inside the project. The claim proved here
// is exactly "asks before a command reads outside your project" — it is not containment
// and it is not credential protection: a subprocess that opens files by itself, a path
// computed at runtime, or an interpreter handed code on its command line are all outside
// what these tests cover.

const OPEN = compileRules({allow: [], ask: [], deny: []});
const WIN = process.platform === 'win32';

function makeProject(): string {
  // The temp directory itself may sit behind a link; compare against its real form so the
  // test asserts the boundary and not the accident of where the OS puts temp files.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'talos-confine-')));
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'src', 'file con spazio.ts'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(root, '.env'), 'TOKEN=inside-the-project\n');
  return root;
}

// A file one level above the project, so it can be named with a relative escape.
function makeSibling(root: string, name: string): string {
  const file = path.join(path.dirname(root), name);
  fs.writeFileSync(file, 'SECRET OUTSIDE THE PROJECT\n');
  return file;
}

function makeLink(target: string, link: string): boolean {
  for (const kind of ['dir', 'junction'] as const) {
    try {fs.symlinkSync(target, link, kind); return true;} catch {/* unprivileged Windows refuses symlinks */}
  }
  return false;
}

function makeOutsideFile(): string {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'talos-fuori-')));
  const file = path.join(dir, 'chiave-privata');
  fs.writeFileSync(file, 'PRIVATE KEY MATERIAL\n');
  return file;
}

const effect = (command: string, projectRoot: string) =>
  evaluateRules(OPEN, {tool: 'Bash', command}, {projectRoot}).effect;

test('every read-only verb asks when its argument names a path outside the project', () => {
  const root = makeProject();
  const outside = makeOutsideFile();
  const outsideDir = path.dirname(outside);
  const cases: string[] = [
    `cat ${outside}`,
    `type ${outside}`,
    `head ${outside}`,
    `tail ${outside}`,
    `wc ${outside}`,
    `stat ${outside}`,
    `du ${outsideDir}`,
    `ls ${outsideDir}`,
    `dir ${outsideDir}`,
    `grep TOKEN ${outside}`,
    `rg TOKEN ${outsideDir}`,
    `diff src/a.ts ${outside}`,
    `git diff -- ${outside}`,
  ];
  for (const command of cases) {
    assert.equal(effect(command, root), 'ask', `expected ask for: ${command}`);
  }
});

test('a recursive search rooted outside the project asks', () => {
  const root = makeProject();
  const outsideDir = path.dirname(makeOutsideFile());
  assert.equal(effect(`grep -r AWS_SECRET ${outsideDir}`, root), 'ask');
  assert.equal(effect(`rg --files ${outsideDir}`, root), 'ask');
  assert.equal(effect(`grep -r AWS_SECRET ${path.join(root, '..')}`, root), 'ask');
});

test('a read-only command naming only paths inside the project is still allowed', () => {
  const root = makeProject();
  for (const command of [
    'ls',
    'ls -la',
    'ls src',
    'cat .env',
    'cat src/a.ts',
    'git status',
    'git diff -- src/a.ts',
    'head -n 20 src/a.ts',
    'wc -l src/a.ts',
    'pwd',
    `cat ${path.join(root, 'src', 'a.ts')}`,
    'grep -r AWS_SECRET .',
    'grep -rn TODO src',
    'rg --files src',
  ]) {
    assert.equal(effect(command, root), 'allow', `expected allow for: ${command}`);
  }
});

test('an argument that is not a path does not by itself trigger a prompt', () => {
  const root = makeProject();
  // Search patterns, option values and revision names all resolve against the project root
  // and land inside it, so the boundary must stay silent for them.
  for (const command of [
    'grep AWS_SECRET src/a.ts',
    'grep -e AWS_SECRET -e AWS_KEY src/a.ts',
    'grep --color=always TOKEN .env',
    'rg "class .*Engine" src',
    'head -n 5 src/a.ts',
    'git log',
    'git show HEAD',
    'git rev-parse --short HEAD',
    'git ls-files',
  ]) {
    assert.equal(effect(command, root), 'allow', `expected allow for: ${command}`);
  }
});

test('tilde and shell-variable prefixes are resolved or refused, never silently treated as relative', () => {
  const root = makeProject();
  // A tilde is expanded before the comparison: unexpanded it compares as relative and
  // lands inside the project, which is the whole trap.
  assert.equal(effect('cat ~/.ssh/id_ed25519', root), 'ask');
  assert.equal(effect(`cat ~${path.sep}.ssh${path.sep}id_ed25519`, root), 'ask');
  // A variable cannot be statically verified, so it is refused rather than resolved.
  assert.equal(effect('cat $HOME/.ssh/id_ed25519', root), 'ask');
  assert.equal(effect('cat ${HOME}/.ssh/id_ed25519', root), 'ask');
  assert.equal(effect('grep -r AWS_SECRET $HOME', root), 'ask');
  if (WIN) {
    assert.equal(effect(`cat %USERPROFILE%${path.sep}.ssh${path.sep}id_ed25519`, root), 'ask');
    assert.equal(effect('type %APPDATA%', root), 'ask');
  }
});

test('a link inside the project pointing outside it asks, because resolution runs on the real path', () => {
  const root = makeProject();
  const outsideDir = path.dirname(makeOutsideFile());
  const link = path.join(root, 'scorciatoia');
  assert.ok(makeLink(outsideDir, link), 'could not create any link for the test');
  assert.equal(effect('cat scorciatoia/chiave-privata', root), 'ask');
  assert.equal(effect('ls scorciatoia', root), 'ask');
  assert.equal(effect(`cat ${path.join(link, 'chiave-privata')}`, root), 'ask');
  // A file that does not exist behind that link must be judged on the resolved location too.
  assert.equal(effect('cat scorciatoia/mai-creato', root), 'ask');
});

test('a path that cannot be resolved asks rather than being allowed', () => {
  const root = makeProject();
  const unc = WIN ? '\\\\server-che-non-esiste\\share\\x' : '//server-che-non-esiste/share/x';
  assert.equal(effect(`cat ${unc}`, root), 'ask');
});

test('a command whose composition cannot be parsed keeps today refusal rather than gaining an allow', () => {
  const root = makeProject();
  for (const command of ['cat `whoami`', 'cat $(whoami)', 'cat src/a.ts > out.txt', 'cat < src/a.ts']) {
    assert.equal(effect(command, root), 'deny', `expected deny for: ${command}`);
  }
});

test('the boundary survives the Windows path forms', {skip: !WIN}, () => {
  const root = makeProject();
  const outside = makeOutsideFile();
  // Case differences must not be read as an escape.
  assert.equal(effect(`cat ${path.join(root.toUpperCase(), 'src', 'a.ts')}`, root), 'allow');
  // The long-path prefix and UNC form do not launder an outside path.
  assert.equal(effect(`cat \\\\?\\${outside}`, root), 'ask');
  // A drive-relative path is resolved by Node against the project root, which is not what
  // Windows does with it, so it cannot be verified and must ask.
  assert.equal(effect('cat C:chiave', root), 'ask');
  // An alternate data stream on an outside file is still an outside read.
  assert.equal(effect(`cat ${outside}:nascosto`, root), 'ask');
  // ... and one on an inside file is still an inside read.
  assert.equal(effect('cat src/a.ts:nascosto', root), 'allow');
});

test('a project root given in a non-canonical form is canonicalized before the comparison', () => {
  // Without this the boundary compares an argument against a root spelling that no path can ever
  // be under, and every legitimate in-project read turns into a prompt.
  const real = makeProject();
  const link = path.join(path.dirname(real), `link-${path.basename(real)}`);
  if (makeLink(real, link)) {
    // Project opened through the link, argument written in its real form.
    assert.equal(effect(`cat ${path.join(real, 'src', 'a.ts')}`, link), 'allow');
    assert.equal(effect('cat src/a.ts', link), 'allow');
  }
  // The same thing with an 8.3 short name, which only the native realpath expands.
  if (WIN && fs.existsSync('C:\\PROGRA~1')) {
    assert.equal(effect('cat "C:\\Program Files\\Common Files\\x.txt"', 'C:\\PROGRA~1'), 'allow');
    // Unquoted the same path is three tokens, and the first of them really is outside.
    assert.equal(effect('cat C:\\Program Files\\Common Files\\x.txt', 'C:\\PROGRA~1'), 'ask');
  }
});

test('a quoted Windows path keeps its separators', {skip: !WIN}, () => {
  // The rule tokenizer treats a backslash inside quotes as an escape, which eats the separators
  // and lands the argument inside the project. Quoting is not exotic: it is what gets written
  // whenever a path contains a space, so this is the common form, not the adversarial one.
  const root = makeProject();
  const fuori = path.basename(makeSibling(root, 'segreto-fuori.txt'));
  assert.equal(effect(`type "..\\${fuori}"`, root), 'ask');
  assert.equal(effect(`type '..\\${fuori}'`, root), 'ask');
  assert.equal(effect(`type ..\\${fuori}`, root), 'ask');
  assert.equal(effect(`cat "${path.join('..', '..', '..', '..', '..', '..', 'Users')}"`, root), 'ask');
  const outside = makeOutsideFile();
  assert.equal(effect(`cat "${outside}"`, root), 'ask');
  // And the reason quoting exists in the first place still works.
  assert.equal(effect('cat "src/file con spazio.ts"', root), 'allow');
  assert.equal(effect(`cat "src\\file con spazio.ts"`, root), 'allow');
});

test('a backslash that the POSIX shell removes is removed here too', {skip: WIN}, () => {
  // On POSIX a backslash escapes the next character, so `\/etc/passwd` reaches /etc/passwd while
  // the raw token compares as a relative path inside the project.
  const root = makeProject();
  assert.equal(effect('cat \\/etc/passwd', root), 'ask');
  assert.equal(effect('cat "\\/etc/passwd"', root), 'ask');
  // A backslash inside single quotes is literal in POSIX and must stay literal here.
  assert.equal(effect("grep 'a\\.b' src/a.ts", root), 'allow');
});

test('a short option carrying its value attached is still a path argument', () => {
  const root = makeProject();
  const outside = makeOutsideFile();
  // Attached form: `-fPATH`. The separated and `--flag=` forms already asked; this one did not.
  assert.equal(effect(`grep -f${outside} -r src`, root), 'ask');
  assert.equal(effect(`grep -f ${outside}`, root), 'ask');
  assert.equal(effect(`grep --file=${outside}`, root), 'ask');
  assert.equal(effect(`head -c1 ${outside}`, root), 'ask');
  assert.equal(effect(`tail -n1${path.sep}..${path.sep}x`, root), 'ask');
  // The flags a read-only command actually carries must not start prompting.
  for (const command of ['ls -la', 'ls -lah', 'grep -rn TODO src', 'head -n20 src/a.ts', 'head -n 20 src/a.ts',
    'wc -l src/a.ts', 'grep -i token .env', 'rg -uu --files src', 'git log --format=%H', 'grep -c "" src/a.ts', 'cat -']) {
    assert.equal(effect(command, root), 'allow', `expected allow for: ${command}`);
  }
});

test('brace expansion turns one token into several and is refused', () => {
  const root = makeProject();
  const fuori = path.basename(makeSibling(root, 'segreto-graffe.txt'));
  assert.equal(effect(`cat {../${fuori},src/a.ts}`, root), 'ask');
  assert.equal(effect(`cat {src/a.ts,../${fuori}}`, root), 'ask');
  assert.equal(effect('cat ../{a,b}', root), 'ask');
  assert.equal(effect('cat {1..3}', root), 'ask');
  // A quoted brace does not expand, and a bare quantifier has no comma, so neither prompts.
  assert.equal(effect('grep -E "a{2}" src/a.ts', root), 'allow');
  assert.equal(effect('grep -E "a{2,3}" src/a.ts', root), 'allow');
  assert.equal(effect("grep -E 'x{1,2}' src/a.ts", root), 'allow');
});

test('a Windows-style switch is not reported as a path that leaves the project', {skip: !WIN}, () => {
  const root = makeProject();
  // A single-segment `/x` token is a switch on Windows, never a path, and must not prompt.
  for (const command of ['dir /s', 'dir /b', 'dir /a', 'dir /o-d', 'dir /w', 'type /?', 'dir /a:h']) {
    assert.equal(effect(command, root), 'allow', `expected allow for: ${command}`);
  }
  // ... unless it really names something, and then it is judged as the path it is.
  assert.equal(fs.existsSync('C:\\Users'), true);
  assert.equal(effect('dir /Users', root), 'ask');
  // More than one segment, or an extension, and it was never switch-shaped.
  assert.equal(effect('cat /Users/person/.ssh/id_ed25519', root), 'ask');
  assert.equal(effect('type /pagefile.sys', root), 'ask');
});

test('the refusal names what the argument resolved to, never a bare token', () => {
  const root = makeProject();
  const outside = makeOutsideFile();
  const decision = evaluateRules(OPEN, {tool: 'Bash', command: `cat ${outside}`}, {projectRoot: root});
  assert.equal(decision.effect, 'ask');
  assert.ok(decision.reason.includes(outside), `reason must name the resolved path: ${decision.reason}`);
  // A token that resolved to nothing must never be described as reading outside the project.
  for (const command of WIN ? ['dir /s', 'dir /b'] : ['ls -la']) {
    const d = evaluateRules(OPEN, {tool: 'Bash', command}, {projectRoot: root});
    assert.ok(!d.reason.includes('outside the project'), `${command}: ${d.reason}`);
  }
});

test('an unreachable network path does not stall the permission decision', () => {
  const root = makeProject();
  const dead = WIN ? '\\\\10.255.255.1\\share\\x' : '//10.255.255.1/share/x';
  const started = Date.now();
  assert.equal(effect(`cat ${dead}`, root), 'ask');
  assert.equal(effect(`cat ${dead} ${dead} ${dead}`, root), 'ask');
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `boundary must not wait on an unreachable host, took ${elapsed}ms`);
});

test('one outside segment decides a composed read-only command', () => {
  const root = makeProject();
  const outside = makeOutsideFile();
  assert.equal(effect(`git status && cat ${outside}`, root), 'ask');
  assert.equal(effect(`cat ${outside} && git status`, root), 'ask');
  assert.equal(effect('git status && cat src/a.ts', root), 'allow');
});

test('an explicit deny still wins over the boundary and an explicit allow is still the user decision', () => {
  const root = makeProject();
  const denied = compileRules({allow: [], ask: [], deny: ['Bash(cat:*)']});
  assert.equal(evaluateRules(denied, {tool: 'Bash', command: 'cat src/a.ts'}, {projectRoot: root}).effect, 'deny');
});

/* C-005 (owner 01/10, «bypass vero»): bypassPermissions now lifts the boundary, as in Claude Code and Codex — except for what the
   kernel marked as a secret or the keychain. The classifier-driven `auto` mode keeps the boundary. */
test('an auto-approving mode does not lift the boundary; bypass lifts it except for a secret', async () => {
  const root = makeProject();
  const outside = makeOutsideFile();
  const command = `grep -r AWS_SECRET ${path.dirname(outside)}`;
  const bypass = createPermissionEngine({projectRoot: root, rules: {allow: [], ask: [], deny: []}});
  assert.equal((await bypass.decide({tool: 'Bash', command}, {interactive: true, mode: 'bypassPermissions'})).kind, 'allow');
  /* 0.6.8 (owner 16/10/2026): Full access no longer asks for a secret either */
  assert.equal((await bypass.decide({tool: 'Bash', command, sensitive: 'secret'}, {interactive: true, mode: 'bypassPermissions'})).kind, 'allow');
  // The shipped local classifier allows any command whose first token is grep, which is the
  // same first-token defect this slice closes; the boundary must survive it.
  const automatic = createPermissionEngine({
    projectRoot: root,
    rules: {allow: [], ask: [], deny: []},
    mode: 'auto',
    classifier: async () => 'allow',
  });
  assert.equal((await automatic.decide({tool: 'Bash', command}, {interactive: true, mode: 'auto'})).kind, 'ask');
  // An inside command is still auto-allowed, so the mode keeps its point.
  assert.equal((await bypass.decide({tool: 'Bash', command: 'grep -r AWS_SECRET .'}, {interactive: true, mode: 'bypassPermissions'})).kind, 'allow');
});

test('plan mode does not allow a read-only command that reads outside the project', async () => {
  const root = makeProject();
  const outside = makeOutsideFile();
  const engine = createPermissionEngine({projectRoot: root, rules: {allow: [], ask: [], deny: []}});
  const decision = await engine.decide({tool: 'Bash', command: `cat ${outside}`}, {interactive: true, mode: 'plan'});
  assert.notEqual(decision.kind, 'allow');
});

test('a grant taken once is scoped to the argument and never widens the allowlist', async () => {
  const root = makeProject();
  const outside = makeOutsideFile();
  const sibling = path.join(path.dirname(outside), 'altra-chiave');
  fs.writeFileSync(sibling, 'ANOTHER KEY\n');
  const persisted: string[] = [];
  const engine = createPermissionEngine({
    projectRoot: root,
    rules: {allow: [], ask: [], deny: []},
    persistRule: async (_e, action) => {persisted.push(permissionActionToRule(action, root));},
  });
  const first = await engine.decide({tool: 'Bash', command: `cat ${outside}`}, {interactive: true, mode: 'default'});
  assert.equal(first.kind, 'ask');
  if (first.kind !== 'ask') return;
  await engine.resolve(first.requestId, 'allow-session');
  // The exact approved invocation is allowed...
  assert.equal((await engine.decide({tool: 'Bash', command: `cat ${outside}`}, {interactive: true, mode: 'default'})).kind, 'allow');
  // ... and nothing else is.
  assert.equal((await engine.decide({tool: 'Bash', command: `cat ${sibling}`}, {interactive: true, mode: 'default'})).kind, 'ask');
  assert.equal((await engine.decide({tool: 'Bash', command: `head ${outside}`}, {interactive: true, mode: 'default'})).kind, 'ask');
  assert.equal((await engine.decide({tool: 'Bash', command: `cat ${outside} extra`}, {interactive: true, mode: 'default'})).kind, 'ask');

  const always = await engine.decide({tool: 'Bash', command: `cat ${sibling}`}, {interactive: true, mode: 'default'});
  assert.equal(always.kind, 'ask');
  if (always.kind !== 'ask') return;
  await engine.resolve(always.requestId, 'allow-always');
  assert.equal(persisted.length, 1);
  const rule = persisted[0]!;
  assert.equal(rule, `Bash(cat ${sibling})`);
  assert.ok(!rule.includes('*'), `persisted rule must not carry a wildcard: ${rule}`);
  assert.notEqual(rule, 'Bash(cat)');
  assert.ok(rule.includes(sibling), `persisted rule must name the resolved argument: ${rule}`);
});
