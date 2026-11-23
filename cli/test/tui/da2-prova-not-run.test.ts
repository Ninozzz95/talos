/*
 * D-A2 (owner 04/10): the merged kernel answers a `prova` that ran no test with `NOT RUN: NO_TESTS_RAN — …` and a `prova`
 * with no suite with `NOT RUN: NO_TEST_SUITE_CONFIGURED — …` (talosHarness.mjs `messaggioNessunTestEseguito`,
 * `messaggioProvaNonEseguita`; `codice: null`, the receipt is a failure, H-04). The row says `not run: no tests ran` /
 * `not run: no test suite`, never `exit N`, in the failed tone; the kernel's whole sentence stays in the detail.
 * Like Codex (`exec_cell/compact.rs`: a failed command is «Failed (exit N)» in red) and the runners themselves (pytest exit 5,
 * Jest/Vitest fail without `passWithNoTests`): no tests is not a pass.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {t} from '../../src/i18n/index.ts';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import type {ToolRowModel} from '../../src/tui/tools/registry.ts';

const NOW=1_000_000;
const KERNEL=readFileSync(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url),'utf8');
const NO_TESTS='NOT RUN: NO_TESTS_RAN — the test command ran and exited 0, but no tests ran: this is not a pass. Create the suite or point the command at the folder that has one.\nThe runner said: (no declaration line)';
const NO_SUITE='NOT RUN: NO_TEST_SUITE_CONFIGURED — no test suite found in C:\\p: no package.json test script. No command was run, so there is no exit code; this is not a pass.';
const row=(over:Partial<ToolRowModel>):ToolRowModel=>({id:'t1',name:'prova',status:'failed',argsText:JSON.stringify({comando:'npm test'}),liveOutput:'',finalOutput:'',startedAt:NOW-10_000,endedAt:NOW-9_000,outcome:null,...over} as ToolRowModel);
const view=(r:ToolRowModel,expanded=false)=>toolRowView(r,120,expanded,NOW);

test('D-A2: the kernel still opens these answers with these codes (pinned)',()=>{
  assert.ok(KERNEL.includes("export const CODICE_NESSUN_TEST = 'NO_TESTS_RAN'"));
  assert.ok(KERNEL.includes("export const CODICE_NESSUNA_SUITE = 'NO_TEST_SUITE_CONFIGURED'"));
  assert.ok(KERNEL.includes('return `NOT RUN: ${CODICE_NESSUN_TEST} — the test command ran${sandbox}'));
  assert.ok(KERNEL.includes('return `NOT RUN: ${CODICE_NESSUNA_SUITE} — no test suite found in ${cartella}'));
});

test('D-A2: a prova that ran no test says «not run: no tests ran», failed tone, no exit',()=>{
  /* the kernel sends no exit code (`codice: null`); even if some path carried one (the runner's own `actualExitCode`), the row shows none */
  const v=view(row({finalOutput:NO_TESTS,facts:{exitCode:0,durationMs:1_200}}));
  assert.equal(v.tone,'failed');
  assert.ok(v.statusLabel.includes(t('tool.state.notRun.noTests')),v.statusLabel);
  assert.equal(t('tool.state.notRun.noTests'),'not run: no tests ran');
  assert.doesNotMatch(v.statusLabel,/\bexit\b|\bfailed\b/u,'never an exit code, never the bare «failed»');
  assert.ok(v.detailLines.join('\n').includes('NOT RUN: NO_TESTS_RAN'),'the kernel sentence stays in the detail');
});

test('D-A2: a prova with no suite says «not run: no test suite»',()=>{
  const v=view(row({finalOutput:NO_SUITE}));
  assert.equal(v.tone,'failed');
  assert.ok(v.statusLabel.includes(t('tool.state.notRun.noSuite')),v.statusLabel);
  assert.equal(t('tool.state.notRun.noSuite'),'not run: no test suite');
  assert.doesNotMatch(v.statusLabel,/\bexit\b|\bfailed\b/u);
});

test('D-A2: only the exact kernel head counts; a real failure keeps «failed» and its exit',()=>{
  const real=view(row({finalOutput:'exit 1\n1 failing',facts:{exitCode:1}}));
  assert.match(real.statusLabel,/failed/u);assert.match(real.statusLabel,/exit 1/u);
  const quoted=view(row({finalOutput:'exit 1\nNOT RUN: NO_TESTS_RAN — quoted by a test',facts:{exitCode:1}}));
  assert.doesNotMatch(quoted.statusLabel,/not run/u,'a NOT RUN line that is not the first line is the command\'s output');
  const shell=view(row({name:'shell',argsText:JSON.stringify({comando:'echo'}),finalOutput:NO_TESTS}));
  assert.doesNotMatch(shell.statusLabel,/not run/u,'only `prova` answers with NOT RUN');
});
