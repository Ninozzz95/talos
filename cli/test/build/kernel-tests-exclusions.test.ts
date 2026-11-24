/*
 * After the review of 0.6.3 (bugfixer, 14/10/2026), item 2b. `npm run test:kernel` (scripts/kernel-tests.mjs) excluded the whole
 * of `harness-ui/tests/kernel-caricato-all-avvio.test.mjs` because four of its six tests start, or read, the DESKTOP's own server
 * (the CLI tree carries an older server.mjs). The other two — the sentence that says which kernel was loaded, and when the
 * desktop default applies — need no server and pass here: excluding the file hid them. The exclusion file can name single tests
 * (`tests`, matched by name with `--test-skip-pattern`): the four were skipped by name and the file ran.
 * 0.7.0 block 1, item 5 (21/11/2026): the line carries the desktop's current server.mjs, and the four desktop-server tests were green
 * 3 of 3 under the gate's conditions; they left the exclusion list, so the whole file runs in the gate now, all six tests.
 * Measured here: the file run with the gate's skip patterns, as the gate runs it.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const HARNESS=fileURLToPath(new URL('../../../harness-ui/',import.meta.url));
const EXCLUDED=JSON.parse(readFileSync(new URL('../../scripts/kernel-tests-excluded.json',import.meta.url),'utf8')) as {files:Record<string,string>;tests:Record<string,string>};
/* as scripts/kernel-tests.mjs builds them */
const escapeRegExp=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const FILE='kernel-caricato-all-avvio.test.mjs';

test('the kernel startup file runs whole in the gate: none of its tests is skipped by name, all six pass',{timeout:120_000},()=>{
  assert.equal(FILE in EXCLUDED.files,false,`${FILE} is excluded as a whole: its tests never run`);
  const skips=Object.keys(EXCLUDED.tests).map(name=>`--test-skip-pattern=${escapeRegExp(name)}`);
  /* a `node --test` started inside a test runs nothing unless it is told it is not a child of this one */
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const run=spawnSync(process.execPath,['--test','--test-reporter=tap',...skips,`tests/${FILE}`],{cwd:HARNESS,encoding:'utf8',timeout:110_000,env});
  const out=`${run.stdout??''}${run.stderr??''}`;
  const count=(label:string)=>Number(new RegExp(`^# ${label} (\\d+)$`,'mu').exec(out)?.[1]??NaN);
  /* a test left out by `--test-skip-pattern` is not reported at all: what is reported is what ran */
  const ran=[...out.matchAll(/^(?:not )?ok \d+ - (KERNEL-AVVIO-[0-9a-z]+)/gmu)].map(match=>match[1]).sort();
  assert.equal(count('fail'),0,`a test of the file failed in the gate:\n${out.slice(-3000)}`);
  assert.deepEqual(ran,['KERNEL-AVVIO-01','KERNEL-AVVIO-02','KERNEL-AVVIO-02b','KERNEL-AVVIO-03','KERNEL-AVVIO-04','KERNEL-AVVIO-05'],'all six tests of the file run');
  assert.equal(count('pass'),6);
  /* none of the file's tests is named in the exclusion file any more */
  assert.deepEqual(Object.keys(EXCLUDED.tests).filter(name=>name.startsWith('KERNEL-AVVIO-')),[]);
});

/* CLI 0.7.0, fourth public dry run (45281344821, 24/11/2026, judge v2671): the two files whose cleanup meets a background child
   alive (EPERM, which rmSync does not retry) failed a different test on each loaded runner; skipping them by name never ended.
   They are excluded whole here, and the coverage stays where the exclusion reasons say: the release job's desktop gate runs the
   whole server suite, these two files included, with no skip. */
const EPERM_FILES=['riserva-del-riassunto-c6bis.test.mjs','r21-attese-e-sveglia.test.mjs'];

test('the two EPERM-prone kernel files are excluded whole, none of their tests by name, and the release desktop gate still runs them',()=>{
  for(const file of EPERM_FILES){
    assert.ok(file in EXCLUDED.files,`${file} is not excluded whole: on a loaded runner another of its tests fails each time`);
    assert.match(EXCLUDED.files[file]!,/desktop gate/u,`${file}: the reason says where the file still runs`);
    const source=readFileSync(new URL(`../../../harness-ui/tests/${file}`,import.meta.url),'utf8');
    assert.deepEqual(Object.keys(EXCLUDED.tests).filter(name=>source.includes(name)),[],`${file}: a skip by name is useless once the file is excluded`);
  }
  const workflow=readFileSync(new URL('../../../.github/workflows/cli-release.yml',import.meta.url),'utf8');
  const server=workflow.split(/\r?\n/u).filter(line=>line.trim().startsWith('node --test --import=./harness-ui/desktop/tests/gancio-portachiavi.mjs'));
  assert.equal(server.length,1,'the release job runs the server suite once');
  assert.match(server[0]!,/ harness-ui\/tests\/\*\.test\.mjs$/u,'the server suite runs every harness-ui test file, these two included');
  assert.doesNotMatch(server[0]!,/--test-skip-pattern/u,'the server suite skips nothing');
});
