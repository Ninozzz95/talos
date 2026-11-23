import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('run.ts is a thin dependency-loading composition root with no input or rendering logic',async()=>{
  const source=await readFile(new URL('../../src/tui/run.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/useInput|parseMarkdownBlocks|createTuiSessionController|execFileAsync|setInterval/u);
  assert.match(source,/detectTerminalCapabilities/u);
  assert.match(source,/createTuiAppComponent/u);
  assert.match(source,/waitUntilExit/u);
});


/* UI phase stage 2, cure 2a: the collector comes from createTuiRenderMetrics(env) and exists only with
   TALOS_TUI_RENDER_METRICS=1 (test/tui/render-metrics-opt-in.test.ts); the summary is still written at exit. */
test('run.ts composes one production render coordinator and opt-in render metrics',async()=>{
  const source=await readFile(new URL('../../src/tui/run.ts',import.meta.url),'utf8');
  assert.match(source,/createTuiRenderMetrics\(env\)/u);
  assert.match(source,/createTuiMetricsProfiler/u);
  assert.match(source,/createRenderCoordinator/u);
  assert.match(source,/renderCoordinator:coordinator/u);
  assert.match(source,/renderMetrics\.summary\(\)/u);
});


test('M2-C run.ts delegates alternate-screen policy and full-frame background to TALOS terminal session helpers',async()=>{
  const source=await readFile(new URL('../../src/tui/run.ts',import.meta.url),'utf8');
  assert.match(source,/createTerminalSessionPlan/u);
  assert.match(source,/terminalFrameProps/u);
  assert.match(source,/alternateScreen:\s*session\.alternateScreen/u);
  // M2-E (e7a4f242d): the mono theme derives effectiveCapabilities, which keep capabilities.interactive.
  /* R5b D4 (Q-R5-14): mono is derived by the live theme store (theme-store.ts liveTheme, same rule), and the session is
     planned on the terminal's own capabilities, so leaving mono for a colour theme paints the background again. */
  assert.match(source,/const themeStore=createThemeStore\(capabilities,props\.uiTheme\?\?DEFAULT_THEME_ACCENT\);/u);
  assert.match(source,/effectiveCapabilities=themeStore\.getSnapshot\(\)\.capabilities;/u);
  assert.match(source,/interactive:\s*session\.mode==='plain'\?false:effectiveCapabilities\.interactive/u);
  assert.match(source,/React\.createElement\(Ink\.Box/u);
});


test('M2-E migrated effective theme flows from main to the same root and app palette',async()=>{
  const main=await readFile(new URL('../../src/main.ts',import.meta.url),'utf8');
  const run=await readFile(new URL('../../src/tui/run.ts',import.meta.url),'utf8');
  const app=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(main,/uiTheme:\s*effective\.value\.ui\?\.theme/u);
  assert.match(run,/props\.uiTheme/u);
  /* R5b D4 (Q-R5-14): one live store for the painted background and the app's palette (r5b-theme-live.test.ts). */
  assert.match(run,/useSyncExternalStore\(themeStore\.subscribe,themeStore\.getSnapshot,themeStore\.getSnapshot\)\.theme\.colors\.background/u);
  /* UI Phase 0 D2: the app gets Ink with painted borders, which read the same live store */
  assert.match(run,/paintedBorders\(React,Ink,\(\)=>session\.paintBackground\?themeStore\.getSnapshot\(\)\.theme\.colors\.background:undefined\)/u);
  /* UI Phase 3: the painted Ink, whose exit() switches the mouse off first, is the one the app gets */
  assert.match(run,/const leavingInk=\{\.\.\.paintedInk,useApp:/u);
  assert.match(run,/createTuiAppComponent\(React,leavingInk,capabilities,undefined,themeStore\)/u);
  assert.match(app,/createTuiTheme\(capabilities,accentId\)/u);
});
