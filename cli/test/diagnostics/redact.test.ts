import assert from 'node:assert/strict';
import test from 'node:test';
import {createRedactor,redactObject} from '../../src/diagnostics/redact.ts';

test('redacts exact secret values wherever they appear',()=>{
  const secret='sk-live-123456';
  const r=createRedactor([secret]);
  const text=r.text(`request failed: token=${secret}; retrying`);
  assert.equal(text.includes(secret),false);
  assert.match(text,/\[REDACTED:14\]/u);
});

test('redacts authorization api key token secret and password assignments in strings',()=>{
  const r=createRedactor([]);
  const text=r.text('Authorization: Bearer abc123\nx-api-key=xyz\npassword: hunter2\nnormal=value');
  assert.equal(text.includes('abc123'),false);
  assert.equal(text.includes('xyz'),false);
  assert.equal(text.includes('hunter2'),false);
  assert.match(text,/normal=value/u);
});

test('redacts secret-like object fields and nested strings',()=>{
  const out=redactObject({provider:{apiKey:'abcdef',note:'token=xyz'},safe:'ok'},['xyz']) as any;
  assert.equal(out.provider.apiKey,'[REDACTED:6]');
  assert.equal(String(out.provider.note).includes('xyz'),false);
  assert.equal(out.safe,'ok');
});
