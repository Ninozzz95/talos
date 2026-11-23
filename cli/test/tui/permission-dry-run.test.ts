import assert from 'node:assert/strict';
import test from 'node:test';

test('/permissions dry-run uses the same simulation and leaves ordinary /permissions for its sheet',async()=>{
  const app:any=await import('../../src/tui/app.ts');
  assert.equal(typeof app.permissionDryRunSlash,'function','app must expose the slash dry-run helper');
  const rules={allow:['Bash(git status)'],ask:[],deny:['Bash(rm -rf build)']};
  const dry=await app.permissionDryRunSlash(['dry-run','git','status','&&','rm','-rf','build'],rules,process.cwd());
  assert.equal(typeof dry,'string');
  assert.match(dry,/\bdeny\b/u);
  assert.match(dry,/segment 2/u);
  assert.match(dry,/rm -rf build/u);
  assert.equal(app.permissionDryRunSlash([],rules,process.cwd()),null,'plain /permissions opens its sheet (stage 7.21; the trust center is /permissions trust)');
});

test('F-P-001: /permissions dry-run answers in the session\'s current mode',async()=>{
  const app:any=await import('../../src/tui/app.ts');
  const rules={allow:[],ask:[],deny:[]};
  const manual=await app.permissionDryRunSlash(['dry-run','mkdir','out'],rules,process.cwd(),{mode:'default'});
  const edits=await app.permissionDryRunSlash(['dry-run','mkdir','out'],rules,process.cwd(),{mode:'acceptEdits'});
  assert.match(manual,/^Permission dry-run: ask/u);
  assert.match(edits,/^Permission dry-run: allow/u);
  assert.match(edits,/Mode: acceptEdits · in a session: allow \(accept edits lets it go\) · with -p: allow/u);
});
