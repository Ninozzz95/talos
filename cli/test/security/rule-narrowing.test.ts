import assert from 'node:assert/strict';
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import {mkdtemp, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ensureCliPaths, projectId, resolveCliPaths} from '../../src/paths.ts';
import {compileRules, evaluateRules, patternNamesOnlyAVerb} from '../../src/security/evaluate.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionToRule, persistPermissionRule} from '../../src/security/persist.ts';

// B1 slice 11. One line in matches() splits a Bash pattern on its first colon to separate the verb
// from the wildcard, and a Windows absolute path carries the drive's colon. The same line produces
// two opposite failures: a rule that names only the verb switches the slice 10 boundary off, and a
// rule that names the exact path never matches at all. This file pins both, and the rule that
// decides between them: naming a path still allows, naming only a verb is downgraded to ask when
// the argument leaves the project.

const WIN = process.platform === 'win32';
const VERB = WIN ? 'type' : 'cat';
const OTHER_READ_ONLY_VERB = VERB === 'cat' ? 'head' : 'cat';

function makeProject() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'talos-narrow-')));
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'dentro.txt'), 'CONTENUTO-DENTRO\n');
  return root;
}

function makeSecret(root: string, name = 'segreto.txt') {
  const file = path.join(path.dirname(root), name);
  fs.writeFileSync(file, 'CONTENUTO-SEGRETO-FUORI\n');
  return file;
}

const decide = (rules: string[], command: string, projectRoot: string) =>
  evaluateRules(compileRules({allow: rules, ask: [], deny: []}), {tool: 'Bash', command}, {projectRoot});

test('a rule that names only the verb does not lift the boundary', () => {
  const root = makeProject();
  const segreto = makeSecret(root);
  for (const rule of [`Bash(${VERB}:*)`, 'Bash(*)']) {
    const decision = decide([rule], `${VERB} ${segreto}`, root);
    assert.equal(decision.effect, 'ask', `${rule} must not allow a read outside the project`);
    assert.ok(decision.reason.includes(rule), `the decision must say which rule was downgraded: ${decision.reason}`);
    assert.ok(decision.reason.includes(segreto), `the decision must say what was resolved: ${decision.reason}`);
    assert.equal(decision.rule, rule);
  }
  // Every verb in the allowlist, not only the one this host can execute.
  for (const verb of ['cat', 'type', 'head', 'tail', 'grep', 'rg', 'wc', 'stat', 'du', 'ls', 'dir']) {
    assert.equal(decide([`Bash(${verb}:*)`], `${verb} ${segreto}`, root).effect, 'ask', `Bash(${verb}:*)`);
    assert.equal(decide(['Bash(*)'], `${verb} ${segreto}`, root).effect, 'ask', `Bash(*) with ${verb}`);
  }
});

test('a rule that names only the verb still allows what stays inside the project', () => {
  const root = makeProject();
  for (const [rule, command] of [
    [`Bash(${VERB}:*)`, `${VERB} dentro.txt`],
    ['Bash(*)', `${VERB} src/a.ts`],
    ['Bash(grep:*)', 'grep -rn TODO src'],
    ['Bash(*)', 'ls -la'],
    ['Bash(*)', 'git status'],
    ['Bash(*)', 'npm test'],
  ] as const) {
    assert.equal(decide([rule], command, root).effect, 'allow', `${rule} + ${command}`);
  }
});

test('a rule that names the exact path allows that exact command, drive letter included', () => {
  const root = makeProject();
  const segreto = makeSecret(root);
  // This is the case that has never worked on Windows: the drive colon was read as the
  // verb/wildcard separator, so the rule matched nothing at all.
  assert.equal(decide([`Bash(${VERB} ${segreto})`], `${VERB} ${segreto}`, root).effect, 'allow');
  assert.equal(decide([`Bash(cat ${segreto})`], `cat ${segreto}`, root).effect, 'allow');
  // A POSIX absolute path in a rule carries no colon and has always worked; it must keep working.
  assert.equal(decide(['Bash(cat /etc/passwd)'], 'cat /etc/passwd', root).effect, 'allow');
});

test('a rule that names the exact path does not allow a neighbouring path', () => {
  const root = makeProject();
  const segreto = makeSecret(root);
  const vicino = makeSecret(root, 'segreto-vicino.txt');
  const rule = `Bash(${VERB} ${segreto})`;
  assert.equal(decide([rule], `${VERB} ${vicino}`, root).effect, 'ask');
  assert.equal(decide([rule], `${VERB} ${segreto} ${vicino}`, root).effect, 'ask');
  assert.equal(decide([rule], `${OTHER_READ_ONLY_VERB} ${segreto}`, root).effect, 'ask');
  assert.equal(decide([rule], `${VERB} ${segreto}.bak`, root).effect, 'ask');
  assert.equal(decide([rule], `${VERB} ${path.dirname(segreto)}`, root).effect, 'ask');
});

