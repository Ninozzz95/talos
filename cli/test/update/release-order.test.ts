/*
 * Before the first beta (owner 02/10: 0.5.0-beta.1 with stages 3 and 4): `talos update` must offer beta.2 to whoever has
 * beta.1. The order is SemVer 2.0.0 §11: dot-separated pre-release identifiers from the left, numeric ones numerically,
 * alphanumeric ones in ASCII order, a numeric one below an alphanumeric one, and the longer set wins when all before are
 * equal; a pre-release is below its release. Before this test the pre-release part only said "is there one", so
 * beta.2 and beta.1 compared equal (measured, registro 12).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {compareReleaseVersions} from '../../src/update/check.ts';

test('the release order is SemVer §11, pre-releases included',()=>{
  const ordered=['0.4.0','1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0'];
  for(let i=0;i+1<ordered.length;i++){
    assert.equal(compareReleaseVersions(ordered[i+1]!,ordered[i]!),1,`${ordered[i+1]} is after ${ordered[i]}`);
    assert.equal(compareReleaseVersions(ordered[i]!,ordered[i+1]!),-1,`${ordered[i]} is before ${ordered[i+1]}`);
  }
  assert.equal(compareReleaseVersions('0.5.0-beta.2','0.5.0-beta.2'),0);
  assert.equal(compareReleaseVersions('0.5.0-beta.10','0.5.0-beta.2'),1,'numeric identifiers compare as numbers');
  assert.equal(compareReleaseVersions('0.5.0','0.5.0-beta.10'),1,'the release is after every beta');
  assert.equal(compareReleaseVersions('0.5.0-beta.1','0.4.0'),1);
});

test('a version that is not SemVer is refused, as before',()=>{
  assert.throws(()=>compareReleaseVersions('0.5','0.4.0'),/UPDATE_VERSION_INVALID/u);
});
