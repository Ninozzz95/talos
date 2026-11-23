import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {exportCliSession, importCliSession} from '../../src/sessions/transfer.ts';

test('session export and import preserve safe history but drop pending approvals', async () => {
  const dir = await mkdtemp(join(tmpdir(),'talos-session-'));
  const out = join(dir,'s.json');
  await exportCliSession(out,{header:{schema:'talos.cli.session.v1',sessionId:'s1',projectRoot:'/repo',createdAt:'2026-09-14T00:00:00Z',talosCommit:'abc'},events:[{type:'ApprovalRequested',requestId:'r1'},{type:'RunFinished'}]});
  const imported = await importCliSession(out);
  assert.equal(imported.header.sessionId,'s1');
  assert.deepEqual(imported.events,[{type:'RunFinished'}]);
  assert.equal(imported.pendingApprovalsDropped,1);
  assert.match(await readFile(out,'utf8'), /talos\.cli\.session\.v1/);
});

test('future session schema is rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(),'talos-session-'));
  const out = join(dir,'future.json');
  await import('node:fs/promises').then(({writeFile})=>writeFile(out,JSON.stringify({header:{schema:'talos.cli.session.v2'},events:[]})));
  await assert.rejects(()=>importCliSession(out),/SESSION_SCHEMA_UNSUPPORTED/);
});
