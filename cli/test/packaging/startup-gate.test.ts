/*
 * Owner 27/10/2026 («Misura vera»): the installed-package proof measures the warm start against the previous release instead of
 * counting the bundle's files. The verdict and the version order are pure; the PTY measure runs in scripts/prove-standalone.ts.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {STARTUP_LIMIT,STARTUP_RUNS,STARTUP_WARMUP,median,npmCommand,olderThan,releaseVersion,sameBuild,startupVerdict} from '../../scripts/startup-gate.ts';

test('the verdict compares medians: within 10 % passes, beyond it fails, and one slow outlier does not decide',()=>{
  const before=[276,280,270,290,275,279,281,272,274,300];
  assert.equal(median(before),277.5,'an even count: the mean of the two middle values (276 and 279)');
  const ok=startupVerdict([292,290,300,288,295,297,289,291,1200,293],before);
  assert.equal(ok.ok,true,JSON.stringify(ok));
  const slow=startupVerdict(before.map(ms=>Math.round(ms*1.2)),before);
  assert.equal(slow.ok,false);assert.equal(slow.reason,'slower than the previous release');
  /* the limit itself passes, one millisecond over it fails */
  assert.equal(startupVerdict([110],[100]).ok,true);
  assert.equal(startupVerdict([111],[100]).ok,false);
  assert.equal(STARTUP_LIMIT,1.10);assert.ok(STARTUP_RUNS>=10&&STARTUP_WARMUP>=1,'warm-ups thrown away, at least 10 measured');
});

test('a start that never reached the composer, or nothing measured, is a failure, never a pass',()=>{
  assert.equal(startupVerdict([280,-1,281],[276,277,278]).ok,false);
  assert.equal(startupVerdict([280],[276,-1]).ok,false);
  assert.equal(startupVerdict([],[276]).ok,false);
  assert.equal(startupVerdict([280],[]).ok,false);
});

test('version order: the previous release is the one not newer than this package (the same number until the release raises it)',()=>{
  assert.equal(olderThan('0.6.14','0.6.15'),true);
  assert.equal(olderThan('0.6.15','0.6.14'),false);
  assert.equal(olderThan('0.6.14','0.6.14'),false);
  assert.equal(olderThan('0.9.0','0.10.0'),true,'numbers, not text');
  assert.equal(olderThan('0.6.15-beta.1','0.6.15'),true,'a pre-release comes before its release');
  assert.equal(olderThan('1.0.0','0.99.99'),false);
});

/* review E1: two pre-releases of the same numbers were not ordered, so a newer beta could pass as the previous one */
test('version order: pre-releases of the same numbers are ordered as semver orders them',()=>{
  assert.equal(olderThan('0.6.15-beta.1','0.6.15-beta.2'),true);
  assert.equal(olderThan('0.6.15-beta.2','0.6.15-beta.1'),false);
  assert.equal(olderThan('0.6.15-beta.9','0.6.15-beta.10'),true,'numbers, not text');
  assert.equal(olderThan('0.6.15-beta.1','0.6.15-beta.1'),false);
  assert.equal(olderThan('0.6.15-alpha','0.6.15-beta'),true);
  assert.equal(olderThan('0.6.15-beta','0.6.15-beta.1'),true,'fewer fields come first');
  assert.equal(olderThan('0.6.15-1','0.6.15-beta'),true,'a number comes before a word');
});

/* review E2 (Node DEP0190): with shell:true Node joins the arguments as they are, so a folder with a space fell in two */
test('npm on Windows is one quoted line, so a folder with a space stays one argument',()=>{
  assert.deepEqual(npmCommand(['install','--prefix','C:\\Users\\A B\\x','talos-code@0.6.14'],'win32'),{file:'npm.cmd install --prefix "C:\\Users\\A B\\x" talos-code@0.6.14',args:[],shell:true});
  assert.deepEqual(npmCommand(['root','-g'],'linux'),{file:'npm',args:['root','-g'],shell:false});
});

test('the version npm prints is a whole version or nothing',()=>{
  assert.equal(releaseVersion('0.6.14\n'),'0.6.14');
  assert.equal(releaseVersion('warn\n0.6.15-beta.1\n'),'0.6.15-beta.1');
  assert.equal(releaseVersion('0.6.14 and more'),'');
  assert.equal(releaseVersion('0.6.14junk'),'');
  assert.equal(releaseVersion(''),'');
});

/* review E1: a global install of this very build compared the package with itself, and the check could only pass */
test('the same build is no reference: the bytes decide, a missing file does not count as the same',()=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-startup-'));
  try{
    const a=join(dir,'a.js'),b=join(dir,'b.js'),c=join(dir,'c.js');
    writeFileSync(a,'one');writeFileSync(b,'one');writeFileSync(c,'two');
    assert.equal(sameBuild(a,b),true);assert.equal(sameBuild(a,c),false);assert.equal(sameBuild(a,join(dir,'none.js')),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
