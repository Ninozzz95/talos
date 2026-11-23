/*
 * CAND033-S11-HELP-8B (registered 30/09): once, an idle window with the help open held 8 bytes and the report said only
 * «8 bytes in 1 chunks», so the cause could not be named. The meter now keeps the first bytes, escaped, and the report
 * shows them: the next occurrence names itself (e.g. ESC[?1004h, focus reporting, is exactly 8 bytes).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {OutputMeter,describeOutput} from './terminal.ts';

test('the output report shows the first bytes it counted, escaped and bounded',()=>{
  const meter=new OutputMeter();
  meter.feed('\u001b[?1004h');
  const report=describeOutput(meter.read());
  assert.match(report,/8 bytes in 1 chunks/u);
  assert.ok(report.includes('first bytes "\\u001b[?1004h"'),report);
  const long=new OutputMeter();long.feed('x'.repeat(5_000));
  const sample=long.read().sample;
  assert.ok(sample.length<=160,`bounded: ${sample.length}`);
  assert.doesNotMatch(describeOutput(new OutputMeter().read()),/first bytes/u,'nothing counted, nothing shown');
});
