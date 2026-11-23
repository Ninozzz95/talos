import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('M6-E runtime exposes measured context status and CLI composition reuses Context Engine at 50 percent',async()=>{
  const [types,facade,composition]=await Promise.all([
    readFile(new URL('../../src/runtime/types.ts',import.meta.url),'utf8'),
    readFile(new URL('../../src/runtime/session-facade.ts',import.meta.url),'utf8'),
    readFile(new URL('../../src/runtime/talos-composition.ts',import.meta.url),'utf8'),
  ]);
  assert.match(types,/contextStatus\??\(sessionId:string\)/u);
  assert.match(facade,/statoContesto/u);
  assert.match(facade,/buildContextStatus/u);
  assert.match(composition,/contextHooksFn/u);
  assert.match(composition,/contextCompactFn/u);
  /* 14/10/2026 (owner, «Tetto di serie»): the 50 % rule lives in compaction-cap.ts (HALF), capped by context.compactAtTokens */
  assert.match(composition,/compactionRatios\(/u);
  assert.match(await readFile(new URL('../../src/runtime/compaction-cap.ts',import.meta.url),'utf8'),/const HALF=0\.5;/u);
  assert.match(composition,/createContextEngine|createDesktopContextService/u);
  const statusStart=composition.indexOf('async status(sessionId:string)');
  const closeStart=composition.indexOf('async close()',statusStart);
  assert.ok(statusStart>=0&&closeStart>statusStart);
  const statusSource=composition.slice(statusStart,closeStart);
  assert.match(statusSource,/readContextSnapshot/u);
  assert.doesNotMatch(statusSource,/ensureSettings/u);
});

test('M6-E TUI and session CLI expose the inspector without deriving occupancy from turn usage',async()=>{
  const [app,sessionCli,footer]=await Promise.all([
    readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8'),
    readFile(new URL('../../src/commands/session-cli.ts',import.meta.url),'utf8'),
    readFile(new URL('../../src/tui/components/footer.ts',import.meta.url),'utf8'),
  ]);
  /* stage 7.11, then FE-048 C7 (01/11): /context opens the Context page, still from the runtime's measure (contextOf), never
     from turn usage */
  assert.match(app,/parsed\.name==='context'\)\{await openContextPage\(\);return;\}/u);
  assert.match(app,/status=await runtime\.contextStatus\(session\)/u);
  assert.match(app,/context:contextOf\(status\)/u);
  assert.match(sessionCli,/op==='context'/u);
  assert.match(sessionCli,/runtime\.contextStatus/u);
  assert.match(footer,/talos\.cli\.context-status\.v1/u);
});
