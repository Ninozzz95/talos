import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildProduction } from '../../scripts/build.mjs';
import ts from 'typescript';
import { STATE_OWNERS } from '../../src/app/state.ts';

const modules=['src/app/state.ts','src/domain/resource-state.ts','src/domain/session-events.ts',
  'src/infrastructure/api/client.ts','src/infrastructure/host/bridge.ts','src/infrastructure/lifecycle.ts',
  'src/infrastructure/persistence/preferences.ts','src/infrastructure/events/session-stream.ts'];
test('L02: every new runtime module is in the actual production graph',async()=>{
  const output=await mkdtemp(path.join(tmpdir(),'talos-phase1-foundation-'));
  try{
    const result=await buildProduction({outputDir:output});const inputs=Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/'));
    for(const file of modules)assert.ok(inputs.includes(file),`${file}: added but not used by production`);
    assert.equal(inputs.some(x=>/showcase|tests\/|fixtures\//.test(x)),false);
    const bundle=await readFile(path.join(output,'app.js'),'utf8');
    for(const symbol of ['createApplicationState','createRequestCoordinator','createApiClient','createHostBridge','createPreferences','createSessionStreamFactory'])assert.ok(bundle.includes(symbol),symbol);
  }finally{await rm(output,{recursive:true,force:true});}
});
test('L02: all existing root state fields have owners, including fields initialized later',async()=>{
  const source=await readFile(new URL('../../src/legacy/app.js',import.meta.url),'utf8');
  const ast=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const names=new Set();
  function visit(n){if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='state')names.add(n.name.text);ts.forEachChild(n,visit);}
  visit(ast);const fields=[...names];
  assert.deepEqual(fields.filter(name=>!Object.hasOwn(STATE_OWNERS,name)),[]);
  assert.ok(source.includes('const state = applicationState.legacy;'));
  assert.ok(source.includes('metricsRequests.run('));
  assert.ok(source.includes('sessionStreams.open('));
  assert.ok(source.includes('applicationLifetime.dispose();'));
});
