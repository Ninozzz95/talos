/*
 * Stress test 0.5.4, F-K-001 (variant of S-3): a trusted hook `echo x > file-s3.txt` "ran" with exit 0 and created nothing, while
 * `node -e "require('fs').writeFileSync(...)"` worked. The kernel runs hooks WITHOUT a shell (hook-registry.mjs eseguiHook), so `>`
 * reached echo.exe as text. TALOS names the shell operators of a hook command, outside quotes, so dry-run and trust say so.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hookShellOperators} from '../../src/services/hook-facade.ts';
import {hookOutcome} from '../../src/commands/extensions-cli.ts';

test('the dry-run says the outcome: a refused hook is not reported as a plain "executed"',()=>{
  assert.equal(hookOutcome({consentito:false,motivo:'The command cannot contain shell operators'}),'Outcome: refused (The command cannot contain shell operators).');
  assert.equal(hookOutcome({consentito:false}),'Outcome: refused.');
  assert.equal(hookOutcome({consentito:true,motivo:'ok'}),'Outcome: allowed.');
  assert.doesNotMatch(hookOutcome({consentito:false,motivo:'x\u001b[31m'}),/\u001b/u);
});

test('the tester\'s hook is flagged, the working one is not',()=>{
  assert.deepEqual(hookShellOperators('echo x > file-s3.txt'),['>']);
  assert.deepEqual(hookShellOperators('node -e "require(\'fs\').writeFileSync(\'file-node.txt\',\'y\')"'),[]);
});

test('every operator is named once, doubled ones as they are written',()=>{
  assert.deepEqual(hookShellOperators('a >> b | c && d || e ; f < g & h').sort(),['&','&&','<',';','>>','|','||'].sort());
});

test('operators inside quotes are the program\'s own text',()=>{
  assert.deepEqual(hookShellOperators('node -e "a>b && c|d"'),[]);
  assert.deepEqual(hookShellOperators("node -e 'x;y' > out.txt"),['>']);
});