test('an explicit deny is unchanged by the narrowing', () => {
  const root = makeProject();
  const segreto = makeSecret(root);
  const rules = compileRules({allow: ['Bash(*)'], ask: [], deny: [`Bash(${VERB}:*)`]});
  assert.equal(evaluateRules(rules, {tool: 'Bash', command: `${VERB} dentro.txt`}, {projectRoot: root}).effect, 'deny');
  assert.equal(evaluateRules(rules, {tool: 'Bash', command: `${VERB} ${segreto}`}, {projectRoot: root}).effect, 'deny');
  const exact = compileRules({allow: [`Bash(${VERB} ${segreto})`], ask: [], deny: [`Bash(${VERB} ${segreto})`]});
  assert.equal(evaluateRules(exact, {tool: 'Bash', command: `${VERB} ${segreto}`}, {projectRoot: root}).effect, 'deny');
});

test('rules that contain no colon behave exactly as before', () => {
  const root = makeProject();
  assert.equal(decide(['Bash(npm test:*)'], 'npm test -- --run', root).effect, 'allow');
  assert.equal(decide(['Bash(npm test:*)'], 'npm test-malicious', root).effect, 'ask');
  assert.equal(decide(['Bash(git status)'], 'git status', root).effect, 'allow');
  // Not `git status --short`: that one is allowed by the documented read-only branch whatever the
  // rules say, so it would not measure the rule at all. `git stash` is not read-only.
  assert.equal(decide(['Bash(git status)'], 'git stash', root).effect, 'ask');
  assert.equal(decide(['Bash(rm -rf:*)'], 'rm -rf build', root).effect, 'allow');
  assert.equal(decide(['Bash(rm:*)'], 'rmdir build', root).effect, 'ask');
  assert.equal(decide(['Bash(npm test)'], 'npm test', root).effect, 'allow');
  assert.equal(decide(['Bash(npm test)'], 'npm test -- --run', root).effect, 'ask');
});

test('a colon inside a command is no longer mistaken for the wildcard separator', () => {
  const root = makeProject();
  // npm script names carry colons all the time. The rule must mean the script it names.
  assert.equal(decide(['Bash(npm run test:unit)'], 'npm run test:unit', root).effect, 'allow');
  assert.equal(decide(['Bash(npm run test:unit)'], 'npm run test', root).effect, 'ask');
  assert.equal(decide(['Bash(npm run test:unit)'], 'npm run test:e2e', root).effect, 'ask');
  assert.equal(decide(['Bash(npm run build:prod)'], 'npm run build:prod', root).effect, 'allow');
});

test('rules for other tools keep their colon, which separates their own fields', () => {
  const root = makeProject();
  const effect = (rule: string, action: Parameters<typeof evaluateRules>[1]) =>
    evaluateRules(compileRules({allow: [rule], ask: [], deny: []}), action, {projectRoot: root}).effect;
  assert.equal(effect('Mcp(server:leggi)', {tool: 'Mcp', serverId: 'server', operation: 'leggi'}), 'allow');
  assert.equal(effect('Mcp(server:leggi)', {tool: 'Mcp', serverId: 'server', operation: 'scrivi'}), 'ask');
  assert.equal(effect('Mcp(server:*)', {tool: 'Mcp', serverId: 'server', operation: 'qualunque'}), 'allow');
  assert.equal(effect('Mcp(*)', {tool: 'Mcp', serverId: 's', operation: 'o'}), 'allow');
  assert.equal(effect('TalosService(risorsa:leggi)', {tool: 'TalosService', resource: 'risorsa', operation: 'leggi'}), 'allow');
  assert.equal(effect('TalosService(risorsa:leggi)', {tool: 'TalosService', resource: 'risorsa', operation: 'scrivi'}), 'ask');
  assert.equal(effect('TalosService(risorsa:*)', {tool: 'TalosService', resource: 'risorsa', operation: 'x'}), 'allow');
  assert.equal(effect('TalosService(leggi)', {tool: 'TalosService', operation: 'leggi'}), 'allow');
  assert.equal(effect('Read(./**)', {tool: 'Read', resource: 'src/a.ts'}), 'allow');
});

