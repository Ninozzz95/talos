import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  PathPolicyError,
  createPathPolicy,
  isPathInside,
} from '../src/path-policy.mjs';

const CAMPAIGNS = ['esiti-22ago-progetti', 'esiti-22ago-storia'];

function makeBanco(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-harness-path-'));
  for (const campaign of CAMPAIGNS) {
    mkdirSync(join(root, campaign));
  }
  writeFileSync(join(root, CAMPAIGNS[0], 'beta.jsonl'), '{}\n');
  writeFileSync(join(root, CAMPAIGNS[0], 'alpha.jsonl'), '{}\n');
  writeFileSync(join(root, CAMPAIGNS[0], 'ignore.txt'), 'ignored');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('path policy rejects unknown campaign', (t) => {
  const bancoDir = makeBanco(t);
  const policy = createPathPolicy({ bancoDir, campaigns: CAMPAIGNS });
  policy.initialize();
  assert.throws(() => policy.resolveCampaignDir('esiti-non-ammessi'), PathPolicyError);
});

test('path policy rejects dot-dot, encoded dot-dot and Windows separator traversal', (t) => {
  const bancoDir = makeBanco(t);
  const policy = createPathPolicy({ bancoDir, campaigns: CAMPAIGNS });
  policy.initialize();
  for (const input of ['..', '../esiti-22ago-progetti', '%2e%2e', '%252e%252e', '..\\esiti-22ago-progetti']) {
    assert.throws(() => policy.resolveCampaignDir(input), PathPolicyError, input);
  }
});

test('path policy rejects absolute and UNC input', (t) => {
  const bancoDir = makeBanco(t);
  const policy = createPathPolicy({ bancoDir, campaigns: CAMPAIGNS });
  policy.initialize();
  for (const input of ['C:\\Windows', '\\\\server\\share', '/etc/passwd']) {
    assert.throws(() => policy.resolveCampaignDir(input), PathPolicyError, input);
  }
});

test('path policy rejects a symlink or junction escaping bancoDir', (t) => {
  const bancoDir = mkdtempSync(join(tmpdir(), 'talos-harness-link-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'talos-harness-link-outside-'));
  mkdirSync(join(bancoDir, CAMPAIGNS[1]));
  t.after(() => {
    rmSync(bancoDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  let policy;
  try {
    symlinkSync(outside, join(bancoDir, CAMPAIGNS[0]), 'junction');
    policy = createPathPolicy({ bancoDir, campaigns: CAMPAIGNS });
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    const bancoReal = resolve(bancoDir);
    const outsideReal = resolve(outside);
    const fsAdapter = {
      accessSync() {},
      realpathSync(candidate) {
        return candidate === join(bancoDir, CAMPAIGNS[0]) ? outsideReal : bancoReal;
      },
      statSync() { return { isDirectory: () => true }; },
    };
    policy = createPathPolicy({ bancoDir, campaigns: [CAMPAIGNS[0]], fsAdapter });
  }

  assert.throws(() => policy.initialize(), PathPolicyError);
});

test('path policy lists only contained JSONL files in deterministic order', (t) => {
  const bancoDir = makeBanco(t);
  const policy = createPathPolicy({ bancoDir, campaigns: CAMPAIGNS });
  policy.initialize();
  const files = policy.listJsonlFiles(CAMPAIGNS[0]);
  assert.deepEqual(files.map((file) => file.split(/[\\/]/).at(-1)), ['alpha.jsonl', 'beta.jsonl']);
  assert.equal(isPathInside(bancoDir, files[0]), true);
  assert.equal(policy.resolveHarnessCostFile(CAMPAIGNS[0], 'alpha'), join(bancoDir, CAMPAIGNS[0], 'alpha.costo.json'));
  assert.equal(policy.resolveReportFile(CAMPAIGNS[0]), join(bancoDir, CAMPAIGNS[0], 'rapporto.txt'));
  assert.throws(() => policy.resolveHarnessCostFile(CAMPAIGNS[0], '../alpha'), PathPolicyError);
});
