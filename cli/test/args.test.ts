import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCliArgs} from '../src/args.ts';

test('headless json invocation is explicit and non-interactive', () => {
  const parsed = parseCliArgs(['-p', 'fix tests', '--json']);
  assert.equal(parsed.command, 'run');
  assert.equal(parsed.prompt, 'fix tests');
  assert.equal(parsed.interactive, false);
  assert.equal(parsed.outputFormat, 'json');
});

test('bare argv starts the TUI', () => {
  const parsed = parseCliArgs([]);
  assert.equal(parsed.command, 'run');
  assert.equal(parsed.interactive, true);
  assert.equal(parsed.outputFormat, 'text');
});

test('run options validate permission mode and timeout', () => {
  const parsed = parseCliArgs(['--project', '/tmp/repo', '--model', 'openai:gpt-5', '--permission-mode', 'dontAsk', '--timeout', '42']);
  assert.equal(parsed.project, '/tmp/repo');
  assert.equal(parsed.model, 'openai:gpt-5');
  assert.equal(parsed.permissionMode, 'dontAsk');
  assert.equal(parsed.timeoutSeconds, 42);
});

test('unknown flags fail instead of being ignored', () => {
  assert.throws(() => parseCliArgs(['--does-not-exist']), /Unknown option/);
});

test('resume and fork are mutually exclusive', () => {
  assert.throws(() => parseCliArgs(['--resume', 'a', '--fork', 'b']), /mutually exclusive/);
});

test('recognized subcommands are preserved with positionals', () => {
  const parsed = parseCliArgs(['config', 'get', 'model']);
  assert.equal(parsed.command, 'subcommand');
  assert.deepEqual(parsed.positionals, ['config', 'get', 'model']);
});

test('subcommand-specific flags remain in positionals for family parser',()=>{const x=parseCliArgs(['config','set','ui.theme','"mono"','--scope','user']);assert.equal(x.command,'subcommand');assert.deepEqual(x.positionals,['config','set','ui.theme','"mono"','--scope','user']);});
test('global flags before subcommand are parsed while family flags stay raw',()=>{const x=parseCliArgs(['--json','--project','/repo','session','export','s1','--format','md','--out','x.md']);assert.equal(x.outputFormat,'json');assert.equal(x.project,'/repo');assert.deepEqual(x.positionals,['session','export','s1','--format','md','--out','x.md']);});
test('P9-JSON-AFTER-SUBCOMMAND: exact global --json works after a family without swallowing local options',()=>{
  for(const family of ['config','doctor']){
    const x=parseCliArgs([family,'list','--scope','user','--json']);
    assert.equal(x.command,'subcommand');assert.equal(x.outputFormat,'json');
    assert.deepEqual(x.positionals,[family,'list','--scope','user']);
  }
  const literal=parseCliArgs(['config','get','model','--','--json']);
  assert.equal(literal.outputFormat,'text');
  assert.deepEqual(literal.positionals,['config','get','model','--','--json']);
  const typo=parseCliArgs(['config','list','--jsoon']);
  assert.equal(typo.outputFormat,'text');assert.deepEqual(typo.positionals,['config','list','--jsoon']);
});
test('project trust family is a recognized subcommand',()=>{const x=parseCliArgs(['--project','/repo','project','status']);assert.equal(x.command,'subcommand');assert.deepEqual(x.positionals,['project','status']);});
/* Stress test 0.5.6, F-B-001 (S1): `talos -p alpha beta gamma` sent only "alpha" to the model and dropped the rest in silence, exit 0. */
test('F-B-001: the words after the -p prompt belong to the prompt, as they do without -p',()=>{
  assert.equal(parseCliArgs(['-p','alpha','beta','gamma']).prompt,'alpha beta gamma');
  assert.equal(parseCliArgs(['-p','alpha','beta','gamma','--json']).prompt,'alpha beta gamma');
  assert.equal(parseCliArgs(['--model','openai:gpt-5','-p','alpha','beta']).prompt,'alpha beta');
  assert.equal(parseCliArgs(['alpha','beta','gamma']).prompt,'alpha beta gamma','without -p, as before');
});
test('F-B-001 the other way: one quoted prompt is unchanged, and -p stays non-interactive',()=>{
  const one=parseCliArgs(['-p','fix the tests']);
  assert.equal(one.prompt,'fix the tests');assert.equal(one.interactive,false);
  const setup=parseCliArgs(['-p','setup']);
  assert.equal(setup.prompt,'setup');assert.equal(setup.setup,undefined,'-p setup is a prompt, not the guided setup');
  assert.equal(parseCliArgs(['-p','alpha','setup']).prompt,'alpha setup');
});
test('F-B-001: after -p a command name is a word of the prompt, and a command keeps its own -p',()=>{
  for(const [argv,prompt] of [[['-p','explain','provider','errors'],'explain provider errors'],[['--print','alpha','config','list'],'alpha config list'],[['--print=alpha','session'],'alpha session'],[['-palpha','doctor'],'alpha doctor']] as const){
    const x=parseCliArgs([...argv]);
    assert.equal(x.command,'run',argv.join(' '));assert.equal(x.prompt,prompt);assert.equal(x.interactive,false);
  }
  const own=parseCliArgs(['session','resume','abc','-p','go on']);
  assert.equal(own.command,'subcommand');assert.deepEqual(own.positionals,['session','resume','abc','-p','go on']);
  assert.equal(parseCliArgs(['--model','openai:gpt-5','provider','list']).command,'subcommand','an option that is not -p changes nothing');
});
