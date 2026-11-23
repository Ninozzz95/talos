/* Startup stage (01/10): in the esbuild bundle, with code splitting, `import('react')` is a chunk whose only export is
   `default` (React's module.exports); the named exports Node adds to a CommonJS namespace are not there. The bundled TUI
   failed with «React.memo is not a function». The TUI and the trust prompt take React's own object, `.default`, which
   is the same object from the sources and from the bundle. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTuiModules} from '../../src/tui/run.ts';

test('the TUI gets React\'s own object (module.exports), as the bundle provides it',async()=>{
  const {React}=await loadTuiModules();
  const exported=(await import('react')).default;
  assert.equal(React,exported,'React is module.exports, not the namespace');
  assert.equal(typeof (React as any).memo,'function');
});