test('a rule persisted by answering allow-always matches the identical command afterwards', async () => {
  // The dormant defect, proved through the writing path rather than by building the rule by hand.
  const root = makeProject();
  const segreto = makeSecret(root);
  const vicino = makeSecret(root, 'segreto-vicino2.txt');
  const persisted: string[] = [];
  const engine = createPermissionEngine({
    projectRoot: root,
    rules: {allow: [], ask: [], deny: []},
    persistRule: async (_e, action) => {persisted.push(permissionActionToRule(action, root));},
  });
  const first = await engine.decide({tool: 'Bash', command: `${VERB} ${segreto}`}, {interactive: true, mode: 'default'});
  assert.equal(first.kind, 'ask');
  if (first.kind !== 'ask') return;
  await engine.resolve(first.requestId, 'allow-always');
  assert.equal(persisted.length, 1);
  const rule = persisted[0]!;
  // Same command, new engine loaded with what was written: it must be allowed now.
  const after = createPermissionEngine({projectRoot: root, rules: {allow: [rule], ask: [], deny: []}});
  assert.equal((await after.decide({tool: 'Bash', command: `${VERB} ${segreto}`}, {interactive: true, mode: 'default'})).kind, 'allow');
  // ... and a neighbouring path is still asked, so the grant did not widen.
  assert.equal((await after.decide({tool: 'Bash', command: `${VERB} ${vicino}`}, {interactive: true, mode: 'default'})).kind, 'ask');
});

test('the writing path refuses to persist an allow rule that narrows nothing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'talos-narrow-cfg-'));
  const paths = resolveCliPaths({XDG_CONFIG_HOME: path.join(dir, 'cfg'), XDG_STATE_HOME: path.join(dir, 'state'), XDG_CACHE_HOME: path.join(dir, 'cache')}, 'linux', dir);
  await ensureCliPaths(paths);
  const project = path.join(dir, 'repo');
  const write = (effect: 'allow' | 'deny', command: string) =>
    persistPermissionRule({paths, projectRoot: project, effect, action: {tool: 'Bash', command}});
  for (const command of ['*', '**', 'cat:*', 'grep:*', 'cat x:*']) {
    await assert.rejects(() => write('allow', command), /RULE_NOT_NARROWED/u, `allow of ${command} must be refused`);
  }
  // A deny that covers everything is the safe direction and stays allowed to be written.
  await write('deny', '*');
  // And an ordinary narrowed allow still writes.
  await write('allow', 'npm test');
  const file = path.join(paths.projectOverridesRoot, projectId(project), 'config.json');
  const obj = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(obj.permissions.allow, ['Bash(npm test)']);
  assert.deepEqual(obj.permissions.deny, ['Bash(*)']);
});

test('decision and execution measured together against the shell TALOS launches', () => {
  // ⛔ The decision is not the proof on its own. Every pair below runs the command with the shape
  // the kernel uses — spawn(command,{cwd,shell:true}) — so the verdict is checked against what the
  // shell really reads, not against what the evaluator believes it reads.
  const root = makeProject();
  const segreto = makeSecret(root, 'segreto-eseguito.txt');
  const run = (command: string) => {
    try {return execSync(command, {cwd: root, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore']}).trim();}
    catch {return null;}
  };

  // 1. A verb-only rule: the decision asks, and the shell really would have read the outside file.
  const fuori = `${VERB} ${segreto}`;
  assert.equal(decide([`Bash(${VERB}:*)`], fuori, root).effect, 'ask');
  assert.equal(run(fuori), 'CONTENUTO-SEGRETO-FUORI', 'the command really does read outside the project');

  // 2. The same rule, inside the project: the decision allows, and the shell reads inside.
  const dentro = `${VERB} dentro.txt`;
  assert.equal(decide([`Bash(${VERB}:*)`], dentro, root).effect, 'allow');
  assert.equal(run(dentro), 'CONTENUTO-DENTRO', 'the allowed command really does read inside the project');

  // 3. A rule that names the path: the deliberate grant is obeyed, and the read it authorises is
  //    exactly the one the person named.
  assert.equal(decide([permissionActionToRule({tool: 'Bash', command: fuori}, root)], fuori, root).effect, 'allow');
  assert.equal(run(fuori), 'CONTENUTO-SEGRETO-FUORI');

  // 4. A relative escape, decided and executed.
  const risalita = `${VERB} ..${path.sep}${path.basename(segreto)}`;
  assert.equal(decide([`Bash(${VERB}:*)`], risalita, root).effect, 'ask');
  assert.equal(run(risalita), 'CONTENUTO-SEGRETO-FUORI', 'the relative form reads outside too');
});

test('the verb is recognized the way Windows resolves it, without case', {skip: !WIN}, () => {
  // Windows resolves a command name without case, so `TYPE` and `type` are the same program. If
  // only the lowercase spelling is recognized as read-only, the whole downgrade is defeated by the
  // shift key: the command still reads the file, but no longer looks like something to check.
  const root = makeProject();
  const segreto = makeSecret(root, 'segreto-maiuscole.txt');
  const run = (command: string) => {
    try {return execSync(command, {cwd: root, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore']}).trim();}
    catch {return null;}
  };
  for (const verb of ['TYPE', 'Type', 'tYpE', 'CAT', 'Cat', 'GREP', 'LS', 'DIR', 'HEAD']) {
    assert.equal(evaluateRules(compileRules({allow: ['Bash(*)'], ask: [], deny: []}),
      {tool: 'Bash', command: `${verb} ${segreto}`}, {projectRoot: root}).effect, 'ask', `Bash(*) + ${verb}`);
  }
  // Measured with the shell, because that is how the escape was found in the first place.
  assert.equal(run(`TYPE ${segreto}`), 'CONTENUTO-SEGRETO-FUORI', 'cmd really runs the uppercase verb');
  assert.equal(run('TYPE dentro.txt'), 'CONTENUTO-DENTRO');
  // An uppercase verb naming something inside the project is still allowed, so this is recognition
  // and not a new prompt.
  assert.equal(decide(['Bash(*)'], 'TYPE dentro.txt', root).effect, 'allow');
  assert.equal(decide([], 'TYPE dentro.txt', root).effect, 'allow');
  // ⛔ And rule matching stays case-sensitive, which is a different question: a rule names the text
  // a person wrote. Only the read-only recognition follows the platform.
  assert.equal(decide(['Bash(npm:*)'], 'NPM test', root).effect, 'ask');
  assert.equal(decide(['Bash(npm test)'], 'NPM test', root).effect, 'ask');
});

test('the verb wildcard is only a trailing one, not a colon-star anywhere in the pattern', () => {
  // A Windows glob carries `C:*` in the middle of the pattern. Without the end anchor that reads as
  // the verb/wildcard separator, which both mis-parses the rule and mis-classifies it as naming
  // only a verb — and `p.slice(0,-2)` then cuts characters that are part of the path.
  const root = makeProject();
  assert.equal(patternNamesOnlyAVerb('cat C:*.log'), false);
  assert.equal(patternNamesOnlyAVerb('cat C:*'), true);
  assert.equal(patternNamesOnlyAVerb('cat:*'), true);
  assert.equal(patternNamesOnlyAVerb('cat C:\\dir\\a.txt'), false);
  assert.equal(decide(['Bash(cat C:*.log)'], 'cat C:*.log', root).effect, 'allow');
  if (WIN) {
    assert.equal(decide(['Bash(cat C:*.l)'], 'cat C:*.l zzz', root).effect, 'ask');
    assert.equal(decide(['Bash(cat C:*.log)'], 'cat C:*.txt', root).effect, 'ask');
  }
});

test('a downgrade does not end the search for a rule that names the path', () => {
  // The shape a configuration really takes is a permissive base plus specific grants appended, so
  // the verb-only rule is usually FIRST. If the downgrade were a final answer, the very rule this
  // slice tells a person to add would do nothing.
  const root = makeProject();
  const segreto = makeSecret(root, 'segreto-ordine.txt');
  const vicino = makeSecret(root, 'vicino-ordine.txt');
  const esatta = `Bash(${VERB} ${segreto})`;
  const command = `${VERB} ${segreto}`;
  assert.equal(decide([`Bash(${VERB}:*)`, esatta], command, root).effect, 'allow', 'verb-only first');
  assert.equal(decide([esatta, `Bash(${VERB}:*)`], command, root).effect, 'allow', 'exact first');
  assert.equal(decide(['Bash(*)', esatta], command, root).effect, 'allow', 'blanket first');
  assert.equal(decide([`Bash(${VERB}:*)`, 'Bash(*)', esatta], command, root).effect, 'allow', 'two blankets first');
  // No rule names this path, so the downgrade is still the answer and still explains itself.
  const solo = decide([`Bash(${VERB}:*)`, 'Bash(*)'], command, root);
  assert.equal(solo.effect, 'ask');
  assert.ok(solo.reason.includes(`Bash(${VERB}:*)`), solo.reason);
  // A neighbouring grant does not rescue it.
  assert.equal(decide([`Bash(${VERB}:*)`, `Bash(${VERB} ${vicino})`], command, root).effect, 'ask');
  // deny and ask keep first-match: neither is affected by the allow search.
  assert.equal(evaluateRules(compileRules({allow: [esatta], ask: [`Bash(${VERB}:*)`], deny: []}),
    {tool: 'Bash', command}, {projectRoot: root}).effect, 'ask');
  assert.equal(evaluateRules(compileRules({allow: [esatta], ask: [], deny: [`Bash(${VERB}:*)`]}),
    {tool: 'Bash', command}, {projectRoot: root}).effect, 'deny');
});
